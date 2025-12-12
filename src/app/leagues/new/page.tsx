import Link from "next/link";
import { createLeagueAction } from "@/app/leagues/actions";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  const sports = await prisma.sport.findMany({
    orderBy: { name: "asc" },
    include: { ruleSets: { orderBy: { name: "asc" } } },
  });

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>Create league</h1>
          <p className="ui-muted">Pick a sport template and a ruleset.</p>
        </div>
        <Link className="ui-link" href="/dashboard">
          Back to dashboard
        </Link>
      </div>

      <Card>
        {error ? <p className="ui-alert ui-alert--danger">Please enter a name and select a ruleset.</p> : null}

        <form className="form" action={createLeagueAction}>
          <div className="field">
            <Label htmlFor="name">League name</Label>
            <Input id="name" name="name" type="text" placeholder="e.g., Thursday Night Legends" required />
          </div>

          <div className="field">
            <Label htmlFor="ruleSetId">Sport + ruleset</Label>
            <select id="ruleSetId" name="ruleSetId" className="ui-input" required defaultValue="">
              <option value="" disabled>
                Select a ruleset…
              </option>
              {sports.map((sport) => (
                <optgroup key={sport.id} label={sport.name}>
                  {sport.ruleSets.map((rs) => (
                    <option key={rs.id} value={rs.id}>
                      {rs.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <Button type="submit">Create league</Button>
        </form>
      </Card>
    </main>
  );
}

