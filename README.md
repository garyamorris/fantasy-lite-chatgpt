# Fantasy Lite (3D + Config-Driven)

Fantasy Lite is a sport- and format-agnostic fantasy platform where **rosters, scoring, and schedules are model-driven** (RuleSets) rather than hard-coded sport logic.

It includes a **themeable** UI (design tokens for colors/typography/spacing/motion + 3D material properties) and a **3D weekly play flow** (lineup cards in a real 3D scene, then reveal the week’s outcome).

## Features

- Auth: email/password sign-in + sessions
- Leagues: create leagues from configurable RuleSets
- Teams: create teams; roster size comes from RuleSet roster config
- Admin console: create sports + edit RuleSets (JSON-configurable)
- Rules engine: roster slots, scoring rules, schedules, stat simulation are config-driven
- 3D weekly play: set lineup in a 3D matchup arena and reveal results
- Themes: switch brands at runtime; 3D materials and lights are token-driven

## Quick start

```bash
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

### First run

- Create the first admin user at `http://localhost:3000/setup`
- Use `/admin` to manage Sports and RuleSets
- Create a league via `/leagues/new`, then create 2+ teams to generate a schedule
- Play the current week at `/leagues/[leagueId]/play`

## Tech

- Next.js App Router + Server Actions
- Prisma (SQLite) + `@prisma/adapter-better-sqlite3`
- React Three Fiber (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`)
