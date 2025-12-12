import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

