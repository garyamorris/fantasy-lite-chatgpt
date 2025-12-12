"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { TeamAnalyticsVm } from "@/lib/analytics-vm";
import { Sparkline } from "@/components/charts/Sparkline";

function formatNumber(n: number, decimals: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(decimals);
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

function metricLabel(metric: string, statLabelByKey: Map<string, string>) {
  if (metric === "fantasy") return "Fantasy points";
  return statLabelByKey.get(metric) ?? metric;
}

function decimalsForMetric(metric: string, decimalsByKey: Map<string, number>) {
  if (metric === "fantasy") return 1;
  return decimalsByKey.get(metric) ?? 0;
}

export function TeamAnalyticsClient({ data }: { data: TeamAnalyticsVm }) {
  const router = useRouter();

  const statLabelByKey = useMemo(() => new Map(data.statDefs.map((s) => [s.key, s.label] as const)), [data.statDefs]);
  const decimalsByKey = useMemo(() => new Map(data.statDefs.map((s) => [s.key, s.decimals] as const)), [data.statDefs]);
  const metrics = useMemo(() => ["fantasy", ...data.statDefs.map((s) => s.key)], [data.statDefs]);

  const otherTeams = useMemo(() => data.allTeams.filter((t) => t.id !== data.team.id), [data.allTeams, data.team.id]);
  const [compareTo, setCompareTo] = useState<string>(otherTeams[0]?.id ?? "");

  const [metric, setMetric] = useState<string>("fantasy");
  const [sort, setSort] = useState<{ key: "total" | "avg" | "name"; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });
  const [q, setQ] = useState("");

  const metricDecimals = decimalsForMetric(metric, decimalsByKey);
  const metricName = metricLabel(metric, statLabelByKey);

  const athletes = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = data.athletes.filter((a) => (query ? a.athleteName.toLowerCase().includes(query) : true));

    const dir = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sort.key === "name") return a.athleteName.localeCompare(b.athleteName) * dir;
      const av = sort.key === "total" ? a.totals[metric] ?? 0 : a.avgs[metric] ?? 0;
      const bv = sort.key === "total" ? b.totals[metric] ?? 0 : b.avgs[metric] ?? 0;
      if (bv !== av) return (bv - av) * dir;
      return a.athleteName.localeCompare(b.athleteName);
    });
    return filtered;
  }, [data.athletes, metric, q, sort.dir, sort.key]);

  const matchups = useMemo(
    () => data.matchups.slice().sort((a, b) => a.week - b.week),
    [data.matchups],
  );

  return (
    <div className="analyticsShell">
      <div className="analyticsKpis">
        <Card className="kpiCard">
          <div className="kpiCard__k">Rank</div>
          <div className="kpiCard__v">{data.rank ?? "-"}</div>
          <div className="kpiCard__sub">
            Record {data.record.wins}-{data.record.losses}
            {data.record.ties ? `-${data.record.ties}` : ""}
          </div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Points</div>
          <div className="kpiCard__v">{formatNumber(data.record.pointsFor, 1)}</div>
          <div className="kpiCard__sub">
            PA {formatNumber(data.record.pointsAgainst, 1)} · Diff{" "}
            <span className={cn(data.record.diff >= 0 ? "pos" : "neg")}>{formatNumber(data.record.diff, 1)}</span>
          </div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Ceiling / Avg</div>
          <div className="kpiCard__v">
            {formatNumber(data.record.ceiling, 1)} <span className="ui-muted">/</span> {formatNumber(data.record.avg, 1)}
          </div>
          <div className="kpiCard__sub">σ {formatNumber(data.record.stddev, 1)} · Last {data.record.last5}</div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Trend</div>
          <Sparkline
            className="kpiCard__spark"
            series={[
              { values: data.series.pf, color: "var(--color-accent2)" },
              { values: data.series.pa, color: "rgba(255,255,255,0.38)", dashed: true },
            ]}
            width={220}
            height={44}
          />
          <div className="kpiCard__sub">PF (solid) vs PA (dashed)</div>
        </Card>
      </div>

      <div className="analyticsGrid">
        <Card>
          <div className="analyticsSectionHeader">
            <div>
              <h2>Compare</h2>
              <p className="ui-muted">Jump straight into head-to-head analysis.</p>
            </div>
            <div className="analyticsTools">
              <select className="ui-input" value={compareTo} onChange={(e) => setCompareTo(e.target.value)}>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--md"
                onClick={() => {
                  if (!compareTo) return;
                  router.push(
                    `/leagues/${data.leagueId}/analytics?tab=compare&a=${encodeURIComponent(data.team.id)}&b=${encodeURIComponent(compareTo)}`,
                  );
                }}
              >
                Compare
              </button>
            </div>
          </div>

          <div className="dataTableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Opponent</th>
                  <th>Status</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {matchups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ui-muted">
                      No matchups scheduled.
                    </td>
                  </tr>
                ) : (
                  matchups.map((m) => {
                    const isHome = m.homeTeam.id === data.team.id;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const teamScore = m.result ? (isHome ? m.result.homeScore : m.result.awayScore) : null;
                    const oppScore = m.result ? (isHome ? m.result.awayScore : m.result.homeScore) : null;
                    const outcome =
                      teamScore === null || oppScore === null
                        ? null
                        : teamScore > oppScore
                          ? "W"
                          : teamScore < oppScore
                            ? "L"
                            : "T";
                    return (
                      <tr key={m.id}>
                        <td className="mono">W{m.week}</td>
                        <td>
                          <Link className="ui-link" href={`/leagues/${data.leagueId}/teams/${opp.id}`}>
                            {opp.name}
                          </Link>
                        </td>
                        <td className="ui-muted">{m.result ? "FINAL" : "Scheduled"}</td>
                        <td className="num mono">
                          {m.result ? (
                            <span className={cn(outcome === "W" ? "pos" : outcome === "L" ? "neg" : "")}>
                              {formatNumber(teamScore ?? 0, 1)}-{formatNumber(oppScore ?? 0, 1)} {outcome ? `(${outcome})` : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="analyticsSectionHeader">
            <div>
              <h2>Roster performance</h2>
              <p className="ui-muted">Sort and trend athletes by any stat.</p>
            </div>
            <div className="analyticsTools analyticsTools--wide">
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--sm"
                onClick={() => {
                  const header = ["Athlete", "WeeksPlayed", ...metrics.flatMap((m) => [`${metricLabel(m, statLabelByKey)} total`, `${metricLabel(m, statLabelByKey)} avg`])];
                  const rows = data.athletes.map((a) => [
                    a.athleteName,
                    String(a.weeksPlayed),
                    ...metrics.flatMap((m) => [
                      formatNumber(a.totals[m] ?? 0, decimalsForMetric(m, decimalsByKey)),
                      formatNumber(a.avgs[m] ?? 0, decimalsForMetric(m, decimalsByKey)),
                    ]),
                  ]);
                  downloadCsv(`${data.team.name}-roster.csv`, header, rows);
                }}
              >
                Export CSV
              </button>
              <select className="ui-input" value={metric} onChange={(e) => setMetric(e.target.value)}>
                {metrics.map((m) => (
                  <option key={m} value={m}>
                    {metricLabel(m, statLabelByKey)}
                  </option>
                ))}
              </select>
              <select
                className="ui-input"
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  if (key !== "total" && key !== "avg" && key !== "name") return;
                  if (dir !== "asc" && dir !== "desc") return;
                  setSort({ key, dir } as { key: "total" | "avg" | "name"; dir: "asc" | "desc" });
                }}
              >
                <option value="total:desc">Total ↓</option>
                <option value="total:asc">Total ↑</option>
                <option value="avg:desc">Average ↓</option>
                <option value="avg:asc">Average ↑</option>
                <option value="name:asc">Name A→Z</option>
                <option value="name:desc">Name Z→A</option>
              </select>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roster…" />
            </div>
          </div>

          <div className="dataTableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th className="num">{metricName} (total)</th>
                  <th className="num">{metricName} (avg)</th>
                  <th className="num">Weeks</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {athletes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="ui-muted">
                      No athletes yet.
                    </td>
                  </tr>
                ) : (
                  athletes.map((a) => (
                    <tr key={a.athleteId}>
                      <td>
                        <Link className="ui-link" href={`/leagues/${data.leagueId}/athletes/${a.athleteId}`}>
                          {a.athleteName}
                        </Link>
                      </td>
                      <td className="num mono">{formatNumber(a.totals[metric] ?? 0, metricDecimals)}</td>
                      <td className="num mono">{formatNumber(a.avgs[metric] ?? 0, metricDecimals)}</td>
                      <td className="num mono">{a.weeksPlayed}</td>
                      <td>
                        <Sparkline
                          className="tableSpark"
                          series={[{ values: a.series[metric] ?? [], color: "var(--color-accent2)" }]}
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
    </div>
  );
}
