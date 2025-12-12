import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const memberships = await prisma.leagueMember.findMany({
    where: { userId: user.id },
    include: {
      league: { include: { sport: true, ruleSet: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>Dashboard</h1>
          <p className="ui-muted">Welcome, {user.displayName}.</p>
        </div>
        <Link href="/leagues/new">
          <Button>Create league</Button>
        </Link>
      </div>

      {memberships.length === 0 ? (
        <Card className="emptyState">
          <h2>No leagues yet</h2>
          <p className="ui-muted">
            Create a league, invite friends, and jump into a 3D weekly matchup flow.
          </p>
          <Link href="/leagues/new">
            <Button>Create your first league</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid">
          {memberships.map((m) => (
            <Link key={m.id} className="cardLink" href={`/leagues/${m.leagueId}`}>
              <Card className="leagueCard">
                <div className="leagueCard__top">
                  <h2>{m.league.name}</h2>
                  <span className="pill">{m.role === "COMMISSIONER" ? "Commissioner" : "Member"}</span>
                </div>
                <p className="ui-muted">
                  {m.league.sport.name} | {m.league.ruleSet.name}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
