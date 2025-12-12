import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseRuleSetConfig } from "@/lib/rules";
import { buildAthleteAnalyticsVm } from "@/lib/analytics";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/charts/Sparkline";

function formatNumber(n: number | null, decimals: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return n.toFixed(decimals);
}

export default async function AthletePage({
  params,
}: {
  params: Promise<{ leagueId: string; athleteId: string }>;
}) {
  const user = await requireUser();
  const { leagueId, athleteId } = await params;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) redirect("/dashboard");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true, sport: true },
  });
  if (!league) redirect("/dashboard");

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    include: { team: { select: { id: true, name: true, leagueId: true } } },
  });
  if (!athlete || athlete.team.leagueId !== leagueId) redirect(`/leagues/${leagueId}`);

  const config = parseRuleSetConfig(league.ruleSet.config);

  const [athleteWeekStats, startedRows] = await Promise.all([
    prisma.athleteWeekStat.findMany({
      where: { leagueId, athleteId },
      select: { athleteId: true, week: true, stats: true },
      orderBy: { week: "asc" },
    }),
    prisma.lineupSlot.findMany({
      where: { athleteId, lineup: { team: { leagueId } } },
      select: { lineup: { select: { week: true } } },
    }),
  ]);

  const startedWeeks = Array.from(new Set(startedRows.map((r) => r.lineup.week))).sort((a, b) => a - b);

  const vm = buildAthleteAnalyticsVm({
    leagueId: league.id,
    leagueName: league.name,
    currentWeek: league.currentWeek,
    config,
    athlete: { id: athlete.id, name: athlete.name, teamId: athlete.team.id, teamName: athlete.team.name },
    athleteWeekStats,
    startedWeeks,
  });

  const fantasySeries = vm.weeksData.map((w) => w.fantasy);

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>{vm.athlete.name}</h1>
          <p className="ui-muted">
            <Link className="ui-link" href={`/leagues/${leagueId}/teams/${vm.athlete.teamId}`}>
              {vm.athlete.teamName}
            </Link>{" "}
            | {league.name} | {league.sport.name}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link className="ui-link" href={`/leagues/${leagueId}/analytics?tab=players`}>
            League players
          </Link>
          <Link className="ui-link" href={`/leagues/${leagueId}`}>
            Back to league
          </Link>
        </div>
      </div>

      <div className="analyticsKpis">
        <Card className="kpiCard">
          <div className="kpiCard__k">Fantasy total</div>
          <div className="kpiCard__v">{formatNumber(vm.totals.fantasy ?? 0, 1)}</div>
          <div className="kpiCard__sub">Weeks played: {vm.weeksPlayed}</div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Fantasy average</div>
          <div className="kpiCard__v">{formatNumber(vm.avgs.fantasy ?? 0, 1)}</div>
          <div className="kpiCard__sub">
            Best: {vm.bestWeek ? `W${vm.bestWeek.week} (${formatNumber(vm.bestWeek.fantasy, 1)})` : "—"}
          </div>
        </Card>

        <Card className="kpiCard">
          <div className="kpiCard__k">Trend</div>
          <Sparkline
            className="kpiCard__spark"
            series={[{ values: fantasySeries, color: "var(--color-accent2)" }]}
            width={220}
            height={44}
          />
          <div className="kpiCard__sub">
            Worst: {vm.worstWeek ? `W${vm.worstWeek.week} (${formatNumber(vm.worstWeek.fantasy, 1)})` : "—"}
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: "var(--space-4)" }}>
        <div className="analyticsSectionHeader">
          <div>
            <h2>Weekly stats</h2>
            <p className="ui-muted">Raw stat lines and fantasy scoring, week by week.</p>
          </div>
        </div>

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Week</th>
                <th>Started</th>
                <th className="num">Fantasy</th>
                {vm.statDefs.map((s) => (
                  <th key={s.key} className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vm.weeksData.map((w) => (
                <tr key={w.week}>
                  <td className="mono">W{w.week}</td>
                  <td className={w.started ? "pos" : "ui-muted"}>{w.started ? "Yes" : "No"}</td>
                  <td className="num mono">{formatNumber(w.fantasy, 1)}</td>
                  {vm.statDefs.map((s) => (
                    <td key={s.key} className="num mono">
                      {formatNumber(w.stats[s.key] ?? null, s.decimals)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

