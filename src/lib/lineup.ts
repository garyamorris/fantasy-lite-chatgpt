import "server-only";

import { prisma } from "@/lib/db";
import type { RuleSetConfig } from "@/lib/rules";
import { listStarterSlots } from "@/lib/rules";

export async function ensureLineup(teamId: string, week: number, config: RuleSetConfig) {
  const required = listStarterSlots(config);

  const lineup = await prisma.lineup.upsert({
    where: { teamId_week: { teamId, week } },
    update: {},
    create: {
      teamId,
      week,
      slots: {
        create: required.map((s) => ({
          slotKey: s.slotKey,
          slotIndex: s.slotIndex,
        })),
      },
    },
    include: { slots: true },
  });

  const existing = new Set(lineup.slots.map((s) => `${s.slotKey}:${s.slotIndex}`));
  const missing = required.filter((s) => !existing.has(`${s.slotKey}:${s.slotIndex}`));

  if (missing.length > 0) {
    await prisma.lineupSlot.createMany({
      data: missing.map((s) => ({
        lineupId: lineup.id,
        slotKey: s.slotKey,
        slotIndex: s.slotIndex,
      })),
    });
  }

  const updated = await prisma.lineup.findUnique({
    where: { id: lineup.id },
    include: { slots: true },
  });

  return updated ?? lineup;
}

