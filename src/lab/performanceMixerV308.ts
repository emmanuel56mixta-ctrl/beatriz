import { DEFAULT_MIX,cutoffHz,filterType,resonanceQ,type MixParams } from "./mixTypesV308";

export type ExtraId="VOCAL20"|"SHAKER"|"GHOST"|"RIDE"|"STABS"|"ARP"|"TOMFILL"|"WASH"|"RISER"|"DOWN"|"REVERSE"|"IMPACT"|"SWEEP";
export type ExtraKind="VOCAL"|"LIVE"|"FX";
export type ExtraStatus="OFF"|"ARMED"|"ON"|"PLAYING"|"EXIT";
export type ExtraRuntime={status:ExtraStatus;targetBar:number|null};
export type ExtraState={ready:boolean;running:boolean;message:string;error:string|null;layers:Record<ExtraId,ExtraRuntime>};
type Bus={filter:BiquadFilterNode;gain:GainNode;send:GainNode};

export const EXTRA_DEFINITIONS=[
  {id:"VOCAL20" as const,kind:"VOCAL" as const,label:"VOCAL · 20 FINGERS",q:8 as const},
  {id:"SHAKER" as const,kind:"LIVE" as const,label:"SHAKER",q:1 as const},
  {id:"GHOST" as const,kind:"LIVE" as const,label:"GHOST CLAP",q:1 as const},
  {id:"RIDE" as const,kind:"LIVE" as const,label:"RIDE",q:4 as const},
  {id:"STABS" as const,kind:"LIVE" as const,label:"HOUSE STABS",q:4 as const},
  {id:"ARP" as const,kind:"LIVE" as const,label:"ARPEGGIO",q:8 as const},
  {id:"TOMFILL" as const,kind:"LIVE" as const,label:"TOM FILLS",q:4 as const},
  {id:"WASH" as const,kind:"FX" as const,label:"WASH",q:4 as const},
  {id:"RISER" as const,kind:"FX" as const,label:"RISER",q:4 as const},
  {id:"DOWN" as const,kind:"FX" as const,label:"DOWN",q:4 as const},
  {id:"REVERSE" as const,kind:"FX" as const,label:"REVERSE",q:4 as const},
  {id:"IMPACT" as const,kind:"FX" as const,label:"IMPACT",q:4 as const},
  {id:"SWEEP" as const,kind:"FX" as const,label:"SWEEP",q:1 as const},
] as const;

const BPM=124,BEAT=60/BPM,STEP=BEAT/4,BAR=BEAT*4;
const HARMONY=[[56,59,63,66],[52,56,59,63],[59,63,66,73],[54,58,61,64]] as const;
const hz=(n:number)=>440*Math.pow(2,(n-69)/12);
const blank=()=>Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF",targetBar:null}])) as Record<ExtraId,ExtraRuntime>;

export class PerformanceMixerV308{
  private ctx:AudioContext|null=null;
  private masterBus:GainNode|null=null;
  private output:GainNode|null=null;
  private analyser:AnalyserNode|null=null;
  private delay:DelayNode|null=null;
  private buses=new Map<ExtraId,Bus>();
  private mix=new Map<ExtraId,MixParams>();
  private noise:AudioBuffer|null=null;
  private vocal:AudioBuffer|null=null;
  private vocalSource:AudioBufferSourceNode|null=null;
  private startAt=0;
  private nextStep=0;
  private scheduler:number|null=null;
  private timers=new Set<number>();
  private starts=new Map<ExtraId,number>();
  private stops=new Map<ExtraId,number>();
  private volume=.82;
  private onState:(s:ExtraState)=>void;
  state:ExtraState={ready:false,running:false,message:"EXTRAS READY",error:null,layers:blank()};

  constructor(onState:(s:ExtraState)=>void){this.onState=onState;EXTRA_DEFINITIONS.forEach(d=>this.mix.set(d.id,{...DEFAULT_MIX,gain:d.kind==="FX"?1.1:1}));}
  private emit(p?:Partial<ExtraState>){if(p)this.state={...this.state,...p};this.onState({...this.state,layers:{...this.state.layers}});}
  private patch(id:ExtraId,p:Partial<ExtraRuntime>){this.state={...this.state,layers:{...this.state.layers,[id]:{...this.state.layers[id],...p}}};this.emit();}

  async prepare(){if(this.state.ready)return;try{const Ctor=window.AudioContext??(window as unknown as{webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Ctor)throw new Error("Web Audio no disponible");const c=new Ctor({latencyHint:"interactive"});this.ctx=c;
    const master=c.createGain(),analyser=c.createAnalyser(),output=c.createGain();analyser.fftSize=512;analyser.smoothingTimeConstant=.68;output.gain.value=this.volume;master.connect(analyser).connect(output).connect(c.destination);this.masterBus=master;this.analyser=analyser;this.output=output;
    const delay=c.createDelay(2),tone=c.createBiquadFilter(),feedback=c.createGain(),wet=c.createGain();delay.delayTime.value=BEAT*.75;tone.type="lowpass";tone.frequency.value=6000;feedback.gain.value=.27;wet.gain.value=.42;delay.connect(tone).connect(wet).connect(master);tone.connect(feedback).connect(delay);this.delay=delay;
    this.noise=this.makeNoise(c);EXTRA_DEFINITIONS.forEach(d=>this.makeBus(d.id));
    const r=await fetch(`/api/stem?path=${encodeURIComponent("stems/20-fingers-putang-ina-mo/vocals.mp3")}`,{cache:"force-cache"});if(!r.ok)throw new Error(`20F vocal ${r.status}`);this.vocal=await c.decodeAudioData(await r.arrayBuffer());await c.resume();this.emit({ready:true,message:"LIVE + FX MIXER READY",error:null});
  }catch(e){this.emit({error:e instanceof Error?e.message:"Extras unavailable"});throw e;}}

  private makeBus(id:ExtraId){if(!this.ctx||!this.masterBus||!this.delay)return;const f=this.ctx.createBiquadFilter(),g=this.ctx.createGain(),send=this.ctx.createGain();f.connect(g).connect(this.masterBus);g.connect(send).connect(this.delay);this.buses.set(id,{filter:f,gain:g,send});this.applyBus(id,true);}
  private applyBus(id:ExtraId,immediate=false){const c=this.ctx,b=this.buses.get(id),m=this.mix.get(id);if(!c||!b||!m)return;const t=c.currentTime,tc=immediate?.001:.025;b.filter.type=filterType(m.mode);b.filter.frequency.setTargetAtTime(cutoffHz(m.cutoff),t,tc);b.filter.Q.setTargetAtTime(resonanceQ(m.resonance),t,tc);b.gain.gain.setTargetAtTime(m.gain,t,tc);b.send.gain.setTargetAtTime(m.send*.5,t,tc);}
  setMix(id:ExtraId,next:MixParams){this.mix.set(id,{...next});this.applyBus(id);}
  getMix(id:ExtraId){return {...(this.mix.get(id)??DEFAULT_MIX)};}
  private bus(id:ExtraId){return this.buses.get(id)!.filter;}

  async start(){await this.prepare();if(!this.ctx||this.state.running)return;await this.ctx.resume();this.cancel();this.starts.clear();this.stops.clear();this.stopVocal();this.startAt=this.ctx.currentTime+.18;this.nextStep=0;this.emit({running:true,layers:blank(),message:"EXTRAS SYNCED",error:null});this.scheduler=window.setInterval(()=>this.scheduleAhead(),25);this.scheduleAhead();}
  stop(){this.cancel();this.starts.clear();this.stops.clear();if(this.scheduler!=null)window.clearInterval(this.scheduler);this.scheduler=null;this.stopVocal();this.emit({running:false,layers:blank(),message:"EXTRAS STOPPED"});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;this.buses.clear();this.noise=null;this.vocal=null;}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));if(this.ctx&&this.output)this.output.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.02);}

  toggle(id:ExtraId){if(!this.ctx||!this.state.running)return;const d=EXTRA_DEFINITIONS.find(x=>x.id===id)!,rt=this.state.layers[id];if(rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT")return;if(d.kind==="FX"){if(rt.status==="OFF")this.triggerFx(id);return;}if(d.kind==="VOCAL"){if(rt.status==="OFF")this.armVocal();return;}if(rt.status==="OFF")this.armLive(id,d.q);else if(rt.status==="ON")this.exitLive(id,d.q);}
  private armLive(id:ExtraId,q:1|4|8){const bar=this.nextBoundary(q),when=this.timeForBar(bar);this.patch(id,{status:"ARMED",targetBar:bar+1});this.starts.set(id,when);this.stops.delete(id);this.at(when,()=>{if(this.state.running){this.patch(id,{status:"ON",targetBar:null});this.emit({message:`${id} ON · BAR ${bar+1}`});}});}
  private exitLive(id:ExtraId,q:1|4|8){const bar=this.nextBoundary(q),when=this.timeForBar(bar);this.patch(id,{status:"EXIT",targetBar:bar+1});this.stops.set(id,when);this.at(when+.03,()=>{this.starts.delete(id);this.stops.delete(id);this.patch(id,{status:"OFF",targetBar:null});});}
  private active(id:ExtraId,t:number){const s=this.starts.get(id);if(s==null||t<s-.001)return false;const e=this.stops.get(id);return e==null||t<e-.001;}

  private triggerFx(id:ExtraId){const now=this.ctx!.currentTime;let bar=this.nextBoundary(id==="SWEEP"?1:4),fire=this.timeForBar(bar),start=fire;if(id==="RISER"){start=fire-BAR;if(start<now+.08){bar+=4;fire=this.timeForBar(bar);start=fire-BAR;}}if(id==="REVERSE"){start=fire-BEAT;if(start<now+.08){bar+=4;fire=this.timeForBar(bar);start=fire-BEAT;}}this.patch(id,{status:"ARMED",targetBar:bar+1});
    if(id==="WASH")this.at(fire,()=>this.wash(fire,2,.24,id));if(id==="RISER")this.at(start,()=>this.riser(start,BAR,.30,id));if(id==="DOWN")this.at(fire,()=>this.down(fire,1.7,.23,id));if(id==="REVERSE")this.at(start,()=>this.reverse(start,BEAT,.29,id));if(id==="IMPACT")this.at(fire,()=>this.impact(fire,.38,id));if(id==="SWEEP")this.at(fire,()=>this.sweep(fire,.72,.24,id));
    this.at(start,()=>{if(this.state.running){this.patch(id,{status:"PLAYING",targetBar:bar+1});this.emit({message:`${id} PLAYING`});}});const end=id==="RISER"||id==="REVERSE"?fire+.12:id==="WASH"?fire+2.1:id==="DOWN"?fire+1.8:id==="IMPACT"?fire+1:fire+.82;this.at(end,()=>{if(this.state.running){this.patch(id,{status:"OFF",targetBar:null});this.emit({message:`${id} DONE`});}});}

  private armVocal(){const bar=this.nextBoundary(8),when=this.timeForBar(bar);this.patch("VOCAL20",{status:"ARMED",targetBar:bar+1});this.at(when,()=>this.playVocal(bar));}
  private playVocal(bar:number){const c=this.ctx,b=this.vocal;if(!c||!b||!this.state.running)return;this.stopVocal();const specBpm=131,sourceBar=(60/specBpm)*4,offset=.3084+32*sourceBar,dur=Math.min(8*sourceBar,b.duration-offset-.02),s=c.createBufferSource();s.buffer=b;s.playbackRate.setValueAtTime(BPM/specBpm,c.currentTime);s.connect(this.bus("VOCAL20"));s.start(c.currentTime+.004,offset,dur);this.vocalSource=s;this.patch("VOCAL20",{status:"PLAYING",targetBar:bar+9});this.emit({message:"VOCAL 20 FINGERS · 8 BAR"});this.at(c.currentTime+8*BAR,()=>{this.stopVocal();if(this.state.running)this.patch("VOCAL20",{status:"OFF",targetBar:null});});}
  private stopVocal(){if(this.vocalSource){try{this.vocalSource.stop();}catch{}this.vocalSource=null;}}

  private scheduleAhead(){const c=this.ctx;if(!c||!this.state.running)return;const horizon=c.currentTime+.15;while(this.startAt+this.nextStep*STEP<horizon){const t=this.startAt+this.nextStep*STEP;if(t>=c.currentTime+.004)this.scheduleStep(this.nextStep,t);this.nextStep++;}}
  private scheduleStep(abs:number,t:number){const step=abs%16,bar=Math.floor(abs/16),phrase=bar%8;if(this.active("SHAKER",t)){if(step%2===1)this.shaker(t,.045,"SHAKER");if([2,6,10,14].includes(step))this.shaker(t,.06,"SHAKER");}if(this.active("GHOST",t)){if((phrase===1||phrase===5)&&step===15)this.ghost(t,.08,"GHOST");if(phrase===3&&step===7)this.ghost(t,.07,"GHOST");}if(this.active("RIDE",t)&&[2,6,10,14].includes(step))this.ride(t,phrase===6?.085:.068,"RIDE");if(this.active("STABS",t)&&([[2,10],[6],[2,14],[10],[2,6,14],[10],[2,10],[14]][phrase]??[]).includes(step))this.stab(t,bar,step===14?.11:.09,"STABS");if(this.active("ARP",t)&&[1,2,5,6].includes(phrase)&&[1,5,9,13].includes(step))this.arp(t,bar,step,phrase,.072,"ARP");if(this.active("TOMFILL",t)&&(phrase===3||phrase===7)&&[12,14,15].includes(step))this.tom(t,step===12?160:step===14?118:88,step===15?.12:.095,"TOMFILL");}

  spectrum(){if(!this.analyser)return new Uint8Array();const d=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(d);return d;}
  waveform(){if(!this.analyser)return new Uint8Array();const d=new Uint8Array(this.analyser.fftSize);this.analyser.getByteTimeDomainData(d);return d;}

  private makeNoise(c:AudioContext){const b=c.createBuffer(1,c.sampleRate*4,c.sampleRate),d=b.getChannelData(0);let x=0x7722aa;for(let i=0;i<d.length;i++){x=(1664525*x+1013904223)>>>0;d[i]=(x/0xffffffff)*2-1;}return b;}
  private shaker(t:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=6800;g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.045);s.connect(hp).connect(g).connect(this.bus(id));s.start(t);s.stop(t+.05);}
  private ghost(t:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;bp.type="bandpass";bp.frequency.value=1800;g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.085);s.connect(bp).connect(g).connect(this.bus(id));s.start(t);s.stop(t+.09);}
  private ride(t:number,a:number,id:ExtraId){const c=this.ctx;if(!c)return;const sum=c.createGain(),hp=c.createBiquadFilter(),g=c.createGain();sum.gain.value=a;hp.type="highpass";hp.frequency.value=4300;g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(.0001,t+.34);sum.connect(hp).connect(g).connect(this.bus(id));[5100,6670,8210].forEach((f,i)=>{const o=c.createOscillator();o.type=i===1?"square":"triangle";o.frequency.value=f;o.connect(sum);o.start(t);o.stop(t+.35);});}
  private stab(t:number,bar:number,a:number,id:ExtraId){const c=this.ctx;if(!c)return;const chord=HARMONY[bar%4]!,sum=c.createGain(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),g=c.createGain();sum.gain.value=a;hp.type="highpass";hp.frequency.value=220;lp.type="lowpass";lp.frequency.value=3600;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(1,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.22);sum.connect(hp).connect(lp).connect(g).connect(this.bus(id));chord.slice(0,3).forEach((n,i)=>{const o=c.createOscillator();o.type=i===0?"sawtooth":"triangle";o.frequency.value=hz(n);o.detune.value=i?i===1?5:-5:0;o.connect(sum);o.start(t);o.stop(t+.23);});}
  private arp(t:number,bar:number,step:number,phrase:number,a:number,id:ExtraId){const c=this.ctx;if(!c)return;const chord=HARMONY[bar%4]!,n=chord[(Math.floor(step/4)+phrase)%chord.length]!+12,o=c.createOscillator(),lp=c.createBiquadFilter(),g=c.createGain();o.type="triangle";o.frequency.value=hz(n);lp.type="lowpass";lp.frequency.value=4600;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(lp).connect(g).connect(this.bus(id));o.start(t);o.stop(t+.18);}
  private tom(t:number,f:number,a:number,id:ExtraId){const c=this.ctx;if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type="triangle";o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(52,f*.55),t+.15);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(g).connect(this.bus(id));o.start(t);o.stop(t+.19);}
  private wash(t:number,d:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.value=1400;lp.type="lowpass";lp.frequency.setValueAtTime(12000,t);lp.frequency.exponentialRampToValueAtTime(2400,t+d);p.pan.setValueAtTime(-.7,t);p.pan.linearRampToValueAtTime(.7,t+d);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.1);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(hp).connect(lp).connect(p).connect(g).connect(this.bus(id));s.start(t);s.stop(t+d+.02);}
  private riser(t:number,d:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.Q.value=.7;bp.frequency.setValueAtTime(260,t);bp.frequency.exponentialRampToValueAtTime(13000,t+d*.98);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+d*.92);g.gain.linearRampToValueAtTime(.0001,t+d);s.connect(bp).connect(g).connect(this.bus(id));s.start(t);s.stop(t+d+.02);}
  private down(t:number,d:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.frequency.setValueAtTime(12000,t);bp.frequency.exponentialRampToValueAtTime(250,t+d);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(bp).connect(g).connect(this.bus(id));s.start(t);s.stop(t+d+.02);}
  private reverse(t:number,d:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.setValueAtTime(3000,t);hp.frequency.exponentialRampToValueAtTime(14000,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+d*.9);g.gain.linearRampToValueAtTime(.0001,t+d);s.connect(hp).connect(g).connect(this.bus(id));s.start(t);s.stop(t+d+.01);}
  private impact(t:number,a:number,id:ExtraId){const c=this.ctx;if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(105,t);o.frequency.exponentialRampToValueAtTime(30,t+.72);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.78);o.connect(g).connect(this.bus(id));o.start(t);o.stop(t+.8);if(this.noise){const s=c.createBufferSource(),hp=c.createBiquadFilter(),n=c.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=2800;n.gain.setValueAtTime(a*.9,t);n.gain.exponentialRampToValueAtTime(.0001,t+.52);s.connect(hp).connect(n).connect(this.bus(id));s.start(t);s.stop(t+.54);}}
  private sweep(t:number,d:number,a:number,id:ExtraId){const c=this.ctx;if(!c||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;bp.type="bandpass";bp.frequency.setValueAtTime(550,t);bp.frequency.exponentialRampToValueAtTime(10000,t+d);p.pan.setValueAtTime(-.8,t);p.pan.linearRampToValueAtTime(.8,t+d);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+d*.42);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(bp).connect(p).connect(g).connect(this.bus(id));s.start(t);s.stop(t+d+.02);}

  private nextBoundary(q:1|4|8){const c=this.ctx;if(!c)return 0;const bars=Math.max(0,(c.currentTime-this.startAt)/BAR);return Math.floor(bars/q+1)*q;}
  private timeForBar(i:number){return this.startAt+i*BAR;}
  private at(t:number,fn:()=>void){const d=Math.max(0,(t-(this.ctx?.currentTime??t))*1000),id=window.setTimeout(()=>{this.timers.delete(id);fn();},d);this.timers.add(id);}
  private cancel(){this.timers.forEach(id=>window.clearTimeout(id));this.timers.clear();}
}
