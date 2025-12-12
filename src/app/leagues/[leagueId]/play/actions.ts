"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/access";
import { ensureLineup } from "@/lib/lineup";
import { parseRuleSetConfig, scoreFromStats, simulateAthleteStats } from "@/lib/rules";

export async function updateLineupSlotAction(lineupSlotId: string, athleteId: string | null) {
  const user = await requireUser();

  const slot = await prisma.lineupSlot.findUnique({
    where: { id: lineupSlotId },
    include: { lineup: { include: { team: true } } },
  });
  if (!slot) return { ok: false as const, error: "not_found" as const };
  if (slot.lineup.team.ownerId !== user.id) return { ok: false as const, error: "forbidden" as const };
  if (slot.lineup.lockedAt) return { ok: false as const, error: "locked" as const };

  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } });
    if (!athlete || athlete.teamId !== slot.lineup.teamId) {
      return { ok: false as const, error: "bad_athlete" as const };
    }

    const duplicate = await prisma.lineupSlot.findFirst({
      where: {
        lineupId: slot.lineupId,
        athleteId,
        NOT: { id: lineupSlotId },
      },
    });
    if (duplicate) return { ok: false as const, error: "duplicate" as const };
  }

  await prisma.lineupSlot.update({
    where: { id: lineupSlotId },
    data: { athleteId },
  });

  return { ok: true as const };
}

export async function lockLineupAction(lineupId: string) {
  const user = await requireUser();

  const lineup = await prisma.lineup.findUnique({
    where: { id: lineupId },
    include: { team: true, slots: true },
  });
  if (!lineup) return { ok: false as const, error: "not_found" as const };
  if (lineup.team.ownerId !== user.id) return { ok: false as const, error: "forbidden" as const };
  if (lineup.lockedAt) return { ok: false as const, error: "locked" as const };

  const missing = lineup.slots.filter((s) => !s.athleteId).length;
  if (missing > 0) return { ok: false as const, error: "incomplete" as const };

  const updated = await prisma.lineup.update({
    where: { id: lineupId },
    data: { lockedAt: new Date() },
    select: { lockedAt: true },
  });

  return { ok: true as const, lockedAt: updated.lockedAt?.toISOString() ?? null };
}

function parseStatsJson(statsJson: string): Record<string, number> {
  try {
    return JSON.parse(statsJson) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function simulateMatchupAction(leagueId: string, teamId: string) {
  const user = await requireUser();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return { ok: false as const, error: "not_found" as const };
  if (team.ownerId !== user.id) return { ok: false as const, error: "forbidden" as const };

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true },
  });
  if (!league || league.id !== team.leagueId) return { ok: false as const, error: "not_found" as const };

  const config = parseRuleSetConfig(league.ruleSet.config);
  const week = league.currentWeek;

  const matchup = await prisma.matchup.findFirst({
    where: {
      leagueId,
      week,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    include: { result: true },
  });
  if (!matchup) return { ok: false as const, error: "no_matchup" as const };
  if (matchup.result) {
    return {
      ok: true as const,
      matchupId: matchup.id,
      homeScore: matchup.result.homeScore,
      awayScore: matchup.result.awayScore,
      alreadyFinal: true as const,
    };
  }

  const homeLineup = await ensureLineup(matchup.homeTeamId, week, config);
  const awayLineup = await ensureLineup(matchup.awayTeamId, week, config);

  const [homeWithSlots, awayWithSlots] = await Promise.all([
    prisma.lineup.findUnique({ where: { id: homeLineup.id }, include: { slots: true } }),
    prisma.lineup.findUnique({ where: { id: awayLineup.id }, include: { slots: true } }),
  ]);
  if (!homeWithSlots || !awayWithSlots) return { ok: false as const, error: "not_found" as const };

  const isUserHome = matchup.homeTeamId === teamId;
  const userLineup = isUserHome ? homeWithSlots : awayWithSlots;
  const opponentLineup = isUserHome ? awayWithSlots : homeWithSlots;

  if (userLineup.slots.some((s) => !s.athleteId)) {
    return { ok: false as const, error: "incomplete" as const };
  }

  // Auto-fill opponent lineup so the matchup is playable in demo flows.
  const opponentSlotsMissing = opponentLineup.slots.filter((s) => !s.athleteId);
  if (opponentSlotsMissing.length > 0) {
    const opponentAthletes = await prisma.athlete.findMany({
      where: { teamId: opponentLineup.teamId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const used = new Set(opponentLineup.slots.map((s) => s.athleteId).filter(Boolean) as string[]);
    const available = opponentAthletes.map((a) => a.id).filter((id) => !used.has(id));

    await prisma.$transaction(
      opponentSlotsMissing.map((slot, idx) =>
        prisma.lineupSlot.update({
          where: { id: slot.id },
          data: { athleteId: available[idx] ?? available[0] ?? null },
        }),
      ),
    );
  }

  const [finalHome, finalAway] = await Promise.all([
    prisma.lineup.findUnique({ where: { id: homeWithSlots.id }, include: { slots: true } }),
    prisma.lineup.findUnique({ where: { id: awayWithSlots.id }, include: { slots: true } }),
  ]);
  if (!finalHome || !finalAway) return { ok: false as const, error: "not_found" as const };

  // Create stats for the full roster so analytics can show every athlete (starters + bench).
  const rosterAthletes = await prisma.athlete.findMany({
    where: { teamId: { in: [finalHome.teamId, finalAway.teamId] } },
    select: { id: true },
  });
  const athleteIds = rosterAthletes.map((a) => a.id);

  const existingStats = await prisma.athleteWeekStat.findMany({
    where: { leagueId, week, athleteId: { in: athleteIds } },
    select: { athleteId: true, stats: true },
  });
  const statsByAthlete = new Map(existingStats.map((s) => [s.athleteId, s.stats]));

  const toCreate = athleteIds.filter((id) => !statsByAthlete.has(id));
  if (toCreate.length > 0) {
    await prisma.athleteWeekStat.createMany({
      data: toCreate.map((athleteId) => ({
        leagueId,
        week,
        athleteId,
        stats: JSON.stringify(simulateAthleteStats(config, `${leagueId}:${week}:${athleteId}`)),
      })),
    });
    const created = await prisma.athleteWeekStat.findMany({
      where: { leagueId, week, athleteId: { in: toCreate } },
      select: { athleteId: true, stats: true },
    });
    for (const row of created) statsByAthlete.set(row.athleteId, row.stats);
  }

  const scoreTeam = (slots: { athleteId: string | null }[]) => {
    let total = 0;
    for (const slot of slots) {
      if (!slot.athleteId) continue;
      const statsJson = statsByAthlete.get(slot.athleteId);
      if (!statsJson) continue;
      total += scoreFromStats(config, parseStatsJson(statsJson));
    }
    return total;
  };

  const homeScore = scoreTeam(finalHome.slots);
  const awayScore = scoreTeam(finalAway.slots);

  await prisma.$transaction([
    prisma.matchupResult.create({
      data: {
        matchupId: matchup.id,
        homeScore,
        awayScore,
      },
    }),
    prisma.matchup.update({ where: { id: matchup.id }, data: { status: "FINAL" } }),
  ]);

  return {
    ok: true as const,
    matchupId: matchup.id,
    homeScore,
    awayScore,
    alreadyFinal: false as const,
  };
}
