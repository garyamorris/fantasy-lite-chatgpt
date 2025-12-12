import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { seedDefaultSportsAndRuleSets } from "@/lib/seed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function HomePage() {
  await seedDefaultSportsAndRuleSets();

  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const sports = await prisma.sport.findMany({ orderBy: { name: "asc" }, include: { ruleSets: true } });

  return (
    <main className="container">
      <div className="hero">
        <div className="hero__copy">
          <h1>Fantasy Lite</h1>
          <p className="ui-muted">
            A configurable, sport-agnostic fantasy platform with a 3D-enhanced weekly play flow.
          </p>
          <div className="hero__cta">
            <Link href="/auth/sign-up">
              <Button>Create account</Button>
            </Link>
            <Link href="/auth/sign-in">
              <Button variant="secondary">Sign in</Button>
            </Link>
          </div>
          <p className="ui-muted">
            First time setting up? <Link className="ui-link" href="/setup">Create the admin</Link>.
          </p>
        </div>

        <Card className="hero__panel">
          <h2>Config-driven by design</h2>
          <ul className="list">
            <li>Roster slots come from RuleSet models.</li>
            <li>Scoring rules are stat-key multipliers.</li>
            <li>Schedules are generated from templates.</li>
          </ul>
          <h3>Included templates</h3>
          <div className="chips">
            {sports.flatMap((s) => s.ruleSets.map((r) => (
              <span key={r.id} className="chip">
                {s.name}: {r.name}
              </span>
            )))}
          </div>
        </Card>
      </div>
    </main>
  );
}
