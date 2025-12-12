import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { getCurrentUser } from "@/lib/session";
import { seedDefaultSportsAndRuleSets } from "@/lib/seed";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { DEFAULT_THEME, isThemeId, THEME_COOKIE_NAME } from "@/theme/theme";

export const metadata: Metadata = {
  title: "Fantasy Lite",
  description:
    "A sport- and format-agnostic fantasy platform with configurable rules and a themeable 3D weekly play flow.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await seedDefaultSportsAndRuleSets();
  const user = await getCurrentUser();
  const jar = await cookies();
  const themeCookie = jar.get(THEME_COOKIE_NAME)?.value;
  const theme = isThemeId(themeCookie) ? themeCookie : DEFAULT_THEME;

  return (
    <html lang="en" data-theme={theme}>
      <body className="appBody">
        <ThemeProvider initialTheme={theme}>
          <TopNav user={user} />
          <div className="appContent">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
