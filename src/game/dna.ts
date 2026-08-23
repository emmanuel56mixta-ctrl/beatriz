import type { Arrangement, MixState, PieceId, TraitId } from "./types";
import type { Composition } from "./composer";
import { chordOffset, hookNote, layersOn, phraseAge } from "./composer";

export type Dna = Record<TraitId, number>;

export const TRAIT_OF: Record<PieceId, TraitId> = {
  I: "bass",
  O: "harmony",
  T: "hook",
  S: "groove",
  Z: "perc",
  J: "space",
  L: "drive",
};

export const TRAIT_LABEL: Record<TraitId, string> = {
  bass: "BASS",
  harmony: "HARM",
  hook: "HOOK",
  groove: "GROOVE",
  perc: "PERC",
  space: "SPACE",
  drive: "DRIVE",
};

export const TRAIT_HINT: Record<PieceId, string> = {
  I: "Contorno del bajo",
  O: "Densidad armónica",
  T: "Llamada y respuesta",
  S: "Swing / articulación",
  Z: "Color percusivo",
  J: "Espacio / FX",
  L: "Drive / tensión",
};

export const TRAITS: TraitId[] = ["bass", "harmony", "hook", "groove", "perc", "space", "drive"];

export function emptyDna(): Dna {
  return { bass: 0, harmony: 0, hook: 0, groove: 0, perc: 0, space: 0, drive: 0 };
}

export function nudgeDna(dna: Dna, piece: PieceId, amount = 0.16): Dna {
  const k = TRAIT_OF[piece];
  return { ...dna, [k]: Math.min(1, dna[k] + amount) };
}

export function decayDna(dna: Dna, factor = 0.68): Dna {
  const next = emptyDna();
  for (const k of TRAITS) next[k] = dna[k] * factor;
  return next;
}

export function biasFromBoard(dna: Dna, mix: MixState): Dna {
  const total = Object.values(mix.counts).reduce((a, b) => a + b, 0) || 1;
  const next = { ...dna };
  (Object.keys(mix.counts) as PieceId[]).forEach((id) => {
    const k = TRAIT_OF[id];
    next[k] = Math.min(1, next[k] + (mix.counts[id] / total) * 0.08);
  });
  const height = mix.stackHeight / 20;
  next.drive = Math.min(1, next.drive + height * 0.12);
  return next;
}

export type Accent =
  | { kind: "bass"; midi: number; amp: number }
  | { kind: "stab"; amp: number }
  | { kind: "hook"; midi: number; amp: number }
  | { kind: "hat"; amp: number }
  | { kind: "perc"; amp: number; variant: number }
  | { kind: "fx"; amp: number }
  | { kind: "rim"; amp: number };

export function scanAccents(
  mix: MixState,
  step: number,
  bar: number,
  composition: Composition | null,
  arrangement: Arrangement,
): Accent[] {
  if (!composition) return [];
  const cells = mix.cells.filter((c) => c.step === step);
  if (!cells.length) return [];
  const groups: Partial<Record<PieceId, number[]>> = {};
  for (const c of cells) {
    (groups[c.type] ??= []).push(c.col);
  }
  const age = phraseAge(composition, bar);
  const layers = layersOn(age, emptyDna(), arrangement);
  const root = chordOffset(composition, bar);
  const out: Accent[] = [];
  const n = (id: PieceId) => groups[id]?.length ?? 0;
  const avg = (id: PieceId) => {
    const g = groups[id]!;
    return g.reduce((a, b) => a + b, 0) / g.length;
  };

  if (n("I")) {
    const choices = [0, 3, 7, 10, 12];
    const off = choices[Math.min(4, Math.floor(avg("I") / 2))]!;
    let midi = 33 + root + off;
    while (midi > 52) midi -= 12;
    while (midi < 29) midi += 12;
    out.push({ kind: "bass", midi, amp: 0.06 + n("I") * 0.012 });
  }
  if (n("O") && (layers.chord || age >= 2)) {
    out.push({ kind: "stab", amp: 0.03 + n("O") * 0.01 });
  }
  if (n("T") && (layers.hook || n("T") > 1)) {
    out.push({
      kind: "hook",
      midi: hookNote(composition, bar, Math.round(avg("T")) % 4),
      amp: 0.022 + n("T") * 0.01,
    });
  }
  if (n("S") && step % 4 === 3) {
    out.push({ kind: "hat", amp: 0.02 + n("S") * 0.006 });
  }
  if (n("Z") && [3, 7, 11, 15].includes(step) && layers.perc) {
    out.push({ kind: "perc", amp: 0.02 + n("Z") * 0.008, variant: step + Math.round(avg("Z")) });
  }
  if (n("J") && step === 15) {
    out.push({ kind: "fx", amp: 0.018 + n("J") * 0.006 });
  }
  if (n("L") && (step === 4 || step === 12)) {
    out.push({ kind: "rim", amp: 0.02 + n("L") * 0.006 });
  }
  return out;
}
