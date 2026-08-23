import { useEffect, useRef, type MutableRefObject } from "react";
import { Pause, Play } from "lucide-react";
import type { Session } from "@/game/session";
import type { HudState, PieceId, TraitId } from "@/game/types";
import { TRAIT_LABEL, TRAITS } from "@/game/dna";
import { MiniPiece } from "@/components/game/MiniPiece";
import { cn } from "@/lib/utils";

const PIECE_BY_TRAIT: Record<TraitId, PieceId> = {
  bass: "I",
  harmony: "O",
  hook: "T",
  groove: "S",
  perc: "Z",
  space: "J",
  drive: "L",
};

const FADER_COLOR: Record<TraitId, string> = {
  bass: "var(--color-i)",
  harmony: "var(--color-o)",
  hook: "var(--color-t)",
  groove: "var(--color-s)",
  perc: "var(--color-z)",
  space: "var(--color-j)",
  drive: "var(--color-l)",
};

export function Studio({
  hud,
  session,
  compact,
  paused,
  onRemix,
  onDrop,
  onPerfect,
  onPause,
  onResume,
}: {
  hud: HudState;
  session: MutableRefObject<Session | null>;
  compact?: boolean;
  paused: boolean;
  onRemix: () => void;
  onDrop: () => void;
  onPerfect: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col bg-surface", compact ? "gap-1.5 p-2" : "gap-3 p-3")}>
      <Waveform session={session} height={compact ? 40 : 96} />

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className={cn("font-display leading-none tracking-tight tabular-nums text-fg", compact ? "text-2xl" : "text-3xl md:text-5xl")}>
            {hud.bpm}
            <span className="ml-1 font-mono text-[10px] tracking-[0.2em] text-muted">BPM</span>
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {hud.arrangement} · {hud.phrase}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((b) => (
            <span
              key={b}
              className={cn(
                "size-2 rounded-full border border-border",
                hud.beat === b + 1 ? "bg-accent shadow-[0_0_10px_var(--color-accent)]" : "bg-transparent",
              )}
            />
          ))}
          <button
            type="button"
            className="ml-2 flex size-10 items-center justify-center rounded-md border border-border bg-surface-2 text-fg"
            onClick={paused ? onResume : onPause}
            aria-label={paused ? "Continuar" : "Pausa"}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <DeckBtn label="REMIX" hint="R" ready={hud.canRemix} onClick={onRemix} compact={compact} />
        <DeckBtn label="DROP" hint="F" ready={hud.canDrop} hot onClick={onDrop} compact={compact} />
        {hud.canPerfect && <DeckBtn label="PERFECT" hint="1×" ready onClick={onPerfect} compact={compact} />}
      </div>

      <Charge value={hud.charge} />

      {!compact && (
        <>
          <div className="grid grid-cols-6 gap-x-2 gap-y-3 px-1">
            <Knob label="GAIN" value={hud.production.gain} ring="#3ed67a" />
            <Knob label="FILTER" value={hud.production.filter} ring="#f0d44a" />
            <Knob label="DRIVE" value={hud.dna.drive} ring="#e24b3a" />
            <Knob label="ROOM" value={hud.production.room} ring="#3a7cff" />
            <Knob label="DELAY" value={hud.production.delay} ring="#c46ae8" />
            <Knob label="SWING" value={hud.dna.groove} ring="#20d2d6" />
            <Knob label="BASS" value={hud.dna.bass} ring="#20d2d6" />
            <Knob label="HARM" value={hud.dna.harmony} ring="#f0d44a" />
            <Knob label="HOOK" value={hud.dna.hook} ring="#c46ae8" />
            <Knob label="GROOVE" value={hud.dna.groove} ring="#3ed67a" />
            <Knob label="PERC" value={hud.dna.perc} ring="#f04646" />
            <Knob label="SPACE" value={hud.dna.space} ring="#3a7cff" />
          </div>
          <div className="flex min-h-0 flex-1 items-stretch justify-between gap-2 px-2 pb-1">
            {TRAITS.map((t) => (
              <Fader key={t} trait={t} value={hud.dna[t]} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-[10px] uppercase tracking-wider text-muted">Siguientes</span>
            <div className="flex items-center gap-2">
              {hud.next.slice(0, 4).map((p, i) => (
                <MiniPiece key={`${p}-${i}`} type={p} cell={i === 0 ? 8 : 6} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeckBtn({
  label,
  hint,
  ready,
  hot,
  compact,
  onClick,
}: {
  label: string;
  hint: string;
  ready: boolean;
  hot?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center rounded-md border font-display tracking-wide",
        compact ? "h-10 text-xs" : "h-11 text-sm",
        hot && ready
          ? "border-signal bg-signal text-fg"
          : ready
            ? "border-accent bg-accent text-accent-fg"
            : "border-border bg-surface-2 text-muted",
      )}
    >
      {label}
      <span className="ml-2 font-mono text-[9px] opacity-70">{hint}</span>
    </button>
  );
}

function Charge({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <span>Carga</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${value}%`, boxShadow: value > 70 ? "0 0 10px var(--color-accent)" : undefined }}
        />
      </div>
    </div>
  );
}

function Knob({ label, value, ring }: { label: string; value: number; ring: string }) {
  const v = Math.max(0, Math.min(1, value));
  const rot = -135 + v * 270;
  const arc = 58;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-11">
        <svg viewBox="0 0 36 36" className="size-11">
          <circle cx="18" cy="18" r="16" fill="#0b0c10" stroke="#2a2d36" strokeWidth="1" />
          <circle
            cx="18"
            cy="18"
            r="13.5"
            fill="none"
            stroke={ring}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={`${v * arc} ${arc}`}
            transform="rotate(-135 18 18)"
          />
        </svg>
        <div className="absolute inset-[9px] rounded-full bg-surface-2 shadow-inner">
          <span
            className="absolute left-1/2 top-[3px] h-[9px] w-0.5 origin-bottom rounded-full bg-accent"
            style={{ transform: `translateX(-50%) rotate(${rot}deg)`, transformOrigin: "50% 11px" }}
          />
        </div>
      </div>
      <span className="font-mono text-[8px] tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

function Fader({ trait, value }: { trait: TraitId; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex h-full min-h-16 w-8 flex-col items-center gap-1">
      <div className="relative min-h-0 w-3 flex-1 overflow-hidden rounded-full bg-bg">
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{ height: `${pct}%`, background: FADER_COLOR[trait] }}
        />
        <span
          className="absolute left-1/2 size-3 -translate-x-1/2 rounded-[2px] bg-accent shadow"
          style={{ bottom: `calc(${pct}% - 6px)` }}
        />
      </div>
      <MiniPiece type={PIECE_BY_TRAIT[trait]} cell={4} />
      <span className="font-mono text-[8px] tracking-wider text-muted">{TRAIT_LABEL[trait]}</span>
    </div>
  );
}

function Waveform({ session, height }: { session: MutableRefObject<Session | null>; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(0, 0, w, h);
      const data = session.current?.house.waveform();
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#f08a28");
      grad.addColorStop(0.25, "#3ed67a");
      grad.addColorStop(0.5, "#20d2d6");
      grad.addColorStop(0.75, "#3a7cff");
      grad.addColorStop(1, "#f04646");
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      if (!data || data.length === 0) {
        ctx.lineTo(w, h / 2);
      } else {
        const n = data.length;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = ((data[i]! - 128) / 128) * (h * 0.46) + h / 2;
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, h / 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  return (
    <canvas
      ref={ref}
      className="w-full rounded-md border border-border"
      style={{ height }}
      aria-hidden
    />
  );
}
