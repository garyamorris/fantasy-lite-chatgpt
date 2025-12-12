import "server-only";

import { scoreFromStats, type RuleSetConfig } from "@/lib/rules";
import type {
  AthleteAnalyticsVm,
  AthleteSeriesVm,
  AthleteWeekVm,
  LeagueAnalyticsVm,
  MatchupVm,
  StatDefVm,
  TeamAnalyticsVm,
  TeamSeriesVm,
  TeamStandingVm,
} from "@/lib/analytics-vm";

type TeamRow = { id: string; name: string };
type MatchupRow = {
  id: string;
  week: number;
  status: "SCHEDULED" | "FINAL";
  homeTeam: TeamRow;
  awayTeam: TeamRow;
  result: { homeScore: number; awayScore: number; simulatedAt: Date } | null;
};
type AthleteRow = { id: string; name: string; team: TeamRow };
type AthleteWeekStatRow = { athleteId: string; week: number; stats: string };

function safeParseStatsJson(statsJson: string): Record<string, number> {
  try {
    const raw = JSON.parse(statsJson) as unknown;
    if (!raw || typeof raw !== "object") return {};

    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function winPct(wins: number, ties: number, played: number) {
  if (played <= 0) return 0;
  return (wins + ties * 0.5) / played;
}

function formatLast5(results: ("W" | "L" | "T")[]) {
  const slice = results.slice(-5);
  let w = 0;
  let l = 0;
  let t = 0;
  for (const r of slice) {
    if (r === "W") w += 1;
    if (r === "L") l += 1;
    if (r === "T") t += 1;
  }
  if (t > 0) return `${w}-${l}-${t}`;
  return `${w}-${l}`;
}

function formatStreak(results: ("W" | "L" | "T")[]) {
  const last = results[results.length - 1];
  if (!last) return "-";
  let n = 1;
  for (let i = results.length - 2; i >= 0; i -= 1) {
    if (results[i] !== last) break;
    n += 1;
  }
  return `${last}${n}`;
}

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function statDefsFromConfig(config: RuleSetConfig): StatDefVm[] {
  return config.scoring.stats.map((s) => ({ key: s.key, label: s.label, decimals: s.decimals }));
}

function matchupVmFromRow(m: MatchupRow): MatchupVm {
  return {
    id: m.id,
    week: m.week,
    status: m.status,
    homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
    awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
    result: m.result
      ? {
          homeScore: m.result.homeScore,
          awayScore: m.result.awayScore,
          simulatedAt: m.result.simulatedAt.toISOString(),
        }
      : null,
  };
}

type TeamAgg = {
  teamId: string;
  teamName: string;
  pf: (number | null)[];
  pa: (number | null)[];
  result: ("W" | "L" | "T" | null)[];
  resultsChrono: ("W" | "L" | "T")[];
  played: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
};

function initTeamAgg(team: TeamRow, weeks: number): TeamAgg {
  return {
    teamId: team.id,
    teamName: team.name,
    pf: Array.from({ length: weeks }, () => null as number | null),
    pa: Array.from({ length: weeks }, () => null as number | null),
    result: Array.from({ length: weeks }, () => null as "W" | "L" | "T" | null),
    resultsChrono: [],
    played: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

function buildTeamAggById(teams: TeamRow[], matchups: MatchupRow[], weeks: number) {
  const byId = new Map<string, TeamAgg>();
  for (const t of teams) byId.set(t.id, initTeamAgg(t, weeks));

  for (const m of matchups) {
    if (!m.result) continue;
    const weekIdx = m.week - 1;
    if (weekIdx < 0 || weekIdx >= weeks) continue;

    const home = byId.get(m.homeTeam.id);
    const away = byId.get(m.awayTeam.id);
    if (!home || !away) continue;

    const homeScore = m.result.homeScore;
    const awayScore = m.result.awayScore;

    home.pf[weekIdx] = homeScore;
    home.pa[weekIdx] = awayScore;
    away.pf[weekIdx] = awayScore;
    away.pa[weekIdx] = homeScore;

    home.played += 1;
    away.played += 1;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.result[weekIdx] = "W";
      away.result[weekIdx] = "L";
      home.resultsChrono.push("W");
      away.resultsChrono.push("L");
    } else if (homeScore < awayScore) {
      home.losses += 1;
      away.wins += 1;
      home.result[weekIdx] = "L";
      away.result[weekIdx] = "W";
      home.resultsChrono.push("L");
      away.resultsChrono.push("W");
    } else {
      home.ties += 1;
      away.ties += 1;
      home.result[weekIdx] = "T";
      away.result[weekIdx] = "T";
      home.resultsChrono.push("T");
      away.resultsChrono.push("T");
    }
  }

  return byId;
}

function standingsFromAgg(aggs: Iterable<TeamAgg>): TeamStandingVm[] {
  const rows: Omit<TeamStandingVm, "rank">[] = [];

  for (const t of aggs) {
    const pfPlayed = t.pf.filter((n): n is number => typeof n === "number");
    const ceiling = pfPlayed.length ? Math.max(...pfPlayed) : 0;
    const floor = pfPlayed.length ? Math.min(...pfPlayed) : 0;
    const avg = t.played ? t.pointsFor / t.played : 0;
    const consistency = stddev(pfPlayed);

    rows.push({
      teamId: t.teamId,
      teamName: t.teamName,
      played: t.played,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      winPct: winPct(t.wins, t.ties, t.played),
      pointsFor: t.pointsFor,
      pointsAgainst: t.pointsAgainst,
      diff: t.pointsFor - t.pointsAgainst,
      streak: formatStreak(t.resultsChrono),
      last5: formatLast5(t.resultsChrono),
      ceiling,
      floor,
      avg,
      stddev: consistency,
    });
  }

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function athleteSeriesFromRows(
  athletes: AthleteRow[],
  athleteWeekStats: AthleteWeekStatRow[],
  config: RuleSetConfig,
  weeks: number,
): AthleteSeriesVm[] {
  const statDefs = statDefsFromConfig(config);
  const metricKeys = ["fantasy", ...statDefs.map((s) => s.key)];

  const athleteById = new Map<string, AthleteRow>();
  for (const a of athletes) athleteById.set(a.id, a);

  const byId = new Map<string, AthleteSeriesVm>();
  for (const a of athletes) {
    const series: Record<string, (number | null)[]> = {};
    const totals: Record<string, number> = {};
    const avgs: Record<string, number> = {};

    for (const key of metricKeys) {
      series[key] = Array.from({ length: weeks }, () => null as number | null);
      totals[key] = 0;
      avgs[key] = 0;
    }

    byId.set(a.id, {
      athleteId: a.id,
      athleteName: a.name,
      teamId: a.team.id,
      teamName: a.team.name,
      weeksPlayed: 0,
      totals,
      avgs,
      series,
    });
  }

  for (const row of athleteWeekStats) {
    const athlete = athleteById.get(row.athleteId);
    const acc = byId.get(row.athleteId);
    if (!athlete || !acc) continue;
    const weekIdx = row.week - 1;
    if (weekIdx < 0 || weekIdx >= weeks) continue;

    const stats = safeParseStatsJson(row.stats);
    for (const def of statDefs) {
      const v = typeof stats[def.key] === "number" ? stats[def.key] : null;
      if (v === null) continue;
      acc.series[def.key][weekIdx] = v;
      acc.totals[def.key] += v;
    }

    const fantasy = scoreFromStats(config, stats);
    acc.series.fantasy[weekIdx] = fantasy;
    acc.totals.fantasy += fantasy;
    acc.weeksPlayed += 1;
  }

  for (const a of byId.values()) {
    for (const key of metricKeys) {
      a.avgs[key] = a.weeksPlayed ? a.totals[key] / a.weeksPlayed : 0;
    }
  }

  return Array.from(byId.values());
}

export function buildLeagueAnalyticsVm({
  leagueId,
  leagueName,
  currentWeek,
  config,
  teams,
  matchups,
  athletes,
  athleteWeekStats,
}: {
  leagueId: string;
  leagueName: string;
  currentWeek: number;
  config: RuleSetConfig;
  teams: TeamRow[];
  matchups: MatchupRow[];
  athletes: AthleteRow[];
  athleteWeekStats: AthleteWeekStatRow[];
}): LeagueAnalyticsVm {
  const weeks = config.schedule.weeks;
  const aggs = buildTeamAggById(teams, matchups, weeks);
  const standings = standingsFromAgg(aggs.values());

  const teamSeries: TeamSeriesVm[] = Array.from(aggs.values()).map((t) => ({
    teamId: t.teamId,
    pf: t.pf,
    pa: t.pa,
    result: t.result,
  }));

  const leagueWeekAverages: (number | null)[] = Array.from({ length: weeks }).map((_, idx) => {
    const values: number[] = [];
    for (const t of aggs.values()) {
      const pf = t.pf[idx];
      if (typeof pf === "number") values.push(pf);
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  });

  const statDefs = statDefsFromConfig(config);
  const matchupVms = matchups.map(matchupVmFromRow);
  const athletesVm = athleteSeriesFromRows(athletes, athleteWeekStats, config, weeks);

  return {
    leagueId,
    leagueName,
    weeks,
    currentWeek,
    statDefs,
    teams,
    matchups: matchupVms,
    standings,
    teamSeries,
    athletes: athletesVm,
    leagueWeekAverages,
  };
}

export function buildTeamAnalyticsVm({
  leagueVm,
  teamId,
}: {
  leagueVm: LeagueAnalyticsVm;
  teamId: string;
}): TeamAnalyticsVm | null {
  const team = leagueVm.teams.find((t) => t.id === teamId);
  const series = leagueVm.teamSeries.find((s) => s.teamId === teamId);
  if (!team || !series) return null;

  const standing = leagueVm.standings.find((s) => s.teamId === teamId) ?? null;

  const record = standing
    ? {
        played: standing.played,
        wins: standing.wins,
        losses: standing.losses,
        ties: standing.ties,
        winPct: standing.winPct,
        pointsFor: standing.pointsFor,
        pointsAgainst: standing.pointsAgainst,
        diff: standing.diff,
        streak: standing.streak,
        last5: standing.last5,
        ceiling: standing.ceiling,
        floor: standing.floor,
        avg: standing.avg,
        stddev: standing.stddev,
      }
    : {
        played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winPct: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        streak: "-",
        last5: "0-0",
        ceiling: 0,
        floor: 0,
        avg: 0,
        stddev: 0,
      };

  const matchups = leagueVm.matchups.filter((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId);
  const athletes = leagueVm.athletes.filter((a) => a.teamId === teamId);

  return {
    leagueId: leagueVm.leagueId,
    leagueName: leagueVm.leagueName,
    weeks: leagueVm.weeks,
    currentWeek: leagueVm.currentWeek,
    statDefs: leagueVm.statDefs,
    allTeams: leagueVm.teams,
    team,
    rank: standing?.rank ?? null,
    record,
    series,
    matchups,
    athletes,
  };
}

export function buildAthleteAnalyticsVm({
  leagueId,
  leagueName,
  currentWeek,
  config,
  athlete,
  athleteWeekStats,
  startedWeeks,
}: {
  leagueId: string;
  leagueName: string;
  currentWeek: number;
  config: RuleSetConfig;
  athlete: { id: string; name: string; teamId: string; teamName: string };
  athleteWeekStats: AthleteWeekStatRow[];
  startedWeeks: number[];
}): AthleteAnalyticsVm {
  const weeks = config.schedule.weeks;
  const statDefs = statDefsFromConfig(config);
  const metricKeys = ["fantasy", ...statDefs.map((s) => s.key)];

  const totals: Record<string, number> = {};
  const avgs: Record<string, number> = {};
  for (const k of metricKeys) {
    totals[k] = 0;
    avgs[k] = 0;
  }

  const byWeek = new Map<number, AthleteWeekStatRow>();
  for (const row of athleteWeekStats) byWeek.set(row.week, row);

  const startedSet = new Set(startedWeeks);

  const weeksData: AthleteWeekVm[] = [];
  let weeksPlayed = 0;
  let bestWeek: { week: number; fantasy: number } | null = null;
  let worstWeek: { week: number; fantasy: number } | null = null;

  for (let week = 1; week <= weeks; week += 1) {
    const row = byWeek.get(week) ?? null;
    const stats = row ? safeParseStatsJson(row.stats) : null;
    const fantasy = stats ? scoreFromStats(config, stats) : null;

    const statsOut: Record<string, number | null> = {};
    for (const def of statDefs) {
      const v = stats && typeof stats[def.key] === "number" ? stats[def.key] : null;
      statsOut[def.key] = v;
      if (v !== null) totals[def.key] += v;
    }

    if (fantasy !== null) {
      totals.fantasy += fantasy;
      weeksPlayed += 1;
      if (!bestWeek || fantasy > bestWeek.fantasy) bestWeek = { week, fantasy };
      if (!worstWeek || fantasy < worstWeek.fantasy) worstWeek = { week, fantasy };
    }

    weeksData.push({
      week,
      started: startedSet.has(week),
      fantasy,
      stats: statsOut,
    });
  }

  for (const k of metricKeys) {
    avgs[k] = weeksPlayed ? totals[k] / weeksPlayed : 0;
  }

  return {
    leagueId,
    leagueName,
    weeks,
    currentWeek,
    statDefs,
    athlete,
    weeksData,
    totals,
    avgs,
    weeksPlayed,
    bestWeek,
    worstWeek,
  };
}
