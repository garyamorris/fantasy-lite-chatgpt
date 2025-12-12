"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/access";
import { parseRuleSetConfig } from "@/lib/rules";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function createSportAction(formData: FormData) {
  await requireAdmin();

  const slug = getString(formData, "slug").toLowerCase();
  const name = getString(formData, "name");
  const description = getString(formData, "description");

  if (!slug || !name) redirect("/admin/sports/new?error=invalid");

  try {
    await prisma.sport.create({
      data: {
        slug,
        name,
        description: description || null,
      },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      redirect("/admin/sports/new?error=duplicate");
    }
    throw err;
  }

  redirect("/admin");
}

export async function createRuleSetAction(formData: FormData) {
  await requireAdmin();

  const sportId = getString(formData, "sportId");
  const slug = getString(formData, "slug").toLowerCase();
  const name = getString(formData, "name");
  const description = getString(formData, "description");
  const configJson = getString(formData, "config");

  if (!sportId || !slug || !name || !configJson) redirect("/admin/rulesets/new?error=invalid");

  const sport = await prisma.sport.findUnique({ where: { id: sportId }, select: { id: true } });
  if (!sport) redirect("/admin/rulesets/new?error=invalid");

  let config: unknown;
  try {
    config = parseRuleSetConfig(configJson);
  } catch {
    redirect("/admin/rulesets/new?error=invalid");
  }

  let ruleSet: { id: string };
  try {
    ruleSet = await prisma.ruleSet.create({
      data: {
        sportId,
        slug,
        name,
        description: description || null,
        config: JSON.stringify(config),
      },
      select: { id: true },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      redirect("/admin/rulesets/new?error=duplicate");
    }
    throw err;
  }

  redirect(`/admin/rulesets/${ruleSet.id}`);
}

export async function updateRuleSetAction(ruleSetId: string, formData: FormData) {
  await requireAdmin();

  const name = getString(formData, "name");
  const description = getString(formData, "description");
  const configJson = getString(formData, "config");

  if (!name || !configJson) redirect(`/admin/rulesets/${ruleSetId}?error=invalid`);

  let config: unknown;
  try {
    config = parseRuleSetConfig(configJson);
  } catch {
    redirect(`/admin/rulesets/${ruleSetId}?error=invalid`);
  }

  await prisma.ruleSet.update({
    where: { id: ruleSetId },
    data: {
      name,
      description: description || null,
      config: JSON.stringify(config),
    },
  });

  redirect(`/admin/rulesets/${ruleSetId}?saved=1`);
}
