"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { AthleteSeriesVm, LeagueAnalyticsVm, TeamStandingVm } from "@/lib/analytics-vm";
import { Sparkline } from "@/components/charts/Sparkline";

type TabId = "standings" | "compare" | "players";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "standings", label: "Standings" },
  { id: "compare", label: "Compare" },
  { id: "players", label: "Players" },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatNumber(n: number, decimals: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(decimals);
}

function sortToggle(prev: { key: string; dir: "asc" | "desc" }, key: string) {
  if (prev.key !== key) return { key, dir: "desc" as const };
  return { key, dir: prev.dir === "asc" ? ("desc" as const) : ("asc" as const) };
}

function metricLabel(metric: string, statLabelByKey: Map<string, string>) {
  if (metric === "fantasy") return "Fantasy points";
  return statLabelByKey.get(metric) ?? metric;
}

function decimalsForMetric(metric: string, decimalsByKey: Map<string, number>) {
  if (metric === "fantasy") return 1;
  return decimalsByKey.get(metric) ?? 0;
}

function heatStyle(value: number, avg: number | null) {
  if (avg === null || !Number.isFinite(avg) || avg === 0) return undefined;
  const ratio = (value - avg) / avg;
  const intensity = clamp(Math.round(Math.abs(ratio) * 160), 0, 70);
  if (intensity === 0) return undefined;

  const colorVar = ratio >= 0 ? "var(--color-accent2)" : "var(--color-danger)";
  return { background: `color-mix(in srgb, ${colorVar} ${intensity}%, rgba(0,0,0,0.0))` } as CSSProperties;
}

function getTeamName(data: LeagueAnalyticsVm, teamId: string) {
  return data.teams.find((t) => t.id === teamId)?.name ?? "Unknown";
}

function getStanding(data: LeagueAnalyticsVm, teamId: string): TeamStandingVm | null {
  return data.standings.find((s) => s.teamId === teamId) ?? null;
}

function athleteMetricValue(a: AthleteSeriesVm, metric: string, kind: "total" | "avg") {
  if (kind === "total") return a.totals[metric] ?? 0;
  return a.avgs[metric] ?? 0;
}

function csvEscape(value: string) {
  const s = value.replace(/"/g, '""');
  return `"${s}"`;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LeagueAnalyticsClient({
  data,
  initialTab,
  initialTeamA,
  initialTeamB,
}: {
  data: LeagueAnalyticsVm;
  initialTab?: string;
  initialTeamA?: string;
  initialTeamB?: string;
}) {
  const statLabelByKey = useMemo(() => new Map(data.statDefs.map((s) => [s.key, s.label] as const)), [data.statDefs]);
  const decimalsByKey = useMemo(() => new Map(data.statDefs.map((s) => [s.key, s.decimals] as const)), [data.statDefs]);

  const teamIds = useMemo(() => data.teams.map((t) => t.id), [data.teams]);

  const [tab, setTab] = useState<TabId>(() => {
    const maybe = (initialTab ?? "").toLowerCase();
    if (maybe === "compare") return "compare";
    if (maybe === "players") return "players";
    return "standings";
  });

  const [standingSort, setStandingSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "rank",
    dir: "asc",
  });
  const [teamQuery, setTeamQuery] = useState("");

  const [teamA, setTeamA] = useState(() => {
    const first = teamIds[0] ?? "";
    if (initialTeamA && teamIds.includes(initialTeamA)) return initialTeamA;
    return first;
  });
  const [teamB, setTeamB] = useState(() => {
    const second = teamIds[1] ?? teamIds[0] ?? "";
    if (initialTeamB && teamIds.includes(initialTeamB) && initialTeamB !== teamA) return initialTeamB;
    return second === teamA ? teamIds[2] ?? second : second;
  });

  const standings = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    const filtered = q ? data.standings.filter((s) => s.teamName.toLowerCase().includes(q)) : data.standings.slice();

    const dir = standingSort.dir === "asc" ? 1 : -1;
    const key = standingSort.key;
    filtered.sort((a, b) => {
      if (key === "teamName") return a.teamName.localeCompare(b.teamName) * dir;
      const av = (a as unknown as Record<string, number>)[key] as number | undefined;
      const bv = (b as unknown as Record<string, number>)[key] as number | undefined;
      const an = typeof av === "number" ? av : 0;
      const bn = typeof bv === "number" ? bv : 0;
      return (bn - an) * dir;
    });
    return filtered;
  }, [data.standings, standingSort, teamQuery]);

  const teamSeriesById = useMemo(() => new Map(data.teamSeries.map((s) => [s.teamId, s] as const)), [data.teamSeries]);

  const leagueKpis = useMemo<{
    high: { teamId: string; week: number; score: number } | null;
    low: { teamId: string; week: number; score: number } | null;
    mostConsistent: { teamId: string; stddev: number } | null;
  }>(() => {
    let high: { teamId: string; week: number; score: number } | null = null;
    let low: { teamId: string; week: number; score: number } | null = null;

    for (const s of data.teamSeries) {
      s.pf.forEach((v, idx) => {
        if (typeof v !== "number") return;
        if (!high || v > high.score) high = { teamId: s.teamId, week: idx + 1, score: v };
        if (!low || v < low.score) low = { teamId: s.teamId, week: idx + 1, score: v };
      });
    }

    const mostConsistent = data.standings
      .filter((t) => t.played >= 3)
      .slice()
      .sort((a, b) => a.stddev - b.stddev)[0];

    return {
      high,
      low,
      mostConsistent: mostConsistent ? { teamId: mostConsistent.teamId, stddev: mostConsistent.stddev } : null,
    };
  }, [data.teamSeries, data.standings]);

  const compare = useMemo(() => {
    const aStanding = getStanding(data, teamA);
    const bStanding = getStanding(data, teamB);
    const aSeries = teamSeriesById.get(teamA) ?? null;
    const bSeries = teamSeriesById.get(teamB) ?? null;

    const h2h = data.matchups
      .filter(
        (m) =>
          (m.homeTeam.id === teamA && m.awayTeam.id === teamB) || (m.homeTeam.id === teamB && m.awayTeam.id === teamA),
      )
      .filter((m) => Boolean(m.result))
      .slice()
      .sort((x, y) => x.week - y.week);

    let aW = 0;
    let aL = 0;
    let aT = 0;
    for (const m of h2h) {
      if (!m.result) continue;
      const aIsHome = m.homeTeam.id === teamA;
      const aScore = aIsHome ? m.result.homeScore : m.result.awayScore;
      const bScore = aIsHome ? m.result.awayScore : m.result.homeScore;
      if (aScore > bScore) aW += 1;
      else if (aScore < bScore) aL += 1;
      else aT += 1;
    }

    return {
      aStanding,
      bStanding,
      aSeries,
      bSeries,
      h2h,
      aRecord: { w: aW, l: aL, t: aT },
    };
  }, [data, teamA, teamB, teamSeriesById]);

  const metrics = useMemo(() => ["fantasy", ...data.statDefs.map((s) => s.key)], [data.statDefs]);

  const [playerTeam, setPlayerTeam] = useState<string>("__ALL__");
  const [playerMetric, setPlayerMetric] = useState<string>("fantasy");
  const [playerSort, setPlayerSort] = useState<{ key: "total" | "avg"; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });
  const [playerQuery, setPlayerQuery] = useState("");

  const players = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    const filtered = data.athletes
      .filter((a) => (playerTeam === "__ALL__" ? true : a.teamId === playerTeam))
      .filter((a) => (q ? a.athleteName.toLowerCase().includes(q) || a.teamName.toLowerCase().includes(q) : true));

    const dir = playerSort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = athleteMetricValue(a, playerMetric, playerSort.key);
      const bv = athleteMetricValue(b, playerMetric, playerSort.key);
      if (bv !== av) return (bv - av) * dir;
      return a.athleteName.localeCompare(b.athleteName);
    });

    return filtered;
  }, [data.athletes, playerMetric, playerQuery, playerSort.dir, playerSort.key, playerTeam]);

  const metricDecimals = decimalsForMetric(playerMetric, decimalsByKey);
  const playerMetricLabel = metricLabel(playerMetric, statLabelByKey);

  return (
    <div className="analyticsShell">
      <div className="analyticsTabs" role="tablist" aria-label="Analytics sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn("analyticsTab", tab === t.id && "analyticsTab--active")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="analyticsKpis">
        <Card className="kpiCard">
          <div className="kpiCard__k">League average</div>
          <div className="kpiCard__v">
            {typeof data.leagueWeekAverages[data.currentWeek - 1] === "number"
              ? formatNumber(data.leagueWeekAverages[data.currentWeek - 1] ?? 0, 1)
              : "-"}
          </div>
          <div className="kpiCard__sub">This week (all teams)</div>
          <Sparkline
            className="kpiCard__spark"
            series={[{ values: data.leagueWeekAverages, color: "var(--color-accent2)" }]}
            width={220}
            height={44}
          />
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">High score</div>
          <div className="kpiCard__v">
            {leagueKpis.high ? formatNumber(leagueKpis.high.score, 1) : "-"}
          </div>
          <div className="kpiCard__sub">
            {leagueKpis.high ? (
              <>
                Week {leagueKpis.high.week} · {getTeamName(data, leagueKpis.high.teamId)}
              </>
            ) : (
              "No finals yet"
            )}
          </div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Most consistent</div>
          <div className="kpiCard__v">{leagueKpis.mostConsistent ? formatNumber(leagueKpis.mostConsistent.stddev, 1) : "-"}</div>
          <div className="kpiCard__sub">
            {leagueKpis.mostConsistent ? `${getTeamName(data, leagueKpis.mostConsistent.teamId)} (σ)` : "Need 3+ games"}
          </div>
        </Card>
      </div>

      {tab === "standings" ? (
        <div className="analyticsGrid">
          <Card>
            <div className="analyticsSectionHeader">
              <div>
                <h2>Standings</h2>
                <p className="ui-muted">Sortable, with trends and consistency.</p>
              </div>
              <div className="analyticsTools">
                <button
                  type="button"
                  className="ui-button ui-button--secondary ui-button--sm"
                  onClick={() => {
                    const header = ["Rank", "Team", "W", "L", "T", "WinPct", "PF", "PA", "Diff", "Avg", "StdDev", "Last5", "Streak"];
                    const rows = data.standings.map((s) => [
                      String(s.rank),
                      s.teamName,
                      String(s.wins),
                      String(s.losses),
                      String(s.ties),
                      formatNumber(s.winPct, 4),
                      formatNumber(s.pointsFor, 2),
                      formatNumber(s.pointsAgainst, 2),
                      formatNumber(s.diff, 2),
                      formatNumber(s.avg, 2),
                      formatNumber(s.stddev, 2),
                      s.last5,
                      s.streak,
                    ]);
                    downloadCsv(`${data.leagueName}-standings.csv`, header, rows);
                  }}
                >
                  Export CSV
                </button>
                <Input
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  placeholder="Filter teams…"
                />
              </div>
            </div>

            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "rank"))}>
                        #
                      </button>
                    </th>
                    <th>
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "teamName"))}>
                        Team
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "wins"))}>
                        W
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "losses"))}>
                        L
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "ties"))}>
                        T
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "winPct"))}>
                        Win%
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "pointsFor"))}>
                        PF
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "pointsAgainst"))}>
                        PA
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "diff"))}>
                        Diff
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "avg"))}>
                        Avg
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="thButton" onClick={() => setStandingSort(sortToggle(standingSort, "stddev"))}>
                        σ
                      </button>
                    </th>
                    <th>Last 5</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s) => {
                    const series = teamSeriesById.get(s.teamId);
                    return (
                      <tr key={s.teamId}>
                        <td className="num">{s.rank}</td>
                        <td>
                          <Link className="ui-link" href={`/leagues/${data.leagueId}/teams/${s.teamId}`}>
                            {s.teamName}
                          </Link>
                        </td>
                        <td className="num">{s.wins}</td>
                        <td className="num">{s.losses}</td>
                        <td className="num">{s.ties}</td>
                        <td className="num">{formatNumber(s.winPct * 100, 1)}</td>
                        <td className="num">{formatNumber(s.pointsFor, 1)}</td>
                        <td className="num">{formatNumber(s.pointsAgainst, 1)}</td>
                        <td className={cn("num", s.diff >= 0 ? "pos" : "neg")}>{formatNumber(s.diff, 1)}</td>
                        <td className="num">{formatNumber(s.avg, 1)}</td>
                        <td className="num">{formatNumber(s.stddev, 1)}</td>
                        <td className="mono">{s.last5}</td>
                        <td>
                          {series ? (
                            <Sparkline
                              className="tableSpark"
                              series={[{ values: series.pf, color: "var(--color-accent2)" }]}
                              width={120}
                              height={28}
                              strokeWidth={2}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="analyticsSectionHeader">
              <div>
                <h2>Performance heatmap</h2>
                <p className="ui-muted">Weekly points vs league average.</p>
              </div>
            </div>

            <div className="heatmapWrap">
              <div className="heatmapHeader">
                <div className="heatmapHeader__team">Team</div>
                <div className="heatmapHeader__weeks">
                  {Array.from({ length: data.weeks }).map((_, idx) => (
                    <div key={idx} className="heatWeek">
                      W{idx + 1}
                    </div>
                  ))}
                </div>
              </div>

              <div className="heatmapBody">
                {data.standings.map((s) => {
                  const series = teamSeriesById.get(s.teamId);
                  return (
                    <div key={s.teamId} className="heatmapRow">
                      <Link className="ui-link heatmapTeam" href={`/leagues/${data.leagueId}/teams/${s.teamId}`}>
                        {s.teamName}
                      </Link>
                      <div className="heatmapCells">
                        {Array.from({ length: data.weeks }).map((_, idx) => {
                          const v = series?.pf[idx] ?? null;
                          const avg = data.leagueWeekAverages[idx] ?? null;
                          return (
                            <div
                              key={idx}
                              className={cn("heatCell", v === null && "heatCell--empty")}
                              style={typeof v === "number" && avg !== null ? heatStyle(v, avg) : undefined}
                              title={typeof v === "number" ? `Week ${idx + 1}: ${formatNumber(v, 1)}` : `Week ${idx + 1}: -`}
                            >
                              {typeof v === "number" ? formatNumber(v, 0) : "–"}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "compare" ? (
        <div className="analyticsGrid">
          <Card>
            <div className="analyticsSectionHeader">
              <div>
                <h2>Compare teams</h2>
                <p className="ui-muted">Head-to-head, trend lines, and split metrics.</p>
              </div>
              <div className="analyticsTools">
                <select
                  className="ui-input"
                  value={teamA}
                  onChange={(e) => setTeamA(e.target.value)}
                  aria-label="Team A"
                >
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  className="ui-input"
                  value={teamB}
                  onChange={(e) => setTeamB(e.target.value)}
                  aria-label="Team B"
                >
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === teamA}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="compareTop">
              <div className="compareCard">
                <div className="compareCard__k">Team A</div>
                <div className="compareCard__name">
                  <Link className="ui-link" href={`/leagues/${data.leagueId}/teams/${teamA}`}>
                    {getTeamName(data, teamA)}
                  </Link>
                </div>
                <div className="compareCard__stats">
                  <span className="chip">Rank {compare.aStanding?.rank ?? "-"}</span>
                  <span className="chip">
                    {compare.aStanding ? `${compare.aStanding.wins}-${compare.aStanding.losses}${compare.aStanding.ties ? `-${compare.aStanding.ties}` : ""}` : "0-0"}
                  </span>
                  <span className="chip">PF {formatNumber(compare.aStanding?.pointsFor ?? 0, 1)}</span>
                  <span className="chip">PA {formatNumber(compare.aStanding?.pointsAgainst ?? 0, 1)}</span>
                </div>
              </div>

              <div className="compareCard">
                <div className="compareCard__k">Head-to-head</div>
                <div className="compareCard__name mono">
                  {compare.aRecord.w}-{compare.aRecord.l}
                  {compare.aRecord.t ? `-${compare.aRecord.t}` : ""}
                </div>
                <div className="compareCard__sub ui-muted">({getTeamName(data, teamA)} perspective)</div>
                <div className="compareCard__stats">
                  <span className="chip">{compare.h2h.length} game(s)</span>
                </div>
              </div>

              <div className="compareCard">
                <div className="compareCard__k">Team B</div>
                <div className="compareCard__name">
                  <Link className="ui-link" href={`/leagues/${data.leagueId}/teams/${teamB}`}>
                    {getTeamName(data, teamB)}
                  </Link>
                </div>
                <div className="compareCard__stats">
                  <span className="chip">Rank {compare.bStanding?.rank ?? "-"}</span>
                  <span className="chip">
                    {compare.bStanding ? `${compare.bStanding.wins}-${compare.bStanding.losses}${compare.bStanding.ties ? `-${compare.bStanding.ties}` : ""}` : "0-0"}
                  </span>
                  <span className="chip">PF {formatNumber(compare.bStanding?.pointsFor ?? 0, 1)}</span>
                  <span className="chip">PA {formatNumber(compare.bStanding?.pointsAgainst ?? 0, 1)}</span>
                </div>
              </div>
            </div>

            <div className="compareChart">
              <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                Weekly points (PF)
              </div>
              <Sparkline
                series={[
                  { values: compare.aSeries?.pf ?? [], color: "var(--color-accent2)" },
                  { values: compare.bSeries?.pf ?? [], color: "var(--color-accent)" },
                ]}
                width={760}
                height={92}
                strokeWidth={3}
              />
            </div>

            <div className="dataTableWrap" style={{ marginTop: "var(--space-3)" }}>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Matchup</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.h2h.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="ui-muted">
                        No head-to-head games yet.
                      </td>
                    </tr>
                  ) : (
                    compare.h2h.map((m) => (
                      <tr key={m.id}>
                        <td className="mono">W{m.week}</td>
                        <td>
                          {m.homeTeam.name} vs {m.awayTeam.name}
                        </td>
                        <td className="num mono">
                          {m.result ? `${formatNumber(m.result.homeScore, 1)}-${formatNumber(m.result.awayScore, 1)}` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "players" ? (
        <div className="analyticsGrid">
          <Card>
            <div className="analyticsSectionHeader">
              <div>
                <h2>Player explorer</h2>
                <p className="ui-muted">Filter, sort, and compare by any configured stat.</p>
              </div>
              <div className="analyticsTools analyticsTools--wide">
                <button
                  type="button"
                  className="ui-button ui-button--secondary ui-button--sm"
                  onClick={() => {
                    const metricKeys = metrics;
                    const header = [
                      "Athlete",
                      "Team",
                      "WeeksPlayed",
                      ...metricKeys.flatMap((k) => [`${metricLabel(k, statLabelByKey)} total`, `${metricLabel(k, statLabelByKey)} avg`]),
                    ];

                    const rows = players.map((p) => {
                      const cells = [
                        p.athleteName,
                        p.teamName,
                        String(p.weeksPlayed),
                        ...metricKeys.flatMap((k) => [
                          formatNumber(p.totals[k] ?? 0, decimalsForMetric(k, decimalsByKey)),
                          formatNumber(p.avgs[k] ?? 0, decimalsForMetric(k, decimalsByKey)),
                        ]),
                      ];
                      return cells;
                    });

                    downloadCsv(`${data.leagueName}-players.csv`, header, rows);
                  }}
                >
                  Export CSV
                </button>
                <select className="ui-input" value={playerTeam} onChange={(e) => setPlayerTeam(e.target.value)}>
                  <option value="__ALL__">All teams</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select className="ui-input" value={playerMetric} onChange={(e) => setPlayerMetric(e.target.value)}>
                  {metrics.map((m) => (
                    <option key={m} value={m}>
                      {metricLabel(m, statLabelByKey)}
                    </option>
                  ))}
                </select>
                <select
                  className="ui-input"
                  value={`${playerSort.key}:${playerSort.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(":");
                    if (key !== "total" && key !== "avg") return;
                    if (dir !== "asc" && dir !== "desc") return;
                    setPlayerSort({ key, dir });
                  }}
                >
                  <option value="total:desc">Total ↓</option>
                  <option value="total:asc">Total ↑</option>
                  <option value="avg:desc">Average ↓</option>
                  <option value="avg:asc">Average ↑</option>
                </select>
                <Input value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="Search athletes…" />
              </div>
            </div>

            <div className="dataTableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Athlete</th>
                    <th>Team</th>
                    <th className="num">Weeks</th>
                    <th className="num">{playerMetricLabel} (total)</th>
                    <th className="num">{playerMetricLabel} (avg)</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {players.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ui-muted">
                        No athletes match your filters. Stats appear after games are played.
                      </td>
                    </tr>
                  ) : (
                    players.map((p) => (
                      <tr key={p.athleteId}>
                        <td>
                          <Link className="ui-link" href={`/leagues/${data.leagueId}/athletes/${p.athleteId}`}>
                            {p.athleteName}
                          </Link>
                        </td>
                        <td className="ui-muted">
                          <Link className="ui-link" href={`/leagues/${data.leagueId}/teams/${p.teamId}`}>
                            {p.teamName}
                          </Link>
                        </td>
                        <td className="num mono">{p.weeksPlayed}</td>
                        <td className="num mono">{formatNumber(p.totals[playerMetric] ?? 0, metricDecimals)}</td>
                        <td className="num mono">{formatNumber(p.avgs[playerMetric] ?? 0, metricDecimals)}</td>
                        <td>
                          <Sparkline
                            className="tableSpark"
                            series={[{ values: p.series[playerMetric] ?? [], color: "var(--color-accent2)" }]}
                            width={120}
                            height={28}
                            strokeWidth={2}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
