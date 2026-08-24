import { useEffect, useMemo, useRef, useState } from "react";
import {
  LAYER_DEFINITIONS,
  QuantizedLayerBuilder,
  type BuilderState,
  type LayerId,
  type LayerStatus,
} from "@/lab/quantizedBuilder";

const blankState: BuilderState = {
  ready: false,
  loading: false,
  running: false,
  bar: 1,
  beat: 1,
  phase: 0,
  message: "Pulsa START. Nada nuevo entra hasta que tú lo armes.",
  error: null,
  layers: {
    CHORDS: { status: "OFF", targetBar: null },
    RESPONSE: { status: "OFF", targetBar: null },
    MOTIF: { status: "OFF", targetBar: null },
    PERC: { status: "OFF", targetBar: null },
    VOCAL: { status: "OFF", targetBar: null },
    HOOK: { status: "OFF", targetBar: null },
    CLUB: { status: "OFF", targetBar: null },
    BUILD: { status: "OFF", targetBar: null },
  },
};

function quantizeLabel(bars: number) {
  if (bars === 1) return "NEXT 1";
  return bars === 4 ? "NEXT 4-BAR PHRASE" : "NEXT 8-BAR PHRASE";
}

function statusLabel(status: LayerStatus, targetBar: number | null) {
  if (status === "ARMED") return `ARMED · BAR ${targetBar ?? "—"}`;
  if (status === "DISARMING") return `EXIT · BAR ${targetBar ?? "—"}`;
  if (status === "BUILDING") return `BUILDING → BAR ${targetBar ?? "—"}`;
  return status;
}

export function AudioLabBuilder() {
  const engineRef = useRef<QuantizedLayerBuilder | null>(null);
  const [state, setState] = useState<BuilderState>(blankState);
  const [volume, setVolume] = useState(0.82);

  useEffect(() => {
    const engine = new QuantizedLayerBuilder(setState);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const onCount = useMemo(
    () => Object.values(state.layers).filter((layer) => layer.status === "ON").length,
    [state.layers],
  );

  async function start() {
    await engineRef.current?.start();
  }

  function toggle(id: LayerId) {
    engineRef.current?.toggle(id);
  }

  return (
    <main className="builder-shell">
      <header className="builder-hero">
        <div>
          <p className="builder-kicker">BEATRIS v0.30.2 · QUANTIZED LAYER BUILDER</p>
          <h1>PRESS NOW.<br />ENTER ON TIME.</h1>
          <p className="builder-lede">
            Tú decides qué sumar. El clic solo arma la intención: la célula espera al siguiente punto musical válido y entra en el 1, nunca atravesada.
          </p>
        </div>
        <div className="clock-card">
          <span>MASTER CLOCK</span>
          <strong>124</strong><b>BPM</b>
          <div><em>BAR</em><i>{state.bar}</i><em>BEAT</em><i>{state.beat}</i></div>
        </div>
      </header>

      <section className="builder-grid">
        <aside className="builder-panel contract-panel">
          <p className="builder-cap">REGLA</p>
          <h2>Nada evoluciona solo.</h2>
          <p className="contract-copy">BASE puede correr para siempre. Si no pulsas nada, no aparece nada nuevo.</p>
          <div className="contract-rule"><b>NEXT 1</b><span>Percusión puede entrar en el siguiente downbeat.</span></div>
          <div className="contract-rule"><b>4 BARS</b><span>Acordes, response, hook y cambio de kit esperan frase.</span></div>
          <div className="contract-rule"><b>8 BARS</b><span>Motif y vocal esperan una frase más larga.</span></div>
          <div className="contract-rule"><b>BUILD → DROP</b><span>Tu pulsación compromete 4 compases de subida; al final entran CLUB + HOOK juntos.</span></div>
          <div className="base-card"><span>BASE ALWAYS ON</span><b>City drums + City bass</b><small>real stems · 124 BPM</small></div>
        </aside>

        <section className="builder-main">
          <div className="builder-status">
            <div><span>NOW</span><strong>BAR {state.bar} · BEAT {state.beat}</strong></div>
            <div className="beat-dots" aria-label={`Beat ${state.beat} de 4`}>
              {[1, 2, 3, 4].map((beat) => <i key={beat} className={beat === state.beat ? "on" : ""} />)}
            </div>
            <p>{state.message}</p>
          </div>

          <div className="layer-grid">
            {LAYER_DEFINITIONS.map((def) => {
              const runtime = state.layers[def.id];
              const busy = runtime.status === "ARMED" || runtime.status === "DISARMING" || runtime.status === "BUILDING";
              const active = runtime.status === "ON";
              const major = def.id === "BUILD" || def.id === "CLUB";
              return (
                <button
                  type="button"
                  key={def.id}
                  className={`layer-button status-${runtime.status.toLowerCase()} ${major ? "major" : ""}`}
                  disabled={!state.running || busy}
                  onClick={() => toggle(def.id)}
                >
                  <span className="layer-quant">{quantizeLabel(def.quantizeBars)}</span>
                  <strong>{def.label}</strong>
                  <p>{def.description}</p>
                  <footer>
                    <b>{statusLabel(runtime.status, runtime.targetBar)}</b>
                    {active && def.id !== "BUILD" ? <em>tap = quantized exit</em> : <em>{busy ? "waiting for boundary" : "tap = arm"}</em>}
                  </footer>
                </button>
              );
            })}
          </div>

          <div className="transport builder-transport">
            {!state.running ? (
              <button className="start-audio" type="button" disabled={state.loading} onClick={() => void start()}>
                {state.loading ? "LOADING REAL STEMS…" : "START BASE"}
              </button>
            ) : (
              <button className="stop-audio" type="button" onClick={() => engineRef.current?.stop()}>STOP / RESET</button>
            )}
            <label>
              <span>MASTER VOLUME</span>
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
          {state.error ? <p className="builder-error">{state.error}</p> : null}
        </section>

        <aside className="builder-panel mix-panel">
          <p className="builder-cap">MIX MEMORY</p>
          <h2>{onCount} sabores activos</h2>
          <p className="mix-note">Lo que ya entró se queda hasta que tú lo saques. Quitar también espera su frontera musical.</p>
          <div className="memory-list">
            <div className="memory-row base"><span>BASE</span><b>ON</b></div>
            {LAYER_DEFINITIONS.filter((d) => d.id !== "BUILD").map((def) => {
              const runtime = state.layers[def.id];
              return <div className={`memory-row ${runtime.status.toLowerCase()}`} key={def.id}><span>{def.id}</span><b>{statusLabel(runtime.status, runtime.targetBar)}</b></div>;
            })}
          </div>
          <div className="source-stack">
            <span>INGREDIENTS</span>
            <b>City Of Dreams</b><small>base · bass · chords · motif · vocal · hook</small>
            <b>MATRODA</b><small>club kit · build</small>
            <b>20 Fingers</b><small>percussive flavor</small>
          </div>
        </aside>
      </section>

      <section className="builder-test">
        <p className="builder-cap">PRUEBA RECOMENDADA</p>
        <h2>No sigas una secuencia obligatoria. Construye.</h2>
        <p>Empieza BASE. En cualquier momento pulsa CHORDS. Luego, cuando te nazca, PERC o MOTIF. Incluso pulsa justo después de un beat: debe quedarse ARMED y entrar limpio en la frontera indicada. Finalmente prueba BUILD → DROP.</p>
      </section>

      <footer className="builder-footer">
        <span>CLICK ≠ PLAY NOW</span><span>ARM → QUANTIZE → ENTER</span><span>LAYERS PERSIST</span><span>EXIT IS QUANTIZED TOO</span><span>NO AUTO PROGRESSION</span>
      </footer>
    </main>
  );
}
