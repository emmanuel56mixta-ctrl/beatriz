import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type MutableRefObject, type PointerEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Session } from "@/game/session";
import { TRAIT_HINT, TRAIT_LABEL, TRAIT_OF } from "@/game/dna";
import type { Arrangement, HudState, PieceId } from "@/game/types";
import { Button } from "@/components/ui/button";
import { MiniPiece } from "@/components/game/MiniPiece";
import { Studio } from "@/components/game/Studio";
import { AnalyzerLab } from "@/components/game/AnalyzerLab";
import { cn } from "@/lib/utils";

const ARR_LABEL: Record<Arrangement, string> = {
  intro: "INTRO",
  groove: "GROOVE",
  build: "BUILD",
  break: "BREAK",
  drop: "DROP",
};

const emptyHud: HudState = {
  score: 0,
  high: 0,
  lines: 0,
  level: 1,
  combo: 0,
  maxCombo: 0,
  tetrises: 0,
  bpm: 125,
  step: 0,
  bar: 1,
  beat: 1,
  arrangement: "intro",
  dna: { bass: 0, harmony: 0, hook: 0, groove: 0, perc: 0, space: 0, drive: 0 },
  production: { gain: 0.6, filter: 0.6, room: 0.2, delay: 0.16 },
  phrase: "BEAT ONLY",
  mood: "INTRO",
  flash: null,
  hold: null,
  canHold: true,
  next: [],
  charge: 0,
  canRemix: false,
  canDrop: false,
  canPerfect: false,
  b2b: false,
};

export function Beatris() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const [mode, setMode] = useState<Session["mode"]>("title");
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [muted, setMuted] = useState(false);
  const [shake, setShake] = useState(true);
  const [volume, setVolume] = useState(0.72);
  const [labOpen, setLabOpen] = useState(false);

  const onHud = useCallback((h: HudState, m: Session["mode"]) => {
    setHud(h);
    setMode(m);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const session = new Session(canvas, onHud);
    sessionRef.current = session;
    session.attach();
    setHud(session.hud);
    return () => {
      session.detach();
      sessionRef.current = null;
    };
  }, [onHud]);

  const start = () => sessionRef.current?.enter();
  const resume = () => sessionRef.current?.resume();
  const pause = () => sessionRef.current?.pause();
  const restart = () => sessionRef.current?.restart();

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  };

  const onVolume = (v: number) => {
    setVolume(v);
    sessionRef.current?.setVolume(v);
  };

  const onShake = (on: boolean) => {
    setShake(on);
    sessionRef.current?.setShake(on);
  };

  const playing = mode === "playing" || mode === "paused" || mode === "over";

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
      <Header
        hud={hud}
        mode={mode}
        muted={muted}
        onPause={pause}
        onResume={resume}
        onMute={toggleMute}
        hidden={mode === "title"}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-stretch">
        {playing && (
          <aside className="hidden w-24 shrink-0 flex-col gap-5 px-3 pt-4 md:flex">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fg">Score</div>
              <div className="font-display text-[28px] tabular-nums leading-none tracking-tight">{pad(hud.score, 6)}</div>
            </div>
            <MiniPiece type={hud.hold} cell={12} />
          </aside>
        )}
        <div
          className={cn(
            "relative min-h-0 min-w-0",
            playing ? "flex-1 md:h-full md:w-auto md:flex-none md:aspect-[11/20]" : "flex-1",
          )}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            aria-label="Pozo de Beatris"
          />
          {hud.flash && mode === "playing" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="font-display text-4xl tracking-wide text-fg drop-shadow md:text-6xl">
                {hud.flash}
              </span>
            </div>
          )}
        </div>

        {playing && (
          <aside className="hidden h-full min-h-0 min-w-0 flex-1 flex-col border-l border-border md:flex">
            <Studio
              hud={hud}
              session={sessionRef}
              paused={mode === "paused"}
              onRemix={() => sessionRef.current?.remix()}
              onDrop={() => sessionRef.current?.drop()}
              onPerfect={() => sessionRef.current?.perfectPiece()}
              onPause={pause}
              onResume={resume}
            />
          </aside>
        )}
      </div>

      {playing && (
        <div className="border-t border-border md:hidden">
          <Studio
            compact
            hud={hud}
            session={sessionRef}
            paused={mode === "paused"}
            onRemix={() => sessionRef.current?.remix()}
            onDrop={() => sessionRef.current?.drop()}
            onPerfect={() => sessionRef.current?.perfectPiece()}
            onPause={pause}
            onResume={resume}
          />
        </div>
      )}

      {playing && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 md:hidden">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted">Reserva</span>
            <MiniPiece type={hud.hold} cell={7} />
          </div>
          <div className="font-mono text-[11px] tabular-nums text-fg">{pad(hud.score, 6)}</div>
          <div className="flex items-center gap-2">
            {hud.next.slice(0, 3).map((p, i) => (
              <MiniPiece key={`${p}-${i}`} type={p} cell={6} />
            ))}
          </div>
        </div>
      )}

      <TouchPad
        visible={mode === "playing"}
        session={sessionRef}
        canHold={hud.canHold}
      />

      {mode === "title" && <TitleScreen high={hud.high} onStart={start} onLab={() => setLabOpen(true)} />}
      {labOpen && <AnalyzerLab onClose={() => setLabOpen(false)} />}
      {mode === "paused" && (
        <PauseScreen
          onResume={resume}
          onRestart={restart}
          muted={muted}
          volume={volume}
          shake={shake}
          onMute={toggleMute}
          onVolume={onVolume}
          onShake={onShake}
        />
      )}
      {mode === "over" && <OverScreen hud={hud} onRestart={restart} onMenu={() => window.location.reload()} />}
    </div>
  );
}

function Header({
  hud,
  mode,
  muted,
  onPause,
  onResume,
  onMute,
  hidden,
}: {
  hud: HudState;
  mode: Session["mode"];
  muted: boolean;
  onPause: () => void;
  onResume: () => void;
  onMute: () => void;
  hidden: boolean;
}) {
  if (hidden) return null;
  return (
    <header className="flex h-9 items-center gap-2 border-b border-border px-3">
      <h1 className="font-display text-lg tracking-wide text-fg">BEATRIS</h1>
      <span className="font-mono text-xs tabular-nums text-muted">
        {hud.bar}.{hud.beat}
      </span>
      <span
        className={cn(
          "rounded-xs px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
          hud.arrangement === "drop" ? "bg-signal text-fg" : "text-muted",
        )}
      >
        {ARR_LABEL[hud.arrangement]}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="flex size-8 items-center justify-center text-fg"
          onClick={onMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        {mode === "playing" && (
          <button
            type="button"
            className="flex size-8 items-center justify-center text-fg md:hidden"
            onClick={onPause}
            aria-label="Pausa"
          >
            <Pause className="size-5" />
          </button>
        )}
        {mode === "paused" && (
          <button
            type="button"
            className="flex size-8 items-center justify-center text-fg md:hidden"
            onClick={onResume}
            aria-label="Continuar"
          >
            <Play className="size-5" />
          </button>
        )}
      </div>
    </header>
  );
}

function TitleScreen({ high, onStart, onLab }: { high: number; onStart: () => void; onLab: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">Four on the floor</p>
      <h1 className="font-display text-6xl leading-none tracking-wide text-fg sm:text-7xl">BEATRIS</h1>
      <p className="mt-3 max-w-md text-center text-sm leading-snug text-muted">
        El beat no se toca. El pozo escribe la siguiente frase. Hard drop en el uno.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button className="h-12 min-w-48 rounded-lg px-8 font-display tracking-wide" size="lg" onClick={onStart}>ENTRAR</Button>
        <Button className="h-12 min-w-48 rounded-lg border border-border bg-surface px-8 font-display tracking-wide text-fg hover:bg-surface-2" size="lg" onClick={onLab}>ADN LAB</Button>
      </div>
      {high > 0 && (
        <p className="mt-4 font-mono text-xs tabular-nums text-subtle">Récord {pad(high, 6)}</p>
      )}
      <Legend />
      <p className="mt-8 max-w-md text-center font-mono text-[10px] leading-relaxed text-subtle">
        ← → mover · Z / ↑ rotar · ↓ caída suave · espacio hard drop · C reserva · R remix · F drop
      </p>
    </div>
  );
}

function Legend() {
  const items: PieceId[] = ["I", "O", "T", "S", "Z", "J", "L"];
  return (
    <ul className="mt-10 grid grid-cols-4 gap-x-4 gap-y-3 sm:grid-cols-7">
      {items.map((id) => (
        <li key={id} className="flex flex-col items-center gap-1">
          <MiniPiece type={id} cell={7} />
          <span className="font-mono text-[9px] tracking-wider text-muted">{TRAIT_LABEL[TRAIT_OF[id]]}</span>
          <span className="hidden max-w-20 text-center text-[9px] text-subtle sm:block">{TRAIT_HINT[id]}</span>
        </li>
      ))}
    </ul>
  );
}

function PauseScreen({
  onResume,
  onRestart,
  muted,
  volume,
  shake,
  onMute,
  onVolume,
  onShake,
}: {
  onResume: () => void;
  onRestart: () => void;
  muted: boolean;
  volume: number;
  shake: boolean;
  onMute: () => void;
  onVolume: (v: number) => void;
  onShake: (on: boolean) => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/85 px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-2xl tracking-wide">PAUSA</h2>
        <p className="mt-1 text-sm text-muted">El beat sigue, el pozo no.</p>
        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Volumen</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="w-36 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Silencio</span>
            <button type="button" className="text-fg" onClick={onMute}>
              {muted ? "Sí" : "No"}
            </button>
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Sacudida</span>
            <button type="button" className="text-fg" onClick={() => onShake(!shake)}>
              {shake ? "Sí" : "No"}
            </button>
          </label>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onResume}>Continuar</Button>
          <Button variant="ghost" onClick={onRestart}>
            Reiniciar
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverScreen({
  hud,
  onRestart,
  onMenu,
}: {
  hud: HudState;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/90 px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">Tape stop</p>
        <h2 className="mt-1 font-display text-3xl tracking-wide">FIN DE PISTA</h2>
        <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
          <div>
            <dt className="text-[10px] uppercase text-muted">Puntos</dt>
            <dd>{hud.score}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted">Récord</dt>
            <dd>{hud.high}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted">Líneas</dt>
            <dd>{hud.lines}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-muted">Combo máx.</dt>
            <dd>{hud.maxCombo}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onRestart}>Otra pista</Button>
          <Button variant="ghost" onClick={onMenu}>
            Salir
          </Button>
        </div>
      </div>
    </div>
  );
}

function TouchPad({
  visible,
  session,
  canHold,
}: {
  visible: boolean;
  session: MutableRefObject<Session | null>;
  canHold: boolean;
}) {
  if (!visible) return null;
  const down = (a: Parameters<Session["input"]["press"]>[0]) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    session.current?.input.press(a);
  };
  const up = (a: Parameters<Session["input"]["press"]>[0]) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    session.current?.input.release(a);
  };
  return (
    <div className="grid grid-cols-4 gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 md:hidden">
      <Pad onPointerDown={down("hold")} onPointerUp={up("hold")} disabled={!canHold} label="Reserva">
        Reserva
      </Pad>
      <Pad onPointerDown={down("rotCCW")} onPointerUp={up("rotCCW")} label="Rotar a la izquierda">
        <RotateCcw className="size-5" />
      </Pad>
      <Pad onPointerDown={down("rotCW")} onPointerUp={up("rotCW")} label="Rotar a la derecha">
        <RotateCw className="size-5" />
      </Pad>
      <Pad onPointerDown={down("hard")} onPointerUp={up("hard")} label="Hard drop">
        Drop
      </Pad>
      <Pad onPointerDown={down("left")} onPointerUp={up("left")} onPointerCancel={up("left")} label="Izquierda">
        <ChevronLeft className="size-6" />
      </Pad>
      <Pad onPointerDown={down("soft")} onPointerUp={up("soft")} onPointerCancel={up("soft")} label="Caída suave">
        <ChevronDown className="size-6" />
      </Pad>
      <Pad onPointerDown={down("right")} onPointerUp={up("right")} onPointerCancel={up("right")} label="Derecha">
        <ChevronRight className="size-6" />
      </Pad>
      <Pad onPointerDown={down("hard")} onPointerUp={up("hard")} label="Hard drop">
        <ChevronDown className="size-6" />
        <ChevronDown className="-mt-3 size-6" />
      </Pad>
    </div>
  );
}

function Pad({
  children,
  label,
  disabled,
  ...handlers
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="flex h-14 items-center justify-center rounded-md border border-border bg-surface text-xs uppercase tracking-wide text-fg select-none"
      style={{ touchAction: "none" }}
      {...handlers}
    >
      {children}
    </button>
  );
}

function pad(n: number, w: number) {
  return n.toString().padStart(w, "0");
}
