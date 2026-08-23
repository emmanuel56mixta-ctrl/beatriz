import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play, RotateCw, Volume2, VolumeX } from "lucide-react";
import { Session, type CoreHud } from "@/game/session";
import { MiniPiece } from "@/components/game/MiniPiece";

const SKINS=["SKELETON","HATS","BASS","OPEN","FULL"];
const ROLES=["CHORDS","RESPONSE","MOTIF","COUNTER","ARP","HOOK"];
const emptyHud:CoreHud={score:0,high:0,lines:0,level:1,combo:0,tetrises:0,bpm:124,bar:1,beat:1,step:0,boardHeight:0,skinStage:0,skinName:"SKELETON",section:"A",tension:"CALM",lastGesture:"READY",flash:null,momentum:0,nextMomentum:4,memoryCount:0,inventoryName:"FOUNDATION",instrumentTier:0,instrumentName:"RAW",lastRowSignature:"—",hold:null,canHold:true,next:[]};

export function Beatris(){
  const canvasRef=useRef<HTMLCanvasElement>(null);const sessionRef=useRef<Session|null>(null);
  const[mode,setMode]=useState<Session["mode"]>("title");const[hud,setHud]=useState<CoreHud>(emptyHud);const[muted,setMuted]=useState(false);const[volume,setVolume]=useState(.72);
  const onHud=useCallback((h:CoreHud,m:Session["mode"])=>{setHud(h);setMode(m);},[]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const s=new Session(canvas,onHud);sessionRef.current=s;s.attach();setHud(s.hud);return()=>{s.detach();sessionRef.current=null;};},[onHud]);
  const start=()=>void sessionRef.current?.enter();const toggleMute=()=>{const v=!muted;setMuted(v);sessionRef.current?.setMuted(v);};
  const press=(a:Parameters<Session["input"]["press"]>[0])=>sessionRef.current?.input.press(a);const release=(a:Parameters<Session["input"]["release"]>[0])=>sessionRef.current?.input.release(a);
  const heightPct=Math.min(100,hud.boardHeight/20*100);const nextSkin=[1,3,6,10][hud.skinStage]??null;
  const memoryPct=Math.min(100,hud.memoryCount/6*100);const kitPct=hud.instrumentTier/3*100;

  return <main className="v20-shell">
    <header className="v20-top">
      <div><div className="v20-kicker">BEATRIS // v0.20.4 BUILT MUSIC</div><h1>HOUSE INSTRUMENT</h1></div>
      <div className="v20-clock"><strong>{hud.bpm}</strong><span>BPM</span><b>BAR {hud.bar} · BEAT {hud.beat}</b></div>
      <button className="icon-btn" onClick={toggleMute} aria-label={muted?"Activar audio":"Silenciar"}>{muted?<VolumeX/>:<Volume2/>}</button>
    </header>

    <section className="v20-grid">
      <aside className="v20-panel stats-panel">
        <p className="panel-title">PLAY</p>
        <div className="big-stat"><span>SCORE</span><strong>{String(hud.score).padStart(6,"0")}</strong></div>
        <div className="stat-row"><span>LINES</span><b>{hud.lines}</b></div><div className="stat-row"><span>LEVEL</span><b>{hud.level}</b></div><div className="stat-row"><span>TETRIS</span><b>{hud.tetrises}</b></div>
        <div className="rule-card good"><b>BUILD A ROW → WRITE MUSIC</b><small>La combinación real de piezas de la fila escribe ritmo, inversión y contorno. Esa frase se queda.</small></div>
        <div className="rule-card good"><b>TETRIS → NEW BASE KIT</b><small>Solo 4 filas simultáneas cambian permanentemente RAW → DEEP → CLUB → PEAK.</small></div>
        <div className="rule-card warn"><b>STACK → TENSION ONLY</b><small>La altura jamás desbloquea composición.</small></div>
        <label className="volume">VOLUME<input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);sessionRef.current?.setVolume(v);}}/></label>
      </aside>

      <section className="v20-game">
        <div className="v20-well">
          <canvas ref={canvasRef}/>
          {hud.flash&&mode==="playing"?<div className="event-flash">{hud.flash}</div>:null}
          {mode==="title"?<div className="v20-overlay"><div className="start-card"><span>CONSTRUCTION-DRIVEN COMPOSITION</span><h2>BUILD THE MUSIC.</h2><p>No hay desbloqueos automáticos por tiempo. Cada fila que construyes se convierte en una frase armónica persistente usando las piezas reales con las que la completaste. Un TETRIS cambia además el instrumento base.</p><button onClick={start}>START CORE</button><small>G#m → E → B → F# · row DNA → persistent phrase · TETRIS → new kit</small></div></div>:null}
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
        <p className="panel-title">WHAT YOU HAVE BUILT</p>
        <div className="gesture"><span>LAST MUSICAL EVENT</span><strong>{hud.lastGesture}</strong></div>

        <section className="momentum"><header><span>MUSIC MEMORY</span><b>{hud.memoryCount} ROW{hud.memoryCount===1?"":"S"} · {hud.inventoryName}</b></header><div className="momentum-bar"><i style={{width:`${memoryPct}%`}}/></div><small>Cada fila completada añade una frase. No desaparece con el siguiente compás.</small></section>

        <section className="momentum"><header><span>LAST ROW DNA</span><b>{hud.lastRowSignature}</b></header><div className="skin-steps">{ROLES.map((r,i)=><i key={r} className={i<Math.min(6,hud.memoryCount)?"on":""} title={r}/>)}</div><small>{ROLES.map((r,i)=>`${i+1}:${r}`).join(" · ")}</small></section>

        <section className="momentum"><header><span>BASE KIT</span><b>T{hud.instrumentTier} · {hud.instrumentName}</b></header><div className="momentum-bar"><i style={{width:`${kitPct}%`}}/></div><small>Cada TETRIS cambia permanentemente kick, clap, bass y percusión. No lo hace un TRIPLE ni la altura.</small></section>

        <section className="skin"><header><span>RHYTHM SKIN</span><b>{hud.section} · {hud.skinName}</b></header><div className="skin-steps">{SKINS.map((s,i)=><i key={s} className={i<=hud.skinStage?"on":""} title={s}/>)}</div><small>{nextSkin?"También se densifica al construir y limpiar; nunca por esperar.":"FULL: el arreglo usa las frases construidas en distintos compases, no todas a la vez."}</small></section>

        <section className="tension"><header><span>TENSION</span><b className={`state-${hud.tension.toLowerCase()}`}>{hud.tension}</b></header><div className="heightbar"><i style={{width:`${heightPct}%`}}/></div><small>{hud.boardHeight}/20 filas · altura = presión únicamente.</small></section>

        <div className="grammar"><div><b>ROW 1</b><span>ITS DNA → CHORDS</span></div><div><b>ROW 2</b><span>ITS DNA → RESPONSE</span></div><div><b>ROW 3</b><span>ITS DNA → MOTIF</span></div><div><b>ROW 4</b><span>ITS DNA → COUNTER</span></div><div><b>ROW 5</b><span>ITS DNA → ARP</span></div><div><b>ROW 6</b><span>ITS DNA → HOOK</span></div><div><b>TETRIS</b><span>4 PHRASES + NEW KIT + VOCAL</span></div></div>

        <section className="queue"><div><span>HOLD</span>{hud.hold?<MiniPiece type={hud.hold} cell={7}/>:<em>—</em>}</div><div><span>NEXT</span><div className="next-list">{hud.next.slice(0,3).map((p,i)=><MiniPiece key={`${p}-${i}`} type={p} cell={i===0?7:5}/>)}</div></div></section>
      </aside>
    </section>

    <footer className="v20-tests"><span>NO AUTO UNLOCKS</span><span>ROW DNA = MUSIC</span><span>CLEARS ACCUMULATE</span><span>TETRIS = NEW KIT</span><span>I ≠ T</span><span>HARD @1 ≠ OFF</span><span>HEAD-NOD</span><span>ONE HARMONIC WORLD</span></footer>
  </main>;
}

function Control({children,label,onDown,onUp}:{children:React.ReactNode;label:string;onDown:()=>void;onUp?:()=>void}){return <button className="control" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>{children}<small>{label}</small></button>;}
