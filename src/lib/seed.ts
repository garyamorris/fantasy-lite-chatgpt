import "server-only";

import { prisma } from "@/lib/db";
import { starterRuleSetConfig, type RuleSetConfig } from "@/lib/rules";

function defaultRuleSetConfig(): RuleSetConfig {
  return starterRuleSetConfig();
}

export async function seedDefaultSportsAndRuleSets() {
  const sportCount = await prisma.sport.count();
  if (sportCount > 0) return;

  const gridball = await prisma.sport.create({
    data: {
      slug: "gridball",
      name: "Gridball",
      description: "A demo sport template with configurable roster + scoring.",
    },
  });

  const nebula = await prisma.sport.create({
    data: {
      slug: "nebula-league",
      name: "Nebula League",
      description: "A demo format showcasing themeable 3D gameplay.",
    },
  });

  await prisma.ruleSet.createMany({
    data: [
      {
        sportId: gridball.id,
        slug: "gridball-lite",
        name: "Gridball Lite",
        description: "5 starters, 3 bench, points-based H2H.",
        config: JSON.stringify(defaultRuleSetConfig()),
      },
      {
        sportId: nebula.id,
        slug: "nebula-showcase",
        name: "Nebula Showcase",
        description: "A more volatile scoring curve for cinematic reveals.",
        config: JSON.stringify({
          ...defaultRuleSetConfig(),
          scoring: {
            stats: [
              { key: "flux", label: "Flux", min: 0, max: 14, decimals: 0 },
              { key: "shards", label: "Shards", min: 0, max: 8, decimals: 0 },
              { key: "surge", label: "Surge", min: 0, max: 5, decimals: 0 },
            ],
            rules: [
              { statKey: "flux", pointsPerUnit: 3 },
              { statKey: "shards", pointsPerUnit: 5 },
              { statKey: "surge", pointsPerUnit: 9 },
            ],
          },
        } satisfies RuleSetConfig),
      },
    ],
  });
}
