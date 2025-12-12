import Link from "next/link";
import { createTeamAction } from "@/app/leagues/actions";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

export default async function NewTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const { error } = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { sport: true },
  });
  if (!league) return null;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) {
    await prisma.leagueMember.create({
      data: { leagueId, userId: user.id, role: "MEMBER" },
    });
  }

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>Create team</h1>
          <p className="ui-muted">{league.name}</p>
        </div>
        <Link className="ui-link" href={`/leagues/${leagueId}`}>
          Back to league
        </Link>
      </div>

      <Card>
        {error === "invalid" ? (
          <p className="ui-alert ui-alert--danger">Team name is required.</p>
        ) : error === "duplicate" ? (
          <p className="ui-alert ui-alert--danger">That team name is already taken in this league.</p>
        ) : null}

        <form className="form" action={createTeamAction.bind(null, leagueId)}>
          <div className="field">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" type="text" placeholder="e.g., Midnight Meteors" required />
          </div>
          <Button type="submit">Create team</Button>
        </form>
      </Card>
    </main>
  );
}
