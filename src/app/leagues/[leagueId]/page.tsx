import Link from "next/link";
import { redirect } from "next/navigation";
import { advanceWeekAction, generateScheduleAction } from "@/app/leagues/actions";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseRuleSetConfig } from "@/lib/rules";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ error?: string; teamCreated?: string }>;
}) {
  const user = await requireUser();
  const { leagueId } = await params;
  const { error } = await searchParams;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) redirect("/dashboard");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      sport: true,
      ruleSet: true,
      teams: { include: { owner: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!league) redirect("/dashboard");

  const config = parseRuleSetConfig(league.ruleSet.config);

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
    include: {
      homeTeam: true,
      awayTeam: true,
      result: true,
    },
    orderBy: [{ week: "asc" }, { createdAt: "asc" }],
  });

  const historyMatchups = matchups
    .filter((m) => m.week <= league.currentWeek)
    .slice()
    .sort((a, b) => b.week - a.week || b.createdAt.getTime() - a.createdAt.getTime());

  const historyByWeek = new Map<number, typeof historyMatchups>();
  for (const m of historyMatchups) {
    const list = historyByWeek.get(m.week) ?? [];
    list.push(m);
    historyByWeek.set(m.week, list);
  }
  const historyWeeks = Array.from(historyByWeek.keys()).sort((a, b) => b - a);

  const isCommissioner = league.commissionerId === user.id;

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>{league.name}</h1>
          <p className="ui-muted">
            {league.sport.name} | {league.ruleSet.name} | Week {league.currentWeek}/{config.schedule.weeks}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Link href={`/leagues/${leagueId}/teams/new`}>
            <Button variant="secondary">Create team</Button>
          </Link>
          <Link href={`/leagues/${leagueId}/analytics`}>
            <Button variant="secondary">Analytics</Button>
          </Link>
          <Link href={`/leagues/${leagueId}/play`}>
            <Button>Play this week</Button>
          </Link>
        </div>
      </div>

      {error === "need_teams" ? (
        <p className="ui-alert ui-alert--danger">You need at least 2 teams to generate a schedule.</p>
      ) : null}
      {error === "locked" ? (
        <p className="ui-alert ui-alert--danger">
          {"Schedule can't be regenerated after final results exist."}
        </p>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Card>
          <h2>Teams</h2>
          <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            {league.teams.length === 0 ? (
              <p className="ui-muted">No teams yet.</p>
            ) : (
                league.teams.map((team) => (
                  <div key={team.id} className="row">
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        <Link className="ui-link" href={`/leagues/${leagueId}/teams/${team.id}`}>
                          {team.name}
                        </Link>
                      </div>
                      <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                        Owner: {team.owner.displayName}
                      </div>
                    </div>
                  </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h2>Schedule</h2>
          <p className="ui-muted" style={{ marginTop: "var(--space-2)" }}>
            {matchups.length === 0 ? "Not generated yet." : `${matchups.length} matchup(s) scheduled.`}
          </p>

          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              marginTop: "var(--space-3)",
            }}
          >
            {isCommissioner ? (
              <>
                <form action={generateScheduleAction.bind(null, leagueId)}>
                  <Button type="submit" variant="secondary">
                    Generate / Regenerate schedule
                  </Button>
                </form>
                <form action={advanceWeekAction.bind(null, leagueId)}>
                  <Button type="submit" variant="secondary">
                    Advance week
                  </Button>
                </form>
              </>
            ) : (
              <p className="ui-muted">Only the commissioner can modify the schedule/week.</p>
            )}
          </div>

          {matchups.length > 0 ? (
            <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
              {matchups
                .filter((m) => m.week === league.currentWeek)
                .map((m) => (
                  <div key={m.id} className="matchupRow">
                    <div className="ui-muted" style={{ fontSize: "var(--text-xs)" }}>
                      Week {m.week}
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {m.homeTeam.name} vs {m.awayTeam.name}
                    </div>
                    {m.result ? (
                      <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                        Final: {m.result.homeScore.toFixed(1)}-{m.result.awayScore.toFixed(1)}
                      </div>
                    ) : (
                      <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                        Scheduled
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : null}
        </Card>
      </div>

      <Card id="history" className="historyCard">
        <h2>Game history</h2>
        <p className="ui-muted" style={{ marginTop: "var(--space-2)" }}>
          Past weeks, including final scores once played.
        </p>

        {historyWeeks.length === 0 ? (
          <p className="ui-muted" style={{ marginTop: "var(--space-3)" }}>
            No matchups yet. Create teams and generate a schedule.
          </p>
        ) : (
          <div className="historyList">
            {historyWeeks.map((week) => {
              const weekMatchups = historyByWeek.get(week) ?? [];
              return (
                <section key={week} className="historyWeek">
                  <div className="historyWeek__header">
                    <div className="historyWeek__title">Week {week}</div>
                    <div className="historyWeek__meta ui-muted">
                      {week === league.currentWeek ? "Current week" : "Completed week"}
                    </div>
                  </div>

                  <div className="historyWeek__matchups">
                    {weekMatchups.map((m) => (
                      <div key={m.id} className="matchupRow">
                        <div style={{ fontWeight: 800 }}>
                          {m.homeTeam.name} vs {m.awayTeam.name}
                        </div>
                        {m.result ? (
                          <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                            Final: {m.result.homeScore.toFixed(1)}-{m.result.awayScore.toFixed(1)} | {new Date(m.result.simulatedAt).toLocaleString()}
                          </div>
                        ) : (
                          <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                            Not played yet
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
