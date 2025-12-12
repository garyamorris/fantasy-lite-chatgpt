"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function signUpAction(formData: FormData) {
  const email = getString(formData, "email").toLowerCase();
  const displayName = getString(formData, "displayName");
  const password = getString(formData, "password");

  if (!email || !displayName || password.length < 8) {
    redirect("/auth/sign-up?error=invalid");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/auth/sign-up?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      role: "USER",
    },
  });

  await createSession(user.id);
  redirect("/dashboard");
}

export async function signInAction(formData: FormData) {
  const email = getString(formData, "email").toLowerCase();
  const password = getString(formData, "password");
  const returnTo = getString(formData, "returnTo") || "/dashboard";

  if (!email || !password) {
    redirect("/auth/sign-in?error=invalid");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/auth/sign-in?error=invalid");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    redirect("/auth/sign-in?error=invalid");
  }

  await createSession(user.id);
  redirect(returnTo);
}

