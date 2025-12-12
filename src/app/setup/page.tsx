import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { setupAdminAction } from "@/app/setup/actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "exists") return "That email is already registered.";
  return "Please check your inputs (password must be 10+ characters).";
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount > 0) redirect("/auth/sign-in");

  const { error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  return (
    <main className="container">
      <div className="authGrid">
        <section className="authHero">
          <h1>Initialize Fantasy Lite</h1>
          <p>
            Create the first admin account. After this, you’ll be able to configure sports,
            rulesets, and league formats via the admin console.
          </p>
          <p className="ui-muted">
            Want a normal user? Create it afterwards via{" "}
            <Link className="ui-link" href="/auth/sign-up">
              sign up
            </Link>
            .
          </p>
        </section>

        <Card className="authCard">
          <h2>Create admin</h2>
          {errorMessage ? <p className="ui-alert ui-alert--danger">{errorMessage}</p> : null}

          <form className="form" action={setupAdminAction}>
            <div className="field">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" type="text" required />
            </div>
            <div className="field">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={10} required />
            </div>
            <Button type="submit">Create admin</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
