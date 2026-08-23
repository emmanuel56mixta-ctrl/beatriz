import { BPM, type PieceId, type Production, type VisualClock } from "./types";

export type SkinStage = 0 | 1 | 2 | 3 | 4;
export type SectionVariant = "A" | "A′" | "B";
export type TensionState = "CALM" | "PRESSURE" | "BUILD" | "TENSE";
export type HarmonyStage = 0 | 1 | 2 | 3 | 4 | 5;
export type InstrumentTier = 0 | 1 | 2 | 3;

type Harmony = { root: number; chord: number[]; top: number[] };

const clamp = (n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const SKIN_NAMES=["SKELETON","HATS","BASS","OPEN","FULL"] as const;
const LEVEL_FORM:SectionVariant[]=["A","A′","B","A′"];
const HARMONY_NAMES=["ROOT","CHORD","RESPONSE","PROGRESSION","EXTENDED","MELODY"] as const;
const INSTRUMENT_NAMES=["RAW","PUNCH","CLUB","PEAK"] as const;

// One harmonic world only: G#m -> E -> B -> F#.
// Extensions remain inside the same key so cumulative layers never fight.
const HARMONY:Harmony[]=[
  {root:32,chord:[56,59,63,66],top:[71,75]},        // G#m7
  {root:28,chord:[52,56,59,63],top:[68,71]},        // Emaj7
  {root:35,chord:[59,63,66,61],top:[75,73]},        // Badd9
  {root:30,chord:[54,58,61,64],top:[70,73]},        // F#7/add9 color
];

function midiHz(n:number){return 440*Math.pow(2,(n-69)/12);}

/**
 * v0.20.3 — CUMULATIVE HARMONY
 * Action -> gesture.
 * Board -> tension.
 * Cleared rows -> permanent arrangement/harmony.
 * TRIPLE/TETRIS -> permanent instrument evolution.
 */
export class CoreAudio {
  ctx:AudioContext|null=null;
  onStep:((step:number,time:number)=>void)|null=null;

  private master:GainNode|null=null;
  private bassBus:GainNode|null=null;
  private analyser:AnalyserNode|null=null;
  private analyserData:Uint8Array<ArrayBuffer>|null=null;
  private noise:AudioBuffer|null=null;
  private scheduler:number|null=null;
  private nextStepTime=0;
  private absStep=0;
  private startAt=0;
  private userVolume=.72;
  private muted=false;
  private running=false;
  private paused=false;

  private rewardVocal:AudioBuffer|null=null;
  private rewardSource:AudioBufferSourceNode|null=null;
  private rewardBreakBar=-1;
  private rewardVocalStartBar=-1;
  private rewardVocalEndBar=-1;
  private rewardStartedBar=-1;

  skinStage:SkinStage=0;
  harmonyStage:HarmonyStage=0;
  instrumentTier:InstrumentTier=0;
  sectionVariant:SectionVariant="A";
  tensionState:TensionState="CALM";
  stackHeight=0;
  lineCount=0;
  momentum=0;
  lastGesture="READY";

  private dangerLatched=false;
  private dangerBuildStartBar=0;
  private evolutionLaunchBar=-1;
  private releaseLaunchBar=-1;
  private lastTripleAtLines=-1;

  get bpm(){return BPM;}
  get energy(){return clamp(this.stackHeight/20);}
  get harmonyName(){return HARMONY_NAMES[this.harmonyStage];}
  get instrumentName(){return INSTRUMENT_NAMES[this.instrumentTier];}
  private get beatDuration(){return 60/BPM;}
  private get stepDuration(){return this.beatDuration/4;}
  private get barDuration(){return this.beatDuration*4;}

  async unlock(){
    if(this.ctx){await this.ctx.resume();return;}
    const Ctor=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
    if(!Ctor)throw new Error("Web Audio no disponible");
    const ctx=new Ctor({latencyHint:"interactive"});
    const master=ctx.createGain();
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-2;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.08;
    const analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.35;
    const bassBus=ctx.createGain();bassBus.gain.value=1;bassBus.connect(master);
    master.connect(limiter).connect(analyser).connect(ctx.destination);
    this.ctx=ctx;this.master=master;this.bassBus=bassBus;this.analyser=analyser;
    this.analyserData=new Uint8Array(analyser.frequencyBinCount);
    this.noise=this.makeNoiseBuffer(ctx);
    this.applyMaster();
    await ctx.resume();
    void this.loadRewardVocal();
  }

  private async loadRewardVocal(){
    const ctx=this.ctx;if(!ctx||this.rewardVocal)return;
    try{
      const r=await fetch(`${import.meta.env.BASE_URL}api/reward-vocal`,{cache:"force-cache"});
      if(!r.ok)return;
      const bytes=await r.arrayBuffer();if(!this.ctx)return;
      this.rewardVocal=await this.ctx.decodeAudioData(bytes);
    }catch(e){console.warn("Beatris vocal reward unavailable",e);}
  }

  start(){
    if(!this.ctx||this.running)return;
    this.running=true;this.paused=false;this.skinStage=0;this.harmonyStage=0;this.instrumentTier=0;
    this.sectionVariant="A";this.tensionState="CALM";this.stackHeight=0;this.lineCount=0;this.momentum=0;
    this.lastGesture="SKELETON";this.dangerLatched=false;this.dangerBuildStartBar=0;this.evolutionLaunchBar=-1;this.releaseLaunchBar=-1;this.lastTripleAtLines=-1;
    this.rewardBreakBar=-1;this.rewardVocalStartBar=-1;this.rewardVocalEndBar=-1;this.rewardStartedBar=-1;this.stopRewardSource();
    this.absStep=0;this.startAt=this.ctx.currentTime+.08;this.nextStepTime=this.startAt;
    this.scheduler=window.setInterval(()=>this.scheduleAhead(),25);this.scheduleAhead();
  }
  stop(){if(this.scheduler!=null)window.clearInterval(this.scheduler);this.scheduler=null;this.running=false;this.stopRewardSource();}
  pause(){this.paused=true;if(this.ctx)void this.ctx.suspend();}
  resume(){this.paused=false;if(this.ctx)void this.ctx.resume();}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;}
  setMuted(v:boolean){this.muted=v;this.applyMaster();}
  setVolume(v:number){this.userVolume=clamp(v);this.applyMaster();}
  private applyMaster(){if(!this.ctx||!this.master)return;this.master.gain.setTargetAtTime(this.muted?.0001:this.userVolume,this.ctx.currentTime,.02);}

  private scheduleAhead(){
    const ctx=this.ctx;if(!ctx||!this.running||this.paused)return;
    const horizon=ctx.currentTime+.12;
    while(this.nextStepTime<horizon){this.scheduleStep(this.absStep,this.nextStepTime);this.absStep++;this.nextStepTime+=this.stepDuration;}
  }

  private scheduleStep(absStep:number,time:number){
    const step=absStep%16,bar=Math.floor(absStep/16),phraseBar=bar%8;
    if(this.tensionState==="BUILD"&&bar-this.dangerBuildStartBar>=4){this.tensionState="TENSE";this.lastGesture="DANGER · TENSE GROOVE";}

    const rewardBreak=bar===this.rewardBreakBar;
    const rewardVocal=bar>=this.rewardVocalStartBar&&bar<this.rewardVocalEndBar;

    if(rewardBreak){
      if([4,8,12].includes(step))this.rim(time,.05,1350+step*70);
      if(step>=12)this.rim(time,.055+(step-12)*.022,1800+(step-12)*580);
      if(step===15)this.sweepNoise(time,.18,.34);
      this.emitStep(step,time);return;
    }

    const turnaround=this.skinStage>=1&&bar>0&&phraseBar===7;
    const skipFourthKick=turnaround&&step===12&&!rewardVocal;

    if(bar===this.rewardVocalStartBar&&step===0&&this.rewardStartedBar!==bar){
      this.rewardStartedBar=bar;this.crash(time,.24,.52);this.kick(time,1);this.chordStab(time+.02,.105,bar,.62,true);this.startVocalReward(time);this.lastGesture="TETRIS · VOCAL SPOTLIGHT";
    }else if(bar===this.evolutionLaunchBar&&step===0){
      this.crash(time,.16+.025*this.instrumentTier,.34);this.kick(time,.94);this.chordStab(time+.018,.08,bar,.55,true);
      this.lastGesture=`EVOLUTION · ${this.instrumentName} · ${this.harmonyName}`;
    }else if(bar===this.releaseLaunchBar&&step===0){
      this.crash(time,.13,.28);this.kick(time,.92);this.chordStab(time+.018,.065,bar,.45,true);this.lastGesture="RELEASE · PRESSURE DOWN";
    }else if(step%4===0&&!skipFourthKick){
      this.kick(time,rewardVocal?.86:this.tensionState==="TENSE"?.83:.78);
    }

    if(step===4||step===12)this.clap(time,rewardVocal?.39:.34);

    this.scheduleSkin(step,time,bar,phraseBar,rewardVocal);
    this.scheduleBass(step,time,bar,phraseBar,rewardVocal,turnaround);
    this.scheduleHarmony(step,time,bar,phraseBar,rewardVocal);
    this.scheduleTension(step,time,bar);

    if(turnaround&&step>=13){
      this.rim(time,.044+(step-13)*.018,1800+(step-13)*520);
      if(step===15)this.sweepNoise(time,.06,.17);
    }
    this.emitStep(step,time);
  }

  private scheduleSkin(step:number,time:number,bar:number,phraseBar:number,rewardVocal:boolean){
    const stage=this.skinStage;
    if(stage===0){if(phraseBar===3&&step===10)this.hat(time,.018,false);return;}
    if([2,6,10,14].includes(step)){
      const open=stage>=3&&(step===6||step===14)&&(phraseBar===3||phraseBar===6||this.instrumentTier>=2);
      this.hat(time,rewardVocal?.052:stage>=3?.073:.051,open);
    }
    if(stage>=2&&phraseBar===2&&step===7)this.ghost(time,.032);
    if(stage>=3&&phraseBar===4&&(step===3||step===11))this.ghost(time,.04);
    if(stage>=4&&phraseBar%2===1){
      const extras=this.sectionVariant==="B"?[1,5,9,13]:this.sectionVariant==="A′"?[7,15]:[15];
      if(extras.includes(step))this.hat(time,.024,false);
    }
    if(this.instrumentTier>=1&&bar%2===1&&(step===5||step===13))this.perc(time,.035+.008*this.instrumentTier,bar,step);
    if(this.instrumentTier>=2&&phraseBar===6&&(step===6||step===14))this.hat(time,.082,true);
    if(this.instrumentTier>=3&&phraseBar===5&&step===15)this.perc(time,.065,bar,step);
  }

  private scheduleBass(step:number,time:number,bar:number,phraseBar:number,vocal:boolean,turnaround:boolean){
    if(turnaround&&step>=12)return;
    const h=this.harmonyForBar(bar),stage=this.skinStage,scale=vocal?.76:1;
    if(stage<=1){
      if(step===0||step===8)this.bass(time+.028,h.root+(step===8?12:0),(stage===0?.13:.145)*scale,.16);
      return;
    }
    const patterns:Record<SectionVariant,number[]>={A:[0,3,6,8,11,14],"A′":[0,2,6,8,10,14],B:[0,3,6,8,11,14,15]};
    if(!patterns[this.sectionVariant].includes(step))return;
    let interval=0;if(step===6||step===14)interval=7;if(step===10||step===11)interval=12;if(step===15)interval=phraseBar===6?10:7;
    this.bass(time+(step%4===0?.03:0),h.root+interval,(stage>=4?.18:.155)*scale,.14);
  }

  private scheduleHarmony(step:number,time:number,bar:number,phraseBar:number,rewardVocal:boolean){
    const hs=this.harmonyStage;if(hs===0||rewardVocal)return;
    // Every cleared row makes the harmonic floor permanently more articulate.
    if(hs>=1&&step===2)this.chordStab(time,.028+.006*hs,bar,.18+hs*.035,false);
    if(hs>=2&&step===10)this.chordStab(time,.025+.006*hs,bar,.18+hs*.03,false);
    if(hs>=3&&(step===6||step===14)&&phraseBar%2===1)this.chordStab(time,.024+.005*hs,bar,.22+hs*.025,true);
    if(hs>=4&&step===15&&(phraseBar===2||phraseBar===6))this.topNote(time,.045,bar,phraseBar===6?1:0);
    if(hs>=5){
      if(phraseBar===1&&step===7)this.topNote(time,.05,bar,0);
      if(phraseBar===3&&step===11)this.topNote(time,.052,bar,1);
      if(phraseBar===5&&step===7)this.topNote(time,.047,bar,0);
      if(phraseBar===7&&step===11)this.topNote(time,.055,bar,1);
    }
  }

  private scheduleTension(step:number,time:number,bar:number){
    if(this.tensionState==="PRESSURE"){
      if(step===15)this.rim(time,.035,3500);if(bar%2===1&&step===7)this.ghost(time,.029);return;
    }
    if(this.tensionState==="BUILD"){
      const b=Math.max(0,bar-this.dangerBuildStartBar);
      if(step%2===1&&step<15)this.hat(time,.012+b*.009,false);
      if(b>=1&&(step===5||step===13))this.rim(time,.035+b*.009,1900);
      if(b===3&&step>=12)this.rim(time,.045+(step-12)*.018,1700+step*80);return;
    }
    if(this.tensionState==="TENSE"){
      if(step===7||step===15)this.ghost(time,.056);if(bar%2===1&&step===13)this.rim(time,.04,2100);
    }
  }

  private harmonyForBar(bar:number){return HARMONY[((bar%HARMONY.length)+HARMONY.length)%HARMONY.length]!;}
  private makeNoiseBuffer(ctx:AudioContext){const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),d=b.getChannelData(0);let seed=0x12345678;for(let i=0;i<d.length;i++){seed=(1664525*seed+1013904223)>>>0;d[i]=(seed/0xffffffff)*2-1;}return b;}

  private kick(t:number,amp:number){
    const ctx=this.ctx;if(!ctx||!this.master)return;
    const base=ctx.createOscillator(),g=ctx.createGain();base.type=this.instrumentTier>=2?"triangle":"sine";base.frequency.setValueAtTime(this.instrumentTier>=1?122:112,t);base.frequency.exponentialRampToValueAtTime(this.instrumentTier>=2?44:48,t+.095);
    g.gain.setValueAtTime(Math.max(.0001,amp),t);g.gain.exponentialRampToValueAtTime(.0001,t+.22);base.connect(g).connect(this.master);base.start(t);base.stop(t+.23);
    const click=ctx.createOscillator(),cg=ctx.createGain();click.type=this.instrumentTier>=2?"sawtooth":"triangle";click.frequency.setValueAtTime(1500+this.instrumentTier*260,t);click.frequency.exponentialRampToValueAtTime(520,t+.026);cg.gain.setValueAtTime(.05+.012*this.instrumentTier,t);cg.gain.exponentialRampToValueAtTime(.0001,t+.038);click.connect(cg).connect(this.master);click.start(t);click.stop(t+.04);
    if(this.instrumentTier>=1){const body=ctx.createOscillator(),bg=ctx.createGain();body.type="sine";body.frequency.setValueAtTime(73,t);body.frequency.exponentialRampToValueAtTime(42,t+.12);bg.gain.setValueAtTime(.14+.025*this.instrumentTier,t);bg.gain.exponentialRampToValueAtTime(.0001,t+.18);body.connect(bg).connect(this.master);body.start(t);body.stop(t+.19);}
    this.duckBass(t);
  }

  private clap(t:number,amp:number){
    const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;
    const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=this.instrumentTier>=2?1100:900;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1900+this.instrumentTier*220;bp.Q.value=.8;
    const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);for(const dt of [0,.013,.027]){g.gain.setValueAtTime(amp,t+dt);g.gain.exponentialRampToValueAtTime(.0001,t+dt+.045);}src.connect(hp).connect(bp).connect(g).connect(this.master);src.start(t);src.stop(t+.12);
    if(this.instrumentTier>=1)this.rim(t+.008,.035+.012*this.instrumentTier,3200+this.instrumentTier*350);
  }

  private hat(t:number,amp:number,open:boolean){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=(open?6200:7600)-this.instrumentTier*180;const g=ctx.createGain();const dur=open?.16:.045;g.gain.setValueAtTime(Math.max(.0001,amp),t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(hp).connect(g).connect(this.master);src.start(t);src.stop(t+dur+.01);}
  private ghost(t:number,amp:number){this.rim(t,amp,3100);}
  private rim(t:number,amp=.12,freq=2500){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=freq;bp.Q.value=3.2;const g=ctx.createGain();g.gain.setValueAtTime(Math.max(.0001,amp),t);g.gain.exponentialRampToValueAtTime(.0001,t+.055);src.connect(bp).connect(g).connect(this.master);src.start(t);src.stop(t+.065);}
  private perc(t:number,amp:number,bar:number,step:number){const h=this.harmonyForBar(bar);const freq=midiHz(h.chord[(step+bar)%h.chord.length]!+12);const ctx=this.ctx;if(!ctx||!this.master)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.7,t+.05);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.07);o.connect(g).connect(this.master);o.start(t);o.stop(t+.075);}

  private bass(t:number,note:number,amp:number,dur:number){
    const ctx=this.ctx;if(!ctx||!this.bassBus)return;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=500+this.instrumentTier*90;lp.Q.value=.65;
    const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(amp,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);lp.connect(g).connect(this.bassBus);
    const o=ctx.createOscillator();o.type=this.instrumentTier>=1?"sawtooth":"triangle";o.frequency.value=midiHz(note);o.connect(lp);o.start(t);o.stop(t+dur+.02);
    if(this.instrumentTier>=2){const o2=ctx.createOscillator(),g2=ctx.createGain();o2.type="triangle";o2.frequency.value=midiHz(note+12);g2.gain.value=.16;o2.connect(g2).connect(lp);o2.start(t);o2.stop(t+dur+.02);}
  }
  private duckBass(t:number){const b=this.bassBus;if(!b)return;b.gain.cancelScheduledValues(t);b.gain.setValueAtTime(Math.max(.15,b.gain.value),t);b.gain.linearRampToValueAtTime(.24,t+.004);b.gain.exponentialRampToValueAtTime(1,t+.085);}

  private chordStab(t:number,amp:number,bar:number,dur:number,extended:boolean){
    const ctx=this.ctx;if(!ctx||!this.master)return;const h=this.harmonyForBar(bar);const notes=extended?h.chord:h.chord.slice(0,3);
    const sum=ctx.createGain();sum.gain.value=amp;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=260;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=2800+this.harmonyStage*420;lp.Q.value=.35;const env=ctx.createGain();env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(1,t+.012);env.gain.exponentialRampToValueAtTime(.0001,t+dur);sum.connect(hp).connect(lp).connect(env).connect(this.master);
    notes.forEach((n,i)=>{const o=ctx.createOscillator();o.type=this.instrumentTier>=2&&i===0?"sawtooth":"triangle";o.frequency.value=midiHz(n+(this.harmonyStage>=4&&i===notes.length-1?12:0));o.detune.value=i%2?3:-3;o.connect(sum);o.start(t);o.stop(t+dur+.02);});
  }
  private topNote(t:number,amp:number,bar:number,index:number){const ctx=this.ctx;if(!ctx||!this.master)return;const h=this.harmonyForBar(bar),o=ctx.createOscillator(),g=ctx.createGain(),lp=ctx.createBiquadFilter();o.type="sine";o.frequency.value=midiHz(h.top[index%h.top.length]!);lp.type="lowpass";lp.frequency.value=5000;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.24);o.connect(lp).connect(g).connect(this.master);o.start(t);o.stop(t+.25);}

  private iGesture(t:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;this.duckBass(t);const src=ctx.createBufferSource();src.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.setValueAtTime(1500,t);bp.frequency.exponentialRampToValueAtTime(5200,t+.17);bp.Q.value=1.5;const pan=ctx.createStereoPanner();pan.pan.value=-.28;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.11,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+.19);src.connect(bp).connect(pan).connect(g).connect(this.master);src.start(t);src.stop(t+.2);}
  private tGesture(t:number,bar:number){this.chordStab(t,.055,bar,.1,this.harmonyStage>=3);}
  private sweepNoise(t:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.setValueAtTime(7000,t);hp.frequency.exponentialRampToValueAtTime(1300,t+dur);const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+dur*.7);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(hp).connect(g).connect(this.master);src.start(t);src.stop(t+dur+.02);}
  private crash(t:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=4200;const g=ctx.createGain();g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(hp).connect(g).connect(this.master);src.start(t);src.stop(t+dur+.02);}

  lock(piece:PieceId){const ctx=this.ctx;if(!ctx||!this.running)return;const t=ctx.currentTime+.004,bar=this.musicalPosition(t).bar;this.rim(t,.065+Math.min(.025,this.stackHeight/20*.025),3400);if(piece==="I"){this.iGesture(t+.006);this.lastGesture="I · SWEEP";}else if(piece==="T"){this.tGesture(t+.006,bar);this.lastGesture="T · HARMONIC STAB";}else this.lastGesture="LOCK · TICK";}

  hardDrop(){const ctx=this.ctx;if(!ctx||!this.running)return false;const p=this.musicalPosition(ctx.currentTime),beatInBar=p.totalBeats%4,dist=Math.min(beatInBar,4-beatInBar),onOne=dist*this.beatDuration<=.085,t=ctx.currentTime+.002;if(onOne){this.kick(t,.64);this.crash(t,.17,.29);if(this.harmonyStage>0)this.chordStab(t+.012,.045,p.bar,.22,false);this.lastGesture="HARD DROP · ON THE 1";}else{this.rim(t,.17,2200);this.lastGesture="HARD DROP · OFF GRID";}return onOne;}

  clear(lines:number,combo:number,totalLines:number){
    const ctx=this.ctx;if(!ctx||!this.running||lines<=0)return;
    const previousHarmony=this.harmonyStage,previousInstrument=this.instrumentTier;
    this.lineCount=totalLines;
    this.momentum+=lines===1?1:lines===2?2.5:lines===3?4:6;this.momentum+=Math.min(3,Math.max(0,combo))*.5;

    this.harmonyStage=this.harmonyStageFor(totalLines);
    this.skinStage=this.skinStageFor(totalLines,lines);
    this.sectionVariant=LEVEL_FORM[Math.floor(totalLines/10)%LEVEL_FORM.length]??"A";

    // A 3+ line clear permanently evolves the physical instrument itself.
    if(lines>=3&&this.lastTripleAtLines!==totalLines){
      const jump=lines>=4?2:1;this.instrumentTier=Math.min(3,this.instrumentTier+jump) as InstrumentTier;this.lastTripleAtLines=totalLines;
    }

    const start=this.nextBeatTime(ctx.currentTime);
    if(lines===1){this.rim(start,.14,2900);this.chordStab(start+this.stepDuration,.04,start===0?0:this.musicalPosition(start).bar,.2,false);}
    else if(lines===2){for(let i=0;i<4;i++)this.rim(start+i*this.stepDuration,.08+i*.012,900+i*170);this.chordStab(start+this.beatDuration*.5,.06,this.musicalPosition(start).bar,.32,true);}
    else if(lines===3){for(let i=0;i<8;i++)if(i%2===0||i>=5)this.rim(start+i*this.stepDuration,.075+i*.009,760+i*120);this.crash(start+this.beatDuration,.15,.28);}
    else{this.crash(start,.2,.36);for(let i=0;i<12;i++)if(![3,7].includes(i))this.rim(start+i*this.stepDuration,.07+i*.006,650+i*105);this.armVocalReward();}

    // The permanent change lands on the next downbeat so it is unmistakable.
    if(this.harmonyStage>previousHarmony||this.instrumentTier>previousInstrument){
      this.evolutionLaunchBar=this.musicalPosition(ctx.currentTime).bar+1;
      this.lastGesture=`CLEAR · +HARMONY ${this.harmonyName} · ${this.instrumentName}`;
    }else this.lastGesture=`CLEAR · ${lines} · MOMENTUM ${this.momentum.toFixed(1)}`;
  }

  private harmonyStageFor(lines:number):HarmonyStage{return(lines>=8?5:lines>=5?4:lines>=3?3:lines>=2?2:lines>=1?1:0) as HarmonyStage;}
  private skinStageFor(lines:number,lastClear:number):SkinStage{if(lastClear>=4)return 4;if(lastClear>=3)return Math.max(this.skinStage,3) as SkinStage;return(lines>=10?4:lines>=6?3:lines>=3?2:lines>=1?1:0) as SkinStage;}

  private armVocalReward(){const ctx=this.ctx;if(!ctx)return;const bar=this.musicalPosition(ctx.currentTime).bar;if(bar>=this.rewardBreakBar&&bar<this.rewardVocalEndBar)return;this.rewardBreakBar=bar+1;this.rewardVocalStartBar=this.rewardBreakBar+1;this.rewardVocalEndBar=this.rewardVocalStartBar+10;this.rewardStartedBar=-1;}
  private startVocalReward(time:number){const ctx=this.ctx,master=this.master,b=this.rewardVocal;if(!ctx||!master||!b){void this.loadRewardVocal();return;}this.stopRewardSource();const off=48*this.barDuration,dur=Math.min(10*this.barDuration,Math.max(.2,b.duration-off-.05));const s=ctx.createBufferSource();s.buffer=b;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=110;const g=ctx.createGain();g.gain.setValueAtTime(.0001,time);g.gain.linearRampToValueAtTime(.4,time+.08);g.gain.setValueAtTime(.4,time+Math.max(.1,dur-.5));g.gain.exponentialRampToValueAtTime(.0001,time+dur);s.connect(hp).connect(g).connect(master);s.start(time,off,dur);s.onended=()=>{if(this.rewardSource===s)this.rewardSource=null;};this.rewardSource=s;}
  private stopRewardSource(){if(!this.rewardSource)return;try{this.rewardSource.stop();}catch{}this.rewardSource=null;}

  setBoardHeight(rows:number){const ctx=this.ctx;this.stackHeight=rows;if(!ctx||!this.running)return;if(!this.dangerLatched&&rows>=14){this.dangerLatched=true;this.tensionState="BUILD";this.dangerBuildStartBar=this.musicalPosition(ctx.currentTime).bar;this.lastGesture="DANGER · 4 BAR BUILD";}else if(this.dangerLatched&&rows<=10){this.dangerLatched=false;this.tensionState=rows>=8?"PRESSURE":"CALM";this.releaseLaunchBar=this.musicalPosition(ctx.currentTime).bar+1;this.lastGesture="RELEASE ARMED";}else if(!this.dangerLatched)this.tensionState=rows>=8?"PRESSURE":"CALM";}
  private nextBeatTime(now:number){const p=this.musicalPosition(now);let target=Math.ceil(p.totalBeats-1e-5),t=this.startAt+target*this.beatDuration;if(t<now+.015){target++;t=this.startAt+target*this.beatDuration;}return t;}
  private musicalPosition(now:number){const elapsed=Math.max(0,now-this.startAt),totalBeats=elapsed/this.beatDuration,totalSteps=totalBeats*4;return{totalBeats,step:Math.floor(totalSteps)%16,frac:totalSteps-Math.floor(totalSteps),bar:Math.floor(totalBeats/4),beat:Math.floor(totalBeats%4)};}
  private emitStep(step:number,time:number){if(!this.onStep||!this.ctx)return;const delay=Math.max(0,(time-this.ctx.currentTime)*1000);window.setTimeout(()=>this.onStep?.(step,time),delay);}

  visual():VisualClock{const p=this.musicalPosition(this.ctx?.currentTime??this.startAt),vocal=p.bar>=this.rewardVocalStartBar&&p.bar<this.rewardVocalEndBar,air=p.bar===this.rewardBreakBar;const dna={bass:clamp(this.skinStage/4),harmony:clamp(this.harmonyStage/5),hook:vocal?1:clamp((this.harmonyStage-3)/2),groove:clamp(this.skinStage/4),perc:clamp(this.instrumentTier/3),space:air?1:0,drive:this.tensionState==="CALM"?.15:this.tensionState==="PRESSURE"?.38:.7};const production:Production={gain:this.userVolume,filter:1,room:0,delay:0};const arrangement=air?"break":this.tensionState==="BUILD"?"build":vocal?"drop":"groove";return{step:p.step,frac:p.frac,bpm:BPM,bar:p.bar+1,beat:p.beat+1,arrangement,energy:this.energy,kickPulse:p.step%4===0?1-p.frac:0,duck:p.step%4===0?1-p.frac:0,dna,production,phrase:`${this.sectionVariant} · ${SKIN_NAMES[this.skinStage]} · H${this.harmonyStage} · ${this.instrumentName}${vocal?" · VOCAL":""}`,mood:this.tensionState};}
  waveform():Uint8Array{if(!this.analyser||!this.analyserData)return new Uint8Array();this.analyser.getByteTimeDomainData(this.analyserData);return this.analyserData;}
  notifyLock(piece:PieceId,_onTheOne:boolean){this.lock(piece);}notifyClear(lines:number,combo:number,_tspin:boolean,_perfect:boolean){this.clear(lines,combo,this.lineCount+lines);}nudge(_piece:PieceId){}requestRemix(){}requestDrop(){if(this.ctx){const t=this.nextBeatTime(this.ctx.currentTime);this.crash(t,.12,.2);if(this.harmonyStage>0)this.chordStab(t+.02,.07,this.musicalPosition(t).bar,.35,true);}}
  tapeStop(){if(!this.ctx||!this.master){this.stop();return;}this.stopRewardSource();const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(Math.max(.0001,this.master.gain.value),t);this.master.gain.exponentialRampToValueAtTime(.0001,t+.45);window.setTimeout(()=>this.stop(),500);}
}
