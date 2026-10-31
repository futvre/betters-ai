"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, BellRing, Clock3, ShieldAlert } from "lucide-react";
import type { Fixture } from "@/types/fixture";

type Quote = {
  bookmakerId: string; bookmaker: string; home: number; draw: number; away: number;
  favourite: "HOME" | "AWAY" | null;
};
type Alert = {
  id: string | number; previous_favourite: "HOME" | "AWAY";
  new_favourite: "HOME" | "AWAY"; bookmaker_name: string;
  new_favourite_odd: string | number; detected_at: string;
};
type Saved = {
  quotes: Quote[]; alerts: Alert[]; checkedAt?: string;
  message?: string; source?: "prematch" | "near_kickoff";
};
type BatchResponse = {
  records?: Record<string, Saved>;
  checkedAt?: string; nextCheckAt?: string; quotaReached?: boolean;
  partial?: boolean; message?: string; providerTotalPages?: number;
  dailyLimit?: number; error?: string;
};
type Props = { fixtures: Fixture[]; date: string; active: boolean };
const ended = new Set(["FT","AET","PEN","CANC","ABD","AWD","WO"]);
const live = new Set(["1H","HT","2H","ET","P","LIVE","BT"]);
const timeLabel = (v?: string) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Athens",hour:"2-digit",minute:"2-digit",
  }).format(d);
};

export default function OddsAutoMonitor({fixtures,date,active}:Props) {
  const [data,setData] = useState<Record<number,Saved>>({});
  const [checking,setChecking] = useState(false);
  const [quotaReached,setQuotaReached] = useState(false);
  const [error,setError] = useState("");
  const [lastScan,setLastScan] = useState("");
  const [nextScan,setNextScan] = useState("");
  const [permission,setPermission] = useState("default");
  const nextDue = useRef(0);
  const running = useRef(false);
  const checkedNear = useRef(new Set<number>());

  const upcoming = useMemo(()=>fixtures.filter(f=>{
    const status=f.fixture.status.short;
    return Date.parse(f.fixture.date)>Date.now()&&!ended.has(status)&&!live.has(status);
  }).sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date)),[fixtures]);

  const notify = useCallback((fixture:Fixture,alerts:Alert[])=>{
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    for(const a of alerts){
      const key="betmind.odds.auto.alert."+a.id;
      let seen=false;
      try{seen=localStorage.getItem(key)==="1";}catch{}
      const recent=Date.now()-Date.parse(a.detected_at)<12*60*60*1000;
      if(!seen&&recent){
        const previous=a.previous_favourite==="HOME"?fixture.teams.home.name:fixture.teams.away.name;
        const next=a.new_favourite==="HOME"?fixture.teams.home.name:fixture.teams.away.name;
        try{new Notification("BetMind AI · Favourite changed",{
          body:next+" replaced "+previous+" as favourite at "+a.bookmaker_name+
            ". New price: "+Number(a.new_favourite_odd).toFixed(2)+".",
          tag:"betmind-odds-"+a.id,
        });}catch{}
      }
      try{localStorage.setItem(key,"1");}catch{}
    }
  },[]);

  const scan = useCallback(async()=>{
    if(running.current||!upcoming.length)return;
    running.current=true;setChecking(true);setError("");
    try{
      const response=await fetch("/api/odds/scan",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({date,fixtures:upcoming.map(f=>({
          fixtureId:f.fixture.id,kickoff:f.fixture.date,
          homeName:f.teams.home.name,awayName:f.teams.away.name,
        }))}),cache:"no-store",
      });
      const result=await response.json() as BatchResponse;
      if(!response.ok)throw new Error(result.error||"Automatic odds scan failed.");
      setData(current=>{
        const next={...current};
        for(const fixture of upcoming){
          const record=result.records?.[String(fixture.fixture.id)];
          if(!record)continue;
          next[fixture.fixture.id]=record;
          notify(fixture,record.alerts||[]);
        }
        return next;
      });
      setLastScan(result.checkedAt||new Date().toISOString());
      setQuotaReached(Boolean(result.quotaReached));
      setNextScan(result.nextCheckAt||"");
      nextDue.current=result.quotaReached?Number.POSITIVE_INFINITY:
        result.nextCheckAt?Date.parse(result.nextCheckAt):Date.now()+3*60*60*1000;
      if(result.quotaReached)setError("Το ημερήσιο όριο ασφαλείας του API-Football εξαντλήθηκε. Η σάρωση θα συνεχιστεί όταν μηδενιστεί.");
      else if(result.partial)setError(result.message || "Έγινε μερική σάρωση λόγω ορίου σελίδων του δωρεάν API-Football.");
    }catch(e){
      setError(e instanceof Error?e.message:"Odds service unavailable.");
      nextDue.current=Date.now()+5*60*1000;
    }finally{running.current=false;setChecking(false);}
  },[date,upcoming,notify]);

  const nearKickoff = useCallback(async()=>{
    if(quotaReached||document.visibilityState!=="visible")return;
    for(const f of upcoming){
      const id=f.fixture.id;
      const mins=(Date.parse(f.fixture.date)-Date.now())/60000;
      if(mins<=0||mins>15||checkedNear.current.has(id))continue;
      const key="betmind.odds.near.checked."+id;
      try{if(localStorage.getItem(key)==="1"){checkedNear.current.add(id);continue;}}catch{}
      try{
        const response=await fetch("/api/odds",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({fixtureId:id,homeName:f.teams.home.name,awayName:f.teams.away.name,kickoff:f.fixture.date}),
          cache:"no-store",
        });
        const result=await response.json() as Saved&{error?:string;dailyLimit?:number};
        if(response.status===429&&result.dailyLimit){setQuotaReached(true);setError(result.error||"Daily odds request limit reached.");return;}
        if(response.status===409){checkedNear.current.add(id);continue;}
        if(!response.ok)continue;
        checkedNear.current.add(id);
        try{localStorage.setItem(key,"1");}catch{}
        setData(current=>({...current,[id]:result}));
        notify(f,result.alerts||[]);
      }catch{}
    }
  },[upcoming,quotaReached,notify]);

  useEffect(()=>{
    if("Notification" in window)setPermission(Notification.permission);
  },[]);
  useEffect(()=>{
    if(!active||!upcoming.length)return;
    let stopped=false;
    const tick=async()=>{
      if(stopped||document.visibilityState!=="visible")return;
      if(!running.current&&Date.now()>=nextDue.current&&!quotaReached)await scan();
      if(!stopped)await nearKickoff();
    };
    void tick();
    const timer=window.setInterval(()=>void tick(),30000);
    const onVisibility=()=>{if(document.visibilityState==="visible")void tick();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{stopped=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[active,upcoming,quotaReached,scan,nearKickoff]);

  if(!active)return null;
  const checked=upcoming.filter(f=>Boolean(data[f.fixture.id]?.checkedAt)).length;
  const alerts=Object.entries(data).flatMap(([id,r])=>{
    const fixture=upcoming.find(f=>f.fixture.id===Number(id));
    return fixture?(r.alerts||[]).map(a=>({...a,homeName:fixture.teams.home.name,awayName:fixture.teams.away.name})): [];
  }).sort((a,b)=>Date.parse(b.detected_at)-Date.parse(a.detected_at)).slice(0,5);
  const quoteRows=upcoming.map(f=>({fixture:f,record:data[f.fixture.id]}))
    .filter(x=>x.record?.quotes.length).slice(0,6);
  const allowNotifications=async()=>{
    if(!("Notification" in window))return;
    try{setPermission(await Notification.requestPermission());}catch{setPermission(Notification.permission);}
  };

  return <section className="auto-odds-monitor" aria-live="polite">
    <div className="auto-odds-heading">
      <div className="auto-odds-title">
        <span className="auto-odds-icon"><Activity size={17}/></span>
        <div><strong>Automatic odds monitoring</strong><span>All upcoming fixtures · batch checks every 3 hours</span></div>
      </div>
      <div className="auto-odds-controls">
        <button type="button" className="auto-odds-notify" onClick={()=>void allowNotifications()}>
          <BellRing size={12}/>{permission==="granted"?"Notifications enabled":"Enable notifications"}
        </button>
        <span className={"auto-odds-status"+(quotaReached?" auto-odds-paused":"")}>
          <span className="status-led"/>{quotaReached?"DAILY LIMIT":checking?"SCANNING":"AUTO MONITOR ON"}
        </span>
      </div>
    </div>
    <div className="auto-odds-metrics">
      <span><strong>{upcoming.length}</strong> upcoming matches</span>
      <span><strong>{checked}</strong> checked</span>
      <span><strong>{alerts.length}</strong> favourite changes</span>
      <span className="auto-odds-note">{nextScan? "Next scan "+timeLabel(nextScan):lastScan?"Last scan "+timeLabel(lastScan):"Starting scan…"}</span>
    </div>
    {error&&<div className="auto-odds-warning"><ShieldAlert size={14}/><span>{error}</span></div>}
    {alerts.length>0&&<div className="auto-odds-alerts">
      <div className="auto-odds-section-title"><BellRing size={13}/> FAVOURITE CHANGES</div>
      {alerts.map(a=><div className="auto-odds-alert" key={a.id}>
        <strong>{a.new_favourite==="HOME"?a.homeName:a.awayName}</strong>
        <span>replaced {a.previous_favourite==="HOME"?a.homeName:a.awayName} at {a.bookmaker_name}</span>
        <small>{timeLabel(a.detected_at)}</small>
      </div>)}
    </div>}
    {quoteRows.length>0&&<div className="auto-odds-quotes">
      <div className="auto-odds-section-title"><Clock3 size={13}/> LATEST AVAILABLE 1X2 PRICES</div>
      {quoteRows.map(({fixture,record})=><div className="auto-odds-quote" key={fixture.fixture.id}>
        <span className="auto-odds-match">{fixture.teams.home.name} – {fixture.teams.away.name}</span>
        <span className="auto-odds-bookmaker">{record!.quotes[0].bookmaker}</span>
        <strong>{record!.quotes[0].home.toFixed(2)} / {record!.quotes[0].draw.toFixed(2)} / {record!.quotes[0].away.toFixed(2)}</strong>
      </div>)}
    </div>}
    <p className="auto-odds-footnote">Odds are checked automatically while this page is open. Date batches respect the provider refresh window; one extra capture is attempted in the final 15 minutes before kickoff.</p>
    {upcoming.length===0&&<p className="auto-odds-empty">No upcoming matches on this date.</p>}
  </section>;
}
