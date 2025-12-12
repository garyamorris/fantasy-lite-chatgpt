import Link from "next/link";
import { createRuleSetAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { starterRuleSetConfig } from "@/lib/rules";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "duplicate") return "A ruleset with that slug already exists.";
  return "Please provide valid JSON that matches the RuleSet schema.";
}

export default async function NewRuleSetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  const sports = await prisma.sport.findMany({ orderBy: { name: "asc" } });
  const starter = JSON.stringify(starterRuleSetConfig(), null, 2);
  const errorMessage = getErrorMessage(error);

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>New ruleset</h1>
          <p className="ui-muted">Define roster slots, scoring rules, and schedule template.</p>
        </div>
        <Link className="ui-link" href="/admin">
          Back to admin
        </Link>
      </div>

      <Card>
        {sports.length === 0 ? (
          <p className="ui-alert ui-alert--danger">
            Create a sport first, then come back to add a ruleset.{" "}
            <Link className="ui-link" href="/admin/sports/new">
              New sport
            </Link>
            .
          </p>
        ) : null}
        {errorMessage ? <p className="ui-alert ui-alert--danger">{errorMessage}</p> : null}

        {sports.length > 0 ? (
          <form className="form" action={createRuleSetAction}>
            <div className="field">
              <Label htmlFor="sportId">Sport</Label>
              <select id="sportId" name="sportId" className="ui-input" required defaultValue="">
                <option value="" disabled>
                  Select a sport…
                </option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" type="text" required />
            </div>

            <div className="field">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" type="text" required />
            </div>

            <div className="field">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" type="text" />
            </div>

            <div className="field">
              <Label htmlFor="config">Config (JSON)</Label>
              <textarea
                id="config"
                name="config"
                className="ui-input"
                style={{ fontFamily: "var(--font-mono)", minHeight: 280 }}
                defaultValue={starter}
                required
              />
              <p className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                This config drives roster, scoring, and schedule generation—no sport logic is hard-coded.
              </p>
            </div>

            <Button type="submit">Create ruleset</Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
