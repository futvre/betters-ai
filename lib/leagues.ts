import type { League } from "@/types/fixture";

export const LEAGUES: League[] = [
  { id: 39, name: "Premier League", shortName: "Premier League", country: "England" },
  { id: 140, name: "La Liga", shortName: "La Liga", country: "Spain" },
  { id: 78, name: "Bundesliga", shortName: "Bundesliga", country: "Germany" },
  { id: 135, name: "Serie A", shortName: "Serie A", country: "Italy" },
  { id: 61, name: "Ligue 1", shortName: "Ligue 1", country: "France" },
  { id: 197, name: "Super League 1", shortName: "Super League", country: "Greece" },
  { id: 2, name: "UEFA Champions League", shortName: "Champions League", country: "Europe" },
];

export const LEAGUE_IDS = new Set(LEAGUES.map((league) => league.id));
