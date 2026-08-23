import { DEFAULT_MIX,filterWindow,resonanceQ,type MixParams } from "./mixTypesV308";

export type CellId="CHORDS"|"RESPONSE"|"MOTIF"|"PERC"|"VOCAL"|"HOOK"|"CLUB"|"BUILD";
export type CellStatus="OFF"|"ARMED"|"ON"|"DISARMING"|"BUILDING";
export type CellRuntime={status:CellStatus;targetBar:number|null};
export type CellState={ready:boolean;loading:boolean;running:boolean;bar:number;beat:number;phase:number;message:string;error:string|null;layers:Record<CellId,CellRuntime>};

type SourceKey="cityDrums"|"cityBass"|"cityOther"|"cityVocals"|"matrodaDrums"|"fingersDrums";
type SourceSpec={path:string;bpm:number;beatOffset:number};
type CellSpec={source:SourceKey;bar:number;bars:number;gain:number};
type CellDef={id:CellId;label:string;q:1|4|8;kind:"add"|"replace"|"build";cells:CellSpec[]};
type Handle={source:AudioBufferSourceNode;sourceGain:GainNode};
type Bus={hpf:BiquadFilterNode;lpf:BiquadFilterNode;gain:GainNode};

const BPM=124,BEAT=60/BPM,BAR=BEAT*4;
const SOURCES:Record<SourceKey,SourceSpec>={
  cityDrums:{path:"stems/city-of-dreams-alt-control-millero/drums.mp3",bpm:124,beatOffset:.021},
  cityBass:{path:"stems/city-of-dreams-alt-control-millero/bass.mp3",bpm:124,beatOffset:.021},
  cityOther:{path:"stems/city-of-dreams-alt-control-millero/other.mp3",bpm:124,beatOffset:.021},
  cityVocals:{path:"stems/city-of-dreams-alt-control-millero/vocals.mp3",bpm:124,beatOffset:.021},
  matrodaDrums:{path:"stems/bullshit-matroda-klp/drums.mp3",bpm:130,beatOffset:.0246},
  fingersDrums:{path:"stems/20-fingers-putang-ina-mo/drums.mp3",bpm:131,beatOffset:.3084},
};

export const CELL_DEFINITIONS:CellDef[]=[
  {id:"CHORDS",label:"+ CHORDS",q:4,kind:"add",cells:[{source:"cityOther",bar:40,bars:4,gain:.27}]},
  {id:"RESPONSE",label:"+ RESPONSE",q:4,kind:"add",cells:[{source:"cityOther",bar:64,bars:4,gain:.20}]},
  {id:"MOTIF",label:"+ MOTIF",q:8,kind:"add",cells:[{source:"cityOther",bar:80,bars:4,gain:.20}]},
  {id:"PERC",label:"+ PERC MP3",q:1,kind:"add",cells:[{source:"fingersDrums",bar:48,bars:4,gain:.15}]},
  {id:"VOCAL",label:"+ VOCAL CITY",q:8,kind:"add",cells:[{source:"cityVocals",bar:48,bars:4,gain:.34}]},
  {id:"HOOK",label:"+ HOOK",q:4,kind:"add",cells:[{source:"cityOther",bar:96,bars:4,gain:.20}]},
  {id:"CLUB",label:"CLUB KIT",q:4,kind:"replace",cells:[{source:"matrodaDrums",bar:64,bars:4,gain:.78}]},
  {id:"BUILD",label:"BUILD → DROP",q:4,kind:"build",cells:[{source:"matrodaDrums",bar:48,bars:4,gain:.82},{source:"cityOther",bar:72,bars:4,gain:.24}]},
];

const BASE_DRUM:CellSpec={source:"cityDrums",bar:32,bars:4,gain:.68};
const BASE_BASS:CellSpec={source:"cityBass",bar:32,bars:4,gain:.42};
const blank=()=>Object.fromEntries(CELL_DEFINITIONS.map(d=>[d.id,{status:"OFF",targetBar:null}])) as Record<CellId,CellRuntime>;

export class RealCellsMixerV308{
  private ctx:AudioContext|null=null;
  private masterBus:GainNode|null=null;
  private output:GainNode|null=null;
  private analyser:AnalyserNode|null=null;
  private buffers=new Map<SourceKey,AudioBuffer>();
  private buses=new Map<CellId,Bus>();
  private mix=new Map<CellId,MixParams>();
  private loops=new Map<CellId,Handle[]>();
  private baseDrum:Handle|null=null;
  private baseBass:Handle|null=null;
  private timers=new Set<number>();
  private clock:number|null=null;
  private startAt=0;
  private volume=.82;
  private onState:(s:CellState)=>void;
  state:CellState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"START BASE",error:null,layers:blank()};

  constructor(onState:(s:CellState)=>void){this.onState=onState;CELL_DEFINITIONS.forEach(d=>this.mix.set(d.id,{...DEFAULT_MIX}));}
  private emit(p?:Partial<CellState>){if(p)this.state={...this.state,...p};this.onState({...this.state,layers:{...this.state.layers}});}
  private patch(id:CellId,p:Partial<CellRuntime>){this.state={...this.state,layers:{...this.state.layers,[id]:{...this.state.layers[id],...p}}};this.emit();}

  async prepare(){if(this.state.ready||this.state.loading)return;this.emit({loading:true,error:null,message:"LOADING REAL CELLS…"});try{
    const Ctor=window.AudioContext??(window as unknown as{webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Ctor)throw new Error("Web Audio no disponible");
    const c=new Ctor({latencyHint:"interactive"});this.ctx=c;
    const master=c.createGain(),analyser=c.createAnalyser(),output=c.createGain();analyser.fftSize=512;analyser.smoothingTimeConstant=.72;output.gain.value=this.volume;master.connect(analyser).connect(output).connect(c.destination);this.masterBus=master;this.analyser=analyser;this.output=output;
    CELL_DEFINITIONS.forEach(d=>this.makeBus(d.id));
    const keys=[...new Set([BASE_DRUM,BASE_BASS,...CELL_DEFINITIONS.flatMap(d=>d.cells)].map(c=>c.source))];await Promise.all(keys.map(k=>this.load(k)));await c.resume();this.emit({ready:true,loading:false,message:"REAL CELLS READY"});
  }catch(e){this.emit({loading:false,error:e instanceof Error?e.message:"No se pudieron cargar las células"});}}

  private makeBus(id:CellId){if(!this.ctx||!this.masterBus)return;const hpf=this.ctx.createBiquadFilter(),lpf=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();hpf.type="highpass";lpf.type="lowpass";hpf.connect(lpf).connect(gain).connect(this.masterBus);this.buses.set(id,{hpf,lpf,gain});this.applyBus(id,true);}
  private applyBus(id:CellId,immediate=false){const c=this.ctx,b=this.buses.get(id),m=this.mix.get(id);if(!c||!b||!m)return;const t=c.currentTime,tc=immediate?.001:.025,{hp,lp}=filterWindow(m),q=resonanceQ(m.resonance);b.hpf.frequency.setTargetAtTime(hp,t,tc);b.lpf.frequency.setTargetAtTime(lp,t,tc);b.hpf.Q.setTargetAtTime(Math.max(.7,q*.55),t,tc);b.lpf.Q.setTargetAtTime(q,t,tc);b.gain.gain.setTargetAtTime(m.gain,t,tc);}
  setMix(id:CellId,next:MixParams){this.mix.set(id,{...next});this.applyBus(id);}
  getMix(id:CellId){return {...(this.mix.get(id)??DEFAULT_MIX)};}

  private async load(key:SourceKey){if(this.buffers.has(key))return;const spec=SOURCES[key],r=await fetch(`/api/stem?path=${encodeURIComponent(spec.path)}`,{cache:"force-cache"});if(!r.ok)throw new Error(`Stem ${key} ${r.status}`);const bytes=await r.arrayBuffer();if(!this.ctx)throw new Error("Audio context missing");this.buffers.set(key,await this.ctx.decodeAudioData(bytes));}

  async start(){await this.prepare();const c=this.ctx;if(!c||!this.state.ready||this.state.running)return;await c.resume();this.cancel();this.stopSources();this.state={...this.state,running:true,bar:1,beat:1,phase:0,layers:blank(),error:null};this.startAt=c.currentTime+.18;this.baseDrum=this.startBase(BASE_DRUM,this.startAt);this.baseBass=this.startBase(BASE_BASS,this.startAt);this.startClock();this.emit({message:"BASE ON"});}
  stop(){this.cancel();this.stopSources();if(this.clock!=null)window.clearInterval(this.clock);this.clock=null;this.state={...this.state,running:false,bar:1,beat:1,phase:0,layers:blank()};this.emit({message:"STOPPED"});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;this.buffers.clear();this.buses.clear();}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));if(this.ctx&&this.output)this.output.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.02);}

  toggle(id:CellId){if(!this.ctx||!this.state.running)return;const d=CELL_DEFINITIONS.find(x=>x.id===id)!,rt=this.state.layers[id];if(rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING")return;if(d.kind==="build"){if(rt.status==="OFF")this.armBuild(d);return;}if(rt.status==="OFF")this.armOn(d);else if(rt.status==="ON")this.armOff(d);}
  private armOn(d:CellDef){const bar=this.nextBoundary(d.q),when=this.timeForBar(bar);this.patch(d.id,{status:"ARMED",targetBar:bar+1});this.at(when,()=>{if(!this.state.running)return;this.activate(d,when);this.patch(d.id,{status:"ON",targetBar:null});this.emit({message:`${d.id} ON · BAR ${bar+1}`});});}
  private activate(d:CellDef,when:number){const bus=this.buses.get(d.id)!;const m=this.mix.get(d.id)!;bus.gain.gain.cancelScheduledValues(when);bus.gain.gain.setValueAtTime(.0001,Math.max(this.ctx!.currentTime,when-.02));bus.gain.gain.linearRampToValueAtTime(m.gain,when+.08);if(d.kind==="replace")this.fadeHandle(this.baseDrum,0,when,.12);const hs=d.cells.map(c=>this.startCell(c,d.id,when,true));this.loops.set(d.id,hs);}
  private armOff(d:CellDef){const bar=this.nextBoundary(d.q),when=this.timeForBar(bar),bus=this.buses.get(d.id)!;this.patch(d.id,{status:"DISARMING",targetBar:bar+1});bus.gain.gain.cancelScheduledValues(when);bus.gain.gain.setValueAtTime(Math.max(.0001,bus.gain.gain.value),when);bus.gain.gain.linearRampToValueAtTime(.0001,when+.12);if(d.kind==="replace")this.fadeHandle(this.baseDrum,BASE_DRUM.gain,when,.12);this.at(when+.14,()=>{this.stopLayer(d.id);this.patch(d.id,{status:"OFF",targetBar:null});this.applyBus(d.id);});}

  private armBuild(d:CellDef){const bar=this.nextBoundary(4),when=this.timeForBar(bar),end=when+4*BAR;this.patch("BUILD",{status:"ARMED",targetBar:bar+1});this.at(when,()=>{if(!this.state.running)return;this.patch("BUILD",{status:"BUILDING",targetBar:bar+5});this.fadeHandle(this.state.layers.CLUB.status==="ON"?this.loops.get("CLUB")?.[0]??null:this.baseDrum,.22,when,.12);const hs=d.cells.map(c=>this.startCell(c,"BUILD",when,false));this.loops.set("BUILD",hs);this.at(end,()=>{this.stopLayer("BUILD");this.patch("BUILD",{status:"OFF",targetBar:null});this.forceDrop(end);});});}
  private forceDrop(when:number){const club=CELL_DEFINITIONS.find(d=>d.id==="CLUB")!,hook=CELL_DEFINITIONS.find(d=>d.id==="HOOK")!;if(this.state.layers.CLUB.status!=="ON"){this.fadeHandle(this.baseDrum,0,when,.08);this.activate(club,when);this.patch("CLUB",{status:"ON",targetBar:null});}if(this.state.layers.HOOK.status!=="ON"){this.activate(hook,when);this.patch("HOOK",{status:"ON",targetBar:null});}this.emit({message:"DROP · CLUB + HOOK"});}

  private startBase(cell:CellSpec,when:number){const c=this.ctx!,spec=SOURCES[cell.source],buffer=this.buffers.get(cell.source)!,source=c.createBufferSource(),g=c.createGain(),sourceBar=(60/spec.bpm)*4,offset=spec.beatOffset+cell.bar*sourceBar;source.buffer=buffer;source.playbackRate.value=BPM/spec.bpm;source.loop=true;source.loopStart=offset;source.loopEnd=Math.min(buffer.duration-.02,offset+cell.bars*sourceBar);g.gain.value=cell.gain;source.connect(g).connect(this.masterBus!);source.start(when,offset);return{source,sourceGain:g};}
  private startCell(cell:CellSpec,id:CellId,when:number,loop:boolean){const c=this.ctx!,spec=SOURCES[cell.source],buffer=this.buffers.get(cell.source)!,source=c.createBufferSource(),sg=c.createGain(),sourceBar=(60/spec.bpm)*4,offset=spec.beatOffset+cell.bar*sourceBar;source.buffer=buffer;source.playbackRate.setValueAtTime(BPM/spec.bpm,when);source.loop=loop;if(loop){source.loopStart=offset;source.loopEnd=Math.min(buffer.duration-.02,offset+cell.bars*sourceBar);}sg.gain.value=cell.gain;source.connect(sg).connect(this.buses.get(id)!.hpf);if(loop)source.start(when,offset);else source.start(when,offset,Math.min(cell.bars*sourceBar,buffer.duration-offset-.02));return{source,sourceGain:sg};}
  private fadeHandle(h:Handle|null,target:number,when:number,dur:number){if(!h)return;h.sourceGain.gain.cancelScheduledValues(when);h.sourceGain.gain.setValueAtTime(Math.max(.0001,h.sourceGain.gain.value),when);h.sourceGain.gain.linearRampToValueAtTime(Math.max(.0001,target),when+dur);}
  private stopLayer(id:CellId){const hs=this.loops.get(id);hs?.forEach(h=>{try{h.source.stop();}catch{}});this.loops.delete(id);}
  private stopSources(){for(const id of [...this.loops.keys()])this.stopLayer(id);for(const h of [this.baseDrum,this.baseBass])if(h){try{h.source.stop();}catch{}}this.baseDrum=null;this.baseBass=null;}

  spectrum(){if(!this.analyser)return new Uint8Array();const d=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(d);return d;}
  waveform(){if(!this.analyser)return new Uint8Array();const d=new Uint8Array(this.analyser.fftSize);this.analyser.getByteTimeDomainData(d);return d;}

  private nextBoundary(q:1|4|8){if(!this.ctx)return 0;const bars=Math.max(0,(this.ctx.currentTime-this.startAt)/BAR);return Math.floor(bars/q+1)*q;}
  private timeForBar(i:number){return this.startAt+i*BAR;}
  private at(t:number,fn:()=>void){const delay=Math.max(0,(t-(this.ctx?.currentTime??t))*1000),id=window.setTimeout(()=>{this.timers.delete(id);fn();},delay);this.timers.add(id);}
  private cancel(){this.timers.forEach(id=>window.clearTimeout(id));this.timers.clear();}
  private startClock(){if(this.clock!=null)window.clearInterval(this.clock);this.clock=window.setInterval(()=>{if(!this.ctx||!this.state.running)return;const e=Math.max(0,this.ctx.currentTime-this.startAt),bars=e/BAR,bi=Math.floor(bars),bf=bars-bi,beatFloat=bf*4;this.emit({bar:bi+1,beat:Math.min(4,Math.floor(beatFloat)+1),phase:beatFloat-Math.floor(beatFloat)});},50);}
}
