import {
  COLS,
  HIDDEN_ROWS,
  ROWS,
  SEQUENCE_STEPS,
  VISIBLE_ROWS,
  type MixCell,
  type MixState,
  type PieceId,
} from "./types";
import { cellsOf, PIECE_IDS } from "./pieces";
import type { TetrisEngine } from "./engine";

function emptyCounts(): Record<PieceId, number> {
  return { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };
}

export function rowToStep(row: number): number | null {
  const visible = row - HIDDEN_ROWS;
  if (visible < VISIBLE_ROWS - SEQUENCE_STEPS) return null;
  if (visible < 0 || visible >= VISIBLE_ROWS) return null;
  return VISIBLE_ROWS - 1 - visible;
}

export function stepToRow(step: number): number {
  const visible = VISIBLE_ROWS - 1 - step;
  return visible + HIDDEN_ROWS;
}

export function analyze(engine: TetrisEngine, energy: number): MixState {
  const counts = emptyCounts();
  const sums: Record<PieceId, { col: number; step: number; n: number }> = {
    I: { col: 0, step: 0, n: 0 },
    O: { col: 0, step: 0, n: 0 },
    T: { col: 0, step: 0, n: 0 },
    S: { col: 0, step: 0, n: 0 },
    Z: { col: 0, step: 0, n: 0 },
    J: { col: 0, step: 0, n: 0 },
    L: { col: 0, step: 0, n: 0 },
  };
  const cells: MixCell[] = [];
  let stackHeight = 0;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = engine.grid[y]![x];
      if (!cell) continue;
      counts[cell.type] += 1;
      const vis = engine.visibleRow(y);
      if (vis >= 0) stackHeight = Math.max(stackHeight, VISIBLE_ROWS - vis);
      const step = rowToStep(y);
      if (step == null) continue;
      cells.push({ col: x, step, type: cell.type });
      sums[cell.type].col += x;
      sums[cell.type].step += step;
      sums[cell.type].n += 1;
    }
  }

  const centroids = {} as MixState["centroids"];
  for (const id of PIECE_IDS) {
    const s = sums[id];
    centroids[id] = s.n ? { col: s.col / s.n, step: s.step / s.n } : null;
  }

  let falling: MixState["falling"] = null;
  if (engine.active) {
    const fcells: MixCell[] = [];
    const gy = engine.ghostY();
    for (const [cx, cy] of cellsOf(engine.active.type, engine.active.rot)) {
      const col = engine.active.x + cx;
      const step = rowToStep(gy + cy);
      if (step == null) continue;
      fcells.push({ col, step, type: engine.active.type });
    }
    falling = { type: engine.active.type, cells: fcells };
  }

  return { stackHeight, counts, centroids, cells, falling, energy };
}

export function cellsOnStep(mix: MixState, step: number, type?: PieceId): MixCell[] {
  return mix.cells.filter((c) => c.step === step && (type ? c.type === type : true));
}
