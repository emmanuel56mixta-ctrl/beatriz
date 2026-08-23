import { useEffect, useRef, useState } from "react";
import { REMOTE_STEMS_CONFIGURED, TRACKS } from "@/game/audio/library";
import { Session } from "@/game/session";
import { MUSIC_LEVEL_NAMES, POWER_COSTS, type Hud, type Mode, type PowerKind } from "@/game/types";

const POWERS: PowerKind[] = ["flash", "filter", "boost", "switch", "drop"];
const LAYERS: { key: keyof Hud["layers"]; label: string }[] = [
  { key: "drums", label: "DRUMS" },
  { key: "bass", label: "BASS" },
  { key: "music", label: "OTHER · OFF" },
  { key: "vocals", label: "VOCALS" },
];
const fmt = (n: number) => String(Math.max(0, Math.floor(n))).padStart(6, "0");

export function BeatrisApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [mode, setMode] = useState<Mode>("title");
  const [trackId, setTrackId] = useState(TRACKS[0]!.id);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const session = new Session(canvas, (h, m) => { setHud(h); setMode(m); });
    sessionRef.current = session; session.attach();
    return () => { session.detach(); sessionRef.current = null; };
  }, []);

  async function start() {
    const s = sessionRef.current; if (!s) return;
    setLoading(true); setError(null); s.setTrack(trackId);
    try { await s.enter(); } catch (e) { console.error(e); setError("No pude iniciar el set A/B."); } finally { setLoading(false); }
  }

  const h = hud;
  const charge = h?.charge ?? 0;
  const playing = mode === "playing";

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">HOUSE DIRECTOR · {REMOTE_STEMS_CONFIGURED ? "REAL STEMS · 3 SCENES A/B" : "STEMS OFFLINE"}</p><h1>BEATRIS <i>//</i> HOUSE</h1></div>
        <div className="transport"><b>{h?.bpm ?? 122} BPM</b><span>BAR {h?.bar ?? 1} · BEAT {h?.beat ?? 1}</span><em>{(h?.arrangement ?? "intro").toUpperCase()}</em></div>
        <div className="topActions">
          <button onClick={() => { const s=sessionRef.current;if(!s)return;s.setMuted(!s.muted);setMuted(!s.muted); }}>{muted ? "UNMUTE" : "MUTE"}</button>
          <button onClick={() => mode === "paused" ? sessionRef.current?.resume() : sessionRef.current?.pause()}>{mode === "paused" ? "RESUME" : "PAUSE"}</button>
        </div>
      </header>

      <section className="layout">
        <aside className="stats">
          <label>SCORE</label><strong>{fmt(h?.score ?? 0)}</strong>
          <dl><div><dt>HIGH</dt><dd>{fmt(h?.high ?? 0)}</dd></div><div><dt>LINES</dt><dd>{h?.lines ?? 0}</dd></div><div><dt>LEVEL</dt><dd>{h?.level ?? 1}</dd></div><div><dt>COMBO</dt><dd>{h?.combo ?? 0}</dd></div></dl>
          <div className="height"><span>BOARD HEIGHT</span><b>{Math.round(h?.boardHeight ?? 0)}%</b><div><i style={{width:`${h?.boardHeight ?? 0}%`}} /></div><small>SCENE {h?.musicLevel ?? 0} · {MUSIC_LEVEL_NAMES[h?.musicLevel ?? 0]}</small></div>
        </aside>

        <section className="gameCol">
          <div className="well">
            <canvas ref={canvasRef} aria-label="Pozo de Beatris" />
            {h?.flash && playing ? <div className="flash">{h.flash}</div> : null}
            {mode === "title" ? (
              <div className="overlay"><div className="startCard">
                <span className="stamp">v0.12 · CAUSAL SCENE TEST</span>
                <h2>UNA CANCIÓN. TRES ESTADOS.</h2>
                <p>Prueba A/B con Café Du MIDI. FOUNDATION = drums. TENSION = drums + bass. DROP = otra frase real con drums + bass + vocals. El stem OTHER queda fuera para aislar el drone 258/522 Hz detectado en la auditoría.</p>
                <p className="notice">No hay loopStart/loopEnd crudo: cada escena se dispara como clip finito con fades y los cambios entran en el siguiente compás. Si limpias y baja la pila, el estado musical también puede responder.</p>
                <div className="tracks">{TRACKS.map(t => <button key={t.id} className={trackId===t.id?"on":""} onClick={()=>setTrackId(t.id)}><b>{t.no}</b><span>{t.title}<small>{t.bpm} BPM · 3 STEMS · OTHER OFF</small></span></button>)}</div>
                <button className="start" disabled={loading} onClick={()=>void start()}>{loading ? "LOADING A/B…" : "START A/B"}</button>
                {error ? <p className="error">{error}</p> : null}
              </div></div>
            ) : null}
            {mode === "paused" ? <div className="overlay"><div className="pause"><span>PAUSED</span><h2>EL CLUB ESPERA.</h2><button onClick={()=>sessionRef.current?.resume()}>RESUME</button></div></div> : null}
            {mode === "over" ? <div className="overlay"><div className="pause"><span>SET OVER</span><h2>{fmt(h?.score ?? 0)}</h2><button onClick={()=>sessionRef.current?.restart()}>RUN IT BACK</button></div></div> : null}
          </div>
          <div className="touch">
            {([['left','←'],['rotCCW','↶'],['rotCW','↷'],['right','→'],['soft','↓'],['hard','DROP'],['hold','HOLD']] as const).map(([a,l]) => <button key={a} className={a==='hard'?"hard":""} onPointerDown={()=>sessionRef.current?.input.press(a)} onPointerUp={()=>{if(a==='left'||a==='right'||a==='soft')sessionRef.current?.input.release(a);}}>{l}</button>)}
          </div>
        </section>

        <aside className="deck">
          <div className="now"><span>NOW PLAYING</span><h3>{h?.trackTitle ?? TRACKS.find(t=>t.id===trackId)?.title}</h3><p>{h?.phrase ?? "FOUNDATION"}</p>{h?.pending ? <em>{h.pending.label}</em> : null}</div>
          <section><header><span>SCENE STEMS</span><small>NO FADER-ARRANGEMENT</small></header><div className="layers">{LAYERS.map(row => {const v=h?.layers[row.key]??0;return <div key={row.key}><div className="fader"><i style={{height:`${Math.round(v*100)}%`}} /></div><b>{row.label}</b><small>{Math.round(v*100)}</small></div>;})}</div></section>
          <section className="power"><header><span>POWER</span><b>{Math.round(charge)}%</b></header><div className="powerbar"><i style={{width:`${charge}%`}} /></div><div className="powers">{POWERS.map(kind=><button key={kind} className={kind==='drop'?"drop":""} disabled={!playing||charge<POWER_COSTS[kind]} onClick={()=>sessionRef.current?.usePower(kind)}><span>{kind.toUpperCase()}</span><small>{POWER_COSTS[kind]}</small></button>)}</div></section>
          <div className="rules"><span>3 ESCENAS</span><span>ALTURA MANDA</span><span>CLEAR = PULSE</span><span>NEXT BAR</span></div>
        </aside>
      </section>
      <footer><span>7-BAG · SRS · HOLD · GHOST</span><span>CAFÉ A/B · OTHER MUTED</span><span>FINITE CLIPS · NO RAW LOOP</span></footer>
    </main>
  );
}
