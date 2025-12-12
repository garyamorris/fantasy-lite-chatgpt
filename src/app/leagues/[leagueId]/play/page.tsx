import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ensureLineup } from "@/lib/lineup";
import { listStarterSlots, parseRuleSetConfig } from "@/lib/rules";
import { Card } from "@/components/ui/Card";
import { MatchupPlayClient } from "@/app/leagues/[leagueId]/play/play-client";
import { lockLineupAction, simulateMatchupAction, updateLineupSlotAction } from "@/app/leagues/[leagueId]/play/actions";

export default async function PlayWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ teamId?: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const { teamId: requestedTeamId } = await searchParams;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) redirect("/dashboard");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true },
  });
  if (!league) redirect("/dashboard");

  const config = parseRuleSetConfig(league.ruleSet.config);

  const ownedTeams = await prisma.team.findMany({
    where: { leagueId, ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (ownedTeams.length === 0) {
    return (
      <main className="container">
        <Card className="emptyState">
          <h1>Play Week {league.currentWeek}</h1>
          <p className="ui-muted">Create a team to enter the 3D matchup arena.</p>
          <Link className="ui-link" href={`/leagues/${leagueId}/teams/new`}>
            Create team
          </Link>
        </Card>
      </main>
    );
  }

  const activeTeamId =
    (requestedTeamId && ownedTeams.some((t) => t.id === requestedTeamId) ? requestedTeamId : null) ??
    ownedTeams[0].id;

  const matchup = await prisma.matchup.findFirst({
    where: {
      leagueId,
      week: league.currentWeek,
      OR: [{ homeTeamId: activeTeamId }, { awayTeamId: activeTeamId }],
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: true,
    },
  });

  if (!matchup) {
    return (
      <main className="container">
        <Card className="emptyState">
          <h1>Week {league.currentWeek}</h1>
          <p className="ui-muted">No matchup is scheduled for your team this week.</p>
          <Link className="ui-link" href={`/leagues/${leagueId}`}>
            Back to league
          </Link>
        </Card>
      </main>
    );
  }

  const isHome = matchup.homeTeamId === activeTeamId;
  const opponent = isHome ? matchup.awayTeam : matchup.homeTeam;

  const userLineup = await ensureLineup(activeTeamId, league.currentWeek, config);

  const [userLineupFull, userAthletes, opponentLineup, opponentAthletes] = await Promise.all([
    prisma.lineup.findUnique({
      where: { id: userLineup.id },
      include: { slots: { orderBy: [{ slotKey: "asc" }, { slotIndex: "asc" }] } },
    }),
    prisma.athlete.findMany({
      where: { teamId: activeTeamId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    ensureLineup(opponent.id, league.currentWeek, config),
    prisma.athlete.findMany({
      where: { teamId: opponent.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!userLineupFull) return null;

  const slotOrder = new Map(config.roster.starterSlots.map((s, idx) => [s.key, idx]));
  const labelByKey = new Map(config.roster.starterSlots.map((s) => [s.key, s.label]));

  const requiredSlots = listStarterSlots(config);
  const requiredSet = new Set(requiredSlots.map((s) => `${s.slotKey}:${s.slotIndex}`));

  const lineupSlots = userLineupFull.slots
    .filter((s) => requiredSet.has(`${s.slotKey}:${s.slotIndex}`))
    .map((s) => ({
      id: s.id,
      slotKey: s.slotKey,
      slotIndex: s.slotIndex,
      athleteId: s.athleteId,
      label: labelByKey.get(s.slotKey) ?? s.slotKey,
    }))
    .sort((a, b) => (slotOrder.get(a.slotKey) ?? 999) - (slotOrder.get(b.slotKey) ?? 999) || a.slotIndex - b.slotIndex);

  const opponentLineupFull = await prisma.lineup.findUnique({
    where: { id: opponentLineup.id },
    include: { slots: { orderBy: [{ slotKey: "asc" }, { slotIndex: "asc" }] } },
  });

  const opponentSlots = (opponentLineupFull?.slots ?? [])
    .filter((s) => requiredSet.has(`${s.slotKey}:${s.slotIndex}`))
    .map((s) => ({
      id: s.id,
      slotKey: s.slotKey,
      slotIndex: s.slotIndex,
      athleteId: s.athleteId,
      label: labelByKey.get(s.slotKey) ?? s.slotKey,
    }))
    .sort((a, b) => (slotOrder.get(a.slotKey) ?? 999) - (slotOrder.get(b.slotKey) ?? 999) || a.slotIndex - b.slotIndex);

  return (
    <main className="container">
      <MatchupPlayClient
        league={{ id: league.id, name: league.name, week: league.currentWeek, weeks: config.schedule.weeks }}
        rules={{
          roster: {
            starterSlots: config.roster.starterSlots,
          },
        }}
        matchup={{
          id: matchup.id,
          week: matchup.week,
          status: matchup.status,
          homeTeam: matchup.homeTeam,
          awayTeam: matchup.awayTeam,
          result: matchup.result ? { homeScore: matchup.result.homeScore, awayScore: matchup.result.awayScore } : null,
        }}
        userTeam={{ id: activeTeamId, name: ownedTeams.find((t) => t.id === activeTeamId)?.name ?? "Your Team" }}
        opponentTeam={opponent}
        ownedTeams={ownedTeams}
        athletes={userAthletes}
        opponentAthletes={opponentAthletes}
        lineup={{
          id: userLineupFull.id,
          lockedAt: userLineupFull.lockedAt ? userLineupFull.lockedAt.toISOString() : null,
          slots: lineupSlots,
        }}
        opponentSlots={opponentSlots}
        updateLineupSlotAction={updateLineupSlotAction}
        lockLineupAction={lockLineupAction}
        simulateMatchupAction={simulateMatchupAction}
      />
    </main>
  );
}

