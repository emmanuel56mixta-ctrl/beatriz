import type { Arrangement, TraitId } from "./types";
import type { Dna } from "./dna";

export type Composition = {
  id: number;
  reason: string;
  style: string;
  mood: string;
  key: string;
  progression: number[];
  bassRhythm: number[];
  bassContour: number[];
  bassShift: number;
  chordRhythm: number[];
  chordDensity: number;
  hookRhythm: number[];
  hookCall: number[];
  hookResponse: number[];
  hookOctave: number;
  swing: number;
  percOn: boolean;
  startBar: number;
  bars: number;
};

const PROGRESSIONS = [
  { mood: "SUNSET", roots: [0, 8, 3, 10] },
  { mood: "TENSION", roots: [0, 10, 8, 7] },
  { mood: "SOUL", roots: [0, 5, 8, 7] },
  { mood: "LIFT", roots: [0, 3, 10, 8] },
  { mood: "DARK", roots: [0, 7, 5, 8] },
  { mood: "HYPNO", roots: [0, 0, 8, 10] },
  { mood: "NIGHT", roots: [0, 3, 5, 7] },
] as const;

const STYLES = ["DEEP", "ROLL", "SOUL", "DRIVE", "AIRY", "CLUB"] as const;

const BASS_RHYTHMS = [
  [2, 3, 6, 7, 10, 11, 14],
  [2, 6, 7, 10, 14, 15],
  [2, 3, 6, 10, 11, 14, 15],
  [2, 5, 6, 10, 13, 14],
  [2, 3, 7, 10, 11, 14],
  [2, 6, 9, 10, 14, 15],
  [2, 3, 6, 7, 10, 14],
  [3, 6, 7, 11, 14, 15],
];

const BASS_CONTOURS = [
  [0, 0, 7, 0, -2, 0, 7, 12],
  [0, 7, 0, 3, 0, 7, 10, 0],
  [0, 0, 3, 7, 0, -2, 0, 7],
  [0, 7, 0, 0, 10, 7, 3, 0],
  [0, 3, 0, 7, 0, 10, 7, 12],
  [0, 0, 12, 7, 0, 3, 7, 0],
];

const CHORD_RHYTHMS = [
  [6, 14],
  [2, 6, 10, 14],
  [3, 6, 11, 14],
  [2, 7, 10, 15],
  [6, 10, 14],
  [0, 6, 8, 14],
];

const HOOK_RHYTHMS = [
  [7, 15],
  [5, 7, 13, 15],
  [3, 7, 11, 15],
  [6, 14],
  [5, 13, 15],
  [3, 6, 11, 14],
];

const SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

function pick<T>(arr: readonly T[], avoid?: T): T {
  if (arr.length === 1) return arr[0]!;
  let i = (Math.random() * arr.length) | 0;
  if (avoid !== undefined && arr[i] === avoid && arr.length > 1) i = (i + 1) % arr.length;
  return arr[i]!;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function walkHook(): number[] {
  let degree = pick([0, 2, 4, 5]);
  const walk: number[] = [];
  for (let i = 0; i < 4; i++) {
    degree = clamp(degree + pick([-2, -1, 0, 1, 2]), 0, 7);
    walk.push(69 + SCALE[degree]!);
  }
  return walk;
}

let nextId = 1;

export function composePhrase(dna: Dna, prev: Composition | null, startBar: number, reason: string): Composition {
  const drive = dna.drive;
  const darkBias = drive > 0.55 ? ["TENSION", "DARK", "NIGHT", "HYPNO"] : ["SUNSET", "SOUL", "LIFT", "HYPNO"];
  const pool = PROGRESSIONS.filter((p) => (drive > 0.55 ? darkBias.includes(p.mood) : true));
  const prog = pick(pool.length ? pool : PROGRESSIONS, prev ? PROGRESSIONS.find((p) => p.mood === prev.mood) : undefined);

  const syncopated = dna.bass > 0.45;
  const bassRhythm = pick(syncopated ? BASS_RHYTHMS.slice(2) : BASS_RHYTHMS.slice(0, 5));
  const bassContour = pick(BASS_CONTOURS);
  const bassShift = dna.bass > 0.7 ? 12 : dna.bass > 0.35 && Math.random() < 0.35 ? 12 : 0;

  const chordRhythm = pick(dna.harmony > 0.5 ? CHORD_RHYTHMS.slice(1) : CHORD_RHYTHMS);
  const chordDensity = 1 + Math.round(dna.harmony * 2);

  const hookRhythm = pick(dna.hook > 0.45 ? HOOK_RHYTHMS.slice(0, 4) : HOOK_RHYTHMS);
  const hookCall = walkHook();
  const hookResponse = hookCall.map((n, i) =>
    clamp(n + (i === 3 ? pick([-5, -2, 2, 3]) : pick([-2, 0, 0, 2])), 64, 81),
  );
  const hookOctave = dna.space > 0.55 || dna.hook > 0.75 ? 12 : 0;

  const style = pick(STYLES, prev?.style as (typeof STYLES)[number] | undefined);
  const swing = 0.008 + dna.groove * 0.01 + Math.random() * 0.004;

  return {
    id: nextId++,
    reason,
    style,
    mood: prog.mood,
    key: "A minor",
    progression: [...prog.roots],
    bassRhythm,
    bassContour: dna.bass > 0.6 ? [...bassContour.slice(1), bassContour[0]!] : bassContour,
    bassShift,
    chordRhythm,
    chordDensity,
    hookRhythm,
    hookCall,
    hookResponse,
    hookOctave,
    swing,
    percOn: dna.perc > 0.28,
    startBar,
    bars: 8,
  };
}

export function phraseAge(c: Composition | null, bar: number) {
  if (!c) return 0;
  return Math.max(0, bar - c.startBar) % c.bars;
}

export function chordOffset(c: Composition | null, bar: number) {
  if (!c) return 0;
  return c.progression[phraseAge(c, bar) % 4] ?? 0;
}

export function hookNote(c: Composition | null, bar: number, index: number) {
  if (!c) return 69;
  const arr = phraseAge(c, bar) % 2 ? c.hookResponse : c.hookCall;
  return arr[index % arr.length]! + c.hookOctave;
}

export function arrangementFor(bar: number, c: Composition | null, dropUntil: number, kickDownUntil: number): Arrangement {
  if (bar < 2) return "intro";
  if (kickDownUntil > bar) return "break";
  if (dropUntil > bar) return "drop";
  if (!c) return "groove";
  const age = phraseAge(c, bar);
  if (age < 2) return "groove";
  if (age < 4) return "groove";
  if (age < 6) return "build";
  return "drop";
}

export function layersOn(age: number, dna: Dna, arrangement: Arrangement) {
  const drop = arrangement === "drop";
  return {
    bass: true,
    chord: age >= 2 || dna.harmony >= 0.55 || drop,
    hook: age >= 4 || dna.hook >= 0.55 || drop,
    perc: age >= 3 || drop,
    full: age >= 6 || drop,
  };
}

export function emptyDnaLevels(): Record<TraitId, number> {
  return { bass: 0, harmony: 0, hook: 0, groove: 0, perc: 0, space: 0, drive: 0 };
}
