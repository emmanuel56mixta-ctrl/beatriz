import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RealCellsMixerV308, type CellId, type CellState } from "@/lab/realCellsMixerV308";

const SIZE = 8;
const GEMS = ["groove", "harmony", "hook", "vocal", "energy"] as const;
type Gem = (typeof GEMS)[number];
type Special = "row" | "col" | "bomb" | null;
type Tile = { id: number; gem: Gem; special: Special };
type Board = (Tile | null)[][];
type Pos = { r: number; c: number };
type Group = { gem: Gem; cells: Pos[]; axis: "row" | "col" };

const GEM_INFO: Record<Gem, { label: string; note: string }> = {
  groove: { label: "GROOVE", note: "perc" },
  harmony: { label: "HARMONY", note: "chords" },
  hook: { label: "HOOK", note: "motif" },
  vocal: { label: "VOCAL", note: "voice" },
  energy: { label: "ENERGY", note: "club" },
};

let tileId = 1;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const key = ({ r, c }: Pos) => `${r}:${c}`;
const same = (a: Pos, b: Pos | null) => Boolean(b && a.r === b.r && a.c === b.c);
const adjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const cloneBoard = (board: Board): Board => board.map((row) => row.slice());
const randomGem = () => GEMS[Math.floor(Math.random() * GEMS.length)]!;
const newTile = (gem = randomGem(), special: Special = null): Tile => ({ id: tileId++, gem, special });

function makesTriple(board: Board, r: number, c: number, gem: Gem) {
  return (
    (c >= 2 && board[r]?.[c - 1]?.gem === gem && board[r]?.[c - 2]?.gem === gem) ||
    (r >= 2 && board[r - 1]?.[c]?.gem === gem && board[r - 2]?.[c]?.gem === gem)
  );
}

function createBoard(): Board {
  const board: Board = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      let gem = randomGem();
      let guard = 0;
      while (makesTriple(board, r, c, gem) && guard++ < 20) gem = randomGem();
      board[r]![c] = newTile(gem);
    }
  }
  return board;
}

function groups(board: Board): Group[] {
  const out: Group[] = [];
  for (let r = 0; r < SIZE; r++) {
    let c = 0;
    while (c < SIZE) {
      const tile = board[r]?.[c];
      if (!tile) { c++; continue; }
      let end = c + 1;
      while (end < SIZE && board[r]?.[end]?.gem === tile.gem) end++;
      if (end - c >= 3) out.push({ gem: tile.gem, axis: "row", cells: Array.from({ length: end - c }, (_, i) => ({ r, c: c + i })) });
      c = end;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let r = 0;
    while (r < SIZE) {
      const tile = board[r]?.[c];
      if (!tile) { r++; continue; }
      let end = r + 1;
      while (end < SIZE && board[end]?.[c]?.gem === tile.gem) end++;
      if (end - r >= 3) out.push({ gem: tile.gem, axis: "col", cells: Array.from({ length: end - r }, (_, i) => ({ r: r + i, c })) });
      r = end;
    }
  }
  return out;
}

function collapse(board: Board): Board {
  const next = cloneBoard(board);
  for (let c = 0; c < SIZE; c++) {
    const kept: Tile[] = [];
    for (let r = SIZE - 1; r >= 0; r--) {
      const tile = next[r]?.[c];
      if (tile) kept.push(tile);
    }
    for (let r = SIZE - 1, i = 0; r >= 0; r--, i++) next[r]![c] = kept[i] ?? newTile();
  }
  return next;
}

function expandSpecials(board: Board, clear: Set<string>) {
  const queue = [...clear];
  const seen = new Set(queue);
  while (queue.length) {
    const item = queue.shift()!;
    const [r, c] = item.split(":").map(Number);
    const tile = board[r]?.[c];
    if (!tile?.special) continue;
    const add = (p: Pos) => {
      const k = key(p);
      if (!seen.has(k)) { seen.add(k); clear.add(k); queue.push(k); }
    };
    if (tile.special === "row") for (let x = 0; x < SIZE; x++) add({ r, c: x });
    if (tile.special === "col") for (let y = 0; y < SIZE; y++) add({ r: y, c });
    if (tile.special === "bomb") {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (board[y]?.[x]?.gem === tile.gem) add({ r: y, c: x });
    }
  }
}

const blankCore: CellState = {
  ready: false, loading: false, running: false, bar: 1, beat: 1, phase: 0, message: "START CORE", error: null,
  layers: { CHORDS:{status:"OFF",targetBar:null}, RESPONSE:{status:"OFF",targetBar:null}, MOTIF:{status:"OFF",targetBar:null}, PERC:{status:"OFF",targetBar:null}, VOCAL:{status:"OFF",targetBar:null}, HOOK:{status:"OFF",targetBar:null}, CLUB:{status:"OFF",targetBar:null}, BUILD:{status:"OFF",targetBar:null} },
};

export function CandyCoreGame() {
  const mixerRef = useRef<RealCellsMixerV308 | null>(null);
  const coreRef = useRef<CellState>(blankCore);
  const pointerRef = useRef<{ pos: Pos; x: number; y: number } | null>(null);
  const [core, setCore] = useState<CellState>(blankCore);
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [selected, setSelected] = useState<Pos | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(0);
  const [power, setPower] = useState(0);
  const [event, setEvent] = useState("MATCH 3 → CORE EVOLVES");

  useEffect(() => {
    const mixer = new RealCellsMixerV308((state) => { coreRef.current = state; setCore(state); });
    mixerRef.current = mixer;
    return () => mixer.dispose();
  }, []);

  function ensureOn(id: CellId) {
    const rt = coreRef.current.layers[id];
    if (coreRef.current.running && rt.status === "OFF") mixerRef.current?.toggle(id);
  }

  function directMusic(found: Group[], cascade: number) {
    const max = Math.max(...found.map((g) => g.cells.length));
    const gems = new Set(found.map((g) => g.gem));
    if (gems.has("groove")) ensureOn("PERC");
    if (gems.has("harmony")) {
      if (coreRef.current.layers.CHORDS.status === "OFF") ensureOn("CHORDS");
      else ensureOn("RESPONSE");
    }
    if (gems.has("hook")) {
      if (coreRef.current.layers.MOTIF.status === "OFF") ensureOn("MOTIF");
      else ensureOn("HOOK");
    }
    if (gems.has("vocal")) ensureOn("VOCAL");
    if (gems.has("energy")) ensureOn("CLUB");
    if (max >= 5 || cascade >= 4) {
      if (coreRef.current.layers.BUILD.status === "OFF") mixerRef.current?.toggle("BUILD");
      setEvent("BUILD → DROP");
    } else if (max === 4) setEvent(`MATCH 4 · ${GEM_INFO[found[0]!.gem].label} SPECIAL`);
    else setEvent(cascade > 1 ? `CASCADE ×${cascade}` : `${GEM_INFO[found[0]!.gem].label} MUTATION`);
  }

  async function resolve(start: Board, preferred: Pos | null) {
    let current = start;
    let cascade = 0;
    while (true) {
      const found = groups(current);
      if (!found.length) break;
      cascade++;
      directMusic(found, cascade);
      const clear = new Set<string>();
      const keep = new Map<string, Tile>();
      for (const group of found) {
        let preserve: Pos | null = null;
        if (group.cells.length >= 4) {
          const chosen: Pos = preferred && group.cells.some((p) => same(p, preferred)) ? preferred : group.cells[Math.floor(group.cells.length / 2)]!;
          preserve = chosen;
          const special: Special = group.cells.length >= 5 ? "bomb" : group.axis === "row" ? "row" : "col";
          keep.set(key(chosen), newTile(group.gem, special));
        }
        for (const p of group.cells) if (!preserve || !same(p, preserve)) clear.add(key(p));
      }
      expandSpecials(current, clear);
      const cleared = clear.size;
      const next = cloneBoard(current);
      for (const item of clear) {
        const [r, c] = item.split(":").map(Number);
        next[r]![c] = null;
      }
      for (const [item, tile] of keep) {
        const [r, c] = item.split(":").map(Number);
        next[r]![c] = tile;
      }
      setScore((s) => s + cleared * 10 * cascade);
      setPower((p) => Math.min(100, p + Math.min(30, cleared * 2 + cascade * 4)));
      setCombo(cascade);
      setBoard(next);
      await sleep(180);
      current = collapse(next);
      setBoard(current);
      await sleep(220);
      preferred = null;
    }
    setCombo(cascade > 1 ? cascade : 0);
    return current;
  }

  async function trySwap(a: Pos, b: Pos) {
    if (busy || !adjacent(a, b)) return;
    setBusy(true);
    setSelected(null);
    const next = cloneBoard(board);
    const temp = next[a.r]![a.c];
    next[a.r]![a.c] = next[b.r]![b.c];
    next[b.r]![b.c] = temp;
    setBoard(next);
    await sleep(110);
    if (!groups(next).length) {
      setBoard(board);
      setEvent("NO MATCH");
      await sleep(130);
      setBusy(false);
      return;
    }
    setMoves((m) => m + 1);
    await resolve(next, b);
    setBusy(false);
  }

  function choose(pos: Pos) {
    if (busy) return;
    if (!selected) { setSelected(pos); return; }
    if (same(selected, pos)) { setSelected(null); return; }
    if (adjacent(selected, pos)) void trySwap(selected, pos);
    else setSelected(pos);
  }

  function onDown(e: PointerEvent<HTMLButtonElement>, pos: Pos) {
    pointerRef.current = { pos, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onUp(e: PointerEvent<HTMLButtonElement>, pos: Pos) {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || busy) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { choose(pos); return; }
    const target = Math.abs(dx) > Math.abs(dy)
      ? { r: start.pos.r, c: start.pos.c + (dx > 0 ? 1 : -1) }
      : { r: start.pos.r + (dy > 0 ? 1 : -1), c: start.pos.c };
    if (target.r >= 0 && target.r < SIZE && target.c >= 0 && target.c < SIZE) void trySwap(start.pos, target);
  }

  async function startCore() {
    setEvent("LOADING CORE…");
    await mixerRef.current?.start();
    if (coreRef.current.running) setEvent("CORE ON · MAKE A MATCH");
  }

  function powerDrop() {
    if (power < 100 || !core.running) return;
    if (core.layers.BUILD.status === "OFF") mixerRef.current?.toggle("BUILD");
    setPower(0);
    setEvent("POWER DROP");
  }

  function reset() {
    setBoard(createBoard()); setSelected(null); setBusy(false); setScore(0); setMoves(0); setCombo(0); setPower(0); setEvent("NEW BOARD");
  }

  const layers = (["PERC","CHORDS","RESPONSE","MOTIF","VOCAL","HOOK","CLUB","BUILD"] as CellId[]).filter((id) => core.layers[id].status !== "OFF");

  return (
    <main className="candy-shell">
      <header className="candy-topbar">
        <div className="candy-brand"><strong>BEATRIS</strong><span>CORE CRUSH · v0.1</span></div>
        <div className="candy-stats"><span>SCORE <b>{score.toLocaleString()}</b></span><span>MOVES <b>{moves}</b></span><span>BPM <b>124</b></span></div>
        <button className={`core-start ${core.running ? "on" : ""}`} onClick={() => void startCore()} disabled={core.loading || core.running}>{core.loading ? "LOADING…" : core.running ? "CORE ON" : "START CORE"}</button>
      </header>

      <section className="candy-stage">
        <aside className="candy-left">
          <div className="power-card">
            <div className="power-head"><span>POWER</span><b>{power}%</b></div>
            <div className="power-track"><i style={{ width: `${power}%` }} /></div>
            <button onClick={powerDrop} disabled={power < 100 || !core.running}>BUILD → DROP</button>
          </div>
          <div className="legend-card">
            {GEMS.map((gem) => <div key={gem}><i className={`mini-gem gem-${gem}`} /><span>{GEM_INFO[gem].label}</span><b>{GEM_INFO[gem].note}</b></div>)}
          </div>
          <button className="new-board" onClick={reset}>NEW BOARD</button>
        </aside>

        <div className="board-wrap">
          <div className={`match-board ${busy ? "busy" : ""}`}>
            {board.flatMap((row, r) => row.map((tile, c) => tile && (
              <button
                type="button"
                key={tile.id}
                className={`gem gem-${tile.gem} ${tile.special ? `special-${tile.special}` : ""} ${selected && selected.r === r && selected.c === c ? "selected" : ""}`}
                onPointerDown={(e) => onDown(e, { r, c })}
                onPointerUp={(e) => onUp(e, { r, c })}
                aria-label={`${GEM_INFO[tile.gem].label}${tile.special ? ` ${tile.special}` : ""}`}
              ><span />{tile.special === "row" && <em>↔</em>}{tile.special === "col" && <em>↕</em>}{tile.special === "bomb" && <em>✦</em>}</button>
            )))}
          </div>
          <div className={`combo-toast ${combo > 1 ? "show" : ""}`}>CASCADE ×{combo}</div>
        </div>

        <aside className="candy-right">
          <div className="event-card"><small>NOW</small><strong>{event}</strong><span>{core.error ?? core.message}</span></div>
          <div className="layers-card"><small>CORE ARRANGEMENT</small>{layers.length ? layers.map((id) => <span key={id} className={`layer state-${core.layers[id].status.toLowerCase()}`}>{id}<b>{core.layers[id].status}</b></span>) : <p>Base kick + bass. Make matches to dress the track.</p>}</div>
          <div className="rules-card"><span><b>3</b> mutation</span><span><b>4</b> striped special</span><span><b>5</b> bomb + build</span><span><b>×4</b> cascade → drop</span></div>
        </aside>
      </section>
    </main>
  );
}
