import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play, RotateCw, Volume2, VolumeX } from "lucide-react";
import { Session, type CoreHud } from "@/game/session";
import { MiniPiece } from "@/components/game/MiniPiece";

const SKINS=["SKELETON","HATS","BASS","OPEN","FULL"];
const emptyHud:CoreHud={score:0,high:0,lines:0,level:1,combo:0,tetrises:0,bpm:124,bar:1,beat:1,step:0,boardHeight:0,skinStage:0,skinName:"SKELETON",section:"A",tension:"CALM",lastGesture:"READY",flash:null,momentum:0,nextMomentum:4,hold:null,canHold:true,next:[]};

export function Beatris(){
  const canvasRef=useRef<HTMLCanvasElement>(null);const sessionRef=useRef<Session|null>(null);
  const[mode,setMode]=useState<Session["mode"]>("title");const[hud,setHud]=useState<CoreHud>(emptyHud);const[muted,setMuted]=useState(false);const[volume,setVolume]=useState(0.72);
  const onHud=useCallback((h:CoreHud,m:Session["mode"])=>{setHud(h);setMode(m);},[]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const s=new Session(canvas,onHud);sessionRef.current=s;s.attach();setHud(s.hud);return()=>{s.detach();sessionRef.current=null;};},[onHud]);
  const start=()=>void sessionRef.current?.enter();const toggleMute=()=>{const v=!muted;setMuted(v);sessionRef.current?.setMuted(v);};
  const press=(a:Parameters<Session["input"]["press"]>[0])=>sessionRef.current?.input.press(a);const release=(a:Parameters<Session["input"]["release"]>[0])=>sessionRef.current?.input.release(a);
  const heightPct=Math.min(100,hud.boardHeight/20*100);const nextSkin=[1,3,6,10][hud.skinStage]??null;
  const momentumFloor=Math.floor(hud.momentum/4)*4;const momentumPct=Math.min(100,Math.max(0,(hud.momentum-momentumFloor)/4*100));

  return <main className="v20-shell">
    <header className="v20-top">
      <div><div className="v20-kicker">BEATRIS // v0.20.2 FLOW</div><h1>HOUSE INSTRUMENT</h1></div>
      <div className="v20-clock"><strong>{hud.bpm}</strong><span>BPM</span><b>BAR {hud.bar} · BEAT {hud.beat}</b></div>
      <button className="icon-btn" onClick={toggleMute} aria-label={muted?"Activar audio":"Silenciar"}>{muted?<VolumeX/>:<Volume2/>}</button>
    </header>

    <section className="v20-grid">
      <aside className="v20-panel stats-panel">
        <p className="panel-title">PLAY</p>
        <div className="big-stat"><span>SCORE</span><strong>{String(hud.score).padStart(6,"0")}</strong></div>
        <div className="stat-row"><span>LINES</span><b>{hud.lines}</b></div><div className="stat-row"><span>LEVEL</span><b>{hud.level}</b></div><div className="stat-row"><span>COMBO</span><b>{hud.combo}</b></div>
        <div className="rule-card good"><b>CLEAR → ARRANGEMENT</b><small>Las filas enriquecen el instrumento de forma permanente.</small></div>
        <div className="rule-card warn"><b>STACK → TENSION</b><small>Apilar aumenta presión, nunca la riqueza.</small></div>
        <div className="rule-card good"><b>MOMENTUM → EMOTION</b><small>SINGLE +1 · DOUBLE +2.5 · TRIPLE +4 · TETRIS +6. Los hitos abren lifts/breaks sin salir de la armonía.</small></div>
        <label className="volume">VOLUME<input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);sessionRef.current?.setVolume(v);}}/></label>
      </aside>

      <section className="v20-game">
        <div className="v20-well">
          <canvas ref={canvasRef}/>
          {hud.flash&&mode==="playing"?<div className="event-flash">{hud.flash}</div>:null}
          {mode==="title"?<div className="v20-overlay"><div className="start-card"><span>CUMULATIVE HARMONIC FLOW</span><h2>BUILD THE ENERGY.</h2><p>124 BPM. El House vive en una sola armonía G# menor. Cada clear acumula MOMENTUM: primero viste el groove, luego abre lifts, respiraciones y vocales. La altura solo mete presión; no mejora el beat.</p><button onClick={start}>START CORE</button><small>G#m → E → B → F# · clear quality accumulates · TETRIS = full reward</small></div></div>:null}
          {mode==="paused"?<div className="v20-overlay"><div className="pause-card"><h2>PAUSED</h2><button onClick={()=>sessionRef.current?.resume()}><Play/> RESUME</button></div></div>:null}
          {mode==="over"?<div className="v20-overlay"><div className="pause-card"><h2>SET OVER</h2><strong>{hud.score}</strong><button onClick={()=>sessionRef.current?.restart()}>RUN AGAIN</button></div></div>:null}
        </div>
        <div className="controls">
          <Control label="LEFT" onDown={()=>press("left")} onUp={()=>release("left")}><ChevronLeft/></Control>
          <Control label="ROTATE" onDown={()=>press("rotCW")}><RotateCw/></Control>
          <Control label="RIGHT" onDown={()=>press("right")} onUp={()=>release("right")}><ChevronRight/></Control>
          <Control label="SOFT" onDown={()=>press("soft")} onUp={()=>release("soft")}><ChevronDown/></Control>
          <button className="control hard" onPointerDown={()=>press("hard")}><b>HARD</b><small>DROP</small></button>
          <button className="control" onPointerDown={()=>press("hold")}><b>HOLD</b><small>C / SHIFT</small></button>
        </div>
      </section>

      <aside className="v20-panel music-panel">
        <p className="panel-title">INSTRUMENT LANGUAGE</p>
        <div className="gesture"><span>LAST GESTURE</span><strong>{hud.lastGesture}</strong></div>
        <section className="momentum"><header><span>MOMENTUM</span><b>{hud.momentum.toFixed(1)} → {hud.nextMomentum}</b></header><div className="momentum-bar"><i style={{width:`${momentumPct}%`}}/></div><small>Acumulativo. Cada bloque de 4 abre una nueva ventana de emoción; nunca suma ruido permanente.</small></section>
        <section className="skin"><header><span>SKIN</span><b>{hud.section} · {hud.skinName}</b></header><div className="skin-steps">{SKINS.map((s,i)=><i key={s} className={i<=hud.skinStage?"on":""} title={s}/>)}</div><small>{nextSkin?`Siguiente apertura persistente: ${nextSkin} líneas o un clear grande.`:"FULL: los siguientes levels cambian frase/voicing, no añaden muro."}</small></section>
        <section className="tension"><header><span>TENSION</span><b className={`state-${hud.tension.toLowerCase()}`}>{hud.tension}</b></header><div className="heightbar"><i style={{width:`${heightPct}%`}}/></div><small>{hud.boardHeight}/20 filas · 8 = pressure · 14 = build latch · 10 = release.</small></section>
        <div className="grammar"><div><b>I</b><span>SWEEP · fuera del bass</span></div><div><b>T</b><span>STAB · acorde actual</span></div><div><b>HARD @ 1</b><span>BODY + HARMONIC HIT</span></div><div><b>DOUBLE</b><span>BREATH → 2 BAR LIFT</span></div><div><b>TRIPLE</b><span>BREATH → 4 BAR PEAK + CHOP</span></div><div><b>TETRIS</b><span>1 BAR AIR → VOCAL ~20 s</span></div></div>
        <section className="queue"><div><span>HOLD</span>{hud.hold?<MiniPiece type={hud.hold} cell={7}/>:<em>—</em>}</div><div><span>NEXT</span><div className="next-list">{hud.next.slice(0,3).map((p,i)=><MiniPiece key={`${p}-${i}`} type={p} cell={i===0?7:5}/>)}</div></div></section>
      </aside>
    </section>

    <footer className="v20-tests"><span>LOCK</span><span>I ≠ T</span><span>HARD @1 ≠ OFF</span><span>CLEAR GRAMMAR</span><span>8-BAR BREATH</span><span>HEAD-NOD</span><span>CLEARS IMPROVE</span><span>MOMENTUM ACCUMULATES</span><span>ONE HARMONIC WORLD</span></footer>
  </main>;
}

function Control({children,label,onDown,onUp}:{children:React.ReactNode;label:string;onDown:()=>void;onUp?:()=>void}){return <button className="control" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>{children}<small>{label}</small></button>;}
