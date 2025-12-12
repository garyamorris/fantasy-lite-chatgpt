"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/access";
import { generateRoundRobinSchedule, parseRuleSetConfig, totalRosterSize } from "@/lib/rules";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function createLeagueAction(formData: FormData) {
  const user = await requireUser();

  const name = getString(formData, "name");
  const ruleSetId = getString(formData, "ruleSetId");

  if (!name || !ruleSetId) redirect("/leagues/new?error=invalid");

  const ruleSet = await prisma.ruleSet.findUnique({
    where: { id: ruleSetId },
  });
  if (!ruleSet) redirect("/leagues/new?error=invalid");

  const league = await prisma.league.create({
    data: {
      name,
      sportId: ruleSet.sportId,
      ruleSetId: ruleSet.id,
      commissionerId: user.id,
    },
  });

  await prisma.leagueMember.create({
    data: {
      leagueId: league.id,
      userId: user.id,
      role: "COMMISSIONER",
    },
  });

  redirect(`/leagues/${league.id}`);
}

export async function createTeamAction(leagueId: string, formData: FormData) {
  const user = await requireUser();
  const name = getString(formData, "name");

  if (!name) redirect(`/leagues/${leagueId}/teams/new?error=invalid`);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true },
  });
  if (!league) redirect("/dashboard");

  const config = parseRuleSetConfig(league.ruleSet.config);
  const athleteCount = totalRosterSize(config);

  const existing = await prisma.team.findFirst({
    where: { leagueId: league.id, name },
    select: { id: true },
  });
  if (existing) redirect(`/leagues/${leagueId}/teams/new?error=duplicate`);

  let team: { id: string };
  try {
    team = await prisma.team.create({
      data: {
        leagueId: league.id,
        ownerId: user.id,
        name,
        athletes: {
          create: Array.from({ length: athleteCount }).map((_, i) => ({
            name: `Athlete ${i + 1}`,
          })),
        },
      },
      select: { id: true },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      redirect(`/leagues/${leagueId}/teams/new?error=duplicate`);
    }
    throw err;
  }

  await prisma.leagueMember.upsert({
    where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
    update: {},
    create: { leagueId: league.id, userId: user.id, role: "MEMBER" },
  });

  const teamIds = (await prisma.team.findMany({ where: { leagueId: league.id }, select: { id: true } })).map(
    (t) => t.id,
  );
  const existingMatchups = await prisma.matchup.count({ where: { leagueId: league.id } });
  if (existingMatchups === 0 && teamIds.length >= 2) {
    const schedule = generateRoundRobinSchedule(teamIds, config.schedule.weeks);
    if (schedule.length > 0) {
      await prisma.matchup.createMany({
        data: schedule.map((m) => ({
          leagueId: league.id,
          week: m.week,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        })),
      });
    }
  }

  redirect(`/leagues/${league.id}?teamCreated=${team.id}`);
}

export async function generateScheduleAction(leagueId: string) {
  const user = await requireUser();

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true },
  });
  if (!league) redirect("/dashboard");
  if (league.commissionerId !== user.id) redirect(`/leagues/${leagueId}`);

  const config = parseRuleSetConfig(league.ruleSet.config);

  const teamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map((t) => t.id);
  if (teamIds.length < 2) redirect(`/leagues/${leagueId}?error=need_teams`);

  const finals = await prisma.matchup.count({ where: { leagueId, status: "FINAL" } });
  if (finals > 0) redirect(`/leagues/${leagueId}?error=locked`);

  await prisma.matchupResult.deleteMany({ where: { matchup: { leagueId } } });
  await prisma.matchup.deleteMany({ where: { leagueId } });

  const schedule = generateRoundRobinSchedule(teamIds, config.schedule.weeks);
  await prisma.matchup.createMany({
    data: schedule.map((m) => ({
      leagueId,
      week: m.week,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
    })),
  });

  redirect(`/leagues/${leagueId}`);
}

export async function advanceWeekAction(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { ruleSet: true },
  });
  if (!league) redirect("/dashboard");
  if (league.commissionerId !== user.id) redirect(`/leagues/${leagueId}`);

  const config = parseRuleSetConfig(league.ruleSet.config);
  const nextWeek = Math.min(league.currentWeek + 1, config.schedule.weeks);

  await prisma.league.update({
    where: { id: leagueId },
    data: { currentWeek: nextWeek },
  });

  redirect(`/leagues/${leagueId}`);
}
