import Link from "next/link";
import { createSportAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/access";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "duplicate") return "A sport with that slug already exists.";
  return "Slug and name are required.";
}

export default async function NewSportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>New sport</h1>
          <p className="ui-muted">Sports are templates. Rules live in RuleSets.</p>
        </div>
        <Link className="ui-link" href="/admin">
          Back to admin
        </Link>
      </div>

      <Card>
        {errorMessage ? <p className="ui-alert ui-alert--danger">{errorMessage}</p> : null}

        <form className="form" action={createSportAction}>
          <div className="field">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" placeholder="e.g., Basketball" required />
          </div>
          <div className="field">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" type="text" placeholder="e.g., basketball" required />
          </div>
          <div className="field">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" type="text" placeholder="Optional" />
          </div>
          <Button type="submit">Create sport</Button>
        </form>
      </Card>
    </main>
  );
}
