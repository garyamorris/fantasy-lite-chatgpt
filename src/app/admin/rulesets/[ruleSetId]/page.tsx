import Link from "next/link";
import { updateRuleSetAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

export default async function RuleSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ruleSetId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdmin();

  const { ruleSetId } = await params;
  const { error, saved } = await searchParams;

  const ruleSet = await prisma.ruleSet.findUnique({
    where: { id: ruleSetId },
    include: { sport: true },
  });
  if (!ruleSet) return null;

  let prettyConfig = ruleSet.config;
  let storedConfigInvalid = false;
  try {
    prettyConfig = JSON.stringify(JSON.parse(ruleSet.config), null, 2);
  } catch {
    storedConfigInvalid = true;
  }

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>{ruleSet.name}</h1>
          <p className="ui-muted">
            {ruleSet.sport.name} | {ruleSet.slug}
          </p>
        </div>
        <Link className="ui-link" href="/admin">
          Back to admin
        </Link>
      </div>

      <Card>
        {saved ? <p className="ui-alert">Saved.</p> : null}
        {error ? <p className="ui-alert ui-alert--danger">Invalid config JSON.</p> : null}
        {storedConfigInvalid ? (
          <p className="ui-alert ui-alert--danger">
            Stored config is not valid JSON. Fix it and save to restore the ruleset editor.
          </p>
        ) : null}

        <form className="form" action={updateRuleSetAction.bind(null, ruleSetId)}>
          <div className="field">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" defaultValue={ruleSet.name} required />
          </div>
          <div className="field">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" type="text" defaultValue={ruleSet.description ?? ""} />
          </div>
          <div className="field">
            <Label htmlFor="config">Config (JSON)</Label>
            <textarea
              id="config"
              name="config"
              className="ui-input"
              style={{ fontFamily: "var(--font-mono)", minHeight: 320 }}
              defaultValue={prettyConfig}
              required
            />
          </div>
          <Button type="submit">Save ruleset</Button>
        </form>
      </Card>
    </main>
  );
}
