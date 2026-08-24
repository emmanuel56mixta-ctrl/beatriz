import { useEffect, useMemo, useRef, useState } from "react";
import { MusicalCellsEngine, type LabEngineState, type LabStage, type RowRecipe } from "@/lab/cellEngine";
import { QUARRY_CANDIDATES, QUARRY_CATEGORIES, QuarryEngine, type CellCandidate, type QuarryCategory, type QuarryState } from "@/lab/quarry";

const STAGES: { id: LabStage; label: string; sub: string }[] = [
  { id: "BASE", label: "BASE", sub: "incompleto" },
  { id: "ROW1", label: "ROW 1", sub: "+ armonía" },
  { id: "ROW2", label: "ROW 2", sub: "otra célula" },
  { id: "ROW3", label: "ROW 3", sub: "+ motif" },
  { id: "BUILD", label: "BUILD", sub: "4 bars → CLUB" },
  { id: "TRIPLE", label: "TRIPLE", sub: "CLUB" },
  { id: "TETRIS", label: "TETRIS", sub: "air → PEAK + vocal" },
];

const initial: LabEngineState = { ready:false, loading:false, running:false, stage:"BASE", recipe:"I", scene:"Not started", error:null, activeLayers:[] };
const quarryInitial: QuarryState = { playingId:null, error:null };
const blankKeeps: Record<QuarryCategory,string|null> = { DRUMS:null, BASS:null, MUSIC:null, VOCALS:null, BUILD:null };

export function AudioLabQuarry(){
  const composerRef=useRef<MusicalCellsEngine|null>(null);
  const quarryRef=useRef<QuarryEngine|null>(null);
  const[state,setState]=useState(initial);
  const[qstate,setQstate]=useState(quarryInitial);
  const[category,setCategory]=useState<QuarryCategory>("BUILD");
  const[kept,setKept]=useState(blankKeeps);
  const[volume,setVolume]=useState(.82);

  useEffect(()=>{const composer=new MusicalCellsEngine(setState);const quarry=new QuarryEngine(setQstate);composerRef.current=composer;quarryRef.current=quarry;return()=>{composer.dispose();quarry.dispose();composerRef.current=null;quarryRef.current=null;};},[]);
  const now=useMemo(()=>STAGES.find(s=>s.id===state.stage),[state.stage]);
  const candidates=useMemo(()=>QUARRY_CANDIDATES.filter(c=>c.category===category),[category]);

  async function start(){quarryRef.current?.stop();await composerRef.current?.start();}
  async function setStage(stage:LabStage){quarryRef.current?.stop();await composerRef.current?.setStage(stage);}
  async function setRecipe(recipe:RowRecipe){await composerRef.current?.setRecipe(recipe);}
  async function audition(candidate:CellCandidate){composerRef.current?.stop();await quarryRef.current?.audition(candidate);}
  function keep(candidate:CellCandidate){setKept(cur=>({...cur,[candidate.category]:cur[candidate.category]===candidate.id?null:candidate.id}));}
  function keptName(cat:QuarryCategory){const id=kept[cat];return id?QUARRY_CANDIDATES.find(c=>c.id===id)?.label??id:"—";}

  return <main className="lab-shell quarry-version">
    <header className="lab-hero">
      <div><p className="lab-kicker">BEATRIS v0.30.1 · AUDIO FIRST</p><h1>CELLS + QUARRY</h1><p className="lab-lede">Primero probamos si la música crece. Después buscamos, A/B, los mejores drums, bajos, music, voces y builds de toda la biblioteca.</p></div>
      <div className="lab-badge"><strong>124</strong><span>BPM</span><small>NO OSCILLATORS</small></div>
    </header>

    <section className="lab-grid">
      <aside className="lab-panel lab-rules">
        <p className="panel-cap">TEST</p><h2>La progresión tiene que sentirse.</h2>
        <blockquote>BASE → ROW1 → ROW2 → ROW3 → BUILD → TRIPLE → TETRIS</blockquote>
        <div className="rule"><b>BUILD</b><span>Debe crecer de verdad y caer automáticamente en CLUB.</span></div>
        <div className="rule"><b>QUARRY</b><span>Escucha aislado. KEEP solo si el ladrillo aporta.</span></div>
        <div className="rule"><b>TONAL</b><span>City es referencia. Bass/music externos requieren aprobar armonía.</span></div>
        <div className="rule"><b>VOCAL</b><span>Puede venir de cualquier track si mejora el momento.</span></div>
      </aside>

      <section className="lab-stage">
        <div className="lab-now"><span>COMPOSER</span><strong>{now?.label??state.stage}</strong><b>{state.scene}</b><small>{state.stage==="BUILD"?"AUTO → TRIPLE":`ROW DNA · ${state.recipe}`}</small></div>
        <div className="stage-buttons">{STAGES.map((s,i)=><button type="button" key={s.id} disabled={!state.running} className={`stage-button ${state.stage===s.id?"active":""} ${i>=4?"major":""}`} onClick={()=>void setStage(s.id)}><span>{String(i+1).padStart(2,"0")}</span><b>{s.label}</b><small>{s.sub}</small></button>)}</div>
        <div className="recipe-box"><div><span>ROW DNA A/B</span><strong>I y T deben llevar a células distintas.</strong></div><div className="recipe-toggle"><button type="button" disabled={!state.running} className={state.recipe==="I"?"active":""} onClick={()=>void setRecipe("I")}>I · STRAIGHT</button><button type="button" disabled={!state.running} className={state.recipe==="T"?"active":""} onClick={()=>void setRecipe("T")}>T · SYNCOPATED</button></div></div>
        <div className="transport">{!state.running?<button className="start-audio" type="button" disabled={state.loading} onClick={()=>void start()}>{state.loading?"LOADING…":"START COMPOSER"}</button>:<button className="stop-audio" type="button" onClick={()=>composerRef.current?.stop()}>STOP COMPOSER</button>}<label><span>MASTER VOLUME</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);composerRef.current?.setVolume(v);quarryRef.current?.setVolume(v);}}/></label></div>
        {state.error?<p className="lab-error">COMPOSER · {state.error}</p>:null}{qstate.error?<p className="lab-error">QUARRY · {qstate.error}</p>:null}
      </section>

      <aside className="lab-panel lab-sources">
        <p className="panel-cap">MATERIAL</p><h2>Cantera, no canciones debajo.</h2>
        <div className="source-card primary"><span>HARMONIC REFERENCE</span><b>City Of Dreams</b><small>124 BPM · drums/bass/music/vocal</small></div>
        <div className="source-card"><span>RHYTHM QUARRY</span><b>MATRODA · ZeLeo · Café · 20 Fingers</b><small>se adaptan a 124 BPM</small></div>
        <div className="source-card"><span>TONAL/VOCAL QUARRY</span><b>toda la biblioteca</b><small>solo entra después de prueba armónica y de emoción</small></div>
        <div className="layers"><span>ACTIVE CELLS</span>{state.activeLayers.length?state.activeLayers.map(x=><code key={x}>{x}</code>):<em>—</em>}</div>
      </aside>
    </section>

    <section className="quarry-shell">
      <header className="quarry-head"><div><p className="panel-cap">QUARRY · A/B</p><h2>Escucha el ladrillo solo.</h2><p>PLAY detiene el Composer. KEEP marca el candidato que vale la pena probar después en el arreglo.</p></div><div className="kept-summary">{QUARRY_CATEGORIES.map(cat=><span key={cat}><b>{cat}</b>{keptName(cat)}</span>)}</div></header>
      <nav className="quarry-tabs">{QUARRY_CATEGORIES.map(cat=><button type="button" key={cat} className={category===cat?"active":""} onClick={()=>setCategory(cat)}>{cat}<small>{QUARRY_CANDIDATES.filter(c=>c.category===cat).length}</small></button>)}</nav>
      <div className="candidate-grid">{candidates.map(candidate=>{const playing=qstate.playingId===candidate.id;const selected=kept[candidate.category]===candidate.id;return <article key={candidate.id} className={`candidate-card ${selected?"kept":""}`}><header><span>{candidate.sourceLabel}</span><i className={`fit-${candidate.tonal}`}>{candidate.tonal==="safe"?"TONAL SAFE":candidate.tonal==="check"?"CHECK KEY":"RHYTHM"}</i></header><h3>{candidate.label}</h3><p>{candidate.note}</p><code>{candidate.layers.map(l=>`${String(l.source)} @ bar ${l.bar}`).join(" + ")}</code><div className="candidate-actions"><button type="button" className={playing?"playing":""} onClick={()=>playing?quarryRef.current?.stop():void audition(candidate)}>{playing?"STOP":`PLAY ${candidate.bars} BARS`}</button><button type="button" className={selected?"selected":""} onClick={()=>keep(candidate)}>{selected?"KEPT ✓":"KEEP"}</button></div></article>;})}</div>
    </section>

    <footer className="lab-footer"><span>BASE incompleto</span><span>ROW = cambio real</span><span>BUILD crece</span><span>TRIPLE cambia capítulo</span><span>TETRIS emociona</span><span>QUARRY · KEEP solo si aporta</span></footer>
  </main>;
}
