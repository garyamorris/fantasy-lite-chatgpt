export type MatchupResultVm = {
  homeScore: number;
  awayScore: number;
  simulatedAt: string;
};

export type MatchupVm = {
  id: string;
  week: number;
  status: "SCHEDULED" | "FINAL";
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  result: MatchupResultVm | null;
};

export type StatDefVm = { key: string; label: string; decimals: number };

export type TeamSeriesVm = {
  teamId: string;
  pf: (number | null)[];
  pa: (number | null)[];
  result: ("W" | "L" | "T" | null)[];
};

export type TeamStandingVm = {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  streak: string;
  last5: string;
  ceiling: number;
  floor: number;
  avg: number;
  stddev: number;
};

export type AthleteSeriesVm = {
  athleteId: string;
  athleteName: string;
  teamId: string;
  teamName: string;
  weeksPlayed: number;
  totals: Record<string, number>;
  avgs: Record<string, number>;
  series: Record<string, (number | null)[]>;
};

export type LeagueAnalyticsVm = {
  leagueId: string;
  leagueName: string;
  weeks: number;
  currentWeek: number;
  statDefs: StatDefVm[];
  teams: { id: string; name: string }[];
  matchups: MatchupVm[];
  standings: TeamStandingVm[];
  teamSeries: TeamSeriesVm[];
  athletes: AthleteSeriesVm[];
  leagueWeekAverages: (number | null)[];
};

export type TeamAnalyticsVm = {
  leagueId: string;
  leagueName: string;
  weeks: number;
  currentWeek: number;
  statDefs: StatDefVm[];
  allTeams: { id: string; name: string }[];
  team: { id: string; name: string };
  rank: number | null;
  record: Omit<TeamStandingVm, "rank" | "teamId" | "teamName">;
  series: TeamSeriesVm;
  matchups: MatchupVm[];
  athletes: AthleteSeriesVm[];
};

export type AthleteWeekVm = {
  week: number;
  started: boolean;
  fantasy: number | null;
  stats: Record<string, number | null>;
};

export type AthleteAnalyticsVm = {
  leagueId: string;
  leagueName: string;
  weeks: number;
  currentWeek: number;
  statDefs: StatDefVm[];
  athlete: { id: string; name: string; teamId: string; teamName: string };
  weeksData: AthleteWeekVm[];
  totals: Record<string, number>;
  avgs: Record<string, number>;
  weeksPlayed: number;
  bestWeek: { week: number; fantasy: number } | null;
  worstWeek: { week: number; fantasy: number } | null;
};

