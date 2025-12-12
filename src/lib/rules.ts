import { z } from "zod";

const rosterSlotSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, _ or -"),
  label: z.string().min(1).max(48),
  count: z.number().int().min(1).max(20),
});

const statSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_.-]+$/, "Use letters, numbers, ., _ or -"),
  label: z.string().min(1).max(48),
  min: z.number().finite(),
  max: z.number().finite(),
  decimals: z.number().int().min(0).max(3).default(0),
});

const scoringRuleSchema = z.object({
  statKey: z.string().min(1).max(32),
  pointsPerUnit: z.number().finite(),
});

export const ruleSetConfigSchema = z
  .object({
    roster: z.object({
      starterSlots: z.array(rosterSlotSchema).min(1),
      benchSlots: z.number().int().min(0).max(50).default(0),
    }),
    scoring: z.object({
      stats: z.array(statSchema).min(1),
      rules: z.array(scoringRuleSchema).min(1),
    }),
    schedule: z.object({
      type: z.literal("roundRobin"),
      weeks: z.number().int().min(1).max(52),
    }),
    matchup: z.object({
      format: z.literal("H2H_POINTS"),
    }),
  })
  .superRefine((value, ctx) => {
    const rosterKeys = new Set<string>();
    for (const slot of value.roster.starterSlots) {
      if (rosterKeys.has(slot.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roster", "starterSlots"],
          message: `Duplicate roster slot key: ${slot.key}`,
        });
      }
      rosterKeys.add(slot.key);
    }

    const statKeys = new Set<string>();
    for (const stat of value.scoring.stats) {
      if (stat.min > stat.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scoring", "stats"],
          message: `Stat ${stat.key} has min > max`,
        });
      }

      if (statKeys.has(stat.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scoring", "stats"],
          message: `Duplicate stat key: ${stat.key}`,
        });
      }
      statKeys.add(stat.key);
    }

    for (const rule of value.scoring.rules) {
      if (!statKeys.has(rule.statKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scoring", "rules"],
          message: `Scoring rule references unknown statKey: ${rule.statKey}`,
        });
      }
    }
  });

export type RuleSetConfig = z.infer<typeof ruleSetConfigSchema>;

export type StarterSlotInstance = {
  slotKey: string;
  slotIndex: number;
  label: string;
};

export function parseRuleSetConfig(configJson: string): RuleSetConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(configJson);
  } catch {
    throw new Error("RuleSet config is not valid JSON.");
  }

  return ruleSetConfigSchema.parse(raw);
}

export function listStarterSlots(config: RuleSetConfig): StarterSlotInstance[] {
  const slots: StarterSlotInstance[] = [];
  for (const slot of config.roster.starterSlots) {
    for (let slotIndex = 0; slotIndex < slot.count; slotIndex += 1) {
      slots.push({ slotKey: slot.key, slotIndex, label: slot.label });
    }
  }
  return slots;
}

export function totalRosterSize(config: RuleSetConfig) {
  const starters = listStarterSlots(config).length;
  return starters + config.roster.benchSlots;
}

export function starterRuleSetConfig(): RuleSetConfig {
  return {
    roster: {
      starterSlots: [
        { key: "A", label: "Slot A", count: 3 },
        { key: "B", label: "Slot B", count: 2 },
      ],
      benchSlots: 3,
    },
    scoring: {
      stats: [
        { key: "points", label: "Points", min: 4, max: 30, decimals: 0 },
        { key: "assists", label: "Assists", min: 0, max: 10, decimals: 0 },
        { key: "blocks", label: "Blocks", min: 0, max: 5, decimals: 0 },
      ],
      rules: [
        { statKey: "points", pointsPerUnit: 1 },
        { statKey: "assists", pointsPerUnit: 2 },
        { statKey: "blocks", pointsPerUnit: 3 },
      ],
    },
    schedule: {
      type: "roundRobin",
      weeks: 8,
    },
    matchup: {
      format: "H2H_POINTS",
    },
  };
}

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateAthleteStats(config: RuleSetConfig, seed: string): Record<string, number> {
  const rand = mulberry32(fnv1a32(seed));
  const stats: Record<string, number> = {};

  for (const stat of config.scoring.stats) {
    const t = rand();
    const raw = stat.min + t * (stat.max - stat.min);
    const factor = 10 ** stat.decimals;
    stats[stat.key] = Math.round(raw * factor) / factor;
  }

  return stats;
}

export function scoreFromStats(config: RuleSetConfig, stats: Record<string, number>) {
  let score = 0;
  for (const rule of config.scoring.rules) {
    score += (stats[rule.statKey] ?? 0) * rule.pointsPerUnit;
  }
  return score;
}

export function generateRoundRobinSchedule(teamIds: string[], weeks: number) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];

  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("__BYE__");

  const n = ids.length;

  const schedule: { week: number; homeTeamId: string; awayTeamId: string }[] = [];
  const rotation = [...ids];

  for (let round = 0; round < weeks; round += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === "__BYE__" || b === "__BYE__") continue;

      const homeTeamId = round % 2 === 0 ? a : b;
      const awayTeamId = round % 2 === 0 ? b : a;
      schedule.push({ week: round + 1, homeTeamId, awayTeamId });
    }

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed, ...rest);
  }

  return schedule;
}
