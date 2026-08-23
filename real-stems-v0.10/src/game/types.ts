export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 0;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
export const SEQUENCE_STEPS = 16;

export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Arrangement = "intro" | "groove" | "build" | "drop" | "break";
export type PowerKind = "flash" | "filter" | "boost" | "switch" | "drop";

export type LayerGains = {
  drums: number;
  bass: number;
  music: number;
  vocals: number;
};

export const POWER_COSTS: Record<PowerKind, number> = {
  flash: 25,
  filter: 40,
  boost: 55,
  switch: 70,
  drop: 100,
};

export const MUSIC_LEVEL_THRESHOLDS = [0, 20, 40, 55, 70, 85, 95];
export const MUSIC_LEVEL_NAMES = [
  "FOUNDATION",
  "BASSLINE",
  "GROOVE",
  "DRIVE",
  "HOOK",
  "BUILD",
  "DROP PREP",
];

export function heightToLevel(pct: number): number {
  let level = 0;
  for (let i = 0; i < MUSIC_LEVEL_THRESHOLDS.length; i++) {
    if (pct >= MUSIC_LEVEL_THRESHOLDS[i]!) level = i;
  }
  return level;
}
