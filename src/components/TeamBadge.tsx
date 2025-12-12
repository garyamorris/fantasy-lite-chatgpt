import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function teamAbbr(name: string) {
  const plain = name
    .replace(/^https?:\/\//i, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  const words = plain.split(/\s+/).filter(Boolean);

  const initials = words.map((w) => w[0]?.toUpperCase()).join("");
  if (initials.length >= 3) return initials.slice(0, 3);

  const compact = plain.replace(/\s+/g, "");
  if (compact.length >= 3) return compact.slice(0, 3).toUpperCase();

  return (name.trim().slice(0, 3) || "FL").toUpperCase();
}

export function TeamBadge({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const hue = fnv1a32(seed ?? name) % 360;
  const style = { ["--team-hue" as never]: hue } as CSSProperties;

  return (
    <span className={cn("teamBadge", `teamBadge--${size}`, className)} style={style} aria-hidden="true">
      {teamAbbr(name)}
    </span>
  );
}

