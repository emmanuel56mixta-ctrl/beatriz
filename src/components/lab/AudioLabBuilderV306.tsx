import { useEffect,useMemo,useRef,useState } from "react";
import { LAYER_DEFINITIONS,QuantizedLayerBuilderV304,type BuilderState,type LayerId,type LayerStatus } from "@/lab/quantizedBuilderV304";
import { EXTRA_DEFINITIONS,PerformanceExtrasV306,type ExtraId,type ExtraState,type ExtraStatus } from "@/lab/performanceExtrasV306";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:blankLayers};
const blankExtras:ExtraState={ready:false,running:false,message:"EXTRAS READY",layers:Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as ExtraState["layers"]};
const q=(bars:number)=>bars===1?"NEXT 1":bars===4?"4 BAR":"8 BAR";
const ls=(status:LayerStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="DISARMING"?`EXIT · ${target??"—"}`:status==="BUILDING"?`BUILD → ${target??"—"}`:status;
const es=(status:ExtraStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="EXIT"?`EXIT · ${target??"—"}`:status;

export function AudioLabBuilderV306(){
  const baseRef=useRef<QuantizedLayerBuilderV304|null>(null);
  const extraRef=useRef<PerformanceExtrasV306|null>(null);
  const[state,setState]=useState<BuilderState>(blankState);
  const[extras,setExtras]=useState<ExtraState>(blankExtras);
  const[volume,setVolume]=useState(.82);

  useEffect(()=>{const base=new QuantizedLayerBuilderV304(setState),extra=new PerformanceExtrasV306(setExtras);baseRef.current=base;extraRef.current=extra;return()=>{base.dispose();extra.dispose();baseRef.current=null;extraRef.current=null;};},[]);
  const cellDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="CELL"),[]);
  const vocal20=EXTRA_DEFINITIONS.find(d=>d.id==="VOCAL20")!;
  const liveDefs=EXTRA_DEFINITIONS.filter(d=>d.kind==="LIVE");
  const fxDefs=EXTRA_DEFINITIONS.filter(d=>d.kind==="FX");

  async function start(){await Promise.all([baseRef.current?.prepare(),extraRef.current?.prepare()]);await Promise.all([baseRef.current?.start(),extraRef.current?.start()]);}
  function stop(){baseRef.current?.stop();extraRef.current?.stop();}
  function setMaster(v:number){setVolume(v);baseRef.current?.setVolume(v);extraRef.current?.setVolume(v);}

  const cellPad=(def:(typeof LAYER_DEFINITIONS)[number])=>{const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";return <button type="button" key={def.id} className={`mix-pad origin-cell state-${rt.status.toLowerCase()} ${def.id==="BUILD"?"build-pad":""}`} disabled={!state.running||busy} onClick={()=>baseRef.current?.toggle(def.id as LayerId)} title={def.description}><span className="pad-top"><i>{q(def.quantizeBars)}</i><b>{ls(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong></button>;};
  const extraPad=(def:(typeof EXTRA_DEFINITIONS)[number])=>{const rt=extras.layers[def.id],busy=rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT";return <button type="button" key={def.id} className={`mix-pad origin-${def.kind.toLowerCase()} state-${rt.status.toLowerCase()} ${def.id==="VOCAL20"?"vocal20-pad":""}`} disabled={!state.running||busy} onClick={()=>extraRef.current?.toggle(def.id as ExtraId)} title={def.note}><span className="pad-top"><i>{q(def.q)}</i><b>{es(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong></button>;};

  const cellOn=cellDefs.filter(d=>d.id!=="BUILD"&&state.layers[d.id].status==="ON").length;
  const liveOn=liveDefs.filter(d=>extras.layers[d.id].status==="ON").length;
  const fxBusy=fxDefs.filter(d=>extras.layers[d.id].status!=="OFF").length;
  const vocalBusy=extras.layers.VOCAL20.status!=="OFF";
  const msg=extras.message!=="EXTRAS READY"?extras.message:(state.error??state.message);

  return <main className="console-shell">
    <header className="console-topbar">
      <div className="console-brand"><span>BEATRIS</span><b>v0.30.6</b></div>
      <div className="console-clock"><span>124 BPM</span><b>BAR {state.bar}</b><b>BEAT {state.beat}</b><div className="console-beats">{[1,2,3,4].map(beat=><i key={beat} className={beat===state.beat?"on":""}/>)}</div></div>
      <div className="console-transport">{!state.running?<button type="button" className="transport-main" disabled={state.loading} onClick={()=>void start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button type="button" className="transport-stop" onClick={stop}>RESET</button>}<label className="console-volume"><span>VOL</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setMaster(Number(e.target.value))}/></label></div>
    </header>

    <section className="console-workspace">
      <section className="console-bank bank-cell"><header className="bank-head"><span>REAL CELLS</span><b>{cellOn}{vocalBusy?" + VOCAL":""}</b></header><div className="bank-pads">{cellDefs.map(cellPad)}{extraPad(vocal20)}</div></section>
      <section className="console-bank bank-live"><header className="bank-head"><span>LIVE · BOOSTED</span><b>{liveOn}/{liveDefs.length}</b></header><div className="bank-pads">{liveDefs.map(extraPad)}</div></section>
      <section className="console-bank bank-fx"><header className="bank-head"><span>FX · BOOSTED ONE-SHOT</span><b>{fxBusy?"BUSY":"READY"}</b></header><div className="bank-pads">{fxDefs.map(extraPad)}</div></section>
    </section>

    <footer className="console-status"><span className={`run-light ${state.running?"on":""}`}/><b>{state.running?"RUNNING":"STOPPED"}</b><p>{msg}</p><span className="console-rule">20F VOCAL · 8 BAR SPOTLIGHT</span></footer>
  </main>;
}
