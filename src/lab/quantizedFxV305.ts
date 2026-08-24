export type FxId="WASH"|"RISER"|"DOWN"|"REVERSE"|"IMPACT"|"SWEEP";
export type FxStatus="OFF"|"ARMED"|"PLAYING";
export type FxRuntime={status:FxStatus;targetBar:number|null};
export type FxState={ready:boolean;running:boolean;message:string;layers:Record<FxId,FxRuntime>};

export const FX_DEFINITIONS=[
  {id:"WASH" as const,label:"WASH",q:4,note:"air tail on phrase"},
  {id:"RISER" as const,label:"RISER",q:4,note:"1 bar rise into phrase"},
  {id:"DOWN" as const,label:"DOWN",q:4,note:"drop tail on phrase"},
  {id:"REVERSE" as const,label:"REVERSE",q:4,note:"1 beat into phrase"},
  {id:"IMPACT" as const,label:"IMPACT",q:4,note:"hit on phrase 1"},
  {id:"SWEEP" as const,label:"SWEEP",q:1,note:"short air movement"},
] as const;

const BPM=124,BEAT=60/BPM,BAR=BEAT*4;
const blank=()=>Object.fromEntries(FX_DEFINITIONS.map(d=>[d.id,{status:"OFF",targetBar:null}])) as Record<FxId,FxRuntime>;

export class QuantizedFxV305{
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private noise:AudioBuffer|null=null;
  private startAt=0;
  private volume=.82;
  private timers=new Set<number>();
  private onState:(s:FxState)=>void;
  state:FxState={ready:false,running:false,message:"FX READY",layers:blank()};
  constructor(onState:(s:FxState)=>void){this.onState=onState;}
  private emit(p?:Partial<FxState>){if(p)this.state={...this.state,...p};this.onState({...this.state,layers:{...this.state.layers}});}
  private patch(id:FxId,p:Partial<FxRuntime>){this.state={...this.state,layers:{...this.state.layers,[id]:{...this.state.layers[id],...p}}};this.emit();}
  async prepare(){if(this.state.ready)return;const Ctor=window.AudioContext??(window as unknown as{webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!Ctor)throw new Error("Web Audio no disponible");this.ctx=new Ctor({latencyHint:"interactive"});this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);this.noise=this.makeNoise(this.ctx);await this.ctx.resume();this.emit({ready:true});}
  async start(){await this.prepare();if(!this.ctx||this.state.running)return;await this.ctx.resume();this.cancel();this.startAt=this.ctx.currentTime+.18;this.emit({running:true,message:"FX sincronizados · pulsa cuando quieras",layers:blank()});}
  stop(){this.cancel();this.emit({running:false,message:"FX STOPPED",layers:blank()});}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;this.master=null;this.noise=null;}
  setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.02);}
  trigger(id:FxId){if(!this.ctx||!this.state.running||this.state.layers[id].status!=="OFF")return;const now=this.ctx.currentTime;let boundary=this.nextBoundary(id==="SWEEP"?1:4);let fire=this.timeForBar(boundary);let start=fire;
    if(id==="RISER"){start=fire-BAR;if(start<now+.08){boundary+=4;fire=this.timeForBar(boundary);start=fire-BAR;}}
    if(id==="REVERSE"){start=fire-BEAT;if(start<now+.08){boundary+=4;fire=this.timeForBar(boundary);start=fire-BEAT;}}
    this.patch(id,{status:"ARMED",targetBar:boundary+1});this.emit({message:`${id} ARMED → BAR ${boundary+1}`});
    if(id==="WASH")this.at(fire,()=>this.wash(fire,1.8,.10));
    if(id==="RISER")this.at(start,()=>this.riser(start,BAR,.12));
    if(id==="DOWN")this.at(fire,()=>this.down(fire,1.5,.10));
    if(id==="REVERSE")this.at(start,()=>this.reverse(start,BEAT,.12));
    if(id==="IMPACT")this.at(fire,()=>this.impact(fire,.16));
    if(id==="SWEEP")this.at(fire,()=>this.sweep(fire,.65,.085));
    this.at(start,()=>{if(!this.state.running)return;this.patch(id,{status:"PLAYING",targetBar:boundary+1});this.emit({message:`${id} PLAYING`});});
    const end=id==="RISER"?fire+.08:id==="REVERSE"?fire+.08:id==="WASH"?fire+1.9:id==="DOWN"?fire+1.6:id==="IMPACT"?fire+.8:fire+.75;
    this.at(end,()=>{if(!this.state.running)return;this.patch(id,{status:"OFF",targetBar:null});this.emit({message:`${id} DONE`});});
  }
  private nextBoundary(q:1|4){if(!this.ctx)return 0;const bars=Math.max(0,(this.ctx.currentTime-this.startAt)/BAR);return Math.floor(bars/q+1)*q;}
  private timeForBar(i:number){return this.startAt+i*BAR;}
  private at(t:number,fn:()=>void){const d=Math.max(0,(t-(this.ctx?.currentTime??t))*1000);const id=window.setTimeout(()=>{this.timers.delete(id);fn();},d);this.timers.add(id);}
  private cancel(){this.timers.forEach(id=>window.clearTimeout(id));this.timers.clear();}
  private makeNoise(ctx:AudioContext){const b=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),d=b.getChannelData(0);let x=0x98ab31;for(let i=0;i<d.length;i++){x=(1664525*x+1013904223)>>>0;d[i]=(x/0xffffffff)*2-1;}return b;}
  private wash(t:number,dur:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.value=1700;lp.type="lowpass";lp.frequency.setValueAtTime(10500,t);lp.frequency.exponentialRampToValueAtTime(2900,t+dur);p.pan.setValueAtTime(-.65,t);p.pan.linearRampToValueAtTime(.65,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.12);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(lp).connect(p).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private riser(t:number,dur:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.Q.value=.8;bp.frequency.setValueAtTime(320,t);bp.frequency.exponentialRampToValueAtTime(10500,t+dur*.98);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+dur*.92);g.gain.linearRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private down(t:number,dur:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;bp.type="bandpass";bp.Q.value=.65;bp.frequency.setValueAtTime(10500,t);bp.frequency.exponentialRampToValueAtTime(300,t+dur);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private reverse(t:number,dur:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),hp=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;hp.type="highpass";hp.frequency.setValueAtTime(3500,t);hp.frequency.exponentialRampToValueAtTime(12000,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(a,t+dur*.9);g.gain.linearRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.01);}
  private impact(t:number,a:number){const c=this.ctx;if(!c||!this.master)return;const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(32,t+.62);g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0001,t+.68);o.connect(g).connect(this.master);o.start(t);o.stop(t+.7);if(this.noise){const s=c.createBufferSource(),hp=c.createBiquadFilter(),n=c.createGain();s.buffer=this.noise;hp.type="highpass";hp.frequency.value=3200;n.gain.setValueAtTime(a*.8,t);n.gain.exponentialRampToValueAtTime(.0001,t+.45);s.connect(hp).connect(n).connect(this.master);s.start(t);s.stop(t+.48);}}
  private sweep(t:number,dur:number,a:number){const c=this.ctx;if(!c||!this.master||!this.noise)return;const s=c.createBufferSource(),bp=c.createBiquadFilter(),p=c.createStereoPanner(),g=c.createGain();s.buffer=this.noise;bp.type="bandpass";bp.Q.value=.7;bp.frequency.setValueAtTime(700,t);bp.frequency.exponentialRampToValueAtTime(8500,t+dur);p.pan.setValueAtTime(-.7,t);p.pan.linearRampToValueAtTime(.7,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+dur*.45);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(bp).connect(p).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
}
