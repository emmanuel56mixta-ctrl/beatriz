import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { LAYER_DEFINITIONS, QuantizedLayerBuilderV304, type BuilderState, type LayerId, type LayerStatus } from "@/lab/quantizedBuilderV304";
import { EXTRA_DEFINITIONS, PerformanceExtrasV306, type ExtraId, type ExtraState, type ExtraStatus } from "@/lab/performanceExtrasV306";
import { VisualPerformanceV307, type VisualSettings } from "@/lab/visualPerformanceV307";

const blankLayers=Object.fromEntries(LAYER_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as BuilderState["layers"];
const blankState:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:blankLayers};
const blankExtras:ExtraState={ready:false,running:false,message:"EXTRAS READY",layers:Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as ExtraState["layers"]};
const q=(bars:number)=>bars===1?"NEXT 1":bars===4?"4 BAR":"8 BAR";
const ls=(status:LayerStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="DISARMING"?`EXIT · ${target??"—"}`:status==="BUILDING"?`BUILD → ${target??"—"}`:status;
const es=(status:ExtraStatus,target:number|null)=>status==="ARMED"?`ARMED · ${target??"—"}`:status==="EXIT"?`EXIT · ${target??"—"}`:status;

export function AudioLabBuilderV307(){
  const baseRef=useRef<QuantizedLayerBuilderV304|null>(null);
  const extraRef=useRef<PerformanceExtrasV306|null>(null);
  const visualRef=useRef<VisualPerformanceV307|null>(null);
  const visualStageRef=useRef<HTMLDivElement|null>(null);
  const prevBase=useRef<Record<string,string>>({});
  const prevExtras=useRef<Record<string,string>>({});
  const[state,setState]=useState<BuilderState>(blankState);
  const[extras,setExtras]=useState<ExtraState>(blankExtras);
  const[volume,setVolume]=useState(.82);
  const[visuals,setVisuals]=useState<VisualSettings>({enabled:true,intensity:.82,motion:.78,trail:.62});

  useEffect(()=>{
    const base=new QuantizedLayerBuilderV304(setState);
    const extra=new PerformanceExtrasV306(setExtras);
    const visual=new VisualPerformanceV307();
    baseRef.current=base;extraRef.current=extra;visualRef.current=visual;
    visual.bind(visualStageRef.current);
    return()=>{base.dispose();extra.dispose();visual.bind(null);baseRef.current=null;extraRef.current=null;visualRef.current=null;};
  },[]);

  useEffect(()=>{visualRef.current?.bind(visualStageRef.current);},[]);
  useEffect(()=>{visualRef.current?.setSettings(visuals);},[visuals]);

  const cellDefs=useMemo(()=>LAYER_DEFINITIONS.filter(d=>d.origin==="CELL"),[]);
  const vocal20=EXTRA_DEFINITIONS.find(d=>d.id==="VOCAL20")!;
  const liveDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="LIVE"),[]);
  const fxDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="FX"),[]);

  useEffect(()=>{
    for(const def of cellDefs){
      const next=state.layers[def.id].status;
      const prev=prevBase.current[def.id];
      if((next==="ON"&&prev!=="ON")||(next==="BUILDING"&&prev!=="BUILDING"))visualRef.current?.trigger(def.id);
      prevBase.current[def.id]=next;
    }
  },[cellDefs,state.layers]);

  useEffect(()=>{
    for(const def of EXTRA_DEFINITIONS){
      const next=extras.layers[def.id].status;
      const prev=prevExtras.current[def.id];
      if((next==="ON"&&prev!=="ON")||(next==="PLAYING"&&prev!=="PLAYING"))visualRef.current?.trigger(def.id);
      prevExtras.current[def.id]=next;
    }
  },[extras.layers]);

  async function start(){
    await Promise.all([baseRef.current?.prepare(),extraRef.current?.prepare()]);
    await Promise.all([baseRef.current?.start(),extraRef.current?.start()]);
    visualRef.current?.trigger("IMPACT");
  }
  function stop(){baseRef.current?.stop();extraRef.current?.stop();prevBase.current={};prevExtras.current={};}
  function setMaster(v:number){setVolume(v);baseRef.current?.setVolume(v);extraRef.current?.setVolume(v);}
  function setVisual<K extends keyof VisualSettings>(key:K,value:VisualSettings[K]){setVisuals(cur=>({...cur,[key]:value}));}
  function armVisual(event:MouseEvent<HTMLButtonElement>,id:string){visualRef.current?.armButton(event.currentTarget,id);}

  const cellPad=(def:(typeof LAYER_DEFINITIONS)[number])=>{
    const rt=state.layers[def.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";
    return <button type="button" key={def.id} data-visual={def.id} className={`mix-pad origin-cell state-${rt.status.toLowerCase()} ${def.id==="BUILD"?"build-pad":""}`} disabled={!state.running||busy} onClick={event=>{armVisual(event,def.id);baseRef.current?.toggle(def.id as LayerId);}} title={def.description}><span className="pad-top"><i>{q(def.quantizeBars)}</i><b>{ls(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong><small className="visual-tag">VIS · {def.id}</small></button>;
  };

  const extraPad=(def:(typeof EXTRA_DEFINITIONS)[number])=>{
    const rt=extras.layers[def.id],busy=rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT";
    return <button type="button" key={def.id} data-visual={def.id} className={`mix-pad origin-${def.kind.toLowerCase()} state-${rt.status.toLowerCase()} ${def.id==="VOCAL20"?"vocal20-pad":""}`} disabled={!state.running||busy} onClick={event=>{armVisual(event,def.id);extraRef.current?.toggle(def.id as ExtraId);}} title={def.note}><span className="pad-top"><i>{q(def.q)}</i><b>{es(rt.status,rt.targetBar)}</b></span><strong>{def.label}</strong><small className="visual-tag">VIS · {def.id}</small></button>;
  };

  const cellOn=cellDefs.filter(d=>d.id!=="BUILD"&&state.layers[d.id].status==="ON").length;
  const liveOn=liveDefs.filter(d=>extras.layers[d.id].status==="ON").length;
  const fxBusy=fxDefs.filter(d=>extras.layers[d.id].status!=="OFF").length;
  const vocalBusy=extras.layers.VOCAL20.status!=="OFF";
  const msg=extras.message!=="EXTRAS READY"?extras.message:(state.error??state.message);

  return <main className={`console-shell visual-console ${visuals.enabled?"visuals-on":"visuals-off"}`}>
    <div className="visual-stage" ref={visualStageRef} aria-hidden="true"><div className="visual-grid-lines"/><div className="visual-vignette"/></div>

    <header className="console-topbar">
      <div className="console-brand"><span>BEATRIS</span><b>v0.30.7 · ANIME.JS</b></div>
      <div className="console-clock"><span>124 BPM</span><b>BAR {state.bar}</b><b>BEAT {state.beat}</b><div className="console-beats">{[1,2,3,4].map(beat=><i key={beat} className={beat===state.beat?"on":""}/>)}</div></div>
      <div className="visual-controls">
        <button type="button" className={`visual-toggle ${visuals.enabled?"on":""}`} onClick={()=>setVisual("enabled",!visuals.enabled)}>VIS {visuals.enabled?"ON":"OFF"}</button>
        <label><span>INT</span><input type="range" min="0" max="1" step="0.01" value={visuals.intensity} onChange={e=>setVisual("intensity",Number(e.target.value))}/></label>
        <label><span>MOTION</span><input type="range" min="0" max="1" step="0.01" value={visuals.motion} onChange={e=>setVisual("motion",Number(e.target.value))}/></label>
        <label><span>TRAIL</span><input type="range" min="0" max="1" step="0.01" value={visuals.trail} onChange={e=>setVisual("trail",Number(e.target.value))}/></label>
      </div>
      <div className="console-transport">{!state.running?<button type="button" className="transport-main" disabled={state.loading} onClick={()=>void start()}>{state.loading?"LOADING…":"START BASE"}</button>:<button type="button" className="transport-stop" onClick={stop}>RESET</button>}<label className="console-volume"><span>VOL</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setMaster(Number(e.target.value))}/></label></div>
    </header>

    <section className="console-workspace">
      <section className="console-bank bank-cell"><header className="bank-head"><span>REAL CELLS</span><b>{cellOn}{vocalBusy?" + VOCAL":""}</b></header><div className="bank-pads">{cellDefs.map(cellPad)}{extraPad(vocal20)}</div></section>
      <section className="console-bank bank-live"><header className="bank-head"><span>LIVE · VISUAL SIGNATURES</span><b>{liveOn}/{liveDefs.length}</b></header><div className="bank-pads">{liveDefs.map(extraPad)}</div></section>
      <section className="console-bank bank-fx"><header className="bank-head"><span>FX · AUDIO + VISUAL</span><b>{fxBusy?"BUSY":"READY"}</b></header><div className="bank-pads">{fxDefs.map(extraPad)}</div></section>
    </section>

    <footer className="console-status"><span className={`run-light ${state.running?"on":""}`}/><b>{state.running?"RUNNING":"STOPPED"}</b><p>{msg}</p><span className="console-rule">AUDIO QUANTIZED · VISUAL ON ACTUAL ENTRY</span></footer>
  </main>;
}
