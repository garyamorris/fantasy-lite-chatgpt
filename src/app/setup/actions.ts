"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { seedDefaultSportsAndRuleSets } from "@/lib/seed";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function setupAdminAction(formData: FormData) {
  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) redirect("/auth/sign-in");

  const email = getString(formData, "email").toLowerCase();
  const displayName = getString(formData, "displayName");
  const password = getString(formData, "password");

  if (!email || !displayName || password.length < 10) {
    redirect("/setup?error=invalid");
  }

  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) redirect("/setup?error=exists");

  const passwordHash = await hashPassword(password);
  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        role: "ADMIN",
      },
      select: { id: true },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      redirect("/setup?error=exists");
    }
    throw err;
  }

  await seedDefaultSportsAndRuleSets();
  await createSession(user.id);
  redirect("/dashboard");
}
