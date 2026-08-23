import { useEffect, useMemo, useRef, useState } from "react";
import { LAYER_DEFINITIONS, QuantizedLayerBuilderV304, type BuilderState, type LayerId, type LayerStatus } from "@/lab/quantizedBuilderV304";
import { FX_DEFINITIONS, QuantizedFxV305, type FxId, type FxState, type FxStatus } from "@/lab/quantizedFxV305";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:blankLayers};
const blankFx:FxState={ready:false,running:false,message:"FX READY",layers:{WASH:{status:"OFF",targetBar:null},RISER:{status:"OFF",targetBar:null},DOWN:{status:"OFF",targetBar:null},REVERSE:{status:"OFF",targetBar:null},IMPACT:{status:"OFF",targetBar:null},SWEEP:{status:"OFF",targetBar:null}}};
const q=(bars:number)=>bars===1?"NEXT 1":bars===4?"4 BAR":"8 BAR";
const s=(status:LayerStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="DISARMING"?`EXIT · ${target??"—"}`:status==="BUILDING"?`BUILD → ${target??"—"}`:status;
const fs=(status:FxStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="PLAYING"?"PLAYING":status;

export function AudioLabBuilderV305(){
  const engineRef=useRef<QuantizedLayerBuilderV304|null>(null);
  const fxRef=useRef<QuantizedFxV305|null>(null);
  const[state,setState]=useState<BuilderState>(blankState);
  const[fxState,setFxState]=useState<FxState>(blankFx);
  const[volume,setVolume]=useState(.82);

  useEffect(()=>{const e=new QuantizedLayerBuilderV304(setState);const fx=new QuantizedFxV305(setFxState);engineRef.current=e;fxRef.current=fx;return()=>{e.dispose();fx.dispose();engineRef.current=null;fxRef.current=null;};},[]);

  const cellDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="CELL"),[]);
  const liveDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="LIVE"),[]);

  async function start(){await Promise.all([engineRef.current?.prepare(),fxRef.current?.prepare()]);await Promise.all([engineRef.current?.start(),fxRef.current?.start()]);}
  function stop(){engineRef.current?.stop();fxRef.current?.stop();}
  function setMaster(v:number){setVolume(v);engineRef.current?.setVolume(v);fxRef.current?.setVolume(v);}

  const layerPad=(def:(typeof LAYER_DEFINITIONS)[number])=>{const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";return <button type="button" key={def.id} className={`mix-pad origin-${def.origin.toLowerCase()} state-${rt.status.toLowerCase()} ${def.id==="BUILD"?"build-pad":""}`} disabled={!state.running||busy} onClick={()=>engineRef.current?.toggle(def.id as LayerId)} title={def.description}><span className="pad-top"><i>{q(def.quantizeBars)}</i><b>{s(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong></button>;};
  const fxPad=(def:(typeof FX_DEFINITIONS)[number])=>{const rt=fxState.layers[def.id],busy=rt.status!=="OFF";return <button type="button" key={def.id} className={`mix-pad origin-fx state-${rt.status.toLowerCase()}`} disabled={!state.running||busy} onClick={()=>fxRef.current?.trigger(def.id as FxId)} title={def.note}><span className="pad-top"><i>{def.q===1?"NEXT 1":"4 BAR"}</i><b>{fs(rt.status,rt.targetBar)}</b></span><strong>+ {def.label}</strong></button>;};

  const cellOn=cellDefs.filter(d=>d.id!=="BUILD"&&state.layers[d.id].status==="ON").length;
  const liveOn=liveDefs.filter(d=>state.layers[d.id].status==="ON").length;
  const fxBusy=FX_DEFINITIONS.filter(d=>fxState.layers[d.id].status!=="OFF").length;
  const msg=fxBusy?fxState.message:(state.error??state.message);

  return <main className="console-shell">
    <header className="console-topbar">
      <div className="console-brand"><span>BEATRIS</span><b>v0.30.5</b></div>
      <div className="console-clock"><span>124 BPM</span><b>BAR {state.bar}</b><b>BEAT {state.beat}</b><div className="console-beats">{[1,2,3,4].map(beat=><i key={beat} className={beat===state.beat?"on":""}/>)}</div></div>
      <div className="console-transport">{!state.running?<button type="button" className="transport-main" disabled={state.loading} onClick={()=>void start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button type="button" className="transport-stop" onClick={stop}>RESET</button>}<label className="console-volume"><span>VOL</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setMaster(Number(e.target.value))}/></label></div>
    </header>

    <section className="console-workspace">
      <section className="console-bank bank-cell"><header className="bank-head"><span>REAL CELLS</span><b>{cellOn}/{cellDefs.length-1}</b></header><div className="bank-pads">{cellDefs.map(layerPad)}</div></section>
      <section className="console-bank bank-live"><header className="bank-head"><span>LIVE</span><b>{liveOn}/{liveDefs.length}</b></header><div className="bank-pads">{liveDefs.map(layerPad)}</div></section>
      <section className="console-bank bank-fx"><header className="bank-head"><span>FX · ONE SHOT</span><b>{fxBusy?"BUSY":"READY"}</b></header><div className="bank-pads">{FX_DEFINITIONS.map(fxPad)}</div></section>
    </section>

    <footer className="console-status"><span className={`run-light ${state.running?"on":""}`}/><b>{state.running?"RUNNING":"STOPPED"}</b><p>{msg}</p><span className="console-rule">CLICK → ARM → QUANTIZED ENTRY</span></footer>
  </main>;
}
