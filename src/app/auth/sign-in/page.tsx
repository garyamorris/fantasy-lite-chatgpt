import Link from "next/link";
import { signInAction } from "@/app/auth/actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;

  return (
    <main className="container">
      <div className="authGrid">
        <section className="authHero">
          <h1>Enter the arena.</h1>
          <p>
            Fantasy Lite is sport- and format-agnostic: rosters, scoring, and schedules are
            driven by configurable models.
          </p>
        </section>

        <Card className="authCard">
          <h2>Sign in</h2>
          {error ? <p className="ui-alert ui-alert--danger">Invalid credentials.</p> : null}

          <form className="form" action={signInAction}>
            <input type="hidden" name="returnTo" value={returnTo ?? ""} />
            <div className="field">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit">Sign in</Button>
          </form>

          <p className="ui-muted">
            New here? <Link className="ui-link" href="/auth/sign-up">Create an account</Link>.
          </p>
        </Card>
      </div>
    </main>
  );
}

