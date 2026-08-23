export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 0;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
export const SEQUENCE_STEPS = 16;
export const BPM = 124;

export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type TraitId = "bass" | "harmony" | "hook" | "groove" | "perc" | "space" | "drive";
export type Arrangement = "intro" | "groove" | "build" | "break" | "drop";

export type Cell = { type: PieceId; lockedAt: number };
export type ActivePiece = { type: PieceId; x: number; y: number; rot: number; lastKick: number };

export type GameEvent =
  | { kind: "lock"; piece: PieceId; onBeat: boolean; onTheOne: boolean; tspin: boolean }
  | { kind: "clear"; lines: number; combo: number; perfect: boolean; tspin: boolean; b2b: boolean; clearedRows: number[] }
  | { kind: "spawn"; piece: PieceId }
  | { kind: "hold"; piece: PieceId }
  | { kind: "move"; dx: number }
  | { kind: "rotate"; dir: 1 | -1 }
  | { kind: "harddrop"; distance: number }
  | { kind: "softdrop" }
  | { kind: "gameover" };

export type MixCell = { col: number; step: number; type: PieceId };
export type MixState = {
  stackHeight: number;
  counts: Record<PieceId, number>;
  centroids: Record<PieceId, { col: number; step: number } | null>;
  cells: MixCell[];
  falling: { type: PieceId; cells: MixCell[] } | null;
  energy: number;
};

export type Snapshot = {
  grid: (Cell | null)[][];
  active: ActivePiece | null;
  ghostY: number;
  hold: PieceId | null;
  canHold: boolean;
  next: PieceId[];
  score: number;
  lines: number;
  level: number;
  combo: number;
  maxCombo: number;
  over: boolean;
  tetrises: number;
  b2b: boolean;
};

export type Production = { gain: number; filter: number; room: number; delay: number };
export type VisualClock = {
  step: number;
  frac: number;
  bpm: number;
  bar: number;
  beat: number;
  arrangement: Arrangement;
  energy: number;
  kickPulse: number;
  duck: number;
  dna: Record<TraitId, number>;
  production: Production;
  phrase: string;
  mood: string;
};

export type HudState = {
  score: number;
  high: number;
  lines: number;
  level: number;
  combo: number;
  maxCombo: number;
  tetrises: number;
  bpm: number;
  step: number;
  bar: number;
  beat: number;
  arrangement: Arrangement;
  dna: Record<TraitId, number>;
  production: Production;
  phrase: string;
  mood: string;
  flash: string | null;
  hold: PieceId | null;
  canHold: boolean;
  next: PieceId[];
  charge: number;
  canRemix: boolean;
  canDrop: boolean;
  canPerfect: boolean;
  b2b: boolean;
};