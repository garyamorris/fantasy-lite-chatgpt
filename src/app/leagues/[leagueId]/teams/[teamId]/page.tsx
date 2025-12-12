import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseRuleSetConfig } from "@/lib/rules";
import { buildLeagueAnalyticsVm, buildTeamAnalyticsVm } from "@/lib/analytics";
import { TeamAnalyticsClient } from "@/app/leagues/[leagueId]/teams/[teamId]/team-client";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ leagueId: string; teamId: string }>;
}) {
  const user = await requireUser();
  const { leagueId, teamId } = await params;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) redirect("/dashboard");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true, sport: true },
  });
  if (!league) redirect("/dashboard");

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, leagueId: true },
  });
  if (!team || team.leagueId !== leagueId) redirect(`/leagues/${leagueId}`);

  const config = parseRuleSetConfig(league.ruleSet.config);

  const [teams, matchups, athletes] = await Promise.all([
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
      where: { teamId },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const athleteIds = athletes.map((a) => a.id);
  const athleteWeekStats = athleteIds.length
    ? await prisma.athleteWeekStat.findMany({
        where: { leagueId, athleteId: { in: athleteIds } },
        select: { athleteId: true, week: true, stats: true },
      })
    : [];

  const leagueVm = buildLeagueAnalyticsVm({
    leagueId: league.id,
    leagueName: league.name,
    currentWeek: league.currentWeek,
    config,
    teams,
    matchups,
    athletes: athletes.map((a) => ({ id: a.id, name: a.name, team: { id: a.team.id, name: a.team.name } })),
    athleteWeekStats,
  });

  const vm = buildTeamAnalyticsVm({ leagueVm, teamId });
  if (!vm) redirect(`/leagues/${leagueId}`);

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>{team.name}</h1>
          <p className="ui-muted">
            {league.name} | {league.sport.name} | Week {league.currentWeek}/{config.schedule.weeks}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link className="ui-link" href={`/leagues/${leagueId}/analytics`}>
            League analytics
          </Link>
          <Link className="ui-link" href={`/leagues/${leagueId}`}>
            Back to league
          </Link>
        </div>
      </div>

      <TeamAnalyticsClient data={vm} />
    </main>
  );
}
