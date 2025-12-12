import Link from "next/link";
import { signUpAction } from "@/app/auth/actions";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "exists") return "That email is already registered.";
  return "Please check your inputs (password must be 8+ characters).";
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  return (
    <main className="container">
      <div className="authGrid">
        <section className="authHero">
          <h1>Build a league. Play the week.</h1>
          <p>
            Create leagues and teams, then jump into a 3D matchup flow to set your lineup and
            reveal results.
          </p>
        </section>

        <Card className="authCard">
          <h2>Create account</h2>
          {errorMessage ? (
            <p className="ui-alert ui-alert--danger">{errorMessage}</p>
          ) : null}

          <form className="form" action={signUpAction}>
            <div className="field">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" type="text" autoComplete="nickname" required />
            </div>
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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit">Create account</Button>
          </form>

          <p className="ui-muted">
            Already have an account? <Link className="ui-link" href="/auth/sign-in">Sign in</Link>.
          </p>
        </Card>
      </div>
    </main>
  );
}

