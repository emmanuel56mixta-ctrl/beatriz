import { useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent } from "react";
import { CELL_DEFINITIONS,RealCellsMixerV308,type CellId,type CellState,type CellStatus } from "@/lab/realCellsMixerV308";
import { EXTRA_DEFINITIONS,PerformanceMixerV308,type ExtraId,type ExtraState,type ExtraStatus } from "@/lab/performanceMixerV308";
import { DEFAULT_MIX,cutoffHz,resonanceQ,type FilterMode,type MixParams } from "@/lab/mixTypesV308";
import { VisualPerformanceV307,type VisualSettings } from "@/lab/visualPerformanceV307";

const blankCells:CellState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:Object.fromEntries(CELL_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as CellState["layers"]};
const blankExtras:ExtraState={ready:false,running:false,message:"EXTRAS READY",error:null,layers:Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF" as const,targetBar:null}])) as ExtraState["layers"]};
const allDefs=[...CELL_DEFINITIONS.map(d=>({...d,origin:"CELL" as const})),...EXTRA_DEFINITIONS.map(d=>({...d,origin:d.kind}))];
const initialMix=Object.fromEntries(allDefs.map(d=>[d.id,{...DEFAULT_MIX,gain:d.origin==="FX"?1.1:1}])) as Record<string,MixParams>;
const quantLabel=(n:number)=>n===1?"1":n===4?"4B":"8B";
const cellStatus=(s:CellStatus,b:number|null)=>s==="ARMED"?`ARM ${b??""}`:s==="DISARMING"?`OUT ${b??""}`:s==="BUILDING"?`BUILD ${b??""}`:s;
const extraStatus=(s:ExtraStatus,b:number|null)=>s==="ARMED"?`ARM ${b??""}`:s==="EXIT"?`OUT ${b??""}`:s;

function Knob({label,value,min=0,max=1,onChange,format}:{label:string;value:number;min?:number;max?:number;onChange:(v:number)=>void;format?:(v:number)=>string}){
  const drag=useRef<{y:number;v:number;id:number}|null>(null);
  const pct=(value-min)/(max-min),angle=-135+pct*270;
  function down(e:PointerEvent<HTMLButtonElement>){e.preventDefault();e.stopPropagation();drag.current={y:e.clientY,v:value,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);}
  function move(e:PointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();onChange(Math.max(min,Math.min(max,d.v+(d.y-e.clientY)*(max-min)/115)));}
  function up(e:PointerEvent<HTMLButtonElement>){if(drag.current?.id===e.pointerId)drag.current=null;e.stopPropagation();}
  return <label className="mini-knob"><button type="button" className="knob-face" style={{"--knob-angle":`${angle}deg`} as CSSProperties} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i/></button><span>{label}</span><b>{format?format(value):Math.round(value*100)}</b></label>;
}

function drawMonitor(canvas:HTMLCanvasElement,cellRef:React.RefObject<RealCellsMixerV308|null>,extraRef:React.RefObject<PerformanceMixerV308|null>){
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const g=canvas.getContext("2d");if(!g)return;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle="#080b0b";g.fillRect(0,0,w,h);
  g.strokeStyle="rgba(255,255,255,.055)";g.lineWidth=1;
  for(let i=1;i<8;i++){const x=w*i/8;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let i=1;i<4;i++){const y=h*i/4;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  const a=cellRef.current?.spectrum()??new Uint8Array(),b=extraRef.current?.spectrum()??new Uint8Array(),bars=72,top=h*.66,maxBin=Math.max(0,Math.max(a.length,b.length)-1);
  for(let i=0;i<bars;i++){const p=i/(bars-1),idx=Math.floor(Math.pow(p,2.15)*maxBin),av=a[idx]??0,bv=b[idx]??0,v=Math.min(255,av*.82+bv*.72),bh=(v/255)*(top-8),x=i*w/bars,bw=Math.max(1,w/bars-1);g.fillStyle=`rgba(129,210,181,${.18+.7*v/255})`;g.fillRect(x,top-bh,bw,bh);}
  const wa=cellRef.current?.waveform()??new Uint8Array(),wb=extraRef.current?.waveform()??new Uint8Array();g.strokeStyle="rgba(238,199,143,.9)";g.lineWidth=1.4;g.beginPath();const y0=h*.82;
  for(let x=0;x<w;x++){const p=x/Math.max(1,w-1),ia=Math.floor(p*Math.max(0,wa.length-1)),ib=Math.floor(p*Math.max(0,wb.length-1)),v=(((wa[ia]??128)-128)+((wb[ib]??128)-128)*.8)/128,y=y0-v*h*.12;if(x===0)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();
  g.fillStyle="rgba(200,198,190,.55)";g.font="7px ui-monospace,monospace";["60","250","1K","4K","16K"].forEach((t,i)=>g.fillText(t,4+i*(w-24)/4,h-5));
}

export function AudioLabBuilderV308(){
  const cellRef=useRef<RealCellsMixerV308|null>(null),extraRef=useRef<PerformanceMixerV308|null>(null),visualRef=useRef<VisualPerformanceV307|null>(null),visualStage=useRef<HTMLDivElement|null>(null),canvasRef=useRef<HTMLCanvasElement|null>(null);
  const prevCell=useRef<Record<string,string>>({}),prevExtra=useRef<Record<string,string>>({});
  const[cells,setCells]=useState<CellState>(blankCells),[extras,setExtras]=useState<ExtraState>(blankExtras),[volume,setVolume]=useState(.82),[mix,setMix]=useState<Record<string,MixParams>>(initialMix),[visuals,setVisuals]=useState<VisualSettings>({enabled:true,intensity:.82,motion:.78,trail:.62});

  useEffect(()=>{const c=new RealCellsMixerV308(setCells),e=new PerformanceMixerV308(setExtras),v=new VisualPerformanceV307();cellRef.current=c;extraRef.current=e;visualRef.current=v;v.bind(visualStage.current);return()=>{c.dispose();e.dispose();v.bind(null);};},[]);
  useEffect(()=>{visualRef.current?.bind(visualStage.current);},[]);
  useEffect(()=>{visualRef.current?.setSettings(visuals);},[visuals]);

  const liveDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="LIVE"),[]),fxDefs=useMemo(()=>EXTRA_DEFINITIONS.filter(d=>d.kind==="FX"),[]),vocal20=EXTRA_DEFINITIONS.find(d=>d.id==="VOCAL20")!;

  useEffect(()=>{CELL_DEFINITIONS.forEach(d=>{const n=cells.layers[d.id].status,p=prevCell.current[d.id];if((n==="ON"&&p!=="ON")||(n==="BUILDING"&&p!=="BUILDING"))visualRef.current?.trigger(d.id);prevCell.current[d.id]=n;});},[cells.layers]);
  useEffect(()=>{EXTRA_DEFINITIONS.forEach(d=>{const n=extras.layers[d.id].status,p=prevExtra.current[d.id];if((n==="ON"&&p!=="ON")||(n==="PLAYING"&&p!=="PLAYING"))visualRef.current?.trigger(d.id);prevExtra.current[d.id]=n;});},[extras.layers]);

  useEffect(()=>{let raf=0;const loop=()=>{if(canvasRef.current)drawMonitor(canvasRef.current,cellRef,extraRef);raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf);},[]);

  async function start(){await Promise.all([cellRef.current?.prepare(),extraRef.current?.prepare()]);await Promise.all([cellRef.current?.start(),extraRef.current?.start()]);visualRef.current?.trigger("IMPACT");}
  function stop(){cellRef.current?.stop();extraRef.current?.stop();prevCell.current={};prevExtra.current={};}
  function setMaster(v:number){setVolume(v);cellRef.current?.setVolume(v);extraRef.current?.setVolume(v);}
  function updateMix(id:string,patch:Partial<MixParams>){const next={...(mix[id]??DEFAULT_MIX),...patch};setMix(cur=>({...cur,[id]:next}));if(CELL_DEFINITIONS.some(d=>d.id===id))cellRef.current?.setMix(id as CellId,next);else extraRef.current?.setMix(id as ExtraId,next);}
  function armVisual(el:HTMLElement,id:string){visualRef.current?.armButton(el,id);}

  const controls=(id:string)=>{const m=mix[id]??DEFAULT_MIX;return <div className="channel-controls" onClick={e=>e.stopPropagation()}><div className="knob-row"><Knob label="GAIN" value={m.gain} min={0} max={1.5} onChange={v=>updateMix(id,{gain:v})}/><Knob label="CUT" value={m.cutoff} onChange={v=>updateMix(id,{cutoff:v})} format={v=>cutoffHz(v)>=1000?`${(cutoffHz(v)/1000).toFixed(1)}k`:`${Math.round(cutoffHz(v))}`}/><Knob label="Q" value={m.resonance} onChange={v=>updateMix(id,{resonance:v})} format={v=>resonanceQ(v).toFixed(1)}/><Knob label="SEND" value={m.send} onChange={v=>updateMix(id,{send:v})}/></div><div className="filter-modes">{(["LP","BP","HP"] as FilterMode[]).map(mode=><button type="button" key={mode} className={m.mode===mode?"on":""} onClick={()=>updateMix(id,{mode})}>{mode}</button>)}</div></div>;};

  const cellTile=(d:(typeof CELL_DEFINITIONS)[number])=>{const rt=cells.layers[d.id],busy=rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING";return <article className={`channel-tile origin-cell state-${rt.status.toLowerCase()}`} key={d.id}><button type="button" className="channel-trigger" disabled={!cells.running||busy} onClick={e=>{armVisual(e.currentTarget,d.id);cellRef.current?.toggle(d.id)}}><span><i>{quantLabel(d.q)}</i><b>{cellStatus(rt.status,rt.targetBar)}</b></span><strong>{d.label}</strong></button>{controls(d.id)}</article>;};
  const extraTile=(d:(typeof EXTRA_DEFINITIONS)[number])=>{const rt=extras.layers[d.id],busy=rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT";return <article className={`channel-tile origin-${d.kind.toLowerCase()} state-${rt.status.toLowerCase()}`} key={d.id}><button type="button" className="channel-trigger" disabled={!cells.running||busy} onClick={e=>{armVisual(e.currentTarget,d.id);extraRef.current?.toggle(d.id)}}><span><i>{quantLabel(d.q)}</i><b>{extraStatus(rt.status,rt.targetBar)}</b></span><strong>{d.label}</strong></button>{controls(d.id)}</article>;};

  const cellOn=CELL_DEFINITIONS.filter(d=>d.id!=="BUILD"&&cells.layers[d.id].status==="ON").length,liveOn=liveDefs.filter(d=>extras.layers[d.id].status==="ON").length,fxBusy=fxDefs.filter(d=>extras.layers[d.id].status!=="OFF").length,msg=extras.message!=="EXTRAS READY"?extras.message:(cells.error??extras.error??cells.message);

  return <main className="mixer308-shell"><header className="mixer308-top"><div className="mixer308-brand"><strong>BEATRIS</strong><span>v0.30.8 MIXER</span></div><div className="mixer308-clock"><b>124 BPM</b><span>BAR {cells.bar}</span><span>BEAT {cells.beat}</span><div>{[1,2,3,4].map(n=><i key={n} className={cells.beat===n?"on":""}/>)}</div></div><div className="mixer308-global"><button type="button" className={visuals.enabled?"vis-on":""} onClick={()=>setVisuals(v=>({...v,enabled:!v.enabled}))}>VIS</button><label>VIS INT<input type="range" min="0" max="1" step=".01" value={visuals.intensity} onChange={e=>setVisuals(v=>({...v,intensity:Number(e.target.value)}))}/></label>{!cells.running?<button type="button" className="start308" disabled={cells.loading} onClick={()=>void start()}>{cells.loading?"LOADING":"START"}</button>:<button type="button" className="reset308" onClick={stop}>RESET</button>}<label>MASTER<input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setMaster(Number(e.target.value))}/></label></div></header>
    <section className="monitor308"><div className="spectrum308"><canvas ref={canvasRef}/></div><div className="visual-monitor308"><div className="visual-stage" ref={visualStage} aria-hidden="true"><div className="visual-grid-lines"/><div className="visual-vignette"/></div></div></section>
    <section className="banks308"><section className="bank308 cell-bank"><header><span>REAL CELLS</span><b>{cellOn}</b></header><div>{CELL_DEFINITIONS.map(cellTile)}{extraTile(vocal20)}</div></section><section className="bank308 live-bank"><header><span>LIVE</span><b>{liveOn}/{liveDefs.length}</b></header><div>{liveDefs.map(extraTile)}</div></section><section className="bank308 fx-bank"><header><span>FX · ONE SHOT</span><b>{fxBusy?"BUSY":"READY"}</b></header><div>{fxDefs.map(extraTile)}</div></section></section>
    <footer className="mixer308-status"><i className={cells.running?"on":""}/><b>{cells.running?"RUN":"STOP"}</b><p>{msg}</p><span>GAIN · CUT · Q · SEND · LP/BP/HP PER CHANNEL</span></footer></main>;
}
