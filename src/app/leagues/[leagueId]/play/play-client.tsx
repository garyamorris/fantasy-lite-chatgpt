"use client";

import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, RoundedBox, Sparkles, Text, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  league: { id: string; name: string; week: number; currentWeek: number; weeks: number };
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
  simulateMatchupWeekAction: (leagueId: string, teamId: string, week: number) => Promise<
    | { ok: true; matchupId: string; homeScore: number; awayScore: number; alreadyFinal: boolean }
    | { ok: false; error: "not_found" | "forbidden" | "no_matchup" | "incomplete" }
  >;
  isCommissioner: boolean;
  advanceWeekAndContinueAction: () => Promise<void>;
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

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function teamColor(seed: string, sat = 0.72, light = 0.56) {
  const h = (fnv1a32(seed) % 360) / 360;
  const c = new THREE.Color();
  c.setHSL(h, sat, light);
  return `#${c.getHexString()}`;
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="ui-alert ui-alert--danger">{message}</p>;
}

type PlayStepId = "lineup" | "lock" | "play" | "review" | "next";

function playHref(leagueId: string, week: number, teamId: string) {
  const sp = new URLSearchParams();
  sp.set("week", String(week));
  sp.set("teamId", teamId);
  return `/leagues/${leagueId}/play?${sp.toString()}`;
}

function PlayStepper({ step }: { step: PlayStepId }) {
  const steps: Array<{ id: PlayStepId; label: string }> = [
    { id: "lineup", label: "Lineup" },
    { id: "lock", label: "Lock" },
    { id: "play", label: "Play" },
    { id: "review", label: "Review" },
    { id: "next", label: "Next" },
  ];

  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="playStepper" aria-label="Play workflow steps">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cn("playStepper__step", i < idx && "is-done", i === idx && "is-active")}
          aria-current={i === idx ? "step" : undefined}
        >
          <span className="playStepper__pill">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function MatchupPlayClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const arenaFrameRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [coachView, setCoachView] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const filledCount = slots.filter((s) => Boolean(s.athleteId)).length;
  const showSidebar = coachView && !isFullscreen;

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
      const res = await props.simulateMatchupWeekAction(props.league.id, props.userTeam.id, props.league.week);
      if (!res.ok) {
        setError(res.error === "incomplete" ? "Fill all slots to play." : "Couldn’t simulate this matchup.");
        return;
      }
      setResult({ homeScore: res.homeScore, awayScore: res.awayScore });
    });
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    onFsChange();
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const host = arenaFrameRef.current;
    if (!host) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (typeof host.requestFullscreen !== "function") return;
      await host.requestFullscreen();
    } catch {
      // Ignore fullscreen errors (browser gesture policies).
    }
  }, []);

  const weekLabel = `Week ${props.league.week}/${props.league.weeks}`;
  const isViewingCurrentWeek = props.league.week === props.league.currentWeek;
  const hasNextWeek = props.league.week < props.league.weeks;
  const canAdvanceWeek =
    props.isCommissioner && isViewingCurrentWeek && Boolean(result) && props.league.currentWeek < props.league.weeks;

  const workflowStep: PlayStepId = !isComplete
    ? "lineup"
    : !isLocked
      ? "lock"
      : !result
        ? "play"
        : canAdvanceWeek
          ? "next"
          : "review";

  return (
    <div className={cn("playShell", !showSidebar && "playShell--focus")}>
      <header className="playHeader">
        <div className="playHeader__left">
          <h1>{weekLabel}</h1>
          <p className="ui-muted">
            {props.league.name} · {props.userTeam.name} vs {props.opponentTeam.name}
            {!isViewingCurrentWeek ? ` · Viewing (current is Week ${props.league.currentWeek})` : ""}
          </p>
          <PlayStepper step={workflowStep} />
        </div>

        <div className="playHeader__right">
          {props.ownedTeams.length > 1 ? (
            <select
              className="ui-input"
              value={props.userTeam.id}
              aria-label="Select your team"
              onChange={(e) => {
                const sp = new URLSearchParams(window.location.search);
                sp.set("teamId", e.target.value);
                sp.set("week", String(props.league.week));
                window.location.search = `?${sp.toString()}`;
              }}
            >
              {props.ownedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <ActionError message={error} />

      <div className={cn("playGrid", !showSidebar && "playGrid--focus")}>
        <Card className="playCanvasCard">
          <div ref={arenaFrameRef} className="playCanvasFrame">
            <Suspense fallback={<div className="ui-muted">Loading arena...</div>}>
              <Arena3D
                userTeam={props.userTeam}
                opponentTeam={props.opponentTeam}
                slots={slots}
                opponentSlots={props.opponentSlots}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(id) => {
                  setSelectedSlotId(id);
                  if (!showSidebar) setDrawerOpen(true);
                }}
                athleteName={athleteName}
                opponentAthleteName={opponentAthleteName}
                result={result}
                matchup={props.matchup}
                matchState={!isComplete ? "building" : isLocked && !result ? "locked" : result ? "final" : "ready"}
              />
            </Suspense>

            <div className="arenaOverlay" aria-label="Arena controls">
              <div className="arenaOverlay__bar">
                <div className="arenaOverlay__left">
                  <Link
                    className={cn(
                      "ui-button ui-button--secondary ui-button--sm",
                      props.league.week <= 1 && "is-disabled",
                    )}
                    aria-disabled={props.league.week <= 1}
                    tabIndex={props.league.week <= 1 ? -1 : 0}
                    href={playHref(props.league.id, Math.max(1, props.league.week - 1), props.userTeam.id)}
                  >
                    Prev
                  </Link>
                  <Link
                    className={cn(
                      "ui-button ui-button--secondary ui-button--sm",
                      props.league.week >= props.league.weeks && "is-disabled",
                    )}
                    aria-disabled={props.league.week >= props.league.weeks}
                    tabIndex={props.league.week >= props.league.weeks ? -1 : 0}
                    href={playHref(
                      props.league.id,
                      Math.min(props.league.weeks, props.league.week + 1),
                      props.userTeam.id,
                    )}
                  >
                    Next
                  </Link>
                  <div className="arenaOverlay__meta ui-muted">
                    Lineup {filledCount}/{slots.length} {isLocked ? "· Locked" : ""}
                  </div>
                </div>

                <div className="arenaOverlay__center">
                  {!isComplete ? (
                    <Button type="button" size="sm" onClick={onAutoFill} disabled={isLocked || isPending}>
                      Auto-fill
                    </Button>
                  ) : !isLocked ? (
                    <Button type="button" size="sm" onClick={onLock} disabled={isLocked || isPending}>
                      Lock lineup
                    </Button>
                  ) : !result ? (
                    <Button type="button" size="sm" onClick={onSimulate} disabled={isPending}>
                      Play &amp; reveal
                    </Button>
                  ) : hasNextWeek ? (
                    canAdvanceWeek ? (
                      <form action={props.advanceWeekAndContinueAction}>
                        <button className="ui-button ui-button--primary ui-button--sm" type="submit" disabled={isPending}>
                          Advance to Week {props.league.currentWeek + 1}
                        </button>
                      </form>
                    ) : props.league.currentWeek > props.league.week ? (
                      <Link
                        className="ui-button ui-button--primary ui-button--sm"
                        href={playHref(props.league.id, props.league.week + 1, props.userTeam.id)}
                      >
                        Continue to Week {props.league.week + 1}
                      </Link>
                    ) : (
                      <div className="arenaOverlay__waiting ui-muted">Waiting for commissioner...</div>
                    )
                  ) : (
                    <div className="arenaOverlay__waiting ui-muted">Season complete</div>
                  )}
                </div>

                <div className="arenaOverlay__right">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!showSidebar) setDrawerOpen((v) => !v);
                      else setCoachView(false);
                    }}
                    disabled={isPending}
                  >
                    {showSidebar ? "Focus view" : "Lineup"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCoachView((v) => !v)}
                    disabled={isPending || isFullscreen}
                    title={isFullscreen ? "Exit full screen to use coach view." : undefined}
                  >
                    Coach
                  </Button>

                  <Button type="button" size="sm" variant="secondary" onClick={toggleFullscreen} disabled={isPending}>
                    {isFullscreen ? "Exit full screen" : "Full screen"}
                  </Button>
                </div>
              </div>
            </div>

            <section className={cn("arenaDrawer", drawerOpen && "arenaDrawer--open")} aria-label="Lineup editor">
              <div className="arenaDrawer__header">
                <div>
                  <div className="arenaDrawer__title">Lineup</div>
                  <div className="arenaDrawer__meta ui-muted">
                    {filledCount}/{slots.length} filled {isLocked ? "· Locked" : "· Editable"}
                  </div>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setDrawerOpen(false)}>
                  Close
                </Button>
              </div>

              <div className="arenaDrawer__body">
                <div className="arenaDrawer__field">
                  <label className="ui-muted" htmlFor="arenaSlotSelect">
                    Slot
                  </label>
                  <select
                    id="arenaSlotSelect"
                    className="ui-input"
                    value={selectedSlot?.id ?? ""}
                    disabled={isPending}
                    onChange={(e) => setSelectedSlotId(e.target.value)}
                  >
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shortSlotLabel(s)} · {s.athleteId ? athleteName.get(s.athleteId) ?? "Unknown" : "Empty"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="arenaDrawer__field">
                  <div className="arenaDrawer__label ui-muted">Athletes</div>
                  <div className="arenaDrawer__athletes">
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
                </div>
              </div>
            </section>
          </div>
        </Card>

        {showSidebar ? (
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
        ) : null}
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
  matchState,
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
  matchState: "building" | "ready" | "locked" | "final";
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

  const leftColor = teamColor(opponentTeam.id, 0.7, 0.56);
  const rightColor = teamColor(userTeam.id, 0.7, 0.56);

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
            <MovingLights enabled={quality === "high"} leftColor={leftColor} rightColor={rightColor} state={matchState} />
          </>
        ) : (
          <ambientLight intensity={0.6} />
        )}

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          autoRotate={quality === "high"}
          autoRotateSpeed={matchState === "final" ? 0.65 : matchState === "locked" ? 0.42 : 0.22}
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
        <MatchEnergy state={matchState} winnerSide={winnerSide} leftColor={leftColor} rightColor={rightColor} />

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

function MovingLights({
  enabled,
  leftColor,
  rightColor,
  state,
}: {
  enabled: boolean;
  leftColor: string;
  rightColor: string;
  state: "building" | "ready" | "locked" | "final";
}) {
  const leftRef = useRef<THREE.PointLight>(null);
  const rightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!enabled) return;
    const t = clock.getElapsedTime();
    const speed = state === "final" ? 0.9 : state === "locked" ? 0.6 : 0.35;
    const r = state === "final" ? 8.2 : state === "locked" ? 7.6 : 7.1;
    const y = state === "final" ? 5.2 : state === "locked" ? 4.6 : 4.1;

    if (leftRef.current) {
      leftRef.current.position.set(Math.cos(t * speed) * r, y + Math.sin(t * 0.8) * 0.35, Math.sin(t * speed) * r);
    }
    if (rightRef.current) {
      rightRef.current.position.set(
        Math.cos(t * speed + Math.PI) * r,
        y + Math.sin(t * 0.8 + 1.2) * 0.35,
        Math.sin(t * speed + Math.PI) * r,
      );
    }
  });

  const intensity = state === "final" ? 1.15 : state === "locked" ? 0.85 : 0.55;

  return (
    <>
      <pointLight ref={leftRef} intensity={intensity} color={leftColor} distance={18} decay={2} />
      <pointLight ref={rightRef} intensity={intensity * 0.95} color={rightColor} distance={18} decay={2} />
    </>
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

function MatchEnergy({
  state,
  winnerSide,
  leftColor,
  rightColor,
}: {
  state: "building" | "ready" | "locked" | "final";
  winnerSide: "none" | "left" | "right" | "tie";
  leftColor: string;
  rightColor: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const worldPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = clock.getElapsedTime();
    const speed = state === "final" ? 1.8 : state === "locked" ? 1.35 : 0.95;
    const amp = state === "locked" ? 2.35 : 2.0;

    const baseY = state === "locked" ? 1.55 : 1.35;
    const bob = Math.sin(t * (state === "locked" ? 5.5 : 3.4)) * (state === "locked" ? 0.16 : 0.1);

    if (state === "final" && (winnerSide === "left" || winnerSide === "right")) {
      const targetX = winnerSide === "left" ? -2.35 : 2.35;
      mesh.position.x = THREE.MathUtils.damp(mesh.position.x, targetX, 6.5, delta);
      mesh.position.y = THREE.MathUtils.damp(mesh.position.y, 1.85, 6.5, delta);
      mesh.position.z = THREE.MathUtils.damp(mesh.position.z, 0.6, 6.5, delta);
    } else {
      mesh.position.x = Math.sin(t * speed) * amp;
      mesh.position.y = baseY + bob;
      mesh.position.z = 0.45 + Math.cos(t * (speed * 0.8)) * 0.25;
    }

    const pulse = 1 + Math.sin(t * (state === "final" ? 7.5 : state === "locked" ? 6.2 : 3.8)) * 0.14;
    mesh.scale.setScalar(pulse);

    if (lightRef.current) {
      mesh.getWorldPosition(worldPos);
      lightRef.current.position.copy(worldPos);
      lightRef.current.intensity = state === "final" ? 1.4 : state === "locked" ? 1.05 : 0.75;
    }
  });

  const color =
    winnerSide === "left" ? leftColor : winnerSide === "right" ? rightColor : winnerSide === "tie" ? "#ffffff" : "#00d4ff";

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.14, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={state === "final" ? 1.35 : 0.85} roughness={0.22} metalness={0.35} />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={state === "final" ? 1.3 : 0.85} distance={6} />
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
        position={[0, 0.22, 0.62]}
        fontSize={0.34}
        color={tokens?.text.primary ?? "white"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="black"
      >
        {teamAbbr(team.name)}
      </Text>

      <RoundedBox args={[2.65, 0.44, 0.06]} radius={0.09} smoothness={6} position={[0, 1.15, 0.06]}>
        <meshStandardMaterial
          color={surface?.color ?? "#101225"}
          roughness={surface?.roughness ?? 0.7}
          metalness={surface?.metalness ?? 0.2}
          emissive={teamAccent}
          emissiveIntensity={isWinner ? 0.18 : 0.08}
          transparent
          opacity={0.62}
        />
      </RoundedBox>

      <Text
        position={[0, 1.15, 0.1]}
        fontSize={nameFontSize}
        color={nameColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={2.45}
        textAlign="center"
        outlineWidth={0.012}
        outlineColor="black"
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

          const name =
            slot.athleteId ? athleteName.get(slot.athleteId) ?? "Unknown" : side === "left" ? "Mystery" : "Empty";

          return (
            <LineupCard3D
              key={slot.id}
              title={shortSlotLabel(slot)}
              value={name}
              position={position}
              rotation={[0, 0, 0]}
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
  const pivotRef = useRef<THREE.Group>(null);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const bobSeed = useMemo(() => (fnv1a32(`${title}:${value}`) % 1000) / 1000, [title, value]);

  useFrame(({ camera, clock }, delta) => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    pivot.getWorldPosition(worldPos);
    const dx = camera.position.x - worldPos.x;
    const dz = camera.position.z - worldPos.z;
    const yaw = Math.atan2(dx, dz);

    pivot.rotation.set(rotation[0], yaw, rotation[2]);

    const targetScale = selected ? 1.09 : hovered ? 1.05 : 1;
    const nextScale = THREE.MathUtils.damp(pivot.scale.x, targetScale, 10, delta);
    pivot.scale.setScalar(nextScale);

    const baseLift = selected ? 0.08 : hovered ? 0.04 : 0;
    const bob = Math.sin(clock.getElapsedTime() * 2.1 + bobSeed * Math.PI * 2) * 0.02;
    pivot.position.y = baseLift + bob;
  });

  return (
    <group position={position}>
      <group ref={pivotRef} rotation={rotation}>
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
          outlineWidth={0.006}
          outlineColor="black"
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
          outlineWidth={0.006}
          outlineColor="black"
        >
          {value}
        </Text>
      </group>
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
  const groupRef = useRef<THREE.Group>(null);

  const base = glass?.color ?? "#00d4ff";
  const color = state === "final" ? highlightColor : base;
  const intensity = state === "final" ? 0.42 : state === "tie" ? 0.24 : 0.08;

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    const bobSpeed = state === "final" ? 3.2 : state === "tie" ? 2.4 : 1.7;
    const bobAmp = state === "final" ? 0.08 : state === "tie" ? 0.06 : 0.05;
    g.position.y = 1.05 + Math.sin(t * bobSpeed) * bobAmp;
    g.rotation.y = t * (state === "final" ? 0.9 : 0.35);
    const pulse = 1 + Math.sin(t * (state === "final" ? 6.3 : 3.1)) * (state === "final" ? 0.06 : 0.02);
    g.scale.setScalar(pulse);
  });

  return (
    <group ref={groupRef} position={[0, 1.05, 0]}>
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

function ShockwaveRing({
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
    const mesh = meshRef.current;
    if (!mesh || !animate) return;
    const t = (clock.getElapsedTime() * 0.5) % 1;
    const scale = 1 + t * 3.2;
    mesh.scale.setScalar(scale);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.55 * (1 - t);
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <ringGeometry args={[0.9, 1.25, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
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
      <ShockwaveRing position={[x, 0.01, z]} color={color} animate={animate && winnerSide !== "tie"} />

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
            count={44}
            scale={[2.7, 1.8, 2.7]}
            size={3}
            speed={1.15}
            opacity={0.72}
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
