"use client";

import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import { DEFAULT_THEME, type ThemeId } from "@/theme/theme";

type ThreeTokens = {
  scene: {
    bg: string;
    fog: string;
  };
  text: {
    primary: string;
    muted: string;
  };
  colors: {
    danger: string;
  };
  lights: {
    key: string;
    fill: string;
    rim: string;
    keyIntensity: number;
    fillIntensity: number;
    rimIntensity: number;
  };
  materials: {
    surface: { color: string; roughness: number; metalness: number };
    accent: { color: string; emissive: string; emissiveIntensity: number; roughness: number; metalness: number };
    glass: { color: string; transmission: number; thickness: number; roughness: number; ior: number };
  };
};

const FALLBACKS: Record<ThemeId, ThreeTokens> = {
  nebula: {
    scene: { bg: "#050713", fog: "#050713" },
    text: { primary: "#f3f5ff", muted: "#b7badd" },
    colors: { danger: "#ff4d6d" },
    lights: {
      key: "#6d5efc",
      fill: "#00d4ff",
      rim: "#ffffff",
      keyIntensity: 2.2,
      fillIntensity: 1.35,
      rimIntensity: 1.05,
    },
    materials: {
      surface: { color: "rgba(10, 14, 34, 1)", roughness: 0.72, metalness: 0.22 },
      accent: {
        color: "#6d5efc",
        emissive: "#6d5efc",
        emissiveIntensity: 1.35,
        roughness: 0.26,
        metalness: 0.38,
      },
      glass: { color: "#00d4ff", transmission: 1, thickness: 0.55, roughness: 0.12, ior: 1.4 },
    },
  },
  arcade: {
    scene: { bg: "#07030f", fog: "#0c061a" },
    text: { primary: "#ffffff", muted: "#d8d2f0" },
    colors: { danger: "#ff4d6d" },
    lights: {
      key: "#ff2bd6",
      fill: "#39ff88",
      rim: "#5ce1ff",
      keyIntensity: 2.3,
      fillIntensity: 1.45,
      rimIntensity: 1.15,
    },
    materials: {
      surface: { color: "rgba(18, 10, 34, 1)", roughness: 0.68, metalness: 0.28 },
      accent: {
        color: "#ff2bd6",
        emissive: "#ff2bd6",
        emissiveIntensity: 1.55,
        roughness: 0.22,
        metalness: 0.42,
      },
      glass: { color: "#39ff88", transmission: 1, thickness: 0.6, roughness: 0.14, ior: 1.42 },
    },
  },
};

function canReadComputedStyle() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof getComputedStyle === "function"
  );
}

function readVar(name: string, fallback: string) {
  if (!canReadComputedStyle()) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readNumber(name: string, fallback: number) {
  const raw = readVar(name, String(fallback));
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readThreeTokens(theme: ThemeId): ThreeTokens {
  const fallback = FALLBACKS[theme] ?? FALLBACKS[DEFAULT_THEME];

  return {
    scene: {
      bg: readVar("--three-scene-bg", fallback.scene.bg),
      fog: readVar("--three-scene-fog", fallback.scene.fog),
    },
    text: {
      primary: readVar("--three-text", fallback.text.primary),
      muted: readVar("--three-text-muted", fallback.text.muted),
    },
    colors: {
      danger: readVar("--three-danger", fallback.colors.danger),
    },
    lights: {
      key: readVar("--three-light-key", fallback.lights.key),
      fill: readVar("--three-light-fill", fallback.lights.fill),
      rim: readVar("--three-light-rim", fallback.lights.rim),
      keyIntensity: readNumber("--three-light-key-intensity", 2.2),
      fillIntensity: readNumber("--three-light-fill-intensity", 1.4),
      rimIntensity: readNumber("--three-light-rim-intensity", 1.1),
    },
    materials: {
      surface: {
        color: readVar("--three-surface-color", fallback.materials.surface.color),
        roughness: readNumber("--three-surface-roughness", fallback.materials.surface.roughness),
        metalness: readNumber("--three-surface-metalness", fallback.materials.surface.metalness),
      },
      accent: {
        color: readVar("--three-accent-color", fallback.materials.accent.color),
        emissive: readVar("--three-accent-emissive", fallback.materials.accent.emissive),
        emissiveIntensity: readNumber(
          "--three-accent-emissive-intensity",
          fallback.materials.accent.emissiveIntensity,
        ),
        roughness: readNumber("--three-accent-roughness", fallback.materials.accent.roughness),
        metalness: readNumber("--three-accent-metalness", fallback.materials.accent.metalness),
      },
      glass: {
        color: readVar("--three-glass-color", fallback.materials.glass.color),
        transmission: readNumber("--three-glass-transmission", fallback.materials.glass.transmission),
        thickness: readNumber("--three-glass-thickness", fallback.materials.glass.thickness),
        roughness: readNumber("--three-glass-roughness", fallback.materials.glass.roughness),
        ior: readNumber("--three-glass-ior", fallback.materials.glass.ior),
      },
    },
  };
}

export function useThreeTokens() {
  const { theme } = useTheme();
  return useMemo(() => readThreeTokens(theme), [theme]);
}
