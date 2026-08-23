export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 0;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
export const SEQUENCE_STEPS = 16;

export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Cell = { type: PieceId; lockedAt: number };
export type ActivePiece = { type: PieceId; x: number; y: number; rot: number; lastKick: number };
export type GameEvent =
  | { kind: "spawn"; piece: PieceId }
  | { kind: "move"; dx: number }
  | { kind: "rotate"; dir: number }
  | { kind: "hold"; piece: PieceId }
  | { kind: "softdrop" }
  | { kind: "harddrop"; distance: number }
  | { kind: "lock"; piece: PieceId; onBeat: boolean; onTheOne: boolean; tspin: boolean; hardDrop: boolean }
  | { kind: "clear"; lines: number; combo: number; perfect: boolean; tspin: boolean; clearedRows: number[] }
  | { kind: "gameover" };

export type Snapshot = {
  grid: (Cell | null)[][]; active: ActivePiece | null; ghostY: number; hold: PieceId | null; canHold: boolean; next: PieceId[];
  score: number; lines: number; level: number; combo: number; maxCombo: number; over: boolean; tetrises: number;
};
export type Arrangement = "intro" | "groove" | "build" | "drop" | "break";
export type PowerKind = "flash" | "filter" | "boost" | "switch" | "drop";
export type LayerGains = { drums: number; bass: number; music: number; vocals: number };
export type MusicClock = {
  bpm: number; bar: number; beat: number; step: number; frac: number; phraseBar: number; phrase: number; arrangement: Arrangement;
  musicLevel: number; boardHeight: number; kickPulse: number; duck: number; layers: LayerGains;
  pending: { kind: PowerKind; label: string } | null; trackId: string; trackTitle: string;
};
export type Mode = "title" | "playing" | "paused" | "over";
export type Hud = {
  score: number; high: number; lines: number; level: number; combo: number; maxCombo: number; tetrises: number; bpm: number; step: number; bar: number; beat: number;
  arrangement: Arrangement; flash: string | null; hold: PieceId | null; canHold: boolean; next: PieceId[]; charge: number; phrase: string;
  musicLevel: number; boardHeight: number; layers: LayerGains; pending: { kind: PowerKind; label: string } | null; trackId: string; trackTitle: string;
};
export const POWER_COSTS: Record<PowerKind, number> = { flash: 25, filter: 40, boost: 55, switch: 70, drop: 100 };
export const MUSIC_LEVEL_THRESHOLDS = [0, 20, 40, 55, 70, 85, 95];
export const MUSIC_LEVEL_NAMES = ["FOUNDATION", "BASSLINE", "GROOVE", "DRIVE", "HOOK", "BUILD", "DROP PREP"];
export function heightToLevel(pct: number): number {
  let level = 0;
  for (let i = 0; i < MUSIC_LEVEL_THRESHOLDS.length; i++) if (pct >= MUSIC_LEVEL_THRESHOLDS[i]!) level = i;
  return level;
}
