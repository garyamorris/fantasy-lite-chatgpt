import Link from "next/link";
import { redirect } from "next/navigation";
import { advanceWeekAction, generateScheduleAction } from "@/app/leagues/actions";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseRuleSetConfig } from "@/lib/rules";
import { TeamBadge } from "@/components/TeamBadge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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
  const maxWeek = config.schedule.weeks;
  const seasonMatchups = matchups.filter((m) => m.week <= maxWeek);
  const isSeasonComplete = league.currentWeek >= maxWeek && seasonMatchups.length > 0 && seasonMatchups.every((m) => m.result);

  type Standing = {
    teamId: string;
    teamName: string;
    ownerName: string;
    played: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
  };

  const standingsByTeamId = new Map<string, Standing>();
  for (const team of league.teams) {
    standingsByTeamId.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      ownerName: team.owner.displayName,
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  for (const m of seasonMatchups) {
    if (!m.result) continue;
    const home = standingsByTeamId.get(m.homeTeamId);
    const away = standingsByTeamId.get(m.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.pointsFor += m.result.homeScore;
    home.pointsAgainst += m.result.awayScore;
    away.pointsFor += m.result.awayScore;
    away.pointsAgainst += m.result.homeScore;

    if (m.result.homeScore > m.result.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (m.result.homeScore < m.result.awayScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  const standings = Array.from(standingsByTeamId.values())
    .map((s) => ({ ...s, diff: s.pointsFor - s.pointsAgainst }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pointsFor - a.pointsFor;
    });

  const champion = isSeasonComplete ? standings[0] ?? null : null;

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>{league.name}</h1>
          <p className="ui-muted">
            {league.sport.name} | {league.ruleSet.name} | Week {league.currentWeek}/{config.schedule.weeks}
            {champion ? ` | Champion: ${champion.teamName}` : ""}
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
                        <div className="matchupTeamLine">
                          <TeamBadge name={team.name} seed={team.id} size="sm" />
                          <Link className="ui-link" href={`/leagues/${leagueId}/teams/${team.id}`}>
                            {team.name}
                          </Link>
                        </div>
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
                  (() => {
                    const winner =
                      m.result && m.result.homeScore !== m.result.awayScore
                        ? m.result.homeScore > m.result.awayScore
                          ? "home"
                          : "away"
                        : m.result
                          ? "tie"
                          : null;

                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "matchupRow",
                          winner && "matchupRow--final",
                          winner === "home" && "matchupRow--homeWin",
                          winner === "away" && "matchupRow--awayWin",
                          winner === "tie" && "matchupRow--tie",
                        )}
                      >
                        <div className="matchupRow__top">
                          <div className="ui-muted" style={{ fontSize: "var(--text-xs)" }}>
                            Week {m.week}
                          </div>
                          <div className={cn("pill", m.result ? "pill--final" : "pill--scheduled")}>
                            {m.result ? "Final" : "Scheduled"}
                          </div>
                        </div>

                        <div className="matchupTeams">
                          <div className={cn("matchupTeamLine", winner === "home" && "matchupTeamLine--winner")}>
                            <TeamBadge name={m.homeTeam.name} seed={m.homeTeam.id} size="sm" />
                            <div className="matchupTeamLine__name">{m.homeTeam.name}</div>
                          </div>
                          <div className="matchupTeams__vs ui-muted">vs</div>
                          <div className={cn("matchupTeamLine", winner === "away" && "matchupTeamLine--winner")}>
                            <TeamBadge name={m.awayTeam.name} seed={m.awayTeam.id} size="sm" />
                            <div className="matchupTeamLine__name">{m.awayTeam.name}</div>
                          </div>
                        </div>

                        <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                          {m.result ? (
                            <>
                              {m.result.homeScore.toFixed(1)}-{m.result.awayScore.toFixed(1)}
                              {winner === "tie"
                                ? " | Tie"
                                : winner === "home"
                                  ? ` | Winner: ${m.homeTeam.name}`
                                  : winner === "away"
                                    ? ` | Winner: ${m.awayTeam.name}`
                                    : ""}
                            </>
                          ) : (
                            "Up next"
                          )}
                        </div>
                      </div>
                    );
                  })()
                ))}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="standingsCard">
        <div className="standingsHeader">
          <div>
            <h2>Standings</h2>
            <p className="ui-muted" style={{ marginTop: "var(--space-2)" }}>
              League position, record, and points scored.
            </p>
          </div>
          {champion ? (
            <div className="championPill">
              <span className="championPill__label">Champion</span>
              <TeamBadge name={champion.teamName} seed={champion.teamId} size="sm" />
              <span className="championPill__name">{champion.teamName}</span>
            </div>
          ) : null}
        </div>

        {standings.length === 0 ? (
          <p className="ui-muted" style={{ marginTop: "var(--space-3)" }}>
            Standings will appear once teams exist.
          </p>
        ) : (
          <div className="standingsTable">
            {standings.map((s, idx) => (
              <div key={s.teamId} className={cn("standingRow", champion?.teamId === s.teamId && "standingRow--champ")}>
                <div className="standingRow__rank">{idx + 1}</div>
                <TeamBadge name={s.teamName} seed={s.teamId} size="sm" />
                <div className="standingRow__team">
                  <div className="standingRow__name">
                    <Link className="ui-link" href={`/leagues/${leagueId}/teams/${s.teamId}`}>
                      {s.teamName}
                    </Link>
                  </div>
                  <div className="standingRow__owner ui-muted">Owner: {s.ownerName}</div>
                </div>
                <div className="standingRow__stat standingRow__record">
                  {s.wins}-{s.losses}
                  {s.ties ? `-${s.ties}` : ""}
                </div>
                <div className="standingRow__stat standingRow__pf ui-muted">PF {s.pointsFor.toFixed(1)}</div>
                <div className="standingRow__stat standingRow__pa ui-muted">PA {s.pointsAgainst.toFixed(1)}</div>
                <div
                  className={cn(
                    "standingRow__stat standingRow__diff",
                    s.diff >= 0 ? "standingRow__stat--pos" : "standingRow__stat--neg",
                  )}
                >
                  {s.diff >= 0 ? "+" : ""}
                  {s.diff.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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
                      (() => {
                        const winner =
                          m.result && m.result.homeScore !== m.result.awayScore
                            ? m.result.homeScore > m.result.awayScore
                              ? "home"
                              : "away"
                            : m.result
                              ? "tie"
                              : null;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "matchupRow",
                              winner && "matchupRow--final",
                              winner === "home" && "matchupRow--homeWin",
                              winner === "away" && "matchupRow--awayWin",
                              winner === "tie" && "matchupRow--tie",
                            )}
                          >
                            <div className="matchupTeams">
                              <div className={cn("matchupTeamLine", winner === "home" && "matchupTeamLine--winner")}>
                                <TeamBadge name={m.homeTeam.name} seed={m.homeTeam.id} size="sm" />
                                <div className="matchupTeamLine__name">{m.homeTeam.name}</div>
                              </div>
                              <div className="matchupTeams__vs ui-muted">vs</div>
                              <div className={cn("matchupTeamLine", winner === "away" && "matchupTeamLine--winner")}>
                                <TeamBadge name={m.awayTeam.name} seed={m.awayTeam.id} size="sm" />
                                <div className="matchupTeamLine__name">{m.awayTeam.name}</div>
                              </div>
                            </div>

                            {m.result ? (
                              <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                                {m.result.homeScore.toFixed(1)}-{m.result.awayScore.toFixed(1)}
                                {winner === "tie"
                                  ? " | Tie"
                                  : winner === "home"
                                    ? ` | Winner: ${m.homeTeam.name}`
                                    : winner === "away"
                                      ? ` | Winner: ${m.awayTeam.name}`
                                      : ""}
                                {" | "}
                                {new Date(m.result.simulatedAt).toLocaleString()}
                              </div>
                            ) : (
                              <div className="ui-muted" style={{ fontSize: "var(--text-sm)" }}>
                                Not played yet
                              </div>
                            )}
                          </div>
                        );
                      })()
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
