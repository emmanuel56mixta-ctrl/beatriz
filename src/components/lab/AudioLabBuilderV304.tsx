import { useEffect, useMemo, useRef, useState } from "react";
import {
  LAYER_DEFINITIONS,
  QuantizedLayerBuilderV304,
  type BuilderState,
  type LayerId,
  type LayerStatus,
} from "@/lab/quantizedBuilderV304";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"Pulsa START. BASE corre sola hasta que tú añadas textura y espacio.",error:null,layers:blankLayers};

function quantizeLabel(bars:number){return bars===1?"NEXT 1":bars===4?"NEXT 4-BAR PHRASE":"NEXT 8-BAR PHRASE";}
function statusLabel(status:LayerStatus,targetBar:number|null){if(status==="ARMED")return `ARMED · BAR ${targetBar??"—"}`;if(status==="DISARMING")return `EXIT · BAR ${targetBar??"—"}`;if(status==="BUILDING")return `BUILDING → BAR ${targetBar??"—"}`;return status;}

export function AudioLabBuilderV304(){
  const engineRef=useRef<QuantizedLayerBuilderV304|null>(null);
  const[state,setState]=useState<BuilderState>(blankState);
  const[volume,setVolume]=useState(.82);
  useEffect(()=>{const e=new QuantizedLayerBuilderV304(setState);engineRef.current=e;return()=>{e.dispose();engineRef.current=null;};},[]);
  const realDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="CELL"),[]);
  const liveDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="LIVE"),[]);
  const fxDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="FX"),[]);
  const liveOn=useMemo(()=>liveDefs.filter(d=>state.layers[d.id].status==="ON").length,[liveDefs,state.layers]);
  const fxOn=useMemo(()=>fxDefs.filter(d=>state.layers[d.id].status==="ON").length,[fxDefs,state.layers]);
  const cellOn=useMemo(()=>realDefs.filter(d=>d.id!=="BUILD"&&state.layers[d.id].status==="ON").length,[realDefs,state.layers]);

  function toggle(id:LayerId){engineRef.current?.toggle(id);}
  function layerButton(def:(typeof LAYER_DEFINITIONS)[number]){const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING",active=rt.status==="ON",major=def.id==="BUILD"||def.id==="CLUB";return <button type="button" key={def.id} className={`layer-button status-${rt.status.toLowerCase()} ${major?"major":""} ${def.origin==="LIVE"?"live-layer":""} ${def.origin==="FX"?"fx-layer":""}`} disabled={!state.running||busy} onClick={()=>toggle(def.id)}><span className="layer-quant">{def.origin==="LIVE"?"LIVE · NO MP3 · ":def.origin==="FX"?"FX · NO MP3 · ":"REAL CELL · "}{quantizeLabel(def.quantizeBars)}</span><strong>{def.label}</strong><p>{def.description}</p><footer><b>{statusLabel(rt.status,rt.targetBar)}</b>{active&&def.id!=="BUILD"?<em>tap = quantized exit</em>:<em>{busy?"waiting for boundary":"tap = arm"}</em>}</footer></button>;}

  return <main className="builder-shell">
    <header className="builder-hero">
      <div><p className="builder-kicker">BEATRIS v0.30.4 · SPACE + TRANSITION FX</p><h1>MORE AIR.<br/>BETTER TRANSITIONS.</h1><p className="builder-lede">La música real sigue siendo el cuerpo. Los LIVE INSTRUMENTS dan groove; los TRANSITION FX conectan frases, crean expectativa y hacen que los cambios se sientan producidos.</p></div>
      <div className="clock-card"><span>MASTER CLOCK</span><strong>124</strong><b>BPM</b><div><em>BAR</em><i>{state.bar}</i><em>BEAT</em><i>{state.beat}</i></div></div>
    </header>

    <section className="builder-grid">
      <aside className="builder-panel contract-panel">
        <p className="builder-cap">ESPACIO + MOVIMIENTO</p><h2>No todo tiene que ser una nota.</h2>
        <p className="contract-copy">Los <b>washes, risers, reverse cymbals, impacts y sweeps</b> ayudan a que una frase conduzca a la siguiente. Son aire y transición.</p>
        <div className="contract-rule"><b>WASH / SWEEP</b><span>Dan respiración y movimiento lateral entre bloques.</span></div>
        <div className="contract-rule"><b>RISER / REVERSE</b><span>Crean expectativa antes del siguiente 1.</span></div>
        <div className="contract-rule"><b>IMPACT / DOWN</b><span>Marcan el golpe y dejan una cola que hace sentir el cambio.</span></div>
        <div className="contract-rule"><b>BUILD → DROP</b><span>Ahora incluye riser + reverse + impact + downlifter/wash automáticamente.</span></div>
        <div className="base-card"><span>REGLA</span><b>FX = punctuation</b><small>no deben sonar todo el tiempo ni tapar la música</small></div>
      </aside>

      <section className="builder-main">
        <div className="builder-status"><div><span>NOW</span><strong>BAR {state.bar} · BEAT {state.beat}</strong></div><div className="beat-dots">{[1,2,3,4].map(b=><i key={b} className={b===state.beat?"on":""}/>)}</div><p>{state.message}</p></div>

        <div className="builder-section-head"><span>REAL CELLS</span><b>{cellOn} ON</b><p>La materia con carne: stems y células elegidas.</p></div>
        <div className="layer-grid">{realDefs.map(layerButton)}</div>

        <div className="builder-section-head live-head"><span>LIVE INSTRUMENTS · NO MP3</span><b>{liveOn} ON</b><p>Groove, textura y pequeñas respuestas.</p></div>
        <div className="layer-grid live-grid">{liveDefs.map(layerButton)}</div>

        <div className="builder-section-head fx-head"><span>TRANSITION FX · NO MP3</span><b>{fxOn} ON</b><p>Actívalos como lenguaje de producción. Se disparan solo en fronteras musicales útiles.</p></div>
        <div className="layer-grid fx-grid">{fxDefs.map(layerButton)}</div>

        <div className="transport builder-transport">{!state.running?<button className="start-audio" type="button" disabled={state.loading} onClick={()=>void engineRef.current?.start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button className="stop-audio" type="button" onClick={()=>engineRef.current?.stop()}>STOP / RESET</button>}<label><span>MASTER VOLUME</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);engineRef.current?.setVolume(v);}}/></label></div>
        {state.error?<p className="builder-error">{state.error}</p>:null}
      </section>

      <aside className="builder-panel mix-panel">
        <p className="builder-cap">MIX MEMORY</p><h2>{cellOn} cells · {liveOn} live · {fxOn} fx</h2><p className="mix-note">Todo entra y sale cuantizado. Los FX activos no suenan constantemente: esperan la frontera para puntuarla.</p>
        <div className="memory-list"><div className="memory-row base"><span>BASE</span><b>ON</b></div>{LAYER_DEFINITIONS.filter(d=>d.id!=="BUILD").map(def=>{const rt=state.layers[def.id];return <div className={`memory-row ${rt.status.toLowerCase()}`} key={def.id}><span>{def.id}</span><b>{statusLabel(rt.status,rt.targetBar)}</b></div>;})}</div>
        <div className="source-stack"><span>PALETTE</span><b>LIVE</b><small>shaker · ghost · ride · stabs · arp · tom fills</small><b>FX</b><small>wash · riser · downlifter · reverse · impact · air sweep</small><b>BUILD PACKAGE</b><small>real roll + riser → reverse → impact → down/wash</small></div>
      </aside>
    </section>

    <section className="builder-test"><p className="builder-cap">PRUEBA</p><h2>Escucha cómo conectan las frases.</h2><p>Empieza BASE + CHORDS + SHAKER. Después activa WASH e IMPACT. Déjalo pasar una frase. Luego añade RISER + REVERSE. Finalmente pulsa BUILD → DROP: ahora debe sentirse una subida más clara y una ruptura producida, no solo un cambio de loop.</p></section>
    <footer className="builder-footer"><span>REAL CELLS = BODY</span><span>LIVE = TEXTURE</span><span>FX = TRANSITION</span><span>ALL QUANTIZED</span><span>BUILD HAS LIVE FX</span><span>NO AUTO PROGRESSION</span></footer>
  </main>;
}
