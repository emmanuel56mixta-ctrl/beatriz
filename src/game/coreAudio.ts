import { BPM, type MixState, type PieceId, type Production, type VisualClock } from "./types";

export type SkinStage = 0 | 1 | 2 | 3 | 4;
export type SectionVariant = "A" | "A′" | "B";
export type TensionState = "CALM" | "BUILD" | "TENSE";

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const SKIN_NAMES = ["SKELETON", "HATS", "BASS", "OPEN", "FULL"] as const;
const LEVEL_FORM: SectionVariant[] = ["A", "A′", "B", "A′"];
type PendingSkin = { stage: SkinStage; variant: SectionVariant; at: number };

export class CoreAudio {
  ctx: AudioContext | null = null;
  onStep: ((step: number, time: number) => void) | null = null;
  private master: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private noise: AudioBuffer | null = null;
  private scheduler: number | null = null;
  private nextStepTime = 0;
  private absStep = 0;
  private startAt = 0;
  private userVolume = 0.72;
  private muted = false;
  private running = false;
  private paused = false;

  skinStage: SkinStage = 0;
  sectionVariant: SectionVariant = "A";
  tensionState: TensionState = "CALM";
  stackHeight = 0;
  lineCount = 0;
  lastGesture = "READY";
  private pendingSkin: PendingSkin | null = null;
  private dangerLatched = false;
  private dangerBuildStartBar = 0;
  private milestones = { double: false, triple: false, tetris: false };

  get bpm() { return BPM; }
  get energy() { return clamp(this.stackHeight / 20); }
  private get beatDuration() { return 60 / BPM; }
  private get stepDuration() { return this.beatDuration / 4; }

  async unlock() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.08;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    const bassBus = ctx.createGain(); bassBus.gain.value = 1; bassBus.connect(master);
    master.connect(limiter).connect(analyser).connect(ctx.destination);
    this.ctx = ctx; this.master = master; this.bassBus = bassBus; this.analyser = analyser;
    this.analyserData = new Uint8Array(analyser.frequencyBinCount);
    this.noise = this.makeNoiseBuffer(ctx);
    this.applyMaster();
    await ctx.resume();
  }

  start() {
    if (!this.ctx || this.running) return;
    this.running = true; this.paused = false;
    this.skinStage = 0; this.sectionVariant = "A"; this.tensionState = "CALM"; this.stackHeight = 0; this.lineCount = 0;
    this.lastGesture = "SKELETON"; this.pendingSkin = null; this.dangerLatched = false;
    this.milestones = { double: false, triple: false, tetris: false };
    this.absStep = 0; this.startAt = this.ctx.currentTime + 0.08; this.nextStepTime = this.startAt;
    this.scheduler = window.setInterval(() => this.scheduleAhead(), 25);
    this.scheduleAhead();
  }

  stop() { if (this.scheduler != null) window.clearInterval(this.scheduler); this.scheduler = null; this.running = false; }
  pause() { this.paused = true; if (this.ctx) void this.ctx.suspend(); }
  resume() { this.paused = false; if (this.ctx) void this.ctx.resume(); }
  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null; }
  setMuted(v: boolean) { this.muted = v; this.applyMaster(); }
  setVolume(v: number) { this.userVolume = clamp(v); this.applyMaster(); }
  private applyMaster() { if (!this.ctx || !this.master) return; this.master.gain.setTargetAtTime(this.muted ? 0.0001 : this.userVolume, this.ctx.currentTime, 0.02); }

  private scheduleAhead() {
    const ctx = this.ctx; if (!ctx || !this.running || this.paused) return;
    const horizon = ctx.currentTime + 0.12;
    while (this.nextStepTime < horizon) {
      if (this.pendingSkin && this.nextStepTime >= this.pendingSkin.at) {
        this.skinStage = this.pendingSkin.stage; this.sectionVariant = this.pendingSkin.variant; this.pendingSkin = null;
      }
      this.scheduleStep(this.absStep, this.nextStepTime);
      this.absStep += 1; this.nextStepTime += this.stepDuration;
    }
  }

  private scheduleStep(absStep: number, time: number) {
    const step = absStep % 16; const bar = Math.floor(absStep / 16);
    if (this.tensionState === "BUILD" && bar - this.dangerBuildStartBar >= 4) { this.tensionState = "TENSE"; this.lastGesture = "DANGER LATCH · TENSE GROOVE"; }
    if (step % 4 === 0) this.kick(time, 0.78);
    if (step === 4 || step === 12) this.clap(time, 0.34);

    const stage = this.skinStage; const variant = this.sectionVariant; const danger = this.tensionState;
    if (stage === 0) {
      if (step === 2 || step === 10) this.hat(time, 0.025, false);
    } else {
      if ([2, 6, 10, 14].includes(step)) this.hat(time, stage >= 3 ? 0.075 : 0.055, stage >= 3 && (step === 6 || step === 14));
      if (stage >= 3 && (step === 3 || step === 11)) this.ghost(time, 0.04);
      if (stage >= 4) {
        const extra = variant === "B" ? [1, 5, 9, 13, 15] : variant === "A′" ? [7, 15] : [15];
        if (extra.includes(step)) this.hat(time, 0.025, false);
      }
    }
    if (danger === "BUILD") {
      const buildBar = Math.max(0, bar - this.dangerBuildStartBar);
      if (step % 2 === 1 && step < 15) this.hat(time, 0.012 + buildBar * 0.008, false);
    } else if (danger === "TENSE" && (step === 7 || step === 15)) this.ghost(time, 0.055);

    this.scheduleBass(step, time, stage, variant);
    if (this.onStep && this.ctx) {
      const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
      window.setTimeout(() => this.onStep?.(step, time), delay);
    }
  }

  private scheduleBass(step: number, time: number, stage: SkinStage, variant: SectionVariant) {
    if (stage <= 1) {
      if (step === 0 || step === 8) this.bass(time + 0.028, step === 0 ? 55 : 65.41, stage === 0 ? 0.13 : 0.14, 0.16);
      return;
    }
    const patterns: Record<SectionVariant, Array<[number, number]>> = {
      A: [[0,55],[3,55],[6,65.41],[8,55],[11,73.42],[14,65.41]],
      "A′": [[0,55],[2,55],[6,65.41],[8,55],[10,73.42],[14,65.41]],
      B: [[0,55],[3,65.41],[6,73.42],[8,55],[11,65.41],[14,82.41],[15,73.42]],
    };
    const hit = patterns[variant].find(([s]) => s === step);
    if (hit) this.bass(time + (step % 4 === 0 ? 0.03 : 0), hit[1], stage >= 4 ? 0.18 : 0.15, 0.14);
  }

  private makeNoiseBuffer(ctx: AudioContext) {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); let seed = 0x12345678;
    for (let i=0;i<d.length;i++) { seed = (1664525 * seed + 1013904223) >>> 0; d[i] = (seed / 0xffffffff) * 2 - 1; }
    return b;
  }

  private kick(t: number, amp: number) {
    const ctx=this.ctx; if(!ctx||!this.master)return;
    const osc=ctx.createOscillator(), g=ctx.createGain(); osc.type="sine"; osc.frequency.setValueAtTime(112,t); osc.frequency.exponentialRampToValueAtTime(48,t+0.09);
    g.gain.setValueAtTime(Math.max(0.0001,amp),t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22); osc.connect(g).connect(this.master); osc.start(t); osc.stop(t+0.23);
    const click=ctx.createOscillator(), cg=ctx.createGain(); click.type="triangle"; click.frequency.setValueAtTime(1450,t); click.frequency.exponentialRampToValueAtTime(520,t+0.025);
    cg.gain.setValueAtTime(0.06,t); cg.gain.exponentialRampToValueAtTime(0.0001,t+0.035); click.connect(cg).connect(this.master); click.start(t); click.stop(t+0.04); this.duckBass(t);
  }

  private clap(t:number,amp:number) {
    const ctx=this.ctx; if(!ctx||!this.master||!this.noise)return; const src=ctx.createBufferSource(); src.buffer=this.noise;
    const hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=900; const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1900; bp.Q.value=0.8;
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); for(const dt of [0,0.013,0.027]){g.gain.setValueAtTime(amp,t+dt);g.gain.exponentialRampToValueAtTime(0.0001,t+dt+0.045);} src.connect(hp).connect(bp).connect(g).connect(this.master);src.start(t);src.stop(t+0.12);
  }

  private hat(t:number,amp:number,open:boolean){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=open?6200:7600;const g=ctx.createGain();const dur=open?0.16:0.045;g.gain.setValueAtTime(Math.max(0.0001,amp),t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);src.connect(hp).connect(g).connect(this.master);src.start(t);src.stop(t+dur+0.01);}
  private ghost(t:number,amp:number){this.rim(t,amp,3100);}
  private rim(t:number,amp=0.12,freq=2500){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=freq;bp.Q.value=3.2;const g=ctx.createGain();g.gain.setValueAtTime(Math.max(0.0001,amp),t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.055);src.connect(bp).connect(g).connect(this.master);src.start(t);src.stop(t+0.065);}
  private bass(t:number,hz:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.bassBus)return;const osc=ctx.createOscillator();osc.type="triangle";osc.frequency.value=hz;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=520;lp.Q.value=0.7;const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(amp,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);osc.connect(lp).connect(g).connect(this.bassBus);osc.start(t);osc.stop(t+dur+0.02);}
  private duckBass(t:number){const bus=this.bassBus;if(!bus)return;bus.gain.cancelScheduledValues(t);bus.gain.setValueAtTime(Math.max(0.15,bus.gain.value),t);bus.gain.linearRampToValueAtTime(0.24,t+0.004);bus.gain.exponentialRampToValueAtTime(1,t+0.085);}

  private iGesture(t:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;this.duckBass(t);const src=ctx.createBufferSource();src.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.setValueAtTime(1500,t);bp.frequency.exponentialRampToValueAtTime(5200,t+0.17);bp.Q.value=1.5;const pan=ctx.createStereoPanner();pan.pan.value=-0.28;const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.11,t+0.018);g.gain.exponentialRampToValueAtTime(0.0001,t+0.19);src.connect(bp).connect(pan).connect(g).connect(this.master);src.start(t);src.stop(t+0.2);}
  private tGesture(t:number){const ctx=this.ctx;if(!ctx||!this.master)return;const pan=ctx.createStereoPanner();pan.pan.value=0.25;const sum=ctx.createGain();sum.gain.value=0.055;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=2400;const env=ctx.createGain();env.gain.setValueAtTime(0.0001,t);env.gain.linearRampToValueAtTime(1,t+0.006);env.gain.exponentialRampToValueAtTime(0.0001,t+0.085);sum.connect(lp).connect(pan).connect(env).connect(this.master);for(const hz of [220,261.63,329.63]){const o=ctx.createOscillator();o.type="triangle";o.frequency.value=hz;o.connect(sum);o.start(t);o.stop(t+0.09);}}

  lock(piece:PieceId){const ctx=this.ctx;if(!ctx||!this.running)return;const t=ctx.currentTime+0.004;const velocity=0.07+Math.min(0.03,this.stackHeight/20*0.03);this.rim(t,velocity,3400);if(piece==="I"){this.iGesture(t+0.006);this.lastGesture="I · SWEEP";}else if(piece==="T"){this.tGesture(t+0.006);this.lastGesture="T · STAB";}else this.lastGesture="LOCK · TICK";}

  hardDrop(){const ctx=this.ctx;if(!ctx||!this.running)return false;const pos=this.musicalPosition(ctx.currentTime);const beatInBar=pos.totalBeats%4;const dist=Math.min(beatInBar,4-beatInBar);const onOne=dist*this.beatDuration<=0.085;const t=ctx.currentTime+0.002;if(onOne){this.kick(t,0.62);this.crash(t,0.16,0.28);this.lastGesture="HARD DROP · ON THE 1";}else{this.rim(t,0.17,2200);this.lastGesture="HARD DROP · OFF GRID";}return onOne;}

  clear(lines:number,combo:number,totalLines:number){const ctx=this.ctx;if(!ctx||!this.running||lines<=0)return;this.lineCount=totalLines;if(lines>=2)this.milestones.double=true;if(lines>=3||combo>=2)this.milestones.triple=true;if(lines>=4)this.milestones.tetris=true;const start=this.nextBeatTime(ctx.currentTime);let end=start+this.stepDuration;if(lines===1){this.rim(start,0.14,2900);this.lastGesture="SINGLE · ACCENT";}else if(lines===2){for(let i=0;i<4;i++)this.rim(start+i*this.stepDuration,0.08+i*0.012,900+i*170);end=start+this.beatDuration*0.5;this.lastGesture="DOUBLE · MINI FILL";}else if(lines===3){for(let i=0;i<8;i++)if(i%2===0||i>=5)this.rim(start+i*this.stepDuration,0.075+i*0.009,760+i*120);end=start+this.beatDuration;this.lastGesture="TRIPLE · 1 BAR FILL";}else{this.crash(start,0.18,0.32);for(let i=0;i<12;i++)if(![3,7].includes(i))this.rim(start+i*this.stepDuration,0.07+i*0.006,650+i*105);this.crash(start+this.beatDuration*0.75,0.11,0.2);end=start+this.beatDuration;this.lastGesture="TETRIS · PHRASE";}this.pendingSkin={stage:this.stageFor(totalLines),variant:this.variantFor(totalLines,this.milestones.tetris),at:end};}

  private stageFor(lines:number):SkinStage{let stage:SkinStage=lines>=10?4:lines>=6?3:lines>=3?2:lines>=1?1:0;if(this.milestones.double)stage=Math.max(stage,2) as SkinStage;if(this.milestones.triple)stage=Math.max(stage,3) as SkinStage;if(this.milestones.tetris)stage=4;return stage;}
  private variantFor(lines:number,tetris:boolean):SectionVariant{if(tetris&&lines<10)return"B";const levelIndex=Math.floor(lines/10);return LEVEL_FORM[levelIndex%LEVEL_FORM.length]??"A";}
  private crash(t:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=4200;const g=ctx.createGain();g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);src.connect(hp).connect(g).connect(this.master);src.start(t);src.stop(t+dur+0.02);}

  setBoardHeight(rows:number){const ctx=this.ctx;this.stackHeight=rows;if(!ctx||!this.running)return;if(!this.dangerLatched&&rows>=14){this.dangerLatched=true;this.tensionState="BUILD";this.dangerBuildStartBar=this.musicalPosition(ctx.currentTime).bar;this.lastGesture="DANGER · 4 BAR BUILD";}else if(this.dangerLatched&&rows<=10){this.dangerLatched=false;this.tensionState="CALM";const t=this.nextBeatTime(ctx.currentTime);this.crash(t,0.08,0.18);this.tGesture(t+0.015);this.lastGesture="RELEASE · DANGER EXIT";}}
  setMix(mix:MixState){this.setBoardHeight(mix.stackHeight);}

  private nextBeatTime(now:number){const pos=this.musicalPosition(now);let target=Math.ceil(pos.totalBeats-1e-5);let t=this.startAt+target*this.beatDuration;if(t<now+0.015){target+=1;t=this.startAt+target*this.beatDuration;}return t;}
  private musicalPosition(now:number){const elapsed=Math.max(0,now-this.startAt);const totalBeats=elapsed/this.beatDuration;const totalSteps=totalBeats*4;const step=Math.floor(totalSteps)%16;const frac=totalSteps-Math.floor(totalSteps);const bar=Math.floor(totalBeats/4);const beat=Math.floor(totalBeats%4);return{totalBeats,step,frac,bar,beat};}

  visual():VisualClock{const p=this.musicalPosition(this.ctx?.currentTime??this.startAt);const dna={bass:clamp(this.skinStage/4),harmony:0,hook:0,groove:clamp(this.skinStage/4),perc:clamp(Math.max(0,this.skinStage-1)/3),space:0,drive:this.tensionState==="CALM"?0.15:0.65};const production:Production={gain:this.userVolume,filter:1,room:0,delay:0};return{step:p.step,frac:p.frac,bpm:BPM,bar:p.bar+1,beat:p.beat+1,arrangement:this.tensionState==="BUILD"?"build":"groove",energy:this.energy,kickPulse:p.step%4===0?1-p.frac:0,duck:p.step%4===0?1-p.frac:0,dna,production,phrase:`${this.sectionVariant} · ${SKIN_NAMES[this.skinStage]}`,mood:this.tensionState};}
  waveform():Uint8Array{if(!this.analyser||!this.analyserData)return new Uint8Array();this.analyser.getByteTimeDomainData(this.analyserData);return this.analyserData;}

  notifyLock(piece:PieceId,_onTheOne:boolean){this.lock(piece);}
  notifyClear(lines:number,combo:number,_tspin:boolean,_perfect:boolean){this.clear(lines,combo,this.lineCount+lines);}
  nudge(_piece:PieceId){}
  requestRemix(){}
  requestDrop(){if(this.ctx){this.crash(this.nextBeatTime(this.ctx.currentTime),0.11,0.18);this.lastGesture="POWER · ACCENT";}}
  tapeStop(){if(!this.ctx||!this.master){this.stop();return;}const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(Math.max(0.0001,this.master.gain.value),t);this.master.gain.exponentialRampToValueAtTime(0.0001,t+0.45);window.setTimeout(()=>this.stop(),500);}
}