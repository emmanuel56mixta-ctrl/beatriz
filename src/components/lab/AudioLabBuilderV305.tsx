import { useEffect, useMemo, useRef, useState } from "react";
import { LAYER_DEFINITIONS, QuantizedLayerBuilderV304, type BuilderState, type LayerId, type LayerStatus } from "@/lab/quantizedBuilderV304";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:blankLayers};
const q=(bars:number)=>bars===1?"NEXT 1":bars===4?"4 BAR":"8 BAR";
const s=(status:LayerStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="DISARMING"?`EXIT · ${target??"—"}`:status==="BUILDING"?`BUILD → ${target??"—"}`:status;

export function AudioLabBuilderV305(){
  const engineRef=useRef<QuantizedLayerBuilderV304|null>(null);
  const[state,setState]=useState<BuilderState>(blankState);
  const[volume,setVolume]=useState(.82);
  useEffect(()=>{const e=new QuantizedLayerBuilderV304(setState);engineRef.current=e;return()=>{e.dispose();engineRef.current=null;};},[]);
  const groups=useMemo(()=>[
    {id:"CELL",label:"REAL CELLS",defs:LAYER_DEFINITIONS.filter(d=>d.origin==="CELL")},
    {id:"LIVE",label:"LIVE",defs:LAYER_DEFINITIONS.filter(d=>d.origin==="LIVE")},
    {id:"FX",label:"FX",defs:LAYER_DEFINITIONS.filter(d=>d.origin==="FX")},
  ],[]);
  const pad=(def:(typeof LAYER_DEFINITIONS)[number])=>{const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";return <button type="button" key={def.id} className={`mix-pad origin-${def.origin.toLowerCase()} state-${rt.status.toLowerCase()} ${def.id==="BUILD"?"build-pad":""}`} disabled={!state.running||busy} onClick={()=>engineRef.current?.toggle(def.id as LayerId)} title={def.description}><span className="pad-top"><i>{q(def.quantizeBars)}</i><b>{s(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong></button>;};
  return <main className="console-shell">
    <header className="console-topbar">
      <div className="console-brand"><span>BEATRIS</span><b>v0.30.5</b></div>
      <div className="console-clock"><span>124 BPM</span><b>BAR {state.bar}</b><b>BEAT {state.beat}</b><div className="console-beats">{[1,2,3,4].map(beat=><i key={beat} className={beat===state.beat?"on":""}/>)}</div></div>
      <div className="console-transport">{!state.running?<button type="button" className="transport-main" disabled={state.loading} onClick={()=>void engineRef.current?.start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button type="button" className="transport-stop" onClick={()=>engineRef.current?.stop()}>RESET</button>}<label className="console-volume"><span>VOL</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);engineRef.current?.setVolume(v);}}/></label></div>
    </header>
    <section className="console-workspace">{groups.map(group=>{const active=group.defs.filter(def=>state.layers[def.id].status==="ON").length;return <section className={`console-bank bank-${group.id.toLowerCase()}`} key={group.id}><header className="bank-head"><span>{group.label}</span><b>{active}/{group.defs.length}</b></header><div className="bank-pads">{group.defs.map(pad)}</div></section>;})}</section>
    <footer className="console-status"><span className={`run-light ${state.running?"on":""}`}/><b>{state.running?"RUNNING":"STOPPED"}</b><p>{state.error??state.message}</p><span className="console-rule">CLICK → ARM → QUANTIZED ENTRY</span></footer>
  </main>;
}
