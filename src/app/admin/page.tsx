import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";

export default async function AdminPage() {
  await requireAdmin();

  const sports = await prisma.sport.findMany({
    orderBy: { name: "asc" },
    include: { ruleSets: { orderBy: { name: "asc" } } },
  });

  return (
    <main className="container">
      <div className="pageHeader">
        <div>
          <h1>Admin</h1>
          <p className="ui-muted">Configure sports, formats, rosters, scoring, and schedules.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Link className="ui-link" href="/admin/sports/new">
            New sport
          </Link>
          <Link className="ui-link" href="/admin/rulesets/new">
            New ruleset
          </Link>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {sports.map((sport) => (
          <Card key={sport.id}>
            <h2>{sport.name}</h2>
            {sport.description ? (
              <p className="ui-muted" style={{ marginTop: "var(--space-2)" }}>
                {sport.description}
              </p>
            ) : null}

            <h3 style={{ marginTop: "var(--space-4)" }}>Rule sets</h3>
            <div style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
              {sport.ruleSets.length === 0 ? (
                <p className="ui-muted">No rulesets yet.</p>
              ) : (
                sport.ruleSets.map((rs) => (
                  <Link key={rs.id} className="ui-link" href={`/admin/rulesets/${rs.id}`}>
                    {rs.name}
                  </Link>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
