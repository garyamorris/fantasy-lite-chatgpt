"use client";

import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, RoundedBox, Sparkles, Text, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useMemo, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { useThreeTokens } from "@/theme/useThreeTokens";

type RosterSlotDef = { key: string; label: string; count: number };

type LineupSlotVm = {
  id: string;
  slotKey: string;
  slotIndex: number;
  label: string;
  athleteId: string | null;
};

type TeamVm = { id: string; name: string };
type AthleteVm = { id: string; name: string };

type Props = {
  league: { id: string; name: string; week: number; weeks: number };
  rules: { roster: { starterSlots: RosterSlotDef[] } };
  matchup: {
    id: string;
    week: number;
    status: string;
    homeTeam: TeamVm;
    awayTeam: TeamVm;
    result: { homeScore: number; awayScore: number } | null;
  };
  ownedTeams: TeamVm[];
  userTeam: TeamVm;
  opponentTeam: TeamVm;
  athletes: AthleteVm[];
  opponentAthletes: AthleteVm[];
  lineup: { id: string; lockedAt: string | null; slots: LineupSlotVm[] };
  opponentSlots: LineupSlotVm[];
  updateLineupSlotAction: (lineupSlotId: string, athleteId: string | null) => Promise<
    | { ok: true }
    | { ok: false; error: "not_found" | "forbidden" | "locked" | "bad_athlete" | "duplicate" }
  >;
  lockLineupAction: (lineupId: string) => Promise<
    | { ok: true; lockedAt: string | null }
    | { ok: false; error: "not_found" | "forbidden" | "locked" | "incomplete" }
  >;
  simulateMatchupAction: (leagueId: string, teamId: string) => Promise<
    | { ok: true; matchupId: string; homeScore: number; awayScore: number; alreadyFinal: boolean }
    | { ok: false; error: "not_found" | "forbidden" | "no_matchup" | "incomplete" }
  >;
};

function shortSlotLabel(slot: LineupSlotVm) {
  const suffix = slot.slotIndex > 0 ? ` ${slot.slotIndex + 1}` : "";
  return `${slot.label}${suffix}`;
}

function useAthleteNameMap(athletes: AthleteVm[]) {
  return useMemo(() => new Map(athletes.map((a) => [a.id, a.name])), [athletes]);
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

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="ui-alert ui-alert--danger">{message}</p>;
}

export function MatchupPlayClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(props.lineup.slots[0]?.id ?? null);
  const [slots, setSlots] = useState<LineupSlotVm[]>(props.lineup.slots);
  const [lockedAt, setLockedAt] = useState<string | null>(props.lineup.lockedAt);
  const [result, setResult] = useState(props.matchup.result);
  const [error, setError] = useState<string | null>(null);

  const athleteName = useAthleteNameMap(props.athletes);
  const opponentAthleteName = useAthleteNameMap(props.opponentAthletes);

  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? slots[0] ?? null;
  const assigned = new Set(slots.map((s) => s.athleteId).filter(Boolean) as string[]);
  const availableAthletes = props.athletes.filter((a) => !assigned.has(a.id) || a.id === selectedSlot?.athleteId);

  const isLocked = Boolean(lockedAt) || props.matchup.status === "FINAL";
  const isComplete = slots.every((s) => Boolean(s.athleteId));

  const onAssignAthlete = (athleteId: string | null) => {
    if (!selectedSlot) return;
    if (isLocked) return;

    setError(null);
    const prev = slots;
    setSlots((prev) => prev.map((s) => (s.id === selectedSlot.id ? { ...s, athleteId } : s)));

    startTransition(async () => {
      const res = await props.updateLineupSlotAction(selectedSlot.id, athleteId);
      if (!res.ok) {
        setSlots(prev);
        setError(
          res.error === "duplicate"
            ? "That athlete is already in your lineup."
            : res.error === "locked"
              ? "Lineup is locked."
              : "Couldn’t update slot.",
        );
      }
    });
  };

  const onAutoFill = () => {
    if (isLocked) return;
    setError(null);
    const used = new Set<string>();
    const filled = slots.map((s) => {
      if (s.athleteId) {
        used.add(s.athleteId);
        return s;
      }
      const next = props.athletes.find((a) => !used.has(a.id));
      if (!next) return s;
      used.add(next.id);
      return { ...s, athleteId: next.id };
    });
    setSlots(filled);

    startTransition(async () => {
      for (const slot of filled) {
        if (!slot.athleteId) continue;
        await props.updateLineupSlotAction(slot.id, slot.athleteId);
      }
    });
  };

  const onLock = () => {
    setError(null);
    startTransition(async () => {
      const res = await props.lockLineupAction(props.lineup.id);
      if (!res.ok) {
        setError(res.error === "incomplete" ? "Fill all slots before locking." : "Couldn’t lock lineup.");
        return;
      }
      setLockedAt(res.lockedAt);
    });
  };

  const onSimulate = () => {
    setError(null);
    startTransition(async () => {
      const res = await props.simulateMatchupAction(props.league.id, props.userTeam.id);
      if (!res.ok) {
        setError(res.error === "incomplete" ? "Fill all slots to play." : "Couldn’t simulate this matchup.");
        return;
      }
      setResult({ homeScore: res.homeScore, awayScore: res.awayScore });
    });
  };

  const weekLabel = `Week ${props.league.week}/${props.league.weeks}`;

  return (
    <div className="playShell">
      <header className="playHeader">
        <div>
          <h1>{weekLabel}</h1>
          <p className="ui-muted">
            {props.league.name} | {props.userTeam.name} vs {props.opponentTeam.name}
          </p>
        </div>

        <div className="playHeader__actions">
          {props.ownedTeams.length > 1 ? (
            <select
              className="ui-input"
              value={props.userTeam.id}
              onChange={(e) => {
                window.location.search = `?teamId=${encodeURIComponent(e.target.value)}`;
              }}
            >
              {props.ownedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          <Link href={`/leagues/${props.league.id}#history`} className="ui-button ui-button--secondary ui-button--md">
            History
          </Link>
          <Link
            href={`/leagues/${props.league.id}/analytics`}
            className="ui-button ui-button--secondary ui-button--md"
          >
            Analytics
          </Link>
          <Button type="button" variant="secondary" onClick={onAutoFill} disabled={isLocked || isPending}>
            Auto-fill
          </Button>
          <Button type="button" variant="secondary" onClick={onLock} disabled={isLocked || !isComplete || isPending}>
            {lockedAt ? "Locked" : "Lock lineup"}
          </Button>
          <Button type="button" onClick={onSimulate} disabled={(!isComplete && !result) || isPending}>
            {result ? "View result" : "Reveal outcome"}
          </Button>
        </div>
      </header>

      <ActionError message={error} />

      <div className="playGrid">
        <Card className="playCanvasCard">
          <div className="playCanvasFrame">
            <Suspense fallback={<div className="ui-muted">Loading arena…</div>}>
              <Arena3D
                userTeam={props.userTeam}
                opponentTeam={props.opponentTeam}
                slots={slots}
                opponentSlots={props.opponentSlots}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(id) => setSelectedSlotId(id)}
                athleteName={athleteName}
                opponentAthleteName={opponentAthleteName}
                result={result}
                matchup={props.matchup}
              />
            </Suspense>
          </div>
        </Card>

        <Card className="playSidebar">
          <h2>Lineup</h2>
          <p className="ui-muted">Click a 3D card, then assign an athlete.</p>

          <div className="playSlots">
            {slots.map((slot) => {
              const name = slot.athleteId ? athleteName.get(slot.athleteId) : "Empty";
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={cn("playSlotButton", selectedSlotId === slot.id && "playSlotButton--active")}
                  onClick={() => setSelectedSlotId(slot.id)}
                  disabled={isPending}
                >
                  <div className="playSlotButton__k">{shortSlotLabel(slot)}</div>
                  <div className="playSlotButton__v">{name}</div>
                </button>
              );
            })}
          </div>

          <h3 style={{ marginTop: "var(--space-4)" }}>Athletes</h3>
          <div className="playAthletes">
            {availableAthletes.map((a) => (
              <button
                key={a.id}
                type="button"
                className={cn(
                  "playAthleteButton",
                  selectedSlot?.athleteId === a.id && "playAthleteButton--active",
                )}
                onClick={() => onAssignAthlete(a.id)}
                disabled={isLocked || isPending}
              >
                {a.name}
              </button>
            ))}

            <button
              type="button"
              className="playAthleteButton playAthleteButton--muted"
              onClick={() => onAssignAthlete(null)}
              disabled={isLocked || isPending}
            >
              Clear slot
            </button>
          </div>

          <p className="ui-muted" style={{ marginTop: "var(--space-4)" }}>
            {isLocked ? "Lineup locked." : "Not locked yet."} {isComplete ? "Ready to play." : "Fill all slots."}
          </p>
        </Card>
      </div>
    </div>
  );
}

function Arena3D({
  userTeam,
  opponentTeam,
  slots,
  opponentSlots,
  selectedSlotId,
  onSelectSlot,
  athleteName,
  opponentAthleteName,
  result,
  matchup,
}: {
  userTeam: TeamVm;
  opponentTeam: TeamVm;
  slots: LineupSlotVm[];
  opponentSlots: LineupSlotVm[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  athleteName: Map<string, string>;
  opponentAthleteName: Map<string, string>;
  result: { homeScore: number; awayScore: number } | null;
  matchup: Props["matchup"];
}) {
  const tokens = useThreeTokens();
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [canvasKey, setCanvasKey] = useState(0);
  const [contextLossCount, setContextLossCount] = useState(0);

  const handleContextLost = useCallback((event: Event) => {
    event.preventDefault();
    setContextLossCount((c) => c + 1);
    setQuality("low");
    setCanvasKey((k) => k + 1);
  }, []);

  const tryHighQuality = useCallback(() => {
    setQuality("high");
    setCanvasKey((k) => k + 1);
  }, []);

  const isHome = matchup.homeTeam.id === userTeam.id;
  const scores = result
    ? {
        user: isHome ? result.homeScore : result.awayScore,
        opp: isHome ? result.awayScore : result.homeScore,
      }
    : null;

  const leftColor = tokens.lights.fill;
  const rightColor = tokens.materials.accent.color;

  const winnerSide: "none" | "left" | "right" | "tie" = scores
    ? scores.user > scores.opp
      ? "right"
      : scores.user < scores.opp
        ? "left"
        : "tie"
    : "none";

  const victorySide: "left" | "right" | "tie" | null = winnerSide === "none" ? null : winnerSide;

  const leftStatus: "neutral" | "winner" | "loser" | "tie" =
    winnerSide === "left" ? "winner" : winnerSide === "right" ? "loser" : winnerSide === "tie" ? "tie" : "neutral";
  const rightStatus: "neutral" | "winner" | "loser" | "tie" =
    winnerSide === "right" ? "winner" : winnerSide === "left" ? "loser" : winnerSide === "tie" ? "tie" : "neutral";

  const winnerName =
    winnerSide === "right" ? userTeam.name : winnerSide === "left" ? opponentTeam.name : null;
  const highlightColor =
    winnerSide === "right"
      ? rightColor
      : winnerSide === "left"
        ? leftColor
        : tokens.materials.glass.color;

  return (
    <div className="arena3d">
      <Canvas
        key={canvasKey}
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [0, 3.2, 8.4], fov: 48 }}
        dpr={quality === "high" ? [1, 1.5] : 1}
        frameloop={quality === "high" ? "always" : "demand"}
        gl={{
          antialias: quality === "high",
          powerPreference: quality === "high" ? "high-performance" : "low-power",
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", handleContextLost, { passive: false });
        }}
      >
        {tokens ? <color attach="background" args={[tokens.scene.bg]} /> : null}
        {tokens ? <fog attach="fog" args={[tokens.scene.fog, 8, 18]} /> : null}

        {tokens ? (
          <>
            <ambientLight intensity={0.35} />
            <directionalLight
              position={[6, 8, 6]}
              intensity={tokens.lights.keyIntensity}
              color={tokens.lights.key}
            />
            <directionalLight
              position={[-6, 3, 4]}
              intensity={tokens.lights.fillIntensity}
              color={tokens.lights.fill}
            />
            <directionalLight
              position={[0, 2.5, -6]}
              intensity={tokens.lights.rimIntensity}
              color={tokens.lights.rim}
            />
          </>
        ) : (
          <ambientLight intensity={0.6} />
        )}

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          maxPolarAngle={Math.PI / 2.1}
          minPolarAngle={0.6}
        />

        <Sparkles
          count={quality === "high" ? 48 : 16}
          scale={10}
          size={quality === "high" ? 3 : 2}
          speed={quality === "high" ? 0.22 : 0}
          opacity={quality === "high" ? 0.35 : 0.22}
          color={tokens.text.primary}
        />

        <ArenaBase tokens={tokens} />

        <TeamTotem
          team={opponentTeam}
          side="left"
          slots={opponentSlots}
          selectedSlotId={null}
          athleteName={opponentAthleteName}
          onSelectSlot={null}
          tokens={tokens}
          accentColor={leftColor}
          status={leftStatus}
        />
        <TeamTotem
          team={userTeam}
          side="right"
          slots={slots}
          selectedSlotId={selectedSlotId}
          athleteName={athleteName}
          onSelectSlot={onSelectSlot}
          tokens={tokens}
          accentColor={rightColor}
          status={rightStatus}
        />

        <CenterOrb
          tokens={tokens}
          active={Boolean(result)}
          state={winnerSide === "none" ? "idle" : winnerSide === "tie" ? "tie" : "final"}
          highlightColor={highlightColor}
        />

        {victorySide ? (
          <VictoryCelebration3D
            winnerSide={victorySide}
            quality={quality}
            leftColor={leftColor}
            rightColor={rightColor}
            tokens={tokens}
          />
        ) : null}

        {quality === "high" && Boolean(scores) ? (
          <EffectComposer>
            <Bloom intensity={0.78} luminanceThreshold={0.3} mipmapBlur />
            <Vignette eskil={false} offset={0.28} darkness={0.7} />
          </EffectComposer>
        ) : null}
      </Canvas>

      <div
        className="arenaHud"
        aria-hidden="true"
        style={{ "--arena-team-left": leftColor, "--arena-team-right": rightColor } as React.CSSProperties}
      >
        <div className="arenaScoreboard" data-winner={winnerSide}>
          <div className="arenaScoreboard__meta">
            <div className="arenaMetaPill">Week {matchup.week}</div>
            <div className="arenaMetaPill">{scores ? "Final" : "Up next"}</div>
          </div>

          <div className="arenaScoreboard__row">
            <div className={cn("arenaTeam", winnerSide === "left" && "arenaTeam--winner")} data-side="left">
              <div className="arenaTeam__badge">{teamAbbr(opponentTeam.name)}</div>
              <div className="arenaTeam__text">
                <div className="arenaTeam__name">{opponentTeam.name}</div>
                <div className="arenaTeam__sub">Opponent</div>
              </div>
            </div>

            <div className="arenaScore">
              {scores ? (
                <>
                  <span className="arenaScore__n">{scores.opp.toFixed(1)}</span>
                  <span className="arenaScore__sep">-</span>
                  <span className="arenaScore__n">{scores.user.toFixed(1)}</span>
                </>
              ) : (
                <span className="arenaScore__vs">VS</span>
              )}
            </div>

            <div
              className={cn("arenaTeam arenaTeam--right", winnerSide === "right" && "arenaTeam--winner")}
              data-side="right"
            >
              <div className="arenaTeam__badge">{teamAbbr(userTeam.name)}</div>
              <div className="arenaTeam__text">
                <div className="arenaTeam__name">{userTeam.name}</div>
                <div className="arenaTeam__sub">You</div>
              </div>
            </div>
          </div>

          {scores ? (
            <div className="arenaWinnerBanner">
              {winnerSide === "tie" ? "Tie game" : `Winner: ${winnerName ?? ""}`}
            </div>
          ) : (
            <div className="arenaWinnerBanner arenaWinnerBanner--hint">Pick a 3D card, then assign athletes.</div>
          )}
        </div>
      </div>

      {quality === "low" ? (
        <button type="button" className="arena3dBadge" onClick={tryHighQuality}>
          Low graphics mode (recovered {contextLossCount}) · Try high
        </button>
      ) : null}
    </div>
  );
}

function ArenaBase({ tokens }: { tokens: ReturnType<typeof useThreeTokens> }) {
  const surface = tokens?.materials.surface;
  const accent = tokens?.materials.accent;

  return (
    <group position={[0, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[6.4, 64]} />
        <meshStandardMaterial
          color={surface?.color ?? "#101225"}
          roughness={surface?.roughness ?? 0.8}
          metalness={surface?.metalness ?? 0.2}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2.25, 2.5, 96]} />
        <meshStandardMaterial
          color={accent?.color ?? "#6d5efc"}
          emissive={accent?.emissive ?? "#6d5efc"}
          emissiveIntensity={accent?.emissiveIntensity ?? 1.2}
          roughness={accent?.roughness ?? 0.25}
          metalness={accent?.metalness ?? 0.35}
        />
      </mesh>
    </group>
  );
}

function TeamTotem({
  team,
  side,
  slots,
  selectedSlotId,
  athleteName,
  onSelectSlot,
  tokens,
  accentColor,
  status,
}: {
  team: TeamVm;
  side: "left" | "right";
  slots: LineupSlotVm[];
  selectedSlotId: string | null;
  athleteName: Map<string, string>;
  onSelectSlot: ((slotId: string) => void) | null;
  tokens: ReturnType<typeof useThreeTokens>;
  accentColor: string;
  status: "neutral" | "winner" | "loser" | "tie";
}) {
  const x = side === "left" ? -3.1 : 3.1;
  const z = 0.2;
  const lift = status === "winner" ? 0.06 : 0;

  const surface = tokens?.materials.surface;
  const accent = tokens?.materials.accent;
  const teamAccent = accentColor || accent?.color || "#6d5efc";
  const isWinner = status === "winner";
  const isLoser = status === "loser";
  const isTie = status === "tie";
  const glow = isWinner ? 1.25 : isLoser ? 0.45 : isTie ? 0.95 : 0.8;

  const nameFontSize = team.name.length > 18 ? 0.18 : team.name.length > 12 ? 0.21 : 0.24;
  const nameColor = isWinner
    ? teamAccent
    : isLoser
      ? tokens?.text.muted ?? "white"
      : tokens?.text.primary ?? "white";

  return (
    <group position={[x, lift, z]} scale={isWinner ? 1.035 : 1}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1.1, 0.55, 32]} />
        <meshStandardMaterial
          color={surface?.color ?? "#101225"}
          emissive={teamAccent}
          emissiveIntensity={isWinner ? 0.14 : isLoser ? 0 : 0.04}
          roughness={surface?.roughness ?? 0.7}
          metalness={surface?.metalness ?? 0.2}
        />
      </mesh>

      <mesh position={[0, 0.46, 0]}>
        <torusGeometry args={[0.72, 0.07, 12, 42]} />
        <meshStandardMaterial
          color={teamAccent}
          emissive={teamAccent}
          emissiveIntensity={(accent?.emissiveIntensity ?? 1.2) * glow}
          roughness={accent?.roughness ?? 0.25}
          metalness={accent?.metalness ?? 0.35}
        />
      </mesh>

      <Text
        position={[0, 1.15, 0]}
        fontSize={nameFontSize}
        color={nameColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={2.45}
        textAlign="center"
      >
        {team.name}
      </Text>

      <group position={[0, 0.88, 0]}>
        {slots.map((slot, idx) => {
          const t = idx / Math.max(1, slots.length - 1);
          const angle = THREE.MathUtils.lerp(-0.85, 0.85, t) + (side === "left" ? 0.25 : -0.25);
          const radius = 1.85;
          const px = Math.cos(angle) * radius * (side === "left" ? 1 : -1);
          const pz = Math.sin(angle) * radius;
          const position: [number, number, number] = [px, 0, pz];
          const rotY = (side === "left" ? 1 : -1) * (Math.PI / 2) + (side === "left" ? -angle : angle) * 0.18;

          const name =
            slot.athleteId ? athleteName.get(slot.athleteId) ?? "Unknown" : side === "left" ? "Mystery" : "Empty";

          return (
            <LineupCard3D
              key={slot.id}
              title={shortSlotLabel(slot)}
              value={name}
              position={position}
              rotation={[0, rotY, 0]}
              interactive={Boolean(onSelectSlot)}
              selected={selectedSlotId === slot.id}
              onSelect={() => onSelectSlot?.(slot.id)}
              tokens={tokens}
              accentColor={teamAccent}
            />
          );
        })}
      </group>
    </group>
  );
}

function LineupCard3D({
  title,
  value,
  position,
  rotation,
  interactive,
  selected,
  onSelect,
  tokens,
  accentColor,
}: {
  title: string;
  value: string;
  position: [number, number, number];
  rotation: [number, number, number];
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  tokens: ReturnType<typeof useThreeTokens>;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && interactive);

  const surface = tokens?.materials.surface;
  const accent = tokens?.materials.accent;
  const teamAccent = accentColor || accent?.color || "#6d5efc";

  return (
    <group position={position} rotation={rotation}>
      <RoundedBox
        args={[1.15, 0.62, 0.08]}
        radius={0.08}
        smoothness={6}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (!interactive) return;
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={surface?.color ?? "#101225"}
          roughness={surface?.roughness ?? 0.65}
          metalness={surface?.metalness ?? 0.25}
          emissive={teamAccent}
          emissiveIntensity={
            selected ? accent?.emissiveIntensity ?? 1.2 : hovered ? (accent?.emissiveIntensity ?? 1.2) * 0.5 : 0
          }
        />
      </RoundedBox>

      <Text
        position={[0, 0.14, 0.05]}
        fontSize={0.13}
        color={tokens?.text.muted ?? "white"}
        anchorX="center"
        anchorY="middle"
      >
        {title}
      </Text>
      <Text
        position={[0, -0.12, 0.05]}
        fontSize={0.14}
        color={tokens?.text.primary ?? "white"}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.02}
      >
        {value}
      </Text>
    </group>
  );
}

function CenterOrb({
  tokens,
  active,
  state,
  highlightColor,
}: {
  tokens: ReturnType<typeof useThreeTokens>;
  active: boolean;
  state: "idle" | "final" | "tie";
  highlightColor: string;
}) {
  const glass = tokens?.materials.glass;
  const accent = tokens?.materials.accent;

  const base = glass?.color ?? "#00d4ff";
  const color = state === "final" ? highlightColor : base;
  const intensity = state === "final" ? 0.42 : state === "tie" ? 0.24 : 0.08;

  return (
    <group position={[0, 1.05, 0]}>
      <mesh>
        <sphereGeometry args={[0.62, 64, 64]} />
        <meshPhysicalMaterial
          color={color}
          roughness={glass?.roughness ?? 0.14}
          transmission={glass?.transmission ?? 1}
          thickness={glass?.thickness ?? 0.55}
          ior={glass?.ior ?? 1.4}
          metalness={0}
          emissive={color}
          emissiveIntensity={active ? (accent?.emissiveIntensity ?? 1.2) * intensity : 0.05}
        />
      </mesh>
      <pointLight
        position={[0, 0.2, 0]}
        intensity={active ? 1.2 : 0.35}
        color={color}
        distance={6}
      />
    </group>
  );
}

function PulseRing({
  position,
  color,
  animate,
}: {
  position: [number, number, number];
  color: string;
  animate: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 3.2) * 0.06;
    if (meshRef.current) {
      meshRef.current.rotation.z = t * 0.55;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <ringGeometry args={[1.05, 1.35, 48]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.9}
        roughness={0.28}
        metalness={0.35}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function Trophy3D({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.1, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} metalness={0.65} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.14, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} metalness={0.7} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.22, 0.14, 0.26, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.32} metalness={0.65} roughness={0.26} />
      </mesh>
      <mesh position={[0.27, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.09, 0.02, 10, 18, Math.PI]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.27, 0.4, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[0.09, 0.02, 10, 18, Math.PI]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function VictoryCelebration3D({
  winnerSide,
  quality,
  leftColor,
  rightColor,
  tokens,
}: {
  winnerSide: "left" | "right" | "tie";
  quality: "high" | "low";
  leftColor: string;
  rightColor: string;
  tokens: ReturnType<typeof useThreeTokens>;
}) {
  const animate = quality === "high";

  const x = winnerSide === "left" ? -3.1 : winnerSide === "right" ? 3.1 : 0;
  const z = winnerSide === "left" || winnerSide === "right" ? 0.2 : 0;
  const color = winnerSide === "left" ? leftColor : winnerSide === "right" ? rightColor : tokens.materials.glass.color;

  return (
    <group>
      <PulseRing position={[x, 0.01, z]} color={color} animate={animate} />

      {winnerSide !== "tie" && animate ? (
        <>
          <pointLight position={[x, 2.9, z + 0.8]} intensity={1.5} distance={8} color={color} />
          <mesh position={[x, 1.55, z + 0.45]}>
            <cylinderGeometry args={[0.18, 1.05, 2.9, 28, 1, true]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.14}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Sparkles
            count={22}
            scale={[2.2, 1.4, 2.2]}
            size={3}
            speed={0.85}
            opacity={0.6}
            color={color}
            position={[x, 2.15, z + 0.45]}
          />
          <Float speed={2.0} rotationIntensity={0.55} floatIntensity={0.35}>
            <group position={[x, 1.78, z + 0.45]}>
              <Trophy3D color={color} />
            </group>
          </Float>
        </>
      ) : null}
    </group>
  );
}
