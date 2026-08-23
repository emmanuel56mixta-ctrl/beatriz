import {
  COLS,
  HIDDEN_ROWS,
  ROWS,
  VISIBLE_ROWS,
  type ActivePiece,
  type Cell,
  type GameEvent,
  type PieceId,
  type Snapshot,
} from "./types";
import {
  LOCK_DELAY,
  LOCK_RESET_CAP,
  NEXT_COUNT,
  cellsOf,
  kicksFor,
  spawnX,
} from "./pieces";

function emptyGrid(): (Cell | null)[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export class TetrisEngine {
  grid: (Cell | null)[][] = emptyGrid();
  active: ActivePiece | null = null;
  hold: PieceId | null = null;
  canHold = true;
  next: PieceId[] = [];
  bag: PieceId[] = [];
  score = 0;
  lines = 0;
  combo = -1;
  maxCombo = 0;
  tetrises = 0;
  over = false;
  lockTimer = 0;
  lockResets = 0;
  grounded = false;
  now = 0;
  b2bReady = false;

  reset() {
    this.grid = emptyGrid();
    this.active = null;
    this.hold = null;
    this.canHold = true;
    this.next = [];
    this.bag = [];
    this.score = 0;
    this.lines = 0;
    this.combo = -1;
    this.maxCombo = 0;
    this.tetrises = 0;
    this.over = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.now = 0;
    this.b2bReady = false;
    while (this.next.length < NEXT_COUNT) this.fillBag();
    this.spawn();
  }

  get level() {
    return Math.floor(this.lines / 10) + 1;
  }

  fallInterval() {
    return Math.max(0.08, 0.78 * Math.pow(0.84, this.level - 1));
  }

  gravityRows() {
    return this.level >= 8 ? 1 + Math.floor((this.level - 7) / 4) : 1;
  }

  injectNext(type: PieceId) {
    if (this.next.length) this.next[0] = type;
    else this.next.push(type);
  }

  private fillBag() {
    if (this.bag.length === 0) {
      this.bag = shuffle(["I", "O", "T", "S", "Z", "J", "L"]);
    }
    while (this.next.length < NEXT_COUNT && this.bag.length) {
      this.next.push(this.bag.shift()!);
    }
  }

  private occupy(piece: ActivePiece): { x: number; y: number }[] {
    return cellsOf(piece.type, piece.rot).map(([cx, cy]) => ({
      x: piece.x + cx,
      y: piece.y + cy,
    }));
  }

  collides(piece: ActivePiece): boolean {
    for (const { x, y } of this.occupy(piece)) {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.grid[y]![x]) return true;
    }
    return false;
  }

  ghostY(): number {
    if (!this.active) return 0;
    const p = { ...this.active };
    while (!this.collides({ ...p, y: p.y + 1 })) p.y += 1;
    return p.y;
  }

  private spawn(): GameEvent[] {
    this.fillBag();
    const type = this.next.shift()!;
    this.fillBag();
    const piece: ActivePiece = {
      type,
      x: spawnX(type),
      y: 0,
      rot: 0,
      lastKick: 0,
    };
    this.active = piece;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.canHold = true;
    if (this.collides(piece)) {
      this.over = true;
      this.active = null;
      return [
        { kind: "spawn", piece: type },
        { kind: "gameover" },
      ];
    }
    return [{ kind: "spawn", piece: type }];
  }

  move(dx: number): GameEvent[] {
    if (!this.active || this.over) return [];
    const next = { ...this.active, x: this.active.x + dx };
    if (this.collides(next)) return [];
    this.active = next;
    this.nudgeLock();
    return [{ kind: "move", dx }];
  }

  rotate(dir: 1 | -1): GameEvent[] {
    if (!this.active || this.over) return [];
    const from = this.active.rot;
    const to = (from + (dir === 1 ? 1 : 3)) % 4;
    const kicks = kicksFor(this.active.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i]!;
      const next: ActivePiece = {
        ...this.active,
        rot: to,
        x: this.active.x + kx,
        y: this.active.y - ky,
        lastKick: i,
      };
      if (!this.collides(next)) {
        this.active = next;
        this.nudgeLock();
        return [{ kind: "rotate", dir }];
      }
    }
    return [];
  }

  private nudgeLock() {
    if (!this.grounded) return;
    if (this.lockResets >= LOCK_RESET_CAP) return;
    this.lockTimer = 0;
    this.lockResets += 1;
  }

  holdPiece(): GameEvent[] {
    if (!this.active || this.over || !this.canHold) return [];
    const current = this.active.type;
    this.canHold = false;
    if (this.hold == null) {
      this.hold = current;
      this.active = null;
      const events: GameEvent[] = [{ kind: "hold", piece: current }];
      return events.concat(this.spawn());
    }
    const swapped = this.hold;
    this.hold = current;
    this.active = {
      type: swapped,
      x: spawnX(swapped),
      y: 0,
      rot: 0,
      lastKick: 0,
    };
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    if (this.collides(this.active)) {
      this.over = true;
      this.active = null;
      return [
        { kind: "hold", piece: current },
        { kind: "gameover" },
      ];
    }
    return [{ kind: "hold", piece: current }];
  }

  softDrop(): GameEvent[] {
    if (!this.active || this.over) return [];
    const next = { ...this.active, y: this.active.y + 1 };
    if (this.collides(next)) return [];
    this.active = next;
    this.score += 1;
    return [{ kind: "softdrop" }];
  }

  hardDrop(): GameEvent[] {
    if (!this.active || this.over) return [];
    const dist = this.ghostY() - this.active.y;
    this.active = { ...this.active, y: this.ghostY() };
    this.score += dist * 2;
    const events: GameEvent[] = [{ kind: "harddrop", distance: dist }];
    return events.concat(this.lock());
  }

  tickGravity(): GameEvent[] {
    if (!this.active || this.over) return [];
    const rows = this.gravityRows();
    const events: GameEvent[] = [];
    for (let i = 0; i < rows; i++) {
      const piece: ActivePiece | null = this.active;
      if (!piece) return events;
      const next: ActivePiece = { ...piece, y: piece.y + 1 };
      if (this.collides(next)) {
        this.grounded = true;
        return events;
      }
      this.active = next;
      this.grounded = false;
    }
    return events;
  }

  advanceLock(dt: number): GameEvent[] {
    if (!this.active || this.over) return [];
    const resting = this.collides({ ...this.active, y: this.active.y + 1 });
    this.grounded = resting;
    if (!resting) {
      this.lockTimer = 0;
      return [];
    }
    this.lockTimer += dt;
    if (this.lockTimer >= LOCK_DELAY || this.lockResets >= LOCK_RESET_CAP) {
      return this.lock();
    }
    return [];
  }

  private isTSpin(): boolean {
    if (!this.active || this.active.type !== "T") return false;
    const corners = [
      [this.active.x, this.active.y],
      [this.active.x + 2, this.active.y],
      [this.active.x, this.active.y + 2],
      [this.active.x + 2, this.active.y + 2],
    ];
    let filled = 0;
    for (const [x, y] of corners) {
      if (x < 0 || x >= COLS || y >= ROWS) filled += 1;
      else if (y >= 0 && this.grid[y]![x]) filled += 1;
    }
    return filled >= 3 && this.active.lastKick > 0;
  }

  private lock(): GameEvent[] {
    if (!this.active) return [];
    const tspin = this.isTSpin();
    const piece = this.active.type;
    const events: GameEvent[] = [];
    for (const { x, y } of this.occupy(this.active)) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        this.grid[y]![x] = { type: piece, lockedAt: this.now };
      }
    }
    this.active = null;
    events.push({
      kind: "lock",
      piece,
      onBeat: false,
      onTheOne: false,
      tspin,
    });

    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y]!.every((c) => c != null)) full.push(y);
    }

    if (full.length === 0) {
      this.combo = -1;
    } else {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, Math.max(0, this.combo));
      const kept = this.grid.filter((_, y) => !full.includes(y));
      while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => null));
      this.grid = kept;
      this.lines += full.length;
      if (full.length === 4) this.tetrises += 1;

      const perfect = this.grid.every((row) => row.every((c) => c == null));
      const lv = this.level;
      const difficult = full.length === 4 || tspin;
      const b2b = difficult && this.b2bReady;
      this.b2bReady = difficult;
      const lineScore = [0, 100, 300, 500, 800][full.length] ?? 800;
      const tspinBonus = tspin ? 400 * full.length : 0;
      const comboBonus = this.combo > 0 ? 50 * this.combo * lv : 0;
      const perfectBonus = perfect ? 2000 * lv : 0;
      const b2bMul = b2b ? 1.5 : 1;
      this.score += Math.floor((lineScore * lv + tspinBonus) * b2bMul + comboBonus + perfectBonus);

      events.push({
        kind: "clear",
        lines: full.length,
        combo: Math.max(0, this.combo),
        perfect,
        tspin,
        b2b,
        clearedRows: full,
      });
    }

    return events.concat(this.spawn());
  }

  snapshot(): Snapshot {
    return {
      grid: this.grid,
      active: this.active,
      ghostY: this.active ? this.ghostY() : 0,
      hold: this.hold,
      canHold: this.canHold,
      next: this.next.slice(0, NEXT_COUNT),
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo),
      maxCombo: this.maxCombo,
      over: this.over,
      tetrises: this.tetrises,
      b2b: this.b2bReady,
    };
  }

  visibleRow(y: number) {
    return y - HIDDEN_ROWS;
  }

  isVisible(y: number) {
    return y >= HIDDEN_ROWS && y < ROWS;
  }

  get VISIBLE_ROWS() {
    return VISIBLE_ROWS;
  }
}
