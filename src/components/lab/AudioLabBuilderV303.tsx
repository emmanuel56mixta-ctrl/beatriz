import { useEffect, useMemo, useRef, useState } from "react";
import {
  LAYER_DEFINITIONS,
  QuantizedLayerBuilderV303,
  type BuilderState,
  type LayerId,
  type LayerStatus,
} from "@/lab/quantizedBuilderV303";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"Pulsa START. BASE corre sola hasta que tú añadas textura.",error:null,layers:blankLayers};

function quantizeLabel(bars:number){return bars===1?"NEXT 1":bars===4?"NEXT 4-BAR PHRASE":"NEXT 8-BAR PHRASE";}
function statusLabel(status:LayerStatus,targetBar:number|null){if(status==="ARMED")return `ARMED · BAR ${targetBar??"—"}`;if(status==="DISARMING")return `EXIT · BAR ${targetBar??"—"}`;if(status==="BUILDING")return `BUILDING → BAR ${targetBar??"—"}`;return status;}

export function AudioLabBuilderV303(){
  const engineRef=useRef<QuantizedLayerBuilderV303|null>(null);
  const[state,setState]=useState<BuilderState>(blankState);
  const[volume,setVolume]=useState(.82);
  useEffect(()=>{const e=new QuantizedLayerBuilderV303(setState);engineRef.current=e;return()=>{e.dispose();engineRef.current=null;};},[]);
  const realDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="CELL"),[]);
  const liveDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="LIVE"),[]);
  const liveOn=useMemo(()=>liveDefs.filter(d=>state.layers[d.id].status==="ON").length,[liveDefs,state.layers]);
  const cellOn=useMemo(()=>realDefs.filter(d=>d.id!=="BUILD"&&state.layers[d.id].status==="ON").length,[realDefs,state.layers]);

  function toggle(id:LayerId){engineRef.current?.toggle(id);}
  function layerButton(def:(typeof LAYER_DEFINITIONS)[number]){const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING",active=rt.status==="ON",major=def.id==="BUILD"||def.id==="CLUB";return <button type="button" key={def.id} className={`layer-button status-${rt.status.toLowerCase()} ${major?"major":""} ${def.origin==="LIVE"?"live-layer":""}`} disabled={!state.running||busy} onClick={()=>toggle(def.id)}><span className="layer-quant">{def.origin==="LIVE"?"LIVE · NO MP3 · ":"REAL CELL · "}{quantizeLabel(def.quantizeBars)}</span><strong>{def.label}</strong><p>{def.description}</p><footer><b>{statusLabel(rt.status,rt.targetBar)}</b>{active&&def.id!=="BUILD"?<em>tap = quantized exit</em>:<em>{busy?"waiting for boundary":"tap = arm"}</em>}</footer></button>;}

  return <main className="builder-shell">
    <header className="builder-hero">
      <div><p className="builder-kicker">BEATRIS v0.30.3 · CELLS + LIVE INSTRUMENTS</p><h1>MORE GROOVE.<br/>MORE MOVEMENT.</h1><p className="builder-lede">La música real sigue siendo el cuerpo. Los instrumentos LIVE añaden textura, swing, brillo y respuestas cortas. No son MP3 y tampoco intentan fabricar toda la canción.</p></div>
      <div className="clock-card"><span>MASTER CLOCK</span><strong>124</strong><b>BPM</b><div><em>BAR</em><i>{state.bar}</i><em>BEAT</em><i>{state.beat}</i></div></div>
    </header>

    <section className="builder-grid">
      <aside className="builder-panel contract-panel">
        <p className="builder-cap">NUEVA IDEA</p><h2>Textura, no otra canción.</h2>
        <p className="contract-copy">Creo que la palabra que buscabas era una mezcla de <b>textura, groove, movimiento y riqueza</b>. Eso es lo que agregan estos instrumentos.</p>
        <div className="contract-rule"><b>SHAKER / GHOST</b><span>Rellenan huecos y hacen respirar el groove.</span></div>
        <div className="contract-rule"><b>RIDE</b><span>Levanta energía sin cambiar la base.</span></div>
        <div className="contract-rule"><b>STABS / ARP</b><span>Añaden conversación armónica dentro de G#m–E–B–F#.</span></div>
        <div className="contract-rule"><b>TOM FILLS</b><span>Marcan finales de frase para evitar sensación de bucle infinito.</span></div>
        <div className="base-card"><span>BODY</span><b>real cells + bass</b><small>LIVE = seasoning, never the whole record</small></div>
      </aside>

      <section className="builder-main">
        <div className="builder-status"><div><span>NOW</span><strong>BAR {state.bar} · BEAT {state.beat}</strong></div><div className="beat-dots">{[1,2,3,4].map(b=><i key={b} className={b===state.beat?"on":""}/>)}</div><p>{state.message}</p></div>

        <div className="builder-section-head"><span>REAL CELLS</span><b>{cellOn} ON</b><p>La materia con carne: stems y células elegidas.</p></div>
        <div className="layer-grid">{realDefs.map(layerButton)}</div>

        <div className="builder-section-head live-head"><span>LIVE INSTRUMENTS · NO MP3</span><b>{liveOn} ON</b><p>Añádelos uno por uno. Deben dar movimiento, no volver a dominar el track.</p></div>
        <div className="layer-grid live-grid">{liveDefs.map(layerButton)}</div>

        <div className="transport builder-transport">{!state.running?<button className="start-audio" type="button" disabled={state.loading} onClick={()=>void engineRef.current?.start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button className="stop-audio" type="button" onClick={()=>engineRef.current?.stop()}>STOP / RESET</button>}<label><span>MASTER VOLUME</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);engineRef.current?.setVolume(v);}}/></label></div>
        {state.error?<p className="builder-error">{state.error}</p>:null}
      </section>

      <aside className="builder-panel mix-panel">
        <p className="builder-cap">MIX MEMORY</p><h2>{cellOn} cells + {liveOn} live</h2><p className="mix-note">Todo entra y sale cuantizado. Puedes construir una mezcla distinta cada vez.</p>
        <div className="memory-list"><div className="memory-row base"><span>BASE</span><b>ON</b></div>{LAYER_DEFINITIONS.filter(d=>d.id!=="BUILD").map(def=>{const rt=state.layers[def.id];return <div className={`memory-row ${rt.status.toLowerCase()}`} key={def.id}><span>{def.id}</span><b>{statusLabel(rt.status,rt.targetBar)}</b></div>;})}</div>
        <div className="source-stack"><span>LIVE PALETTE</span><b>SHAKER · GHOST · RIDE</b><small>groove / air / club energy</small><b>HOUSE STABS · ARP</b><small>harmonic movement in the same progression</small><b>TOM FILLS</b><small>phrase punctuation</small></div>
      </aside>
    </section>

    <section className="builder-test"><p className="builder-cap">PRUEBA</p><h2>Busca movimiento, no volumen.</h2><p>Empieza BASE → CHORDS. Después activa SHAKER y GHOST. Espera unos compases. Añade STABS o ARP, no necesariamente ambos. Más tarde prueba RIDE y TOM FILLS. Si al sumar algo solo se oye “más fuerte” pero no “más vivo”, ese ingrediente sobra.</p></section>
    <footer className="builder-footer"><span>REAL CELLS = BODY</span><span>LIVE = TEXTURE</span><span>NO MP3 LIVE LAYERS</span><span>ALL QUANTIZED</span><span>G#m → E → B → F#</span><span>NO AUTO PROGRESSION</span></footer>
  </main>;
}
