import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MatchInput={fixtureId:number;kickoff:string;homeName:string;awayName:string};
type OddValue={value?:string;odd?:string;main?:boolean;suspended?:boolean};
type Bet={name?:string;values?:OddValue[]};
type Bookmaker={id?:number;name?:string;bets?:Bet[]};
type Entry={fixture?:{id?:number};update?:string;bookmakers?:Bookmaker[]};
type Payload={response?:Entry[];paging?:{total?:number};errors?:Record<string,string|string[]>};
type Quote={bookmakerId:string;bookmaker:string;home:number;draw:number;away:number;favourite:"HOME"|"AWAY"|null;updatedAt:string|null};
type Previous={id:string;favourite_side:"HOME"|"AWAY"|null;home_odd:string;draw_odd:string;away_odd:string};

const LIMIT=60, COOLDOWN=3*60*60*1000, MARKET="match_winner_1x2";
const norm=(s:string)=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
function odd(values:OddValue[],labels:string[]){
 const matches=values.filter(v=>!v.suspended&&labels.includes(norm(v.value||"")));
 const value=Number((matches.find(v=>v.main===true)||matches[0])?.odd);
 return Number.isFinite(value)&&value>1?value:null;
}
function fav(h:number,d:number,a:number):"HOME"|"AWAY"|null{
 const min=Math.min(h,d,a);
 if(h===min&&h<d&&h<a)return"HOME";
 if(a===min&&a<d&&a<h)return"AWAY";
 return null;
}
function parse(entry:Entry,match:MatchInput):Quote[]{
 const result:Quote[]=[];
 for(const bm of entry.bookmakers||[]){
  const market=(bm.bets||[]).find(b=>["matchwinner","1x2","fulltimeresult","regulartimeresult"].includes(norm(b.name||"")));
  if(!market)continue;
  const values=market.values||[];
  const h=odd(values,["home","1","team1",norm(match.homeName)]);
  const d=odd(values,["draw","x","tie"]);
  const a=odd(values,["away","2","team2",norm(match.awayName)]);
  if(h===null||d===null||a===null)continue;
  result.push({bookmakerId:String(bm.id??norm(bm.name||"unknown")),bookmaker:bm.name||"Bookmaker",home:h,draw:d,away:a,favourite:fav(h,d,a),updatedAt:entry.update&&Date.parse(entry.update)?entry.update:null});
 }
 return result;
}
async function reserve(client:import("pg").PoolClient){
 const result=await client.query(
  "INSERT INTO public.odds_provider_usage (usage_date,request_count,updated_at) VALUES ((NOW() AT TIME ZONE 'UTC')::date,1,NOW()) "+
  "ON CONFLICT (usage_date) DO UPDATE SET request_count=public.odds_provider_usage.request_count+1,updated_at=NOW() "+
  "WHERE public.odds_provider_usage.request_count<$1 RETURNING request_count",[LIMIT]);
 return result.rows.length>0;
}
async function loadRecords(client:import("pg").PoolClient,matches:MatchInput[]){
 const ids=matches.map(m=>m.fixtureId);
 const [states,alerts]=await Promise.all([
  client.query("SELECT fixture_id,last_checked_at,last_source,last_result FROM public.odds_poll_state WHERE fixture_id=ANY($1::bigint[])",[ids]),
  client.query("SELECT id,fixture_id,home_team,away_team,bookmaker_name,previous_favourite,new_favourite,new_favourite_odd,detected_at FROM public.odds_alerts WHERE fixture_id=ANY($1::bigint[]) ORDER BY detected_at DESC LIMIT 100",[ids]),
 ]);
 const data:Record<string,unknown>={};
 for(const m of matches){
  const state=states.rows.find(r=>Number(r.fixture_id)===m.fixtureId);
  const quotes=Array.isArray(state?.last_result)?state.last_result as Quote[]:[];
  data[String(m.fixtureId)]={
   quotes, alerts:alerts.rows.filter(r=>Number(r.fixture_id)===m.fixtureId).slice(0,5),
   checkedAt:state?.last_checked_at?new Date(state.last_checked_at).toISOString():undefined,
   source:state?.last_source,
   message:quotes.length?undefined:"No supported pre-match 1X2 odds are published for this fixture yet.",
  };
 }
 return data;
}

export async function POST(req:NextRequest){
 let body:{date?:unknown;fixtures?:unknown};
 try{body=await req.json() as typeof body;}catch{return NextResponse.json({error:"Invalid JSON request."},{status:400});}
 const date=typeof body.date==="string"?body.date:"";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))
  return NextResponse.json({error:"A valid YYYY-MM-DD date is required."},{status:400});
 if(!Array.isArray(body.fixtures)||body.fixtures.length>250)
  return NextResponse.json({error:"A fixture list (maximum 250) is required."},{status:400});
 const unique=new Map<number,MatchInput>();
 for(const m of body.fixtures as MatchInput[]){
  if(!Number.isSafeInteger(m.fixtureId)||m.fixtureId<=0||typeof m.kickoff!=="string"||Number.isNaN(Date.parse(m.kickoff))||typeof m.homeName!=="string"||!m.homeName.trim()||typeof m.awayName!=="string"||!m.awayName.trim())
   return NextResponse.json({error:"One or more fixture records are invalid."},{status:400});
  unique.set(m.fixtureId,m);
 }
 const matches=[...unique.values()];
 if(!matches.length)return NextResponse.json({status:"ok",records:{},fixturesProcessed:0});
 const key=process.env.API_FOOTBALL_KEY;
 if(!key)return NextResponse.json({error:"API-Football is not configured."},{status:503});
 const base=(process.env.API_FOOTBALL_BASE_URL||"https://v3.football.api-sports.io").replace(/\/$/,"");
 const client=await getDbPool().connect();
 const lock="betmind-odds-date:"+date;let locked=false;
 try{
  await client.query("SELECT pg_advisory_lock(hashtext($1))",[lock]);locked=true;
  const previous=await client.query("SELECT last_checked_at,pages_processed FROM public.odds_scan_state WHERE scan_date=$1",[date]);
  const scan=previous.rows[0];
  if(scan?.last_checked_at&&Date.now()-new Date(scan.last_checked_at).getTime()<COOLDOWN){
   const records=await loadRecords(client,matches);
   const checkedAt=new Date(scan.last_checked_at).toISOString();
   return NextResponse.json({status:"ok",cached:true,records,fixturesProcessed:matches.length,pagesProcessed:scan.pages_processed||0,checkedAt,nextCheckAt:new Date(Date.parse(checkedAt)+COOLDOWN).toISOString()},{headers:{"Cache-Control":"no-store"}});
  }

  const byId=new Map(matches.map(m=>[m.fixtureId,m]));
  const quotesById=new Map<number,Quote[]>();
  let totalPages=1,pages=0,quotaReached=false,complete=true;
  for(let page=1;page<=totalPages&&page<=40;page++){
   if(!await reserve(client)){quotaReached=true;complete=false;break;}
   const url=new URL(base+"/odds");
   url.searchParams.set("date",date);
   url.searchParams.set("page",String(page));
   url.searchParams.set("timezone",process.env.NEXT_PUBLIC_APP_TIMEZONE||"Europe/Athens");
   const response=await fetch(url.toString(),{
    headers:{"x-apisports-key":key,accept:"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(15000),
   });
   if(response.status===204)break;
   if(!response.ok)return NextResponse.json({error:"API-Football odds request failed (HTTP "+response.status+")."},{status:response.status===429?429:502});
   const payload=await response.json() as Payload;
   if(payload.errors&&Object.keys(payload.errors).length)return NextResponse.json({error:"API-Football: "+Object.values(payload.errors).flat().join(" ").slice(0,220)},{status:502});
   pages++;
   totalPages=Math.max(1,Number(payload.paging?.total||1));
   const entries=payload.response||[];
   for(const entry of entries){
    const id=Number(entry.fixture?.id),match=byId.get(id);
    if(match)quotesById.set(id,parse(entry,match));
   }
   if(!entries.length)break;
  }

  const checkedAt=new Date();
  for(const match of matches){
   const quotes=quotesById.get(match.fixtureId)||[];
   const oldResult=await client.query("SELECT last_source,last_result FROM public.odds_poll_state WHERE fixture_id=$1",[match.fixtureId]);
   const old=oldResult.rows[0];
   if(quotes.length){
    for(const q of quotes){
     const p=await client.query("SELECT id::text,favourite_side,home_odd::text,draw_odd::text,away_odd::text FROM public.odds_snapshots WHERE fixture_id=$1 AND bookmaker_id=$2 AND market_key=$3 ORDER BY captured_at DESC LIMIT 1",[match.fixtureId,q.bookmakerId,MARKET]);
     const prev=p.rows[0] as Previous|undefined;
     if(prev&&Number(prev.home_odd)===q.home&&Number(prev.draw_odd)===q.draw&&Number(prev.away_odd)===q.away)continue;
     const snap=await client.query(
      "INSERT INTO public.odds_snapshots (fixture_id,home_team,away_team,bookmaker_id,bookmaker_name,market_key,market_name,home_odd,draw_odd,away_odd,favourite_side,source,provider_updated_at) "+
      "VALUES ($1,$2,$3,$4,$5,$6,'Match Winner',$7,$8,$9,$10,'prematch',$11) RETURNING id",
      [match.fixtureId,match.homeName,match.awayName,q.bookmakerId,q.bookmaker,MARKET,q.home,q.draw,q.away,q.favourite,q.updatedAt]);
     const snapshotId=snap.rows[0].id as string;
     if(prev?.favourite_side&&q.favourite&&prev.favourite_side!==q.favourite){
      const oldOdd=prev.favourite_side==="HOME"?Number(prev.home_odd):Number(prev.away_odd);
      const newOdd=q.favourite==="HOME"?q.home:q.away;
      await client.query(
       "INSERT INTO public.odds_alerts (fixture_id,home_team,away_team,bookmaker_id,bookmaker_name,market_key,previous_favourite,new_favourite,previous_favourite_odd,new_favourite_odd,previous_snapshot_id,current_snapshot_id) "+
       "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (current_snapshot_id) DO NOTHING",
       [match.fixtureId,match.homeName,match.awayName,q.bookmakerId,q.bookmaker,MARKET,prev.favourite_side,q.favourite,oldOdd,newOdd,prev.id,snapshotId]);
     }
    }
   }
   if(!(quotes.length===0&&old?.last_source==="near_kickoff")){
    await client.query(
     "INSERT INTO public.odds_poll_state (fixture_id,home_team,away_team,kickoff_at,last_checked_at,last_source,last_result,updated_at) "+
     "VALUES ($1,$2,$3,$4,$5,'prematch',$6::jsonb,NOW()) ON CONFLICT (fixture_id) DO UPDATE SET home_team=EXCLUDED.home_team,away_team=EXCLUDED.away_team,kickoff_at=EXCLUDED.kickoff_at,last_checked_at=EXCLUDED.last_checked_at,last_source=EXCLUDED.last_source,last_result=EXCLUDED.last_result,updated_at=NOW()",
     [match.fixtureId,match.homeName,match.awayName,new Date(match.kickoff),checkedAt,JSON.stringify(quotes.length?quotes:(old?.last_result||[]))]);
   }
  }
  await client.query(
   "INSERT INTO public.odds_scan_state (scan_date,last_checked_at,pages_processed,complete,updated_at) VALUES ($1,$2,$3,$4,NOW()) "+
   "ON CONFLICT (scan_date) DO UPDATE SET last_checked_at=EXCLUDED.last_checked_at,pages_processed=EXCLUDED.pages_processed,complete=EXCLUDED.complete,updated_at=NOW()",
   [date,checkedAt,pages,complete]);
  const records=await loadRecords(client,matches);
  return NextResponse.json({
   status:"ok",cached:false,records,fixturesProcessed:matches.length,pagesProcessed:pages,
   quotaReached,dailyLimit:LIMIT,checkedAt:checkedAt.toISOString(),
   nextCheckAt:new Date(checkedAt.getTime()+COOLDOWN).toISOString(),
   message:quotaReached?"Daily API-Football odds quota reached; the scan is partial.":"Date-level odds scan completed. Availability varies by fixture and league.",
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Automatic odds scan failed",{date,message:error instanceof Error?error.message:"Unknown error"});
  return NextResponse.json({error:"Automatic odds scan failed. Check Neon and API-Football availability."},{status:503});
 }finally{
  if(locked)try{await client.query("SELECT pg_advisory_unlock(hashtext($1))",[lock]);}catch{}
  client.release();
 }
}
