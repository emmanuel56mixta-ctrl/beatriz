export type ExtraId = "SHAKER"|"GHOST"|"RIDE"|"STABS"|"ARP"|"TOMFILL"|"WASH"|"RISER"|"DOWN"|"REVERSE"|"IMPACT"|"SWEEP"|"VOCAL20";
export type ExtraKind = "LIVE"|"FX"|"VOCAL";
export type ExtraStatus = "OFF"|"ARMED"|"ON"|"PLAYING"|"EXIT";
export type ExtraRuntime = {status:ExtraStatus;targetBar:number|null};
export type ExtraState = {ready:boolean;running:boolean;message:string;layers:Record<ExtraId,ExtraRuntime>};

export const EXTRA_DEFINITIONS = [
  {id:"VOCAL20" as const,kind:"VOCAL" as const,label:"VOCAL · 20 FINGERS",q:8,note:"8-bar vocal spotlight · real stem"},
  {id:"SHAKER" as const,kind:"LIVE" as const,label:"SHAKER",q:1,note:"audible 16th texture"},
  {id:"GHOST" as const,kind:"LIVE" as const,label:"GHOST CLAP",q:1,note:"syncopated ghost hits"},
  {id:"RIDE" as const,kind:"LIVE" as const,label:"RIDE",q:4,note:"club brightness"},
  {id:"STABS" as const,kind:"LIVE" as const,label:"HOUSE STABS",q:4,note:"G#m–E–B–F# responses"},
  {id:"ARP" as const,kind:"LIVE" as const,label:"ARPEGGIO",q:8,note:"harmonic motion"},
  {id:"TOMFILL" as const,kind:"LIVE" as const,label:"TOM FILLS",q:4,note:"phrase punctuation"},
  {id:"WASH" as const,kind:"FX" as const,label:"WASH",q:4,note:"wide air tail"},
  {id:"RISER" as const,kind:"FX" as const,label:"RISER",q:4,note:"one-bar rise into boundary"},
  {id:"DOWN" as const,kind:"FX" as const,label:"DOWN",q:4,note:"downlifter after boundary"},
  {id:"REVERSE" as const,kind:"FX" as const,label:"REVERSE",q:4,note:"one-beat reverse into 1"},
  {id:"IMPACT" as const,kind:"FX" as const,label:"IMPACT",q:4,note:"sub + noise hit"},
  {id:"SWEEP" as const,kind:"FX" as const,label:"SWEEP",q:1,note:"short stereo air sweep"},
] as const;

const BPM=124,BEAT=60/BPM,STEP=BEAT/4,BAR=BEAT*4;
const blank=()=>Object.fromEntries(EXTRA_DEFINITIONS.map(d=>[d.id,{status:"OFF",targetBar:null}])) as Record<ExtraId,ExtraRuntime>;
const HARMONY=[[56,59,63,66],[52,56,59,63],[59,63,66,73],[54,58,61,64]] as const;
const hz=(n:number)=>440*Math.pow(2,(n-69)/12);

export class PerformanceExtrasV306{
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private noise:AudioBuffer|null=null;
  private startAt=0;
  private nextStep=0;
  private scheduler:number|null=null;
  private timers=new Set<number>();
  private starts=new Map<ExtraId,number>();
  private stops=new Map<ExtraId,number>();
  private volume=.82;
  private vocal:HTMLAudioElement|null=null;
  private vocalTimer:number|null=null;
  private onState:(state:ExtraState)=>void;
  state:ExtraState={ready:false,running:false,message:"EXTRAS READY",layers:blank()};

  constructor(onState:(state:ExtraState)=>void){this.onState=onState;}
  private emit(p?:Partial<ExtraState>){if(p)this.state={...this.state,...p};this.onState({...this.state,layers:{...this.state.layers}});}
  private patch(id:ExtraId,p:Partial<ExtraRuntime>){this.state={...this.state,layers:{...this.state.layers,[id]:{...this.state.layers[id],...p}}};this.emit();}

  async prepare(){
    if(this.state.ready)return;
    const Ctor=window.AudioContext??(window as unknown as{webkitAudioContext:typeof AudioContext}).webkitAudioContext;
    if(!Ctor)throw new Error("Web Audio no disponible");
    this.ctx=new Ctor({latencyHint:"interactive"});
    this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);
    this.noise=this.makeNoise(this.ctx);
    const vocal=new Audio(`/api/stem?path=${encodeURIComponent("stems/20-fingers-putang-ina-mo/vocals.mp3")}`);
    vocal.preload="metadata";vocal.crossOrigin="anonymous";vocal.setAttribute("playsinline","");vocal.volume=.72*this.volume;
    if("preservesPitch" in vocal)(vocal as HTMLAudioElement&{preservesPitch:boolean}).preservesPitch=true;
    vocal.playbackRate=124/131;
    this.vocal=vocal;
    await Promise.all([this.ctx.resume(),this.waitMetadata(vocal)]);
    this.emit({ready:true,message:"LIVE + FX BOOSTED · VOCAL 20F READY"});
  }

  async start(){await this.prepare();if(!this.ctx||this.state.running)return;await this.ctx.resume();this.cancel();this.starts.clear();this.stops.clear();this.stopVocal();this.startAt=this.ctx.currentTime+.18;this.nextStep=0;this.emit({running:true,layers:blank(),message:"EXTRAS SYNCED · 124 BPM"});this.scheduler=window.setInterval(()=>this.scheduleAhead(),25);this.scheduleAhead();}
  stop(){this.cancel();this.starts.clear();this.stops.clear();if(this.scheduler!=null)window.clearInterval(this.scheduler);this.scheduler=null;this.stopVocal();this.emit({running:false,layers:blank(),message:"EXTRAS STOPPED"});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;this.master=null;this.noise=null;this.vocal=null;}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.02);if(this.vocal)this.vocal.volume=.72*this.volume;}

  toggle(id:ExtraId){
    if(!this.ctx||!this.state.running)return;const def=EXTRA_DEFINITIONS.find(d=>d.id===id)!;const rt=this.state.layers[id];if(rt.status==="ARMED"||rt.status==="PLAYING"||rt.status==="EXIT")return;
    if(def.kind==="FX"){if(rt.status==="OFF")this.triggerFx(id);return;}
    if(def.kind==="VOCAL"){if(rt.status==="OFF")this.armVocal();return;}
    if(rt.status==="OFF")this.armLive(id,def.q);else if(rt.status==="ON")this.exitLive(id,def.q);
  }

  private armLive(id:ExtraId,q:1|4|8){const boundary=this.nextBoundary(q),when=this.timeForBar(boundary);this.patch(id,{status:"ARMED",targetBar:boundary+1});this.starts.set(id,when);this.stops.delete(id);this.at(when,()=>{if(!this.state.running)return;this.patch(id,{status:"ON",targetBar:null});this.emit({message:`${id} ON · BAR ${boundary+1}`});});}
  private exitLive(id:ExtraId,q:1|4|8){const boundary=this.nextBoundary(q),when=this.timeForBar(boundary);this.patch(id,{status:"EXIT",targetBar:boundary+1});this.stops.set(id,when);this.at(when+.03,()=>{this.starts.delete(id);this.stops.delete(id);this.patch(id,{status:"OFF",targetBar:null});});}
  private active(id:ExtraId,time:number){const s=this.starts.get(id);if(s==null||time<s-.001)return false;const e=this.stops.get(id);return e==null||time<e-.001;}

  private triggerFx(id:ExtraId){const now=this.ctx!.currentTime;let boundary=this.nextBoundary(id==="SWEEP"?1:4),fire=this.timeForBar(boundary),start=fire;
    if(id==="RISER"){start=fire-BAR;if(start<now+.08){boundary+=4;fire=this.timeForBar(boundary);start=fire-BAR;}}
    if(id==="REVERSE"){start=fire-BEAT;if(start<now+.08){boundary+=4;fire=this.timeForBar(boundary);start=fire-BEAT;}}
    this.patch(id,{status:"ARMED",targetBar:boundary+1});this.emit({message:`${id} ARMED → BAR ${boundary+1}`});
    if(id==="WASH")this.at(fire,()=>this.wash(fire,2.0,.19));
    if(id==="RISER")this.at(start,()=>this.riser(start,BAR,.24));
    if(id==="DOWN")this.at(fire,()=>this.down(fire,1.7,.18));
    if(id==="REVERSE")this.at(start,()=>this.reverse(start,BEAT,.22));
    if(id==="IMPACT")this.at(fire,()=>this.impact(fire,.31));
    if(id==="SWEEP")this.at(fire,()=>this.sweep(fire,.72,.18));
    this.at(start,()=>{if(this.state.running)this.patch(id,{status:"PLAYING",targetBar:boundary+1});});
    const end=id==="RISER"||id==="REVERSE"?fire+.12:id==="WASH"?fire+2.1:id==="DOWN"?fire+1.8:id==="IMPACT"?fire+.9:fire+.82;
    this.at(end,()=>{if(this.state.running){this.patch(id,{status:"OFF",targetBar:null});this.emit({message:`${id} DONE`});}});
  }

  private armVocal(){const boundary=this.nextBoundary(8),when=this.timeForBar(boundary);this.patch("VOCAL20",{status:"ARMED",targetBar:boundary+1});this.emit({message:`VOCAL 20F ARMED → BAR ${boundary+1}`});this.at(when,()=>this.playVocal(boundary));}
  private playVocal(boundary:number){const v=this.vocal;if(!v||!this.state.running)return;this.stopVocal();v.playbackRate=124/131;if("preservesPitch" in v)(v as HTMLAudioElement&{preservesPitch:boolean}).preservesPitch=true;v.volume=.72*this.volume;const sourceBar=(60/131)*4;try{v.currentTime=.3084+32*sourceBar;}catch{};void v.play().then(()=>{this.patch("VOCAL20",{status:"PLAYING",targetBar:boundary+9});this.emit({message:"VOCAL 20 FINGERS · 8 BAR SPOTLIGHT"});}).catch(()=>this.emit({message:"VOCAL 20F blocked · tap again"}));this.vocalTimer=window.setTimeout(()=>{this.stopVocal();if(this.state.running)this.patch("VOCAL20",{status:"OFF",targetBar:null});},8*BAR*1000);}
  private stopVocal(){if(this.vocalTimer!=null)window.clearTimeout(this.vocalTimer);this.vocalTimer=null;if(this.vocal){this.vocal.pause();this.vocal.currentTime=0;}}

  private scheduleAhead(){const c=this.ctx;if(!c||!this.state.running)return;const horizon=c.currentTime+.15;while(this.startAt+this.nextStep*STEP<horizon){const time=this.startAt+this.nextStep*STEP;if(time>=c.currentTime+.004)this.scheduleStep(this.nextStep,time);this.nextStep++;}}
  private scheduleStep(abs:number,t:number){const step=abs%16,bar=Math.floor(abs/16),phrase=bar%8;
    if(this.active("SHAKER",t)){if(step%2===1)this.shaker(t,.030);if([2,6,10,14].includes(step))this.shaker(t,.045);}
    if(this.active("GHOST",t)){if((phrase===1||phrase===5)&&step===15)this.ghost(t,.060);if(phrase===3&&step===7)this.ghost(t,.052);}
    if(this.active("RIDE",t)&&[2,6,10,14].includes(step))this.ride(t,phrase===6?.065:.050);
    if(this.active("STABS",t)&&([[2,10],[6],[2,14],[10],[2,6,14],[10],[2,10],[14]][phrase]??[]).includes(step))this.stab(t,bar,step===14?.085:.072);
    if(this.active("ARP",t)&&[1,2,5,6].includes(phrase)&&[1,5,9,13].includes(step))this.arp(t,bar,step,phrase,.052);
    if(this.active("TOMFILL",t)&&(phrase===3||phrase===7)&&[12,14,15].includes(step))this.tom(t,step===12?160:step===14?118:88,step===15?.090:.072);
  }

  private nextBoundary(q:1|4|8){const c=this.ctx;if(!c)return 0;const bars=Math.max(0,(c.currentTime-this.startAt)/BAR);return Math.floor(bars/q+1)*q;}
  private timeForBar(i:number){return this.startAt+i*BAR;}
  private at(t:number,fn:()=>void){const d=Math.max(0,(t-(this.ctx?.currentTime??t))*1000);const id=window.setTimeout(()=>{this.timers.delete(id);fn();},d);this.timers.add(id);}
  private cancel(){this.timers.forEach(id=>window.clearTimeout(id));this.timers.clear();}
  private waitMetadata(a:HTMLAudioElement){if(a.readyState>=1)return Promise.resolve();return new Promise<void>((resolve,reject)=>{const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error("20 Fingers vocal unavailable"));},cleanup=()=>{a.removeEventListener("loadedmetadata",ok);a.removeEventListener("error",bad);};a.addEventListener("loadedmetadata",ok,{once:true});a.addEventListener("error",bad,{once:true});a.load();});}
  private makeNoise(c:AudioContext){const b=c.createBuffer(1,c.sampleRate*4,c.sampleRate),d=b.getChannelData(0);let x=0x7722aa;for(let i=0;i<d.length;i++){x=(1664525*x+1013904223)>>>0;d[i]=(x/0xffffffff)*2-1;}return b;}
  private shaker(t:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=6800;g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.045);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+.05);}
  private ghost(t:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;bp.type="bandpass";bp.frequency.value=1800;bp.Q.value=.75;g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.085);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+.09);}
  private ride(t:number,a:number){const c=this.ctx;if(!c||!this.master)return;const sum=c.createGain(),hp=c.createBiquadFilter(),g=c.createGain();sum.gain.value=a;hp.type="highpass";hp.frequency.value=4300;g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(.0001,t+.32);sum.connect(hp).connect(g).connect(this.master);[5100,6670,8210].forEach((f,i)=>{const o=c.createOscillator();o.type=i===1?"square":"triangle";o.frequency.value=f;o.connect(sum);o.start(t);o.stop(t+.33);});}
  private stab(t:number,bar:number,a:number){const c=this.ctx;if(!c||!this.master)return;const chord=HARMONY[bar%4]!,sum=c.createGain(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),g=c.createGain();sum.gain.value=a;hp.type="highpass";hp.frequency.value=220;lp.type="lowpass";lp.frequency.value=3100;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(1,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.19);sum.connect(hp).connect(lp).connect(g).connect(this.master);chord.slice(0,3).forEach((n,i)=>{const o=c.createOscillator();o.type=i===0?"sawtooth":"triangle";o.frequency.value=hz(n);o.detune.value=i===1?5:i===2?-5:0;o.connect(sum);o.start(t);o.stop(t+.2);});}
  private arp(t:number,bar:number,step:number,phrase:number,a:number){const c=this.ctx;if(!c||!this.master)return;const chord=HARMONY[bar%4]!,idx=(Math.floor(step/4)+phrase)%chord.length,o=c.createOscillator(),lp=c.createBiquadFilter(),g=c.createGain();o.type="triangle";o.frequency.value=hz(chord[idx]!+12);lp.type="lowpass";lp.frequency.value=4200;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+.145);o.connect(lp).connect(g).connect(this.master);o.start(t);o.stop(t+.16);}
  private tom(t:number,f:number,a:number){const c=this.ctx;if(!c||!this.master)return;const o=c.createOscillator(),g=c.createGain();o.type="triangle";o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(52,f*.58),t+.14);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(g).connect(this.master);o.start(t);o.stop(t+.19);}
  private wash(t:number,d:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.value=1400;lp.type="lowpass";lp.frequency.setValueAtTime(12000,t);lp.frequency.exponentialRampToValueAtTime(2500,t+d);p.pan.setValueAtTime(-.7,t);p.pan.linearRampToValueAtTime(.7,t+d);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.12);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(hp).connect(lp).connect(p).connect(g).connect(this.master);s.start(t);s.stop(t+d+.02);}
  private riser(t:number,d:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.Q.value=.75;bp.frequency.setValueAtTime(250,t);bp.frequency.exponentialRampToValueAtTime(12500,t+d*.98);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+d*.93);g.gain.linearRampToValueAtTime(.0001,t+d);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+d+.02);}
  private down(t:number,d:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.Q.value=.55;bp.frequency.setValueAtTime(12000,t);bp.frequency.exponentialRampToValueAtTime(250,t+d);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+d+.02);}
  private reverse(t:number,d:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.setValueAtTime(2800,t);hp.frequency.exponentialRampToValueAtTime(13500,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+d*.9);g.gain.linearRampToValueAtTime(.0001,t+d);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+d+.01);}
  private impact(t:number,a:number){const c=this.ctx;if(!c||!this.master)return;const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(30,t+.7);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.76);o.connect(g).connect(this.master);o.start(t);o.stop(t+.78);if(this.noise){const s=c.createBufferSource(),hp=c.createBiquadFilter(),n=c.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=2600;n.gain.setValueAtTime(a*.9,t);n.gain.exponentialRampToValueAtTime(.0001,t+.48);s.connect(hp).connect(n).connect(this.master);s.start(t);s.stop(t+.5);}}
  private sweep(t:number,d:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;bp.type="bandpass";bp.Q.value=.65;bp.frequency.setValueAtTime(550,t);bp.frequency.exponentialRampToValueAtTime(10500,t+d);p.pan.setValueAtTime(-.8,t);p.pan.linearRampToValueAtTime(.8,t+d);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+d*.42);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(bp).connect(p).connect(g).connect(this.master);s.start(t);s.stop(t+d+.02);}
}
