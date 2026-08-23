import { useEffect, useMemo, useRef, useState } from "react";
import { MusicalCellsEngine, type LabEngineState, type LabStage, type RowRecipe } from "@/lab/cellEngine";

const STAGES: { id: LabStage; label: string; sub: string }[] = [
  { id: "BASE", label: "BASE", sub: "incompleto" },
  { id: "ROW1", label: "ROW 1", sub: "+ célula armónica" },
  { id: "ROW2", label: "ROW 2", sub: "cambia progresión" },
  { id: "ROW3", label: "ROW 3", sub: "+ motif / respuesta" },
  { id: "TRIPLE", label: "TRIPLE", sub: "nuevo kit CLUB" },
  { id: "TETRIS", label: "TETRIS", sub: "break → PEAK + vocal" },
];

const initial: LabEngineState = {
  ready: false,
  loading: false,
  running: false,
  stage: "BASE",
  recipe: "I",
  scene: "Not started",
  error: null,
  activeLayers: [],
};

export function AudioLab() {
  const engineRef = useRef<MusicalCellsEngine | null>(null);
  const [state, setState] = useState<LabEngineState>(initial);
  const [volume, setVolume] = useState(0.82);

  useEffect(() => {
    const engine = new MusicalCellsEngine(setState);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const title = useMemo(() => STAGES.find((s) => s.id === state.stage), [state.stage]);

  async function start() {
    await engineRef.current?.start();
  }

  async function stage(id: LabStage) {
    await engineRef.current?.setStage(id);
  }

  async function recipe(id: RowRecipe) {
    await engineRef.current?.setRecipe(id);
  }

  return (
    <main className="lab-shell">
      <header className="lab-hero">
        <div>
          <p className="lab-kicker">BEATRIS v0.30 · AUDIO FIRST</p>
          <h1>MUSICAL CELLS LAB</h1>
          <p className="lab-lede">No Tetris. No síntesis. No “song underneath”. Solo células reales que deben probar que el House crece antes de volver al juego.</p>
        </div>
        <div className="lab-badge">
          <strong>124</strong>
          <span>BPM</span>
          <small>CITY HARMONIC WORLD</small>
        </div>
      </header>

      <section className="lab-grid">
        <aside className="lab-panel lab-rules">
          <p className="panel-cap">CONTRATO</p>
          <h2>El Lab tiene una sola pregunta.</h2>
          <blockquote>¿BASE → ROW1 → ROW2 → ROW3 → TRIPLE → TETRIS se vuelve claramente más emocionante sin pozo?</blockquote>
          <div className="rule"><b>BASE</b><span>Debe sonar a disco, pero incompleto.</span></div>
          <div className="rule"><b>ROW</b><span>No desmutea: cambia de célula real A → A′ → B.</span></div>
          <div className="rule"><b>TRIPLE</b><span>Cambia la batería completa a un kit CLUB.</span></div>
          <div className="rule"><b>TETRIS</b><span>Un compás de aire; después PEAK + vocal.</span></div>
          <div className="rule"><b>I ≠ T</b><span>La receta selecciona células claramente distintas.</span></div>
        </aside>

        <section className="lab-stage">
          <div className="lab-now">
            <span>NOW PLAYING</span>
            <strong>{title?.label ?? state.stage}</strong>
            <b>{state.scene}</b>
            <small>ROW DNA · {state.recipe}</small>
          </div>

          <div className="stage-buttons" aria-label="Prueba de progresión">
            {STAGES.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={`stage-button ${state.stage === item.id ? "active" : ""} ${index >= 4 ? "major" : ""}`}
                disabled={!state.running}
                onClick={() => void stage(item.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{item.label}</b>
                <small>{item.sub}</small>
              </button>
            ))}
          </div>

          <div className="recipe-box">
            <div>
              <span>ROW DNA A/B</span>
              <strong>La misma etapa debe hablar distinto.</strong>
            </div>
            <div className="recipe-toggle">
              <button type="button" className={state.recipe === "I" ? "active" : ""} disabled={!state.running} onClick={() => void recipe("I")}>
                I · STRAIGHT / ROLLING
              </button>
              <button type="button" className={state.recipe === "T" ? "active" : ""} disabled={!state.running} onClick={() => void recipe("T")}>
                T · SYNCOPATED / CHOPPY
              </button>
            </div>
          </div>

          <div className="transport">
            {!state.running ? (
              <button className="start-audio" type="button" disabled={state.loading} onClick={() => void start()}>
                {state.loading ? "LOADING REAL CELLS…" : "START AUDIO"}
              </button>
            ) : (
              <button className="stop-audio" type="button" onClick={() => engineRef.current?.stop()}>STOP</button>
            )}
            <label>
              <span>VOLUME</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  engineRef.current?.setVolume(next);
                }}
              />
            </label>
          </div>

          {state.error ? <p className="lab-error">{state.error}</p> : null}
        </section>

        <aside className="lab-panel lab-sources">
          <p className="panel-cap">REAL MATERIAL</p>
          <h2>Qué está sonando de verdad.</h2>
          <div className="source-card primary">
            <span>HARMONIC WORLD</span>
            <b>City Of Dreams</b>
            <small>drums · bass · music · vocals · 124 BPM</small>
          </div>
          <div className="source-card">
            <span>TRIPLE KIT</span>
            <b>MATRODA drums</b>
            <small>time-stretched 130 → 124 · sin cambiar armonía</small>
          </div>
          <div className="source-card">
            <span>TETRIS KIT</span>
            <b>ZeLeo drums</b>
            <small>125 → 124 · City conserva bass/music/vocal</small>
          </div>
          <div className="layers">
            <span>ACTIVE CELLS</span>
            {state.activeLayers.length ? state.activeLayers.map((item) => <code key={item}>{item}</code>) : <em>—</em>}
          </div>
        </aside>
      </section>

      <footer className="lab-footer">
        <span>PASS 1 · BASE incompleto</span>
        <span>PASS 2 · ROW1 es antes/después</span>
        <span>PASS 3 · I ≠ T</span>
        <span>PASS 4 · ROW2/3 cambian composición</span>
        <span>PASS 5 · TRIPLE cambia capítulo</span>
        <span>PASS 6 · TETRIS emociona</span>
      </footer>
    </main>
  );
}
