import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseRuleSetConfig } from "@/lib/rules";
import { buildLeagueAnalyticsVm } from "@/lib/analytics";
import { LeagueAnalyticsClient } from "@/app/leagues/[leagueId]/analytics/analytics-client";

export default async function LeagueAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ tab?: string; a?: string; b?: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const { tab, a, b } = await searchParams;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) redirect("/dashboard");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true, sport: true },
  });
  if (!league) redirect("/dashboard");

  const config = parseRuleSetConfig(league.ruleSet.config);

  const [teams, matchups, athletes, athleteWeekStats] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.matchup.findMany({
      where: { leagueId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: true,
      },
      orderBy: [{ week: "asc" }, { createdAt: "asc" }],
    }),
    prisma.athlete.findMany({
      where: { team: { leagueId } },
      include: { team: { select: { id: true, name: true } } },
      orderBy: [{ teamId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.athleteWeekStat.findMany({
      where: { leagueId, week: { lte: config.schedule.weeks } },
      select: { athleteId: true, week: true, stats: true },
    }),
  ]);

  const vm = buildLeagueAnalyticsVm({
    leagueId: league.id,
    leagueName: league.name,
    currentWeek: league.currentWeek,
    config,
    teams,
    matchups,
    athletes: athletes.map((a) => ({ id: a.id, name: a.name, team: { id: a.team.id, name: a.team.name } })),
    athleteWeekStats,
  });

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>Analytics</h1>
          <p className="ui-muted">
            {league.name} | {league.sport.name} | Week {league.currentWeek}/{config.schedule.weeks}
          </p>
        </div>
        <Link className="ui-link" href={`/leagues/${leagueId}`}>
          Back to league
        </Link>
      </div>

      <LeagueAnalyticsClient data={vm} initialTab={tab} initialTeamA={a} initialTeamB={b} />
    </main>
  );
}

