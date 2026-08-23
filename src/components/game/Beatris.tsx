import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play, RotateCw, Volume2, VolumeX } from "lucide-react";
import { Session, type CoreHud } from "@/game/session";
import { MiniPiece } from "@/components/game/MiniPiece";

const SKINS=["SKELETON","HATS","BASS","OPEN","FULL"];
const emptyHud:CoreHud={score:0,high:0,lines:0,level:1,combo:0,tetrises:0,bpm:124,bar:1,beat:1,step:0,boardHeight:0,skinStage:0,skinName:"SKELETON",section:"A",tension:"CALM",lastGesture:"READY",flash:null,hold:null,canHold:true,next:[]};

export function Beatris(){
  const canvasRef=useRef<HTMLCanvasElement>(null);const sessionRef=useRef<Session|null>(null);
  const[mode,setMode]=useState<Session["mode"]>("title");const[hud,setHud]=useState<CoreHud>(emptyHud);const[muted,setMuted]=useState(false);const[volume,setVolume]=useState(0.72);
  const onHud=useCallback((h:CoreHud,m:Session["mode"])=>{setHud(h);setMode(m);},[]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const s=new Session(canvas,onHud);sessionRef.current=s;s.attach();setHud(s.hud);return()=>{s.detach();sessionRef.current=null;};},[onHud]);
  const start=()=>void sessionRef.current?.enter();const toggleMute=()=>{const v=!muted;setMuted(v);sessionRef.current?.setMuted(v);};
  const press=(a:Parameters<Session["input"]["press"]>[0])=>sessionRef.current?.input.press(a);const release=(a:Parameters<Session["input"]["release"]>[0])=>sessionRef.current?.input.release(a);
  const heightPct=Math.min(100,hud.boardHeight/20*100);const nextSkin=[1,3,6,10][hud.skinStage]??null;

  return <main className="v20-shell">
    <header className="v20-top">
      <div><div className="v20-kicker">BEATRIS // v0.20.1 CORE</div><h1>HOUSE INSTRUMENT</h1></div>
      <div className="v20-clock"><strong>{hud.bpm}</strong><span>BPM</span><b>BAR {hud.bar} · BEAT {hud.beat}</b></div>
      <button className="icon-btn" onClick={toggleMute} aria-label={muted?"Activar audio":"Silenciar"}>{muted?<VolumeX/>:<Volume2/>}</button>
    </header>

    <section className="v20-grid">
      <aside className="v20-panel stats-panel">
        <p className="panel-title">PLAY</p>
        <div className="big-stat"><span>SCORE</span><strong>{String(hud.score).padStart(6,"0")}</strong></div>
        <div className="stat-row"><span>LINES</span><b>{hud.lines}</b></div><div className="stat-row"><span>LEVEL</span><b>{hud.level}</b></div><div className="stat-row"><span>COMBO</span><b>{hud.combo}</b></div>
        <div className="rule-card good"><b>CLEAR → ARRANGEMENT</b><small>Los puntos de drop no visten el beat.</small></div>
        <div className="rule-card warn"><b>STACK → TENSION</b><small>Apilar nunca mejora el groove.</small></div>
        <div className="rule-card good"><b>TETRIS → REWARD</b><small>Fill → 1 compás de aire → ~20 s de vocal.</small></div>
        <label className="volume">VOLUME<input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);sessionRef.current?.setVolume(v);}}/></label>
      </aside>

      <section className="v20-game">
        <div className="v20-well">
          <canvas ref={canvasRef}/>
          {hud.flash&&mode==="playing"?<div className="event-flash">{hud.flash}</div>:null}
          {mode==="title"?<div className="v20-overlay"><div className="start-card"><span>CORE EXPERIMENT · MACRO REWARD</span><h2>PLAY THE GROOVE.</h2><p>124 BPM. Cada lock deja huella. I = sweep. T = stab. Limpiar filas viste el House; apilar crea tensión. Un TETRIS es excepcional: rompe el suelo un compás y abre un vocal spotlight de unos 20 segundos.</p><button onClick={start}>START CORE</button><small>Sin stems como motor · vocal aislada solo como premio ganado</small></div></div>:null}
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
        <section className="skin"><header><span>SKIN</span><b>{hud.section} · {hud.skinName}</b></header><div className="skin-steps">{SKINS.map((s,i)=><i key={s} className={i<=hud.skinStage?"on":""} title={s}/>)}</div><small>{nextSkin?`Siguiente apertura: ${nextSkin} líneas acumuladas o un clear grande.`:"Groove completo: los siguientes levels cambian variante, no añaden muro."}</small></section>
        <section className="tension"><header><span>TENSION</span><b className={`state-${hud.tension.toLowerCase()}`}>{hud.tension}</b></header><div className="heightbar"><i style={{width:`${heightPct}%`}}/></div><small>{hud.boardHeight}/20 filas · danger latch entra en 14, sale en 10.</small></section>
        <div className="grammar"><div><b>I</b><span>SWEEP · alta banda</span></div><div><b>T</b><span>STAB · síncopa</span></div><div><b>HARD @ 1</b><span>BODY + CRASH</span></div><div><b>HARD OFF</b><span>DRY RIM</span></div><div><b>TETRIS</b><span>AIR → VOCAL × 10 BARS</span></div></div>
        <section className="queue"><div><span>HOLD</span>{hud.hold?<MiniPiece type={hud.hold} cell={7}/>:<em>—</em>}</div><div><span>NEXT</span><div className="next-list">{hud.next.slice(0,3).map((p,i)=><MiniPiece key={`${p}-${i}`} type={p} cell={i===0?7:5}/>)}</div></div></section>
      </aside>
    </section>

    <footer className="v20-tests"><span>01 LOCK</span><span>02 I ≠ T</span><span>03 HARD @1 ≠ OFF</span><span>04 CLEAR GRAMMAR</span><span>05 NO 8-BAR COPY</span><span>06 HEAD-NOD</span><span>07 CLEARS IMPROVE</span><span>08 TETRIS BREAK + VOCAL</span></footer>
  </main>;
}

function Control({children,label,onDown,onUp}:{children:React.ReactNode;label:string;onDown:()=>void;onUp?:()=>void}){return <button className="control" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>{children}<small>{label}</small></button>;}
