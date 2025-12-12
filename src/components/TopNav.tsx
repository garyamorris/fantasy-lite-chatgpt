import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import { Button } from "@/components/ui/Button";
import { ThemePicker } from "@/components/ThemePicker";

export function TopNav({ user }: { user: User | null }) {
  return (
    <header className="topnav">
      <div className="topnav__inner">
        <Link className="topnav__brand" href="/">
          <span className="topnav__brandMark" aria-hidden />
          <span className="topnav__brandText">Fantasy Lite</span>
        </Link>

        <nav className="topnav__links">
          <Link href="/dashboard">Dashboard</Link>
          {user?.role === "ADMIN" ? <Link href="/admin">Admin</Link> : null}
        </nav>

        <div className="topnav__actions">
          <ThemePicker />
          {user ? (
            <form action="/auth/sign-out" method="post">
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <div className="topnav__auth">
              <Link className="topnav__authLink" href="/auth/sign-in">
                Sign in
              </Link>
              <Link className="topnav__authLink" href="/auth/sign-up">
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
