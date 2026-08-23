import { TetrisEngine } from "./engine";
import { HouseEngine } from "./audio";
import { Renderer } from "./render";
import { Juice } from "./juice";
import { Input, type InputAction } from "./input";
import { analyze, cellsOnStep, stepToRow } from "./mix";
import { PIECE_COLOR_VAR, PIECE_IDS, cellsOf, SHAPES } from "./pieces";
import { COLS, ROWS, type GameEvent, type HudState, type PieceId } from "./types";
import { emptyDna } from "./dna";

const HI_KEY = "beatris-hi-v2";
const REMIX_COST = 40;
const DROP_COST = 70;

function loadHigh() {
  try {
    return Number(localStorage.getItem(HI_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

function saveHigh(n: number) {
  try {
    localStorage.setItem(HI_KEY, String(n));
  } catch {
    /* ignore */
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function emptyHud(): HudState {
  return {
    score: 0,
    high: loadHigh(),
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
    dna: emptyDna(),
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
}

function bestFit(engine: TetrisEngine): PieceId {
  let bestType: PieceId = engine.next[0] ?? "T";
  let best = -Infinity;
  for (const type of PIECE_IDS) {
    for (let rot = 0; rot < 4; rot++) {
      const shape = SHAPES[type][rot]!;
      const minX = Math.min(...shape.map((c) => c[0]!));
      const maxX = Math.max(...shape.map((c) => c[0]!));
      for (let x = -minX; x <= COLS - 1 - maxX; x++) {
        const piece = { type, x, y: 0, rot, lastKick: 0 };
        if (engine.collides(piece)) continue;
        let y = 0;
        while (!engine.collides({ ...piece, y: y + 1 })) y += 1;
        let touch = 0;
        for (const [cx, cy] of cellsOf(type, rot)) {
          const bx = x + cx;
          const by = y + cy + 1;
          if (by >= ROWS || (by >= 0 && engine.grid[by]![bx])) touch += 1;
        }
        const sc = touch * 3 - y * 0.08;
        if (sc > best) {
          best = sc;
          bestType = type;
        }
      }
    }
  }
  return bestType;
}

export class Session {
  engine = new TetrisEngine();
  house = new HouseEngine();
  renderer: Renderer;
  juice = new Juice();
  input = new Input();
  hud: HudState = emptyHud();
  mode: "title" | "playing" | "paused" | "over" = "title";
  onHud: (h: HudState, mode: Session["mode"]) => void;
  private raf = 0;
  private last = 0;
  private lastEmit = 0;
  private flashUntil = 0;
  private flashText: string | null = null;
  private ro: ResizeObserver | null = null;
  muted = false;
  volume = 0.72;
  charge = 0;
  perfectUsed = false;
  private fallAcc = 0;
  private softAcc = 0;
  private unoLock = false;
  private pendingHard = false;

  constructor(canvas: HTMLCanvasElement, onHud: Session["onHud"]) {
    this.renderer = new Renderer(canvas);
    this.onHud = onHud;
    this.house.onStep = (step) => this.beat(step);
  }

  attach() {
    this.input.attach();
    window.addEventListener("resize", this.onResize);
    const parent = this.renderer.canvas.parentElement;
    if (parent) {
      this.ro = new ResizeObserver(() => this.renderer.resize());
      this.ro.observe(parent);
    }
    this.onResize();
    this.emit();
  }

  detach() {
    this.input.detach();
    window.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    this.ro = null;
    this.stopLoop();
    this.house.dispose();
  }

  private onResize = () => this.renderer.resize();

  enter() {
    this.house.unlock();
    this.house.setVolume(this.volume);
    this.house.setMuted(this.muted);
    this.engine.reset();
    this.juice = new Juice();
    this.charge = 0;
    this.perfectUsed = false;
    this.fallAcc = 0;
    this.softAcc = 0;
    this.house.start();
    this.mode = "playing";
    this.input.enabled = true;
    this.last = performance.now();
    this.stopLoop();
    this.loop(this.last);
    this.emit();
  }

  restart() {
    this.house.stop();
    this.enter();
  }

  pause() {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.house.pause();
    this.input.enabled = false;
    this.emit();
  }

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.house.resume();
    this.input.enabled = true;
    this.last = performance.now();
    this.emit();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.house.setMuted(m);
    this.emit();
  }

  setVolume(v: number) {
    this.volume = v;
    this.house.setVolume(v);
  }

  setShake(on: boolean) {
    this.juice.enabled = on;
  }

  remix() {
    if (this.mode !== "playing" || this.charge < REMIX_COST) return;
    this.charge -= REMIX_COST;
    this.house.requestRemix();
    this.flash("NEW PHRASE", 800);
    this.emit();
  }

  drop() {
    if (this.mode !== "playing" || this.charge < DROP_COST) return;
    this.charge -= DROP_COST;
    this.house.requestDrop();
    this.flash("DROP", 900);
    this.juice.addTrauma(0.28);
    this.emit();
  }

  perfectPiece() {
    if (this.mode !== "playing" || this.perfectUsed || this.charge < 100) return;
    this.perfectUsed = true;
    this.charge = 0;
    this.engine.injectNext(bestFit(this.engine));
    this.flash("PERFECT PIECE", 900);
    this.emit();
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.handleInput(dt);
    if (this.mode === "playing") {
      this.engine.now = t;
      const lockEvents = this.engine.advanceLock(dt);
      this.apply(lockEvents);
      this.fallAcc += dt;
      const interval = this.engine.fallInterval();
      while (this.fallAcc >= interval) {
        this.fallAcc -= interval;
        this.apply(this.engine.tickGravity());
      }
      if (this.input.soft) {
        this.softAcc += dt;
        if (this.softAcc >= 0.045) {
          this.softAcc = 0;
          this.apply(this.engine.softDrop());
        }
      } else {
        this.softAcc = 0;
      }
      this.house.setMix(analyze(this.engine, this.house.energy));
    }
    this.juice.update(dt);
    const snap = this.engine.snapshot();
    const clock = this.house.visual();
    if (this.flashText && t > this.flashUntil) this.flashText = null;
    this.renderer.draw(snap, clock, this.juice, t / 1000);
    if (t - this.lastEmit > 50 || this.flashText) {
      this.syncHud(clock);
      this.lastEmit = t;
    }
  };

  private beat(step: number) {
    if (this.mode !== "playing") return;
    const mix = analyze(this.engine, this.house.energy);
    for (const cell of cellsOnStep(mix, step)) {
      this.renderer.flashCell(cell.col, stepToRow(step));
    }
  }

  private handleInput(dt: number) {
    const actions = this.input.pump();
    for (const a of actions) this.act(a);
    if (this.mode === "playing") {
      const steps = this.input.tickRepeat(dt);
      if (steps) {
        const dir = steps > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(steps); i++) this.apply(this.engine.move(dir));
      }
    }
  }

  private act(a: InputAction) {
    if (a === "mute") {
      this.setMuted(!this.muted);
      return;
    }
    if (a === "pause") {
      if (this.mode === "playing") this.pause();
      else if (this.mode === "paused") this.resume();
      return;
    }
    if (a === "remix") {
      this.remix();
      return;
    }
    if (a === "drop") {
      this.drop();
      return;
    }
    if (this.mode !== "playing") return;
    if (a === "left") this.apply(this.engine.move(-1));
    if (a === "right") this.apply(this.engine.move(1));
    if (a === "rotCW") this.apply(this.engine.rotate(1));
    if (a === "rotCCW") this.apply(this.engine.rotate(-1));
    if (a === "hard") this.apply(this.engine.hardDrop());
    if (a === "hold") this.apply(this.engine.holdPiece());
    if (a === "soft") this.apply(this.engine.softDrop());
  }

  private apply(events: GameEvent[]) {
    if (!events.length) return;
    const clock = this.house.visual();
    for (const ev of events) {
      if (ev.kind === "harddrop") {
        this.pendingHard = true;
        this.juice.addTrauma(0.16);
      }
      if (ev.kind === "lock") {
        const onTheOne =
          this.pendingHard && (clock.step === 0 || clock.step === 15 || (clock.beat === 1 && clock.frac < 0.35));
        this.pendingHard = false;
        this.unoLock = onTheOne;
        if (onTheOne) {
          this.engine.score = Math.floor(this.engine.score * 1.05 + 40 * this.engine.level);
          this.charge = clamp(this.charge + 16, 0, 100);
          this.flash("EN EL UNO", 800);
          this.juice.addTrauma(0.3);
        }
        this.house.nudge(ev.piece);
        this.house.notifyLock(ev.piece, onTheOne);
        this.juice.addTrauma(0.1);
      }
      if (ev.kind === "clear") {
        if (this.unoLock) {
          this.engine.score += Math.floor(([0, 50, 150, 250, 400][ev.lines] ?? 400) * this.engine.level * 0.5);
        }
        this.charge = clamp(this.charge + ev.lines * 10 + ev.combo * 4 + (ev.lines === 4 ? 18 : 0), 0, 100);
        this.house.notifyClear(ev.lines, ev.combo, ev.tspin, ev.perfect);
        const label = ev.b2b
          ? ev.lines === 4
            ? "B2B TETRIS"
            : "B2B T-SPIN"
          : ev.perfect
            ? "PERFECT"
            : ev.tspin
              ? "T-SPIN"
              : ev.lines === 4
                ? "TETRIS"
                : ev.lines === 3
                  ? "TRIPLE"
                  : ev.lines === 2
                    ? "DOUBLE"
                    : "SINGLE";
        this.flash(ev.lines === 4 ? (ev.b2b ? "B2B DROP" : "DROP") : label, ev.lines >= 4 ? 1100 : 700);
        this.juice.addTrauma(0.18 + ev.lines * 0.1);
        const color = tokenColor(ev.tspin ? "T" : "I");
        for (const row of ev.clearedRows) {
          for (let c = 0; c < 10; c++) {
            const { x, y } = this.renderer.cellCenter(c, row);
            this.juice.burst(x, y, color, 3);
          }
        }
        const mid = this.renderer.cellCenter(5, 10);
        this.juice.float(mid.x, mid.y, label);
      }
      if (ev.kind === "gameover") {
        this.mode = "over";
        this.input.enabled = false;
        this.house.tapeStop();
        const hi = Math.max(this.hud.high, this.engine.score);
        saveHigh(hi);
        this.hud.high = hi;
        this.flash("FIN", 2000);
      }
    }
    this.unoLock = false;
    this.emit();
  }

  private flash(text: string, ms: number) {
    this.flashText = text;
    this.flashUntil = performance.now() + ms;
  }

  private syncHud(clock: ReturnType<HouseEngine["visual"]>) {
    const snap = this.engine.snapshot();
    const next: HudState = {
      score: snap.score,
      high: Math.max(this.hud.high, snap.score),
      lines: snap.lines,
      level: snap.level,
      combo: snap.combo,
      maxCombo: snap.maxCombo,
      tetrises: snap.tetrises,
      bpm: clock.bpm,
      step: clock.step,
      bar: clock.bar,
      beat: clock.beat,
      arrangement: clock.arrangement,
      dna: clock.dna,
      production: clock.production,
      phrase: clock.phrase,
      mood: clock.mood,
      flash: this.flashText,
      hold: snap.hold,
      canHold: snap.canHold,
      next: snap.next,
      charge: this.charge,
      canRemix: this.charge >= REMIX_COST,
      canDrop: this.charge >= DROP_COST,
      canPerfect: this.charge >= 100 && !this.perfectUsed,
      b2b: snap.b2b,
    };
    this.hud = next;
    this.onHud(next, this.mode);
  }

  private emit() {
    this.syncHud(this.house.visual());
  }
}

function tokenColor(id: PieceId) {
  if (typeof document === "undefined") return "#e8e4d9";
  return getComputedStyle(document.documentElement).getPropertyValue(PIECE_COLOR_VAR[id]).trim() || "#e8e4d9";
}
