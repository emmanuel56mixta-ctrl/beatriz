export type CellLayerId = "CHORDS" | "RESPONSE" | "MOTIF" | "PERC" | "VOCAL" | "HOOK" | "CLUB" | "BUILD";
export type LiveLayerId = "SHAKER" | "GHOST" | "RIDE" | "STABS" | "ARP" | "TOMFILL";
export type FxLayerId = "WASH" | "RISER" | "DOWN" | "REVERSE" | "IMPACT" | "SWEEP";
export type SynthLayerId = LiveLayerId | FxLayerId;
export type LayerId = CellLayerId | SynthLayerId;
export type LayerStatus = "OFF" | "ARMED" | "ON" | "DISARMING" | "BUILDING";

type SourceKey = "cityDrums" | "cityBass" | "cityOther" | "cityVocals" | "matrodaDrums" | "fingersDrums";
type SourceSpec = { path: string; bpm: number; beatOffset: number };
type CellSpec = { source: SourceKey; bar: number; bars: number; gain: number };

type LayerDefinition = {
  id: LayerId;
  label: string;
  description: string;
  quantizeBars: 1 | 4 | 8;
  kind: "add" | "replace-drums" | "build" | "live";
  origin: "CELL" | "LIVE" | "FX";
  cells: CellSpec[];
};

export type LayerRuntime = { status: LayerStatus; targetBar: number | null };
export type BuilderState = {
  ready: boolean;
  loading: boolean;
  running: boolean;
  bar: number;
  beat: number;
  phase: number;
  message: string;
  error: string | null;
  layers: Record<LayerId, LayerRuntime>;
};

type LoopHandle = { source: AudioBufferSourceNode; gain: GainNode; targetGain: number };

const TARGET_BPM = 124;
const BEAT_SECONDS = 60 / TARGET_BPM;
const STEP_SECONDS = BEAT_SECONDS / 4;
const BAR_SECONDS = BEAT_SECONDS * 4;

const SOURCES: Record<SourceKey, SourceSpec> = {
  cityDrums: { path: "stems/city-of-dreams-alt-control-millero/drums.mp3", bpm: 124, beatOffset: 0.021 },
  cityBass: { path: "stems/city-of-dreams-alt-control-millero/bass.mp3", bpm: 124, beatOffset: 0.021 },
  cityOther: { path: "stems/city-of-dreams-alt-control-millero/other.mp3", bpm: 124, beatOffset: 0.021 },
  cityVocals: { path: "stems/city-of-dreams-alt-control-millero/vocals.mp3", bpm: 124, beatOffset: 0.021 },
  matrodaDrums: { path: "stems/bullshit-matroda-klp/drums.mp3", bpm: 130, beatOffset: 0.0246 },
  fingersDrums: { path: "stems/20-fingers-putang-ina-mo/drums.mp3", bpm: 131, beatOffset: 0.3084 },
};

export const LAYER_DEFINITIONS: LayerDefinition[] = [
  { id:"CHORDS", label:"+ CHORDS", description:"Célula armónica real; entra al inicio de frase.", quantizeBars:4, kind:"add", origin:"CELL", cells:[{source:"cityOther",bar:40,bars:4,gain:.27}] },
  { id:"RESPONSE", label:"+ RESPONSE", description:"Segunda célula real que cambia la conversación musical.", quantizeBars:4, kind:"add", origin:"CELL", cells:[{source:"cityOther",bar:64,bars:4,gain:.20}] },
  { id:"MOTIF", label:"+ MOTIF", description:"Frase reconocible real; espera bloque de 8 compases.", quantizeBars:8, kind:"add", origin:"CELL", cells:[{source:"cityOther",bar:80,bars:4,gain:.20}] },
  { id:"PERC", label:"+ PERC MP3", description:"Textura rítmica real de la cantera; siguiente downbeat.", quantizeBars:1, kind:"add", origin:"CELL", cells:[{source:"fingersDrums",bar:48,bars:4,gain:.15}] },
  { id:"VOCAL", label:"+ VOCAL", description:"Voz real; espera una frase completa.", quantizeBars:8, kind:"add", origin:"CELL", cells:[{source:"cityVocals",bar:48,bars:4,gain:.34}] },
  { id:"HOOK", label:"+ HOOK", description:"Célula real para la sección avanzada.", quantizeBars:4, kind:"add", origin:"CELL", cells:[{source:"cityOther",bar:96,bars:4,gain:.20}] },
  { id:"CLUB", label:"CLUB KIT", description:"Sustituye batería BASE por MATRODA en frontera de frase.", quantizeBars:4, kind:"replace-drums", origin:"CELL", cells:[{source:"matrodaDrums",bar:64,bars:4,gain:.78}] },
  { id:"BUILD", label:"BUILD → DROP", description:"4 compases reales + FX de subida; rompe con CLUB + HOOK.", quantizeBars:4, kind:"build", origin:"CELL", cells:[{source:"matrodaDrums",bar:48,bars:4,gain:.82},{source:"cityOther",bar:72,bars:4,gain:.24}] },

  { id:"SHAKER", label:"+ SHAKER", description:"16ths suaves: rellena huecos y da movimiento sin cambiar la canción.", quantizeBars:1, kind:"live", origin:"LIVE", cells:[] },
  { id:"GHOST", label:"+ GHOST CLAP", description:"Golpes fantasma entre clap y kick; añade swing y conversación.", quantizeBars:1, kind:"live", origin:"LIVE", cells:[] },
  { id:"RIDE", label:"+ RIDE", description:"Brillo de club en offbeats; úsalo cuando quieras levantar energía.", quantizeBars:4, kind:"live", origin:"LIVE", cells:[] },
  { id:"STABS", label:"+ HOUSE STABS", description:"Acordes cortos G#m–E–B–F# con patrones variables, no un loop fijo.", quantizeBars:4, kind:"live", origin:"LIVE", cells:[] },
  { id:"ARP", label:"+ ARPEGGIO", description:"Notas de la misma armonía con silencios y respuesta a 8 compases.", quantizeBars:8, kind:"live", origin:"LIVE", cells:[] },
  { id:"TOMFILL", label:"+ TOM FILLS", description:"Pequeños fills al cierre de frases de 4/8 compases; nunca todo el tiempo.", quantizeBars:4, kind:"live", origin:"LIVE", cells:[] },

  { id:"WASH", label:"+ WASH", description:"Cola de aire amplia al inicio de bloques largos; da espacio sin sumar melodía.", quantizeBars:4, kind:"live", origin:"FX", cells:[] },
  { id:"RISER", label:"+ RISER", description:"Subida de ruido de un compás antes de los cambios de frase.", quantizeBars:4, kind:"live", origin:"FX", cells:[] },
  { id:"DOWN", label:"+ DOWNLIFTER", description:"Caída de aire después del impacto; ayuda a que el drop respire.", quantizeBars:4, kind:"live", origin:"FX", cells:[] },
  { id:"REVERSE", label:"+ REVERSE CYMBAL", description:"Swell de un beat que termina exactamente en el siguiente 1.", quantizeBars:4, kind:"live", origin:"FX", cells:[] },
  { id:"IMPACT", label:"+ IMPACT", description:"Golpe grave + aire al comienzo de la nueva frase.", quantizeBars:4, kind:"live", origin:"FX", cells:[] },
  { id:"SWEEP", label:"+ AIR SWEEP", description:"Barrido corto cada dos compases para añadir movimiento lateral.", quantizeBars:1, kind:"live", origin:"FX", cells:[] },
];

const BASE_CELLS: CellSpec[] = [
  { source:"cityDrums", bar:32, bars:4, gain:.68 },
  { source:"cityBass", bar:32, bars:4, gain:.42 },
];

const ALL_IDS = LAYER_DEFINITIONS.map(d=>d.id);
const blankLayers = () => Object.fromEntries(ALL_IDS.map(id=>[id,{status:"OFF",targetBar:null}])) as Record<LayerId,LayerRuntime>;

const HARMONY = [
  [56,59,63,66],
  [52,56,59,63],
  [59,63,66,73],
  [54,58,61,64],
] as const;
const midiHz=(n:number)=>440*Math.pow(2,(n-69)/12);

export class QuantizedLayerBuilderV304 {
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private buffers=new Map<SourceKey,AudioBuffer>();
  private loops=new Map<CellLayerId|"BASE_DRUMS"|"BASE_BASS",LoopHandle[]>();
  private pendingTimers=new Set<number>();
  private clockTimer:number|null=null;
  private liveTimer:number|null=null;
  private startAt=0;
  private volume=.82;
  private noise:AudioBuffer|null=null;
  private nextLiveStep=0;
  private liveStarts=new Map<SynthLayerId,number>();
  private liveStops=new Map<SynthLayerId,number>();
  private onState:(state:BuilderState)=>void;

  state:BuilderState={ready:false,loading:false,running:false,bar:1,beat:1,phase:0,message:"Pulsa START. BASE corre sola hasta que tú añadas textura y espacio.",error:null,layers:blankLayers()};

  constructor(onState:(state:BuilderState)=>void){this.onState=onState;}
  private emit(patch?:Partial<BuilderState>){if(patch)this.state={...this.state,...patch};this.onState({...this.state,layers:{...this.state.layers}});}
  private patchLayer(id:LayerId,patch:Partial<LayerRuntime>){this.state={...this.state,layers:{...this.state.layers,[id]:{...this.state.layers[id],...patch}}};this.emit();}

  async prepare(){
    if(this.state.ready||this.state.loading)return;
    this.emit({loading:true,error:null,message:"Cargando células reales y preparando instrumentos + FX LIVE…"});
    try{
      const Ctor=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
      if(!Ctor)throw new Error("Web Audio no disponible.");
      if(!this.ctx){this.ctx=new Ctor({latencyHint:"interactive"});this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);this.noise=this.makeNoise(this.ctx);}
      const keys=[...new Set([...BASE_CELLS,...LAYER_DEFINITIONS.flatMap(d=>d.cells)].map(c=>c.source))];
      await Promise.all(keys.map(key=>this.loadBuffer(key)));
      await this.ctx.resume();
      this.emit({ready:true,loading:false,message:"Listo. LIVE INSTRUMENTS + TRANSITION FX no usan MP3."});
    }catch(error){this.emit({loading:false,error:error instanceof Error?error.message:"No se pudo preparar el builder."});}
  }

  private async loadBuffer(key:SourceKey){if(this.buffers.has(key))return;const spec=SOURCES[key];const r=await fetch(`/api/stem?path=${encodeURIComponent(spec.path)}`,{cache:"force-cache"});if(!r.ok)throw new Error(`No se pudo cargar ${key} (${r.status}).`);const bytes=await r.arrayBuffer();if(!this.ctx)throw new Error("AudioContext no inicializado.");this.buffers.set(key,await this.ctx.decodeAudioData(bytes));}

  async start(){
    await this.prepare();const ctx=this.ctx;if(!ctx||!this.master||!this.state.ready||this.state.running)return;await ctx.resume();
    this.stopScheduledOnly();this.stopAllSources();this.stopLiveScheduler();this.liveStarts.clear();this.liveStops.clear();
    this.state={...this.state,running:true,bar:1,beat:1,phase:0,layers:blankLayers(),error:null};
    this.startAt=ctx.currentTime+.18;this.nextLiveStep=0;
    this.loops.set("BASE_DRUMS",[this.startLoop(BASE_CELLS[0]!,this.startAt)]);this.loops.set("BASE_BASS",[this.startLoop(BASE_CELLS[1]!,this.startAt)]);
    this.startClock();this.startLiveScheduler();this.emit({message:"BASE ON. Añade células, instrumentos o FX cuando quieras; todo esperará su frontera."});
  }

  stop(){this.stopScheduledOnly();this.stopAllSources();this.stopLiveScheduler();this.liveStarts.clear();this.liveStops.clear();if(this.clockTimer!=null)window.clearInterval(this.clockTimer);this.clockTimer=null;this.state={...this.state,running:false,layers:blankLayers(),bar:1,beat:1,phase:0};this.emit({message:"Stopped."});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;this.master=null;this.buffers.clear();this.noise=null;}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.02);}

  toggle(id:LayerId){
    if(!this.state.running||!this.ctx)return;const def=LAYER_DEFINITIONS.find(d=>d.id===id)!;const rt=this.state.layers[id];
    if(rt.status==="ARMED"||rt.status==="DISARMING"||rt.status==="BUILDING")return;
    if(def.kind==="build"){if(rt.status==="OFF")this.armBuild(def);return;}
    if(rt.status==="OFF")this.armOn(def);else if(rt.status==="ON")this.armOff(def);
  }

  private armOn(def:LayerDefinition){const targetBar=this.nextBoundary(def.quantizeBars);const when=this.timeForBar(targetBar);this.patchLayer(def.id,{status:"ARMED",targetBar:targetBar+1});this.emit({message:`${def.label} ARMED · BAR ${targetBar+1}.`});this.activateAt(def,when);this.at(when,()=>{if(!this.state.running)return;this.patchLayer(def.id,{status:"ON",targetBar:null});this.emit({message:`${def.label} ON · entró en el 1 de BAR ${targetBar+1}.`});});}

  private activateAt(def:LayerDefinition,when:number){
    if(def.kind==="live"){this.liveStarts.set(def.id as SynthLayerId,when);this.liveStops.delete(def.id as SynthLayerId);return;}
    if(def.kind==="replace-drums")this.fadeHandles(this.loops.get("BASE_DRUMS"),0,when,.12);
    const handles=def.cells.map(cell=>this.startLoop(cell,when));this.loops.set(def.id as CellLayerId,handles);
  }

  private armOff(def:LayerDefinition){const targetBar=this.nextBoundary(def.quantizeBars);const when=this.timeForBar(targetBar);this.patchLayer(def.id,{status:"DISARMING",targetBar:targetBar+1});this.emit({message:`${def.label} EXIT · BAR ${targetBar+1}.`});
    if(def.kind==="live"){this.liveStops.set(def.id as SynthLayerId,when);this.at(when+.03,()=>{this.liveStarts.delete(def.id as SynthLayerId);this.liveStops.delete(def.id as SynthLayerId);this.patchLayer(def.id,{status:"OFF",targetBar:null});});return;}
    const handles=this.loops.get(def.id as CellLayerId);this.fadeHandles(handles,0,when,.12,true);if(def.kind==="replace-drums")this.fadeHandles(this.loops.get("BASE_DRUMS"),BASE_CELLS[0]!.gain,when,.12);
    this.at(when+.14,()=>{if(!this.state.running)return;this.loops.delete(def.id as CellLayerId);this.patchLayer(def.id,{status:"OFF",targetBar:null});this.emit({message:`${def.label} salió cuantizado.`});});
  }

  private armBuild(def:LayerDefinition){const targetBar=this.nextBoundary(def.quantizeBars);const when=this.timeForBar(targetBar);const end=when+4*BAR_SECONDS;this.patchLayer("BUILD",{status:"ARMED",targetBar:targetBar+1});this.emit({message:`BUILD ARMED · BAR ${targetBar+1}.`});this.fadeHandles(this.currentDrumHandles(),.22,when,.14);const oneShots=def.cells.map(cell=>this.startOneShot(cell,when));
    this.riser(when,4*BAR_SECONDS,.050);this.reverseCymbal(end-BEAT_SECONDS,BEAT_SECONDS,.050);
    this.at(when,()=>{if(!this.state.running)return;this.patchLayer("BUILD",{status:"BUILDING",targetBar:targetBar+5});this.emit({message:"BUILDING · redoble real + riser LIVE → DROP."});});
    this.at(end,()=>{if(!this.state.running)return;oneShots.forEach(h=>{try{h.source.stop();}catch{}});this.impact(end,.090);this.downlifter(end+.01,1.25,.040);this.wash(end+.03,.95,.028);this.patchLayer("BUILD",{status:"OFF",targetBar:null});this.forceDropFlavor(end);this.emit({message:`DROP · IMPACT + CLUB + HOOK · BAR ${targetBar+5}.`});});
  }

  private forceDropFlavor(when:number){const club=LAYER_DEFINITIONS.find(d=>d.id==="CLUB")!;const hook=LAYER_DEFINITIONS.find(d=>d.id==="HOOK")!;
    if(this.state.layers.CLUB.status!=="ON"){this.fadeHandles(this.loops.get("BASE_DRUMS"),0,when,.08);this.loops.set("CLUB",club.cells.map(c=>this.startLoop(c,when)));this.patchLayer("CLUB",{status:"ON",targetBar:null});}else this.fadeHandles(this.loops.get("CLUB"),club.cells[0]!.gain,when,.08);
    if(this.state.layers.HOOK.status!=="ON"){this.loops.set("HOOK",hook.cells.map(c=>this.startLoop(c,when)));this.patchLayer("HOOK",{status:"ON",targetBar:null});}
  }

  private currentDrumHandles(){return this.state.layers.CLUB.status==="ON"?this.loops.get("CLUB"):this.loops.get("BASE_DRUMS");}

  private startLoop(cell:CellSpec,when:number):LoopHandle{const ctx=this.ctx!,spec=SOURCES[cell.source],buffer=this.buffers.get(cell.source)!,sourceBar=(60/spec.bpm)*4,offset=spec.beatOffset+cell.bar*sourceBar,loopEnd=Math.min(buffer.duration-.02,offset+cell.bars*sourceBar);const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.setValueAtTime(TARGET_BPM/spec.bpm,when);source.loop=true;source.loopStart=offset;source.loopEnd=loopEnd;const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,Math.max(ctx.currentTime,when-.02));gain.gain.linearRampToValueAtTime(cell.gain,when+.08);source.connect(gain).connect(this.master!);source.start(when,offset);return{source,gain,targetGain:cell.gain};}
  private startOneShot(cell:CellSpec,when:number):LoopHandle{const ctx=this.ctx!,spec=SOURCES[cell.source],buffer=this.buffers.get(cell.source)!,sourceBar=(60/spec.bpm)*4,offset=spec.beatOffset+cell.bar*sourceBar,dur=Math.min(cell.bars*sourceBar,Math.max(.1,buffer.duration-offset-.02));const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.setValueAtTime(TARGET_BPM/spec.bpm,when);const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,Math.max(ctx.currentTime,when-.02));gain.gain.linearRampToValueAtTime(cell.gain,when+.05);gain.gain.setValueAtTime(cell.gain,when+3.6*BAR_SECONDS);gain.gain.linearRampToValueAtTime(.0001,when+4*BAR_SECONDS);source.connect(gain).connect(this.master!);source.start(when,offset,dur);return{source,gain,targetGain:cell.gain};}
  private fadeHandles(handles:LoopHandle[]|undefined,target:number,when:number,duration:number,stop=false){if(!handles)return;handles.forEach(h=>{const g=h.gain.gain;g.cancelScheduledValues(when);g.setValueAtTime(Math.max(.0001,g.value),when);g.linearRampToValueAtTime(Math.max(.0001,target),when+duration);if(stop){try{h.source.stop(when+duration+.02);}catch{}}});}

  private startLiveScheduler(){this.stopLiveScheduler();this.liveTimer=window.setInterval(()=>this.scheduleLiveAhead(),25);this.scheduleLiveAhead();}
  private stopLiveScheduler(){if(this.liveTimer!=null)window.clearInterval(this.liveTimer);this.liveTimer=null;}
  private scheduleLiveAhead(){const ctx=this.ctx;if(!ctx||!this.state.running)return;const horizon=ctx.currentTime+.14;while(this.startAt+this.nextLiveStep*STEP_SECONDS<horizon){const time=this.startAt+this.nextLiveStep*STEP_SECONDS;if(time>=ctx.currentTime+.004)this.scheduleLiveStep(this.nextLiveStep,time);this.nextLiveStep++;}}
  private liveAt(id:SynthLayerId,time:number){const start=this.liveStarts.get(id);if(start==null||time<start-.001)return false;const stop=this.liveStops.get(id);return stop==null||time<stop-.001;}
  private scheduleLiveStep(absStep:number,time:number){const step=absStep%16,bar=Math.floor(absStep/16),phraseBar=bar%8;
    if(this.liveAt("SHAKER",time)){if(step%2===1)this.shaker(time,.010+((bar+step)%3)*.002);if([2,6,10,14].includes(step))this.shaker(time,.020);}
    if(this.liveAt("GHOST",time)){if((phraseBar===1||phraseBar===5)&&step===15)this.ghostClap(time,.030);if(phraseBar===3&&step===7)this.ghostClap(time,.022);}
    if(this.liveAt("RIDE",time)&&[2,6,10,14].includes(step))this.ride(time,phraseBar===6?.026:.018);
    if(this.liveAt("STABS",time)&&this.stabSteps(phraseBar).includes(step))this.houseStab(time,bar,step===14?.055:.045);
    if(this.liveAt("ARP",time)&&this.arpActive(phraseBar)&&[1,5,9,13].includes(step))this.arpNote(time,bar,step,phraseBar);
    if(this.liveAt("TOMFILL",time)&&(phraseBar===3||phraseBar===7)&&[12,14,15].includes(step))this.tom(time,step===12?150:step===14?120:92,step===15?.055:.042);

    if(this.liveAt("WASH",time)&&phraseBar===0&&step===0)this.wash(time,1.25,.032);
    if(this.liveAt("RISER",time)&&(phraseBar===3||phraseBar===7)&&step===0)this.riser(time,BAR_SECONDS,.038);
    if(this.liveAt("DOWN",time)&&(phraseBar===0||phraseBar===4)&&step===0)this.downlifter(time,1.05,.032);
    if(this.liveAt("REVERSE",time)&&(phraseBar===3||phraseBar===7)&&step===12)this.reverseCymbal(time,BEAT_SECONDS,.038);
    if(this.liveAt("IMPACT",time)&&(phraseBar===0||phraseBar===4)&&step===0)this.impact(time,.060);
    if(this.liveAt("SWEEP",time)&&[1,3,5,7].includes(phraseBar)&&step===14)this.airSweep(time,.48,.025);
  }
  private stabSteps(phraseBar:number){return [[2,10],[6],[2,14],[10],[2,6,14],[10],[2,10],[14]][phraseBar]??[];}
  private arpActive(phraseBar:number){return [1,2,5,6].includes(phraseBar);}

  private makeNoise(ctx:AudioContext){const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),d=b.getChannelData(0);let seed=0x51f15e;for(let i=0;i<d.length;i++){seed=(1664525*seed+1013904223)>>>0;d[i]=(seed/0xffffffff)*2-1;}return b;}
  private shaker(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=7200;const g=ctx.createGain();g.gain.setValueAtTime(Math.max(.0001,amp),t);g.gain.exponentialRampToValueAtTime(.0001,t+.032);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+.04);}
  private ghostClap(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1900;bp.Q.value=.8;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.07);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+.08);}
  private ride(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master)return;const mix=ctx.createGain();mix.gain.value=amp;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=4800;const env=ctx.createGain();env.gain.setValueAtTime(1,t);env.gain.exponentialRampToValueAtTime(.0001,t+.22);mix.connect(hp).connect(env).connect(this.master);[5100,6730,8240].forEach((f,i)=>{const o=ctx.createOscillator();o.type=i===1?"square":"triangle";o.frequency.value=f;o.connect(mix);o.start(t);o.stop(t+.23);});}
  private houseStab(t:number,bar:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master)return;const chord=HARMONY[bar%4]!,sum=ctx.createGain(),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),env=ctx.createGain();sum.gain.value=amp;hp.type="highpass";hp.frequency.value=240;lp.type="lowpass";lp.frequency.value=2600;lp.Q.value=.5;env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(1,t+.008);env.gain.exponentialRampToValueAtTime(.0001,t+.16);sum.connect(hp).connect(lp).connect(env).connect(this.master);chord.slice(0,3).forEach((n,i)=>{const o=ctx.createOscillator();o.type=i===0?"sawtooth":"triangle";o.frequency.value=midiHz(n);o.detune.value=i===1?4:i===2?-4:0;o.connect(sum);o.start(t);o.stop(t+.18);});}
  private arpNote(t:number,bar:number,step:number,phraseBar:number){const ctx=this.ctx;if(!ctx||!this.master)return;const chord=HARMONY[bar%4]!,idx=(Math.floor(step/4)+phraseBar)%chord.length,note=chord[idx]!+12;const o=ctx.createOscillator(),lp=ctx.createBiquadFilter(),g=ctx.createGain();o.type="triangle";o.frequency.value=midiHz(note);lp.type="lowpass";lp.frequency.value=3600;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.028,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(lp).connect(g).connect(this.master);o.start(t);o.stop(t+.14);}
  private tom(t:number,freq:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(55,freq*.62),t+.11);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.14);o.connect(g).connect(this.master);o.start(t);o.stop(t+.15);}

  private wash(t:number,dur:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;s.loop=true;const hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),pan=ctx.createStereoPanner(),g=ctx.createGain();hp.type="highpass";hp.frequency.value=2200;lp.type="lowpass";lp.frequency.setValueAtTime(9000,t);lp.frequency.exponentialRampToValueAtTime(3800,t+dur);pan.pan.setValueAtTime(-.42,t);pan.pan.linearRampToValueAtTime(.42,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+Math.min(.16,dur*.2));g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(lp).connect(pan).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private riser(t:number,dur:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;s.loop=true;const bp=ctx.createBiquadFilter(),g=ctx.createGain();bp.type="bandpass";bp.Q.value=.65;bp.frequency.setValueAtTime(520,t);bp.frequency.exponentialRampToValueAtTime(8800,t+dur*.96);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,amp),t+dur*.90);g.gain.linearRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private downlifter(t:number,dur:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;s.loop=true;const bp=ctx.createBiquadFilter(),pan=ctx.createStereoPanner(),g=ctx.createGain();bp.type="bandpass";bp.Q.value=.55;bp.frequency.setValueAtTime(7800,t);bp.frequency.exponentialRampToValueAtTime(480,t+dur);pan.pan.setValueAtTime(.30,t);pan.pan.linearRampToValueAtTime(-.30,t+dur);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(pan).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private reverseCymbal(t:number,dur:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;s.loop=true;const hp=ctx.createBiquadFilter(),g=ctx.createGain();hp.type="highpass";hp.frequency.setValueAtTime(5600,t);hp.frequency.exponentialRampToValueAtTime(8600,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,amp),t+dur*.90);g.gain.linearRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.01);}
  private impact(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master)return;const o=ctx.createOscillator(),sub=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(82,t);o.frequency.exponentialRampToValueAtTime(38,t+.48);sub.gain.setValueAtTime(amp,t);sub.gain.exponentialRampToValueAtTime(.0001,t+.55);o.connect(sub).connect(this.master);o.start(t);o.stop(t+.58);if(this.noise){const s=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=3800;g.gain.setValueAtTime(amp*.55,t);g.gain.exponentialRampToValueAtTime(.0001,t+.32);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+.34);}}
  private airSweep(t:number,dur:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter(),pan=ctx.createStereoPanner(),g=ctx.createGain();bp.type="bandpass";bp.Q.value=.8;bp.frequency.setValueAtTime(1100,t);bp.frequency.exponentialRampToValueAtTime(6200,t+dur);pan.pan.setValueAtTime(-.55,t);pan.pan.linearRampToValueAtTime(.55,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+dur*.42);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(pan).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}

  private nextBoundary(q:1|4|8){if(!this.ctx)return 0;const bars=Math.max(0,(this.ctx.currentTime-this.startAt)/BAR_SECONDS);return Math.floor(bars/q+1)*q;}
  private timeForBar(barIndex:number){return this.startAt+barIndex*BAR_SECONDS;}
  private at(when:number,fn:()=>void){const delay=Math.max(0,(when-(this.ctx?.currentTime??when))*1000);const id=window.setTimeout(()=>{this.pendingTimers.delete(id);fn();},delay);this.pendingTimers.add(id);}
  private startClock(){if(this.clockTimer!=null)window.clearInterval(this.clockTimer);this.clockTimer=window.setInterval(()=>{if(!this.ctx||!this.state.running)return;const elapsed=Math.max(0,this.ctx.currentTime-this.startAt),bars=elapsed/BAR_SECONDS,barIndex=Math.floor(bars),barFrac=bars-barIndex,beatFloat=barFrac*4,beat=Math.min(4,Math.floor(beatFloat)+1),phase=beatFloat-Math.floor(beatFloat);this.emit({bar:barIndex+1,beat,phase});},50);}
  private stopScheduledOnly(){this.pendingTimers.forEach(id=>window.clearTimeout(id));this.pendingTimers.clear();}
  private stopAllSources(){for(const handles of this.loops.values())handles.forEach(h=>{try{h.source.stop();}catch{}});this.loops.clear();}
}

export const LIVE_LAYER_IDS = LAYER_DEFINITIONS.filter(d=>d.origin==="LIVE").map(d=>d.id as LiveLayerId);
export const FX_LAYER_IDS = LAYER_DEFINITIONS.filter(d=>d.origin==="FX").map(d=>d.id as FxLayerId);
export const CELL_LAYER_IDS = LAYER_DEFINITIONS.filter(d=>d.origin==="CELL").map(d=>d.id as CellLayerId);
