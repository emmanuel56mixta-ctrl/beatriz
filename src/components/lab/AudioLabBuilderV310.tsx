import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CELL_DEFINITIONS, RealCellsMixerV308, type CellId, type CellState, type CellStatus } from "@/lab/realCellsMixerV308";
import { EXTRA_DEFINITIONS, PerformanceMixerV308, type ExtraId, type ExtraState, type ExtraStatus } from "@/lab/performanceMixerV308";
import { CambridgeSetMixerV310, type ExternalChannelStatus, type ExternalSetState } from "@/lab/cambridgeSetMixerV310";
import { EXTERNAL_ROLES, EXTERNAL_SETS, type ExternalRole, type ExternalSetId } from "@/lab/externalSetsV310";
import { DEFAULT_MIX, hpfHz, lpfHz, resonanceQ, type MixParams } from "@/lab/mixTypesV308";
import { VisualPerformanceV307, type VisualSettings } from "@/lab/visualPerformanceV307";

const blankCells: CellState = { ready:false, loading:false, running:false, bar:1, beat:1, phase:0, message:"START BASE", error:null, layers:Object.fromEntries(CELL_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as CellState["layers"] };
const blankExtras: ExtraState = { ready:false, running:false, message:"EXTRAS READY", error:null, layers:Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as ExtraState["layers"] };
const blankExternal: ExternalSetState = { ready:false, loading:false, running:false, setId:null, sourceBpm:124, bar:1, beat:1, message:"SELECT SET", error:null, channels:Object.fromEntries(EXTERNAL_ROLES.map(d=>[d.id,{status:"OFF" as const,targetBar:null,count:0}])) as ExternalSetState["channels"] };
const allIds = [...CELL_DEFINITIONS.map(d=>d.id), ...EXTRA_DEFINITIONS.map(d=>d.id), ...EXTERNAL_ROLES.map(d=>d.id)];
const initialMix = Object.fromEntries(allIds.map(id=>[id,{...DEFAULT_MIX,gain:EXTRA_DEFINITIONS.find(d=>d.id===id)?.kind==="FX"?1.15:1}])) as Record<string,MixParams>;
const quantLabel=(n:number)=>n===1?"1":n===4?"4B":"8B";
const cellStatus=(s:CellStatus,b:number|null)=>s==="ARMED"?`ARM ${b??""}`:s==="DISARMING"?`OUT ${b??""}`:s==="BUILDING"?`BUILD ${b??""}`:s;
const extraStatus=(s:ExtraStatus,b:number|null)=>s==="ARMED"?`ARM ${b??""}`:s==="EXIT"?`OUT ${b??""}`:s;
const externalStatus=(s:ExternalChannelStatus,b:number|null)=>s==="ARMED"?`ARM ${b??""}`:s==="EXIT"?`OUT ${b??""}`:s;
const fmtHz=(v:number)=>v>=1000?`${(v/1000).toFixed(v>=10000?0:1)}k`:`${Math.round(v)}`;
const visualRole:Record<ExternalRole,string>={KICK:"IMPACT",SNARE:"GHOST",HATS:"SHAKER",PERC:"PERC",BASS:"CLUB",MUSIC:"CHORDS",VOCAL:"VOCAL",FX:"SWEEP"};

type MusicAnalyser={spectrum:()=>Uint8Array;waveform:()=>Uint8Array};

function Knob({label,value,min=0,max=1,onChange,format}:{label:string;value:number;min?:number;max?:number;onChange:(v:number)=>void;format?:(v:number)=>string}){
  const drag=useRef<{y:number;v:number;id:number}|null>(null);
  const pct=(value-min)/(max-min),angle=-135+pct*270;
  function down(e:PointerEvent<HTMLButtonElement>){e.preventDefault();e.stopPropagation();drag.current={y:e.clientY,v:value,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}
  function move(e:PointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();onChange(Math.max(min,Math.min(max,d.v+(d.y-e.clientY)*(max-min)/115)));}
  function up(e:PointerEvent<HTMLButtonElement>){if(drag.current?.id===e.pointerId)drag.current=null;e.stopPropagation();}
  return <label className="mini-knob"><button type="button" className="knob-face" style={{"--knob-angle":`${angle}deg`} as CSSProperties} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i/></button><span>{label}</span><b>{format?format(value):Math.round(value*100)}</b></label>;
}

function drawMonitor(canvas:HTMLCanvasElement,music:MusicAnalyser|null,extra:PerformanceMixerV308|null){
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const g=canvas.getContext("2d");if(!g)return;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle="#080b0b";g.fillRect(0,0,w,h);g.strokeStyle="rgba(255,255,255,.055)";g.lineWidth=1;
  for(let i=1;i<8;i++){const x=w*i/8;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}for(let i=1;i<4;i++){const y=h*i/4;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  const a=music?.spectrum()??new Uint8Array(),b=extra?.spectrum()??new Uint8Array(),bars=72,top=h*.66,maxBin=Math.max(0,Math.max(a.length,b.length)-1);
  for(let i=0;i<bars;i++){const p=i/(bars-1),idx=Math.floor(Math.pow(p,2.15)*maxBin),av=a[idx]??0,bv=b[idx]??0,v=Math.min(255,av*.82+bv*.72),bh=(v/255)*(top-8),x=i*w/bars,bw=Math.max(1,w/bars-1);g.fillStyle=`rgba(129,210,181,${.18+.7*v/255})`;g.fillRect(x,top-bh,bw,bh);}
  const wa=music?.waveform()??new Uint8Array(),wb=extra?.waveform()??new Uint8Array();g.strokeStyle="rgba(238,199,143,.9)";g.lineWidth=1.4;g.beginPath();const y0=h*.82;
  for(let x=0;x<w;x++){const p=x/Math.max(1,w-1),ia=Math.floor(p*Math.max(0,wa.length-1)),ib=Math.floor(p*Math.max(0,wb.length-1)),v=(((wa[ia]??128)-128)+((wb[ib]??128)-128)*.8)/128,y=y0-v*h*.12;if(x===0)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();g.fillStyle="rgba(200,198,190,.55)";g.font="7px ui-monospace,monospace";["60","250","1K","4K","16K"].forEach((t,i)=>g.fillText(t,4+i*(w-24)/4,h-5));
}

export function AudioLabBuilderV310(){
  const coreRef=useRef<RealCellsMixerV308|null>(null),externalRef=useRef<CambridgeSetMixerV310|null>(null),extraRef=useRef<PerformanceMixerV308|null>(null),visualRef=useRef<VisualPerformanceV307|null>(null),visualStage=useRef<HTMLDivElement|null>(null),canvasRef=useRef<HTMLCanvasElement|null>(null);
  const prevCore=useRef<Record<string,string>>({}),prevExternal=useRef<Record<string,string>>({}),prevExtra=useRef<Record<string,string>>({});
  const[cells,setCells]=useState<CellState>(blankCells),[external,setExternal]=useState<ExternalSetState>(blankExternal),[extras,setExtras]=useState<ExtraState>(blankExtras),[selected,setSelected]=useState<"CORE"|ExternalSetId>("CORE"),[volume,setVolume]=useState(.82),[mix,setMix]=useState<Record<string,MixParams>>(initialMix),[visuals,setVisuals]=useState<VisualSettings>({enabled:true,intensity:.82,motion:.78,trail:.62});

  useEffect(()=>{const core=new RealCellsMixerV308(setCells),ext=new CambridgeSetMixerV310(setExternal),extra=new PerformanceMixerV308(setExtras),visual=new VisualPerformanceV307();coreRef.current=core;externalRef.current=ext;extraRef.current=extra;visualRef.current=visual;visual.bind(visualStage.current);return()=>{core.dispose();ext.dispose();extra.dispose();visual.bind(null);};},[]);
  useEffect(()=>{visualRef.current?.bind(visualStage.current);},[]);
  useEffect(()=>{visualRef.current?.setSettings(visuals);},[visuals]);

  const liveDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="LIVE"),[]),fxDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="FX"),[]);

  useEffect(()=>{if(selected!=="CORE")return;CELL_DEFINITIONS.forEach(d=>{const n=cells.layers[d.id].status,p=prevCore.current[d.id];if((n==="ON"&&p!=="ON")||(n==="BUILDING"&&p!=="BUILDING"))visualRef.current?.trigger(d.id);prevCore.current[d.id]=n;});},[cells.layers,selected]);
  useEffect(()=>{if(selected==="CORE")return;EXTERNAL_ROLES.forEach(d=>{const n=external.channels[d.id].status,p=prevExternal.current[d.id];if(n==="ON"&&p!=="ON")visualRef.current?.trigger(visualRole[d.id]);prevExternal.current[d.id]=n;});},[external.channels,selected]);
  useEffect(()=>{EXTRA_DEFINITIONS.forEach(d=>{const n=extras.layers[d.id].status,p=prevExtra.current[d.id];if((n==="ON"&&p!=="ON")||(n==="PLAYING"&&p!=="PLAYING"))visualRef.current?.trigger(d.id);prevExtra.current[d.id]=n;});},[extras.layers]);
  useEffect(()=>{let raf=0;const loop=()=>{const music=selected==="CORE"?coreRef.current:externalRef.current;if(canvasRef.current)drawMonitor(canvasRef.current,music,extraRef.current);raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf);},[selected]);

  async function chooseSet(value:"CORE"|ExternalSetId){stop();setSelected(value);prevCore.current={};prevExternal.current={};if(value!=="CORE")await externalRef.current?.loadSet(value);}
  async function start(){if(selected==="CORE"){await Promise.all([coreRef.current?.prepare(),extraRef.current?.prepare()]);await Promise.all([coreRef.current?.start(),extraRef.current?.start()]);}else{await externalRef.current?.loadSet(selected);await extraRef.current?.prepare();await Promise.all([externalRef.current?.start(),extraRef.current?.start()]);}visualRef.current?.trigger("IMPACT");}
  function stop(){coreRef.current?.stop();externalRef.current?.stop();extraRef.current?.stop();prevCore.current={};prevExternal.current={};prevExtra.current={};}
  function setMaster(v:number){setVolume(v);coreRef.current?.setVolume(v);externalRef.current?.setVolume(v);extraRef.current?.setVolume(v);}
  function updateMix(id:string,patch:Partial<MixParams>){const next={...(mix[id]??DEFAULT_MIX),...patch};setMix(cur=>({...cur,[id]:next}));if(selected!=="CORE"&&EXTERNAL_ROLES.some(d=>d.id===id))externalRef.current?.setMix(id as ExternalRole,next);else if(CELL_DEFINITIONS.some(d=>d.id===id))coreRef.current?.setMix(id as CellId,next);else extraRef.current?.setMix(id as ExtraId,next);}
  function armVisual(el:HTMLElement,id:string){visualRef.current?.armButton(el,id);}

  const controls=(id:string)=>{const m=mix[id]??DEFAULT_MIX;return <div className="channel-controls" onClick={e=>e.stopPropagation()}><div className="knob-row"><Knob label="GAIN" value={m.gain} min={0} max={1.8} onChange={v=>updateMix(id,{gain:v})} format={v=>`${Math.round(v*100)}%`}/><Knob label="HPF" value={m.hpf} onChange={v=>updateMix(id,{hpf:v})} format={v=>fmtHz(hpfHz(v))}/><Knob label="LPF" value={m.lpf} onChange={v=>updateMix(id,{lpf:v})} format={v=>fmtHz(lpfHz(v))}/><Knob label="RESO" value={m.resonance} onChange={v=>updateMix(id,{resonance:v})} format={v=>resonanceQ(v).toFixed(1)}/></div></div>;};
  const cellTile=(d:(typeof CELL_DEFINITIONS)[number])=>{const rt=cells.layers[d.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";return <article className={`channel-tile origin-cell state-${rt.status.toLowerCase()}`} key={d.id}><button type="button" className="channel-trigger" disabled={!cells.running||busy} onClick={e=>{armVisual(e.currentTarget,d.id);coreRef.current?.toggle(d.id)}}><span><i>{quantLabel(d.q)}</i><b>{cellStatus(rt.status,rt.targetBar)}</b></span><strong>{d.label}</strong></button>{controls(d.id)}</article>;};
  const externalTile=(d:(typeof EXTERNAL_ROLES)[number])=>{const rt=external.channels[d.id],busy=rt.status==="ARMED"||rt.status==="EXIT",empty=!rt.count;return <article className={`channel-tile origin-cell external-channel state-${rt.status.toLowerCase()} ${empty?"empty-channel":""}`} key={d.id}><button type="button" className="channel-trigger" disabled={!external.running||busy||empty} onClick={e=>{armVisual(e.currentTarget,visualRole[d.id]);externalRef.current?.toggle(d.id)}}><span><i>{quantLabel(d.q)}</i><b>{empty?"—":externalStatus(rt.status,rt.targetBar)}</b></span><strong>{d.label}</strong><small>{rt.count?`${rt.count} STEM${rt.count===1?"":"S"}`:"NO STEM"}</small></button>{controls(d.id)}</article>;};
  const extraTile=(d:(typeof EXTRA_DEFINITIONS)[number])=>{const rt=extras.layers[d.id],busy=rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT";return <article className={`channel-tile origin-${d.kind.toLowerCase()} state-${rt.status.toLowerCase()}`} key={d.id}><button type="button" className="channel-trigger" disabled={!(selected==="CORE"?cells.running:external.running)||busy} onClick={e=>{armVisual(e.currentTarget,d.id);extraRef.current?.toggle(d.id)}}><span><i>{quantLabel(d.q)}</i><b>{extraStatus(rt.status,rt.targetBar)}</b></span><strong>{d.label}</strong></button>{controls(d.id)}</article>;};

  const running=selected==="CORE"?cells.running:external.running,loading=selected==="CORE"?cells.loading:external.loading,bar=selected==="CORE"?cells.bar:external.bar,beat=selected==="CORE"?cells.beat:external.beat;
  const coreOn=CELL_DEFINITIONS.filter(d=>d.id!=="BUILD"&&cells.layers[d.id].status==="ON").length,externalOn=EXTERNAL_ROLES.filter(d=>external.channels[d.id].status==="ON").length,liveOn=liveDefs.filter(d=>extras.layers[d.id].status==="ON").length,fxBusy=fxDefs.filter(d=>extras.layers[d.id].status!=="OFF").length;
  const setMeta=selected==="CORE"?null:EXTERNAL_SETS.find(s=>s.id===selected)!;
  const msg=loading?external.message:(selected==="CORE"?(cells.error??extras.error??cells.message):(external.error??extras.error??external.message));

  return <main className="mixer308-shell mixer310-shell"><header className="mixer308-top"><div className="mixer308-brand"><strong>BEATRIS</strong><span>v0.31 · MULTITRACK SETS</span></div><div className="mixer308-clock"><select className="set310-select" value={selected} disabled={loading} onChange={e=>void chooseSet(e.target.value as "CORE"|ExternalSetId)}><option value="CORE">CORE</option>{EXTERNAL_SETS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select><b>124 BPM</b>{setMeta?<em className="source-bpm">SRC ~{external.sourceBpm.toFixed(1)}</em>:null}<span>BAR {bar}</span><span>BEAT {beat}</span><div>{[1,2,3,4].map(n=><i key={n} className={beat===n?"on":""}/>)}</div></div><div className="mixer308-global"><button type="button" className={visuals.enabled?"vis-on":""} onClick={()=>setVisuals(v=>({...v,enabled:!v.enabled}))}>VIS</button><label>VIS INT<input type="range" min="0" max="1" step=".01" value={visuals.intensity} onChange={e=>setVisuals(v=>({...v,intensity:Number(e.target.value)}))}/></label>{!running?<button type="button" className="start308" disabled={loading||(selected!=="CORE"&&!external.ready)} onClick={()=>void start()}>{loading?"LOADING SET":"START"}</button>:<button type="button" className="reset308" onClick={stop}>RESET</button>}<label>MASTER<input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setMaster(Number(e.target.value))}/></label></div></header>
    <section className="monitor308"><div className="spectrum308"><canvas ref={canvasRef}/></div><div className="visual-monitor308"><div className="visual-stage" ref={visualStage} aria-hidden="true"><div className="visual-grid-lines"/><div className="visual-vignette"/></div></div></section>
    <section className="banks308"><section className="bank308 cell-bank"><header><span>{selected==="CORE"?"REAL CELLS":setMeta?.label}</span><b>{selected==="CORE"?coreOn:`${externalOn} ON · ${setMeta?.genre}`}</b></header><div>{selected==="CORE"?CELL_DEFINITIONS.map(cellTile):EXTERNAL_ROLES.map(externalTile)}</div></section><section className="bank308 live-bank"><header><span>LIVE</span><b>{liveOn}/{liveDefs.length}</b></header><div>{liveDefs.map(extraTile)}</div></section><section className="bank308 fx-bank"><header><span>FX · ONE SHOT</span><b>{fxBusy?"BUSY":"READY"}</b></header><div>{fxDefs.map(extraTile)}</div></section></section>
    <footer className="mixer308-status"><i className={running?"on":""}/><b>{running?"RUN":"STOP"}</b><p>{msg}</p><span>{selected==="CORE"?"CORE PRIVATE STEMS":"CAMBRIDGE-MT · PREVIEW ONLY · SUPPORT = RHYTHM/FX"}</span></footer></main>;
}
