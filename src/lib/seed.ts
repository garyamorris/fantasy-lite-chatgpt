import "server-only";

import { prisma } from "@/lib/db";
import { starterRuleSetConfig, type RuleSetConfig } from "@/lib/rules";

function defaultRuleSetConfig(): RuleSetConfig {
  return starterRuleSetConfig();
}

export async function seedDefaultSportsAndRuleSets() {
  // Avoid repeating upserts on every request once seeded.
  const hasCoreSeeds = await prisma.ruleSet.count({ where: { slug: "football-standard" } });
  if (hasCoreSeeds > 0) return;

  const sports = await Promise.all(
    [
      {
        slug: "football",
        name: "Football",
        description: "Common fantasy football formats (H2H points).",
      },
      {
        slug: "basketball",
        name: "Basketball",
        description: "Fantasy basketball templates with flexible rosters.",
      },
      {
        slug: "baseball",
        name: "Baseball",
        description: "Points-based fantasy baseball templates.",
      },
      {
        slug: "soccer",
        name: "Soccer",
        description: "Fantasy soccer templates (goals/assists/clean sheets).",
      },
      {
        slug: "hockey",
        name: "Hockey",
        description: "Fantasy hockey templates (skaters + goalie).",
      },
      {
        slug: "gridball",
        name: "Gridball",
        description: "A demo sport template with configurable roster + scoring.",
      },
      {
        slug: "nebula-league",
        name: "Nebula League",
        description: "A cinematic demo format showcasing themeable 3D gameplay.",
      },
    ].map((s) =>
      prisma.sport.upsert({
        where: { slug: s.slug },
        create: s,
        update: {},
        select: { id: true, slug: true },
      }),
    ),
  );

  const sportIdBySlug = new Map(sports.map((s) => [s.slug, s.id]));
  const getSportId = (slug: string) => {
    const id = sportIdBySlug.get(slug);
    if (!id) throw new Error(`Missing sport seed: ${slug}`);
    return id;
  };

  const configs = {
    footballStandard: {
      roster: {
        starterSlots: [
          { key: "QB", label: "QB", count: 1 },
          { key: "RB", label: "RB", count: 2 },
          { key: "WR", label: "WR", count: 2 },
          { key: "TE", label: "TE", count: 1 },
          { key: "FLEX", label: "FLEX", count: 1 },
          { key: "K", label: "K", count: 1 },
          { key: "DEF", label: "DEF", count: 1 },
        ],
        benchSlots: 6,
      },
      scoring: {
        stats: [
          { key: "passYds", label: "Pass Yds", min: 0, max: 420, decimals: 0 },
          { key: "passTd", label: "Pass TD", min: 0, max: 6, decimals: 0 },
          { key: "rushYds", label: "Rush Yds", min: 0, max: 220, decimals: 0 },
          { key: "rushTd", label: "Rush TD", min: 0, max: 5, decimals: 0 },
          { key: "recYds", label: "Rec Yds", min: 0, max: 220, decimals: 0 },
          { key: "recTd", label: "Rec TD", min: 0, max: 5, decimals: 0 },
          { key: "receptions", label: "Receptions", min: 0, max: 12, decimals: 0 },
          { key: "turnovers", label: "Turnovers", min: 0, max: 3, decimals: 0 },
        ],
        rules: [
          { statKey: "passYds", pointsPerUnit: 0.04 },
          { statKey: "passTd", pointsPerUnit: 4 },
          { statKey: "rushYds", pointsPerUnit: 0.1 },
          { statKey: "rushTd", pointsPerUnit: 6 },
          { statKey: "recYds", pointsPerUnit: 0.1 },
          { statKey: "recTd", pointsPerUnit: 6 },
          { statKey: "receptions", pointsPerUnit: 0.5 },
          { statKey: "turnovers", pointsPerUnit: -2 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 14 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    footballPpr: {
      ...defaultRuleSetConfig(),
      roster: {
        starterSlots: [
          { key: "QB", label: "QB", count: 1 },
          { key: "RB", label: "RB", count: 2 },
          { key: "WR", label: "WR", count: 2 },
          { key: "TE", label: "TE", count: 1 },
          { key: "FLEX", label: "FLEX", count: 1 },
          { key: "K", label: "K", count: 1 },
          { key: "DEF", label: "DEF", count: 1 },
        ],
        benchSlots: 6,
      },
      scoring: {
        stats: [
          { key: "passYds", label: "Pass Yds", min: 0, max: 420, decimals: 0 },
          { key: "passTd", label: "Pass TD", min: 0, max: 6, decimals: 0 },
          { key: "rushYds", label: "Rush Yds", min: 0, max: 220, decimals: 0 },
          { key: "rushTd", label: "Rush TD", min: 0, max: 5, decimals: 0 },
          { key: "recYds", label: "Rec Yds", min: 0, max: 220, decimals: 0 },
          { key: "recTd", label: "Rec TD", min: 0, max: 5, decimals: 0 },
          { key: "receptions", label: "Receptions", min: 0, max: 12, decimals: 0 },
          { key: "turnovers", label: "Turnovers", min: 0, max: 3, decimals: 0 },
        ],
        rules: [
          { statKey: "passYds", pointsPerUnit: 0.04 },
          { statKey: "passTd", pointsPerUnit: 4 },
          { statKey: "rushYds", pointsPerUnit: 0.1 },
          { statKey: "rushTd", pointsPerUnit: 6 },
          { statKey: "recYds", pointsPerUnit: 0.1 },
          { statKey: "recTd", pointsPerUnit: 6 },
          { statKey: "receptions", pointsPerUnit: 1 },
          { statKey: "turnovers", pointsPerUnit: -2 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 14 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    basketballStandard: {
      roster: {
        starterSlots: [
          { key: "G", label: "G", count: 2 },
          { key: "F", label: "F", count: 2 },
          { key: "C", label: "C", count: 1 },
          { key: "UTIL", label: "UTIL", count: 1 },
        ],
        benchSlots: 6,
      },
      scoring: {
        stats: [
          { key: "points", label: "Points", min: 6, max: 42, decimals: 0 },
          { key: "reb", label: "Rebounds", min: 0, max: 18, decimals: 0 },
          { key: "ast", label: "Assists", min: 0, max: 14, decimals: 0 },
          { key: "stl", label: "Steals", min: 0, max: 5, decimals: 0 },
          { key: "blk", label: "Blocks", min: 0, max: 5, decimals: 0 },
          { key: "tov", label: "Turnovers", min: 0, max: 7, decimals: 0 },
        ],
        rules: [
          { statKey: "points", pointsPerUnit: 1 },
          { statKey: "reb", pointsPerUnit: 1.2 },
          { statKey: "ast", pointsPerUnit: 1.5 },
          { statKey: "stl", pointsPerUnit: 3 },
          { statKey: "blk", pointsPerUnit: 3 },
          { statKey: "tov", pointsPerUnit: -1 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 10 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    baseballPoints: {
      roster: {
        starterSlots: [
          { key: "SP", label: "SP", count: 2 },
          { key: "RP", label: "RP", count: 1 },
          { key: "INF", label: "INF", count: 2 },
          { key: "OF", label: "OF", count: 2 },
          { key: "UTIL", label: "UTIL", count: 1 },
        ],
        benchSlots: 6,
      },
      scoring: {
        stats: [
          { key: "runs", label: "Runs", min: 0, max: 6, decimals: 0 },
          { key: "hits", label: "Hits", min: 0, max: 6, decimals: 0 },
          { key: "hr", label: "HR", min: 0, max: 3, decimals: 0 },
          { key: "rbi", label: "RBI", min: 0, max: 6, decimals: 0 },
          { key: "sb", label: "SB", min: 0, max: 3, decimals: 0 },
          { key: "so", label: "SO", min: 0, max: 12, decimals: 0 },
          { key: "wins", label: "Wins", min: 0, max: 2, decimals: 0 },
          { key: "saves", label: "Saves", min: 0, max: 2, decimals: 0 },
        ],
        rules: [
          { statKey: "runs", pointsPerUnit: 1 },
          { statKey: "hits", pointsPerUnit: 1 },
          { statKey: "hr", pointsPerUnit: 4 },
          { statKey: "rbi", pointsPerUnit: 1 },
          { statKey: "sb", pointsPerUnit: 2 },
          { statKey: "so", pointsPerUnit: 1 },
          { statKey: "wins", pointsPerUnit: 5 },
          { statKey: "saves", pointsPerUnit: 5 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 12 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    soccerStandard: {
      roster: {
        starterSlots: [
          { key: "FWD", label: "FWD", count: 2 },
          { key: "MID", label: "MID", count: 3 },
          { key: "DEF", label: "DEF", count: 3 },
          { key: "GK", label: "GK", count: 1 },
        ],
        benchSlots: 5,
      },
      scoring: {
        stats: [
          { key: "goals", label: "Goals", min: 0, max: 3, decimals: 0 },
          { key: "assists", label: "Assists", min: 0, max: 3, decimals: 0 },
          { key: "shots", label: "Shots", min: 0, max: 8, decimals: 0 },
          { key: "cs", label: "Clean Sheets", min: 0, max: 1, decimals: 0 },
          { key: "saves", label: "Saves", min: 0, max: 10, decimals: 0 },
          { key: "cards", label: "Cards", min: 0, max: 2, decimals: 0 },
        ],
        rules: [
          { statKey: "goals", pointsPerUnit: 5 },
          { statKey: "assists", pointsPerUnit: 3 },
          { statKey: "shots", pointsPerUnit: 0.6 },
          { statKey: "cs", pointsPerUnit: 4 },
          { statKey: "saves", pointsPerUnit: 0.35 },
          { statKey: "cards", pointsPerUnit: -1 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 10 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    hockeyStandard: {
      roster: {
        starterSlots: [
          { key: "F", label: "F", count: 3 },
          { key: "D", label: "D", count: 2 },
          { key: "G", label: "G", count: 1 },
          { key: "UTIL", label: "UTIL", count: 1 },
        ],
        benchSlots: 5,
      },
      scoring: {
        stats: [
          { key: "goals", label: "Goals", min: 0, max: 4, decimals: 0 },
          { key: "assists", label: "Assists", min: 0, max: 4, decimals: 0 },
          { key: "shots", label: "Shots", min: 0, max: 10, decimals: 0 },
          { key: "hits", label: "Hits", min: 0, max: 10, decimals: 0 },
          { key: "blocks", label: "Blocks", min: 0, max: 8, decimals: 0 },
          { key: "wins", label: "Wins", min: 0, max: 1, decimals: 0 },
          { key: "saves", label: "Saves", min: 0, max: 35, decimals: 0 },
        ],
        rules: [
          { statKey: "goals", pointsPerUnit: 3 },
          { statKey: "assists", pointsPerUnit: 2 },
          { statKey: "shots", pointsPerUnit: 0.4 },
          { statKey: "hits", pointsPerUnit: 0.3 },
          { statKey: "blocks", pointsPerUnit: 0.4 },
          { statKey: "wins", pointsPerUnit: 4 },
          { statKey: "saves", pointsPerUnit: 0.15 },
        ],
      },
      schedule: { type: "roundRobin", weeks: 10 },
      matchup: { format: "H2H_POINTS" },
    } satisfies RuleSetConfig,
    nebulaShowcase: {
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
    } satisfies RuleSetConfig,
  };

  const ruleSetsToSeed: Array<{
    sportSlug: string;
    slug: string;
    name: string;
    description: string;
    config: RuleSetConfig;
  }> = [
    {
      sportSlug: "football",
      slug: "football-standard",
      name: "Standard (0.5 PPR)",
      description: "QB/RB/WR/TE/FLEX/K/DEF with half-point receptions.",
      config: configs.footballStandard,
    },
    {
      sportSlug: "football",
      slug: "football-ppr",
      name: "PPR",
      description: "Same roster with full-point receptions.",
      config: configs.footballPpr,
    },
    {
      sportSlug: "basketball",
      slug: "basketball-standard",
      name: "Standard Points",
      description: "Guards/Forwards/Center/UTIL with turnovers penalty.",
      config: configs.basketballStandard,
    },
    {
      sportSlug: "baseball",
      slug: "baseball-points",
      name: "Points",
      description: "Pitchers + hitters with HR and wins weighted.",
      config: configs.baseballPoints,
    },
    {
      sportSlug: "soccer",
      slug: "soccer-standard",
      name: "Standard",
      description: "Goals/assists/clean sheets with basic keeper saves.",
      config: configs.soccerStandard,
    },
    {
      sportSlug: "hockey",
      slug: "hockey-standard",
      name: "Standard",
      description: "Skaters + goalie with shots/hits/blocks.",
      config: configs.hockeyStandard,
    },
    {
      sportSlug: "gridball",
      slug: "gridball-lite",
      name: "Gridball Lite",
      description: "Config starter: 5 starters, 3 bench, points-based H2H.",
      config: defaultRuleSetConfig(),
    },
    {
      sportSlug: "nebula-league",
      slug: "nebula-showcase",
      name: "Nebula Showcase",
      description: "A more volatile scoring curve for cinematic reveals.",
      config: configs.nebulaShowcase,
    },
  ];

  await Promise.all(
    ruleSetsToSeed.map((rs) =>
      prisma.ruleSet.upsert({
        where: { slug: rs.slug },
        create: {
          sportId: getSportId(rs.sportSlug),
          slug: rs.slug,
          name: rs.name,
          description: rs.description,
          config: JSON.stringify(rs.config),
        },
        update: {},
      }),
    ),
  );
}
