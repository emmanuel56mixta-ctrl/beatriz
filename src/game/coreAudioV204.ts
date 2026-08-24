import { BPM, type PieceId, type Production, type VisualClock } from "./types";

export type SkinStage = 0 | 1 | 2 | 3 | 4;
export type SectionVariant = "A" | "A′" | "B";
export type TensionState = "CALM" | "PRESSURE" | "BUILD" | "TENSE";
export type InstrumentTier = 0 | 1 | 2 | 3;
export type PhraseRole = "CHORDS" | "RESPONSE" | "MOTIF" | "COUNTER" | "ARP" | "HOOK";

type Harmony = { root: number; chord: number[]; top: number[] };
type BuiltPhrase = {
  id: number;
  role: PhraseRole;
  signature: string;
  rhythm: number[];
  degrees: number[];
  inversion: number;
  register: number;
};

const clamp = (n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const PIECE_VALUE: Record<PieceId, number> = { I:0, O:1, T:2, S:3, Z:4, J:5, L:6 };
const ROLE_ORDER: PhraseRole[] = ["CHORDS","RESPONSE","MOTIF","COUNTER","ARP","HOOK"];
const KIT_NAMES = ["RAW","DEEP","CLUB","PEAK"] as const;
const SKIN_NAMES = ["SKELETON","HATS","BASS","OPEN","FULL"] as const;
const HARMONY: Harmony[] = [
  {root:32,chord:[56,59,63,66],top:[71,73,75]},
  {root:28,chord:[52,56,59,63],top:[68,71,73]},
  {root:35,chord:[59,63,66,61],top:[71,75,78]},
  {root:30,chord:[54,58,61,64],top:[70,73,78]},
];

function midiHz(n:number){return 440*Math.pow(2,(n-69)/12);}
function uniq<T>(a:T[]){return [...new Set(a)];}

export class CoreAudio {
  ctx:AudioContext|null=null;
  onStep:((step:number,time:number)=>void)|null=null;
  private master:GainNode|null=null;
  private bassBus:GainNode|null=null;
  private musicBus:GainNode|null=null;
  private analyser:AnalyserNode|null=null;
  private analyserData:Uint8Array<ArrayBuffer>|null=null;
  private noise:AudioBuffer|null=null;
  private timer:number|null=null;
  private nextStepTime=0;
  private absStep=0;
  private startAt=0;
  private volume=.72;
  private muted=false;
  private running=false;
  private paused=false;

  private vocalBuffer:AudioBuffer|null=null;
  private vocalSource:AudioBufferSourceNode|null=null;
  private chopSource:AudioBufferSourceNode|null=null;

  private phrases:BuiltPhrase[]=[];
  private phraseId=0;
  private rewardBreakBar=-1;
  private rewardVocalStartBar=-1;
  private rewardVocalEndBar=-1;
  private rewardStartedBar=-1;
  private dangerLatched=false;
  private dangerBuildStartBar=0;
  private releaseLaunchBar=-1;
  private evolutionLaunchBar=-1;

  skinStage:SkinStage=0;
  sectionVariant:SectionVariant="A";
  tensionState:TensionState="CALM";
  instrumentTier:InstrumentTier=0;
  stackHeight=0;
  lineCount=0;
  momentum=0;
  tetrisCount=0;
  lastGesture="READY";
  lastRowSignature="—";

  get bpm(){return BPM;}
  get energy(){return clamp(this.stackHeight/20);}
  get memoryCount(){return this.phrases.length;}
  get inventoryName(){
    const n=this.phrases.length;
    return n===0?"FOUNDATION":n===1?"CHORDS":n===2?"RESPONSE":n===3?"MOTIF":n===4?"COUNTER":n===5?"ARP":"HOOK";
  }
  get instrumentName(){return KIT_NAMES[this.instrumentTier];}
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
    limiter.threshold.value=-2;limiter.knee.value=0;limiter.ratio.value=18;limiter.attack.value=.002;limiter.release.value=.09;
    const analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.35;
    const bassBus=ctx.createGain(),musicBus=ctx.createGain();
    bassBus.gain.value=1;musicBus.gain.value=1;
    bassBus.connect(master);musicBus.connect(master);master.connect(limiter).connect(analyser).connect(ctx.destination);
    this.ctx=ctx;this.master=master;this.bassBus=bassBus;this.musicBus=musicBus;this.analyser=analyser;
    this.analyserData=new Uint8Array(analyser.frequencyBinCount);this.noise=this.makeNoise(ctx);this.applyVolume();await ctx.resume();void this.loadVocal();
  }

  private async loadVocal(){
    const ctx=this.ctx;if(!ctx||this.vocalBuffer)return;
    try{const r=await fetch(`${import.meta.env.BASE_URL}api/reward-vocal`,{cache:"force-cache"});if(!r.ok)return;const b=await r.arrayBuffer();if(this.ctx)this.vocalBuffer=await this.ctx.decodeAudioData(b);}catch(e){console.warn("reward vocal unavailable",e);}
  }

  start(){
    if(!this.ctx||this.running)return;
    this.running=true;this.paused=false;this.phrases=[];this.phraseId=0;this.instrumentTier=0;this.skinStage=0;this.sectionVariant="A";this.tensionState="CALM";this.stackHeight=0;this.lineCount=0;this.momentum=0;this.tetrisCount=0;this.lastGesture="FOUNDATION";this.lastRowSignature="—";
    this.rewardBreakBar=-1;this.rewardVocalStartBar=-1;this.rewardVocalEndBar=-1;this.rewardStartedBar=-1;this.dangerLatched=false;this.dangerBuildStartBar=0;this.releaseLaunchBar=-1;this.evolutionLaunchBar=-1;this.stopVocal();this.stopChop();
    this.absStep=0;this.startAt=this.ctx.currentTime+.08;this.nextStepTime=this.startAt;this.timer=window.setInterval(()=>this.scheduleAhead(),25);this.scheduleAhead();
  }
  stop(){if(this.timer!=null)window.clearInterval(this.timer);this.timer=null;this.running=false;this.stopVocal();this.stopChop();}
  pause(){this.paused=true;if(this.ctx)void this.ctx.suspend();}
  resume(){this.paused=false;if(this.ctx)void this.ctx.resume();}
  dispose(){this.stop();void this.ctx?.close();this.ctx=null;}
  setMuted(v:boolean){this.muted=v;this.applyVolume();}
  setVolume(v:number){this.volume=clamp(v);this.applyVolume();}
  private applyVolume(){if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.muted?.0001:this.volume,this.ctx.currentTime,.02);}

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
      if([4,8,12].includes(step))this.rim(time,.05,1400+step*70);
      if(step>=12)this.rim(time,.06+(step-12)*.022,1900+(step-12)*600);
      if(step===15)this.sweep(time,.18,.34);this.emitStep(step,time);return;
    }

    const turnaround=bar>0&&phraseBar===7;
    const skipFourthKick=turnaround&&step===12&&!rewardVocal;

    if(bar===this.rewardVocalStartBar&&step===0&&this.rewardStartedBar!==bar){
      this.rewardStartedBar=bar;this.crash(time,.24,.5);this.kick(time,1);this.playBuiltChord(time+.02,bar,.09,.5,0);this.startVocal(time);this.lastGesture="TETRIS · VOCAL SPOTLIGHT";
    }else if(bar===this.evolutionLaunchBar&&step===0){
      this.crash(time,.14+.035*this.instrumentTier,.36);this.kick(time,.96);if(this.phrases.length)this.playBuiltChord(time+.02,bar,.075,.38,0);this.lastGesture=`BUILT · ${this.inventoryName} · ${this.instrumentName}`;
    }else if(bar===this.releaseLaunchBar&&step===0){
      this.crash(time,.13,.28);this.kick(time,.92);if(this.phrases.length)this.playBuiltChord(time+.02,bar,.05,.25,0);this.lastGesture="RELEASE · PRESSURE DOWN";
    }else if(step%4===0&&!skipFourthKick){this.kick(time,rewardVocal?.86:this.tensionState==="TENSE"?.84:.79);}
    if(step===4||step===12)this.clap(time,rewardVocal?.39:.34);

    this.scheduleRhythm(step,time,bar,phraseBar,rewardVocal);
    this.scheduleBass(step,time,bar,phraseBar,rewardVocal,turnaround);
    this.scheduleBuiltMusic(step,time,bar,phraseBar,rewardVocal);
    this.scheduleTension(step,time,bar);

    if(turnaround&&step>=13){this.rim(time,.045+(step-13)*.02,1800+(step-13)*560);if(step===15)this.sweep(time,.07+.012*this.instrumentTier,.18);}
    this.emitStep(step,time);
  }

  private scheduleRhythm(step:number,time:number,bar:number,phraseBar:number,vocal:boolean){
    if(this.skinStage===0){if(phraseBar===3&&step===10)this.hat(time,.018,false);}else if([2,6,10,14].includes(step)){
      const open=this.skinStage>=3&&(step===6||step===14)&&(phraseBar===3||phraseBar===6||this.instrumentTier>=2);this.hat(time,vocal?.052:this.skinStage>=3?.073:.052,open);
    }
    if(this.skinStage>=2&&phraseBar===2&&step===7)this.ghost(time,.032);
    if(this.skinStage>=3&&phraseBar===4&&(step===3||step===11))this.ghost(time,.04);
    if(this.instrumentTier>=1&&bar%2===1&&[3,7,11,15].includes(step))this.shaker(time,.018+.006*this.instrumentTier);
    if(this.instrumentTier>=2&&(step===5||step===13)&&phraseBar%2===0)this.perc(time,.035+.009*this.instrumentTier,bar,step);
    if(this.instrumentTier>=3&&phraseBar===6&&(step===6||step===14))this.hat(time,.086,true);
  }

  private scheduleBass(step:number,time:number,bar:number,phraseBar:number,vocal:boolean,turnaround:boolean){
    if(turnaround&&step>=12)return;
    const h=this.harmonyForBar(bar),scale=vocal?.75:1;
    if(this.skinStage<=1){if(step===0||step===8)this.bass(time+.028,h.root+(step===8?12:0),(this.skinStage===0?.13:.145)*scale,.16);return;}
    const pat:Record<SectionVariant,number[]>={A:[0,3,6,8,11,14],"A′":[0,2,6,8,10,14],B:[0,3,6,8,11,14,15]};
    if(!pat[this.sectionVariant].includes(step))return;if(phraseBar===3&&step>=10&&this.phrases.length>=3)return;
    let interval=0;if(step===6||step===14)interval=7;if(step===10||step===11)interval=12;if(step===15)interval=phraseBar===6?10:7;
    this.bass(time+(step%4===0?.03:0),h.root+interval,(this.skinStage>=4?.18:.155)*scale,.14);
  }

  private scheduleBuiltMusic(step:number,time:number,bar:number,phraseBar:number,vocal:boolean){
    if(this.phrases.length===0)return;
    // Each archived row occupies a musical role. Nothing here unlocks with time.
    for(const phrase of this.phrases.slice(0,12)){
      if(!this.roleActive(phrase.role,phraseBar))continue;
      const i=phrase.rhythm.indexOf(step);if(i<0)continue;
      const degree=phrase.degrees[i%phrase.degrees.length]??0;
      const ampScale=vocal?.55:1;
      if(phrase.role==="CHORDS")this.phraseChord(time,bar,phrase,degree,.042*ampScale);
      else if(phrase.role==="RESPONSE")this.phraseChord(time,bar,phrase,degree,.034*ampScale);
      else if(phrase.role==="MOTIF")this.phrasePluck(time,bar,phrase,degree,.04*ampScale,-.22);
      else if(phrase.role==="COUNTER")this.phraseLead(time,bar,phrase,degree,.034*ampScale,.22);
      else if(phrase.role==="ARP")this.phrasePluck(time,bar,phrase,degree,.025*ampScale,.12);
      else this.phraseLead(time,bar,phrase,degree,.05*ampScale,-.04);
    }
    if(this.phrases.length>6&&!vocal&&((phraseBar===5&&step===12)||(phraseBar===7&&step===8)))this.vocalChop(time,.18+.02*this.instrumentTier,bar+phraseBar);
  }

  private roleActive(role:PhraseRole,phraseBar:number){
    if(role==="CHORDS")return true;
    if(role==="RESPONSE")return phraseBar%2===1;
    if(role==="MOTIF")return [0,1,4,5].includes(phraseBar);
    if(role==="COUNTER")return [2,6].includes(phraseBar);
    if(role==="ARP")return [3,7].includes(phraseBar);
    return [4,5].includes(phraseBar);
  }

  private phraseChord(t:number,bar:number,p:BuiltPhrase,degree:number,amp:number){
    const h=this.harmonyForBar(bar),notes=h.chord.map((n,i)=>n+(i<p.inversion?12:0));
    const offset=degree%notes.length;const rotated=[...notes.slice(offset),...notes.slice(0,offset)];this.chord(t,rotated,amp,.18+.025*p.register);
  }
  private phrasePluck(t:number,bar:number,p:BuiltPhrase,degree:number,amp:number,pan:number){
    const h=this.harmonyForBar(bar),pool=[...h.chord,...h.top];const n=pool[degree%pool.length]!+12*p.register;this.pluck(t,n,amp,.14,pan);
  }
  private phraseLead(t:number,bar:number,p:BuiltPhrase,degree:number,amp:number,pan:number){
    const h=this.harmonyForBar(bar),pool=[...h.top,h.chord[1]!+12,h.chord[2]!+12];const n=pool[degree%pool.length]!;this.lead(t,n,amp,.2,pan);
  }

  private scheduleTension(step:number,time:number,bar:number){
    if(this.tensionState==="PRESSURE"){if(step===15)this.rim(time,.035,3500);if(bar%2===1&&step===7)this.ghost(time,.029);return;}
    if(this.tensionState==="BUILD"){
      const b=Math.max(0,bar-this.dangerBuildStartBar);if(step%2===1&&step<15)this.hat(time,.012+b*.009,false);if(b>=1&&(step===5||step===13))this.rim(time,.036+b*.009,1900);if(b===3&&step>=12)this.rim(time,.045+(step-12)*.018,1700+step*80);return;
    }
    if(this.tensionState==="TENSE"){if(step===7||step===15)this.ghost(time,.057);if(bar%2===1&&step===13)this.rim(time,.04,2100);}
  }

  clear(lines:number,combo:number,totalLines:number,rowPatterns:PieceId[][]=[]){
    const ctx=this.ctx;if(!ctx||!this.running||lines<=0)return;
    this.lineCount=totalLines;this.momentum+=(lines===1?1:lines===2?2.5:lines===3?4:6)+Math.min(3,Math.max(0,combo))*.5;
    const before=this.phrases.length;
    const patterns=rowPatterns.length?rowPatterns:Array.from({length:lines},()=>["I","O","T","S","Z","J","L","I","T","O"] as PieceId[]);
    for(const pattern of patterns)this.archiveRow(pattern);
    this.skinStage=Math.min(4,Math.max(this.skinStage,this.phrases.length===0?0:this.phrases.length===1?1:this.phrases.length<=3?2:this.phrases.length<=5?3:4)) as SkinStage;
    this.sectionVariant=this.phrases.length>=8?"B":this.phrases.length>=4?"A′":"A";

    // Only a true 4-line TETRIS changes the permanent base kit.
    if(lines===4){this.tetrisCount++;this.instrumentTier=Math.min(3,this.instrumentTier+1) as InstrumentTier;this.armVocalReward();}

    const t=this.nextBeatTime(ctx.currentTime);
    if(lines===1){this.rim(t,.14,2900);this.playBuiltChord(t+this.stepDuration,t===0?0:this.musicalPosition(t).bar,.052,.23,before);}
    else if(lines===2){for(let i=0;i<4;i++)this.rim(t+i*this.stepDuration,.08+i*.012,900+i*170);this.playBuiltChord(t+this.beatDuration*.5,this.musicalPosition(t).bar,.065,.32,before);}
    else if(lines===3){for(let i=0;i<8;i++)if(i%2===0||i>=5)this.rim(t+i*this.stepDuration,.075+i*.009,760+i*120);this.crash(t+this.beatDuration,.15,.28);}
    else{this.crash(t,.2,.36);for(let i=0;i<12;i++)if(![3,7].includes(i))this.rim(t+i*this.stepDuration,.07+i*.006,650+i*105);}

    this.evolutionLaunchBar=this.musicalPosition(ctx.currentTime).bar+1;
    this.lastGesture=`BUILT ${patterns.length} ROW${patterns.length>1?"S":""} · ${this.inventoryName}${lines===4?` · KIT ${this.instrumentName}`:""}`;
  }

  private archiveRow(pattern:PieceId[]){
    const clean=pattern.slice(0,10);while(clean.length<10)clean.push("O");
    const signature=clean.join("");this.lastRowSignature=signature;
    let seed=0;for(let c=0;c<clean.length;c++)seed+=((c+3)*17)*(PIECE_VALUE[clean[c]!] + 1);
    const starts:number[]=[];for(let c=0;c<clean.length;c++)if(c===0||clean[c]!==clean[c-1])starts.push(c);
    let rhythm=uniq(starts.map(c=>Math.min(15,1+Math.round(c*14/9))));
    if(rhythm.length<3)rhythm=uniq([...rhythm,5,10,14]);
    if(rhythm.length>6)rhythm=rhythm.filter((_,i)=>i%2===0||i===rhythm.length-1).slice(0,6);
    const degrees=rhythm.map((_,i)=>(PIECE_VALUE[clean[(i*2+seed)%10]!] + i + seed)%7);
    const role=ROLE_ORDER[Math.min(ROLE_ORDER.length-1,this.phrases.length%ROLE_ORDER.length)]!;
    this.phrases.push({id:++this.phraseId,role,signature,rhythm,degrees,inversion:seed%3,register:(seed>>2)%2});
    if(this.phrases.length>12)this.phrases.shift();
  }

  private playBuiltChord(t:number,bar:number,amp:number,dur:number,index:number){
    const p=this.phrases[Math.min(this.phrases.length-1,index)]??this.phrases.at(-1);if(!p)return;const h=this.harmonyForBar(bar),notes=h.chord.map((n,i)=>n+(i<p.inversion?12:0));this.chord(t,notes,amp,dur);
  }

  lock(piece:PieceId){
    const ctx=this.ctx;if(!ctx||!this.running)return;const t=ctx.currentTime+.004,bar=this.musicalPosition(t).bar;this.rim(t,.065+Math.min(.025,this.stackHeight/20*.025),3400);
    if(piece==="I"){this.iGesture(t+.006);this.lastGesture="I · SWEEP";}else if(piece==="T"){const h=this.harmonyForBar(bar);this.chord(t+.006,h.chord.slice(0,3),.05,.095);this.lastGesture="T · HARMONIC STAB";}else this.lastGesture="LOCK · TICK";
  }

  hardDrop(){
    const ctx=this.ctx;if(!ctx||!this.running)return false;const p=this.musicalPosition(ctx.currentTime),beatInBar=p.totalBeats%4,dist=Math.min(beatInBar,4-beatInBar),onOne=dist*this.beatDuration<=.085,t=ctx.currentTime+.002;
    if(onOne){this.kick(t,.64);this.crash(t,.17,.29);if(this.phrases.length)this.playBuiltChord(t+.012,p.bar,.045,.22,0);this.lastGesture="HARD DROP · ON THE 1";}else{this.rim(t,.17,2200);this.lastGesture="HARD DROP · OFF GRID";}return onOne;
  }

  setBoardHeight(rows:number){
    const ctx=this.ctx;this.stackHeight=rows;if(!ctx||!this.running)return;
    if(!this.dangerLatched&&rows>=14){this.dangerLatched=true;this.tensionState="BUILD";this.dangerBuildStartBar=this.musicalPosition(ctx.currentTime).bar;this.lastGesture="DANGER · 4 BAR BUILD";}
    else if(this.dangerLatched&&rows<=10){this.dangerLatched=false;this.tensionState=rows>=8?"PRESSURE":"CALM";this.releaseLaunchBar=this.musicalPosition(ctx.currentTime).bar+1;this.lastGesture="RELEASE ARMED";}
    else if(!this.dangerLatched)this.tensionState=rows>=8?"PRESSURE":"CALM";
  }

  private armVocalReward(){const ctx=this.ctx;if(!ctx)return;const b=this.musicalPosition(ctx.currentTime).bar;if(b>=this.rewardBreakBar&&b<this.rewardVocalEndBar)return;this.rewardBreakBar=b+1;this.rewardVocalStartBar=this.rewardBreakBar+1;this.rewardVocalEndBar=this.rewardVocalStartBar+10;this.rewardStartedBar=-1;}
  private startVocal(t:number){const ctx=this.ctx,master=this.master,b=this.vocalBuffer;if(!ctx||!master||!b){void this.loadVocal();return;}this.stopVocal();this.stopChop();const off=48*this.barDuration,dur=Math.min(10*this.barDuration,Math.max(.2,b.duration-off-.05)),s=ctx.createBufferSource();s.buffer=b;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=110;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.4,t+.08);g.gain.setValueAtTime(.4,t+Math.max(.1,dur-.5));g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(master);s.start(t,off,dur);s.onended=()=>{if(this.vocalSource===s)this.vocalSource=null;};this.vocalSource=s;}
  private vocalChop(t:number,amp:number,seed:number){const ctx=this.ctx,master=this.master,b=this.vocalBuffer;if(!ctx||!master||!b||this.vocalSource)return;this.stopChop();const offs=[92,104,116,128],off=Math.min(b.duration-.8,offs[Math.abs(seed)%offs.length]!);if(off<0)return;const s=ctx.createBufferSource();s.buffer=b;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=150;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.62);s.connect(hp).connect(g).connect(master);s.start(t,off,.65);s.onended=()=>{if(this.chopSource===s)this.chopSource=null;};this.chopSource=s;}
  private stopVocal(){if(!this.vocalSource)return;try{this.vocalSource.stop();}catch{}this.vocalSource=null;}
  private stopChop(){if(!this.chopSource)return;try{this.chopSource.stop();}catch{}this.chopSource=null;}

  private harmonyForBar(bar:number){return HARMONY[((bar%HARMONY.length)+HARMONY.length)%HARMONY.length]!;}
  private makeNoise(ctx:AudioContext){const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),d=b.getChannelData(0);let seed=0x12345678;for(let i=0;i<d.length;i++){seed=(1664525*seed+1013904223)>>>0;d[i]=(seed/0xffffffff)*2-1;}return b;}

  private kick(t:number,amp:number){
    const ctx=this.ctx;if(!ctx||!this.master)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type=this.instrumentTier>=2?"triangle":"sine";o.frequency.setValueAtTime(112+7*this.instrumentTier,t);o.frequency.exponentialRampToValueAtTime(48-2*this.instrumentTier,t+.095);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.22+.012*this.instrumentTier);o.connect(g).connect(this.master);o.start(t);o.stop(t+.27);
    const c=ctx.createOscillator(),cg=ctx.createGain();c.type=this.instrumentTier>=1?"square":"triangle";c.frequency.setValueAtTime(1450+350*this.instrumentTier,t);c.frequency.exponentialRampToValueAtTime(520+100*this.instrumentTier,t+.025);cg.gain.setValueAtTime(.045+.015*this.instrumentTier,t);cg.gain.exponentialRampToValueAtTime(.0001,t+.035);c.connect(cg).connect(this.master);c.start(t);c.stop(t+.04);
    if(this.instrumentTier>=2){const s=ctx.createOscillator(),sg=ctx.createGain();s.type="sine";s.frequency.value=44;sg.gain.setValueAtTime(.12+.025*this.instrumentTier,t);sg.gain.exponentialRampToValueAtTime(.0001,t+.19);s.connect(sg).connect(this.master);s.start(t);s.stop(t+.2);}this.duckBass(t);
  }
  private clap(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const src=ctx.createBufferSource();src.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=900+120*this.instrumentTier;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1900+180*this.instrumentTier;bp.Q.value=.8;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);for(const dt of [0,.013,.027]){g.gain.setValueAtTime(amp,t+dt);g.gain.exponentialRampToValueAtTime(.0001,t+dt+.045+.006*this.instrumentTier);}src.connect(hp).connect(bp).connect(g).connect(this.master);src.start(t);src.stop(t+.14);}
  private hat(t:number,amp:number,open:boolean){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=open?6100:7600;const g=ctx.createGain(),dur=open?.16:.045;g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.01);}
  private shaker(t:number,amp:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=7000;bp.Q.value=1.3;const g=ctx.createGain();g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.035);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+.04);}
  private ghost(t:number,amp:number){this.rim(t,amp,3100);}
  private rim(t:number,amp=.12,freq=2500){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=freq;bp.Q.value=3.2;const g=ctx.createGain();g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.055);s.connect(bp).connect(g).connect(this.master);s.start(t);s.stop(t+.065);}
  private perc(t:number,amp:number,bar:number,step:number){const ctx=this.ctx;if(!ctx||!this.master)return;const h=this.harmonyForBar(bar),n=h.chord[(step+bar)%h.chord.length]!+12,o=ctx.createOscillator(),g=ctx.createGain();o.type="triangle";o.frequency.setValueAtTime(midiHz(n),t);o.frequency.exponentialRampToValueAtTime(midiHz(n)*.7,t+.05);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.07);o.connect(g).connect(this.master);o.start(t);o.stop(t+.075);}
  private bass(t:number,note:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.bassBus)return;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=500+100*this.instrumentTier;lp.Q.value=.65;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(amp,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);lp.connect(g).connect(this.bassBus);const o=ctx.createOscillator();o.type=this.instrumentTier>=1?"sawtooth":"triangle";o.frequency.value=midiHz(note);o.connect(lp);o.start(t);o.stop(t+dur+.02);if(this.instrumentTier>=2){const o2=ctx.createOscillator(),g2=ctx.createGain();o2.type="triangle";o2.frequency.value=midiHz(note+12);g2.gain.value=.14;o2.connect(g2).connect(lp);o2.start(t);o2.stop(t+dur+.02);}}
  private duckBass(t:number){if(!this.bassBus)return;this.bassBus.gain.cancelScheduledValues(t);this.bassBus.gain.setValueAtTime(Math.max(.15,this.bassBus.gain.value),t);this.bassBus.gain.linearRampToValueAtTime(.24,t+.004);this.bassBus.gain.exponentialRampToValueAtTime(1,t+.085);}
  private chord(t:number,notes:number[],amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.musicBus)return;const sum=ctx.createGain();sum.gain.value=amp;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=250;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=3300+350*this.instrumentTier;const env=ctx.createGain();env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(1,t+.012);env.gain.exponentialRampToValueAtTime(.0001,t+dur);sum.connect(hp).connect(lp).connect(env).connect(this.musicBus);notes.forEach((n,i)=>{const o=ctx.createOscillator();o.type=this.instrumentTier>=2&&i===0?"sawtooth":"triangle";o.frequency.value=midiHz(n);o.detune.value=i%2?3:-3;o.connect(sum);o.start(t);o.stop(t+dur+.02);});}
  private pluck(t:number,note:number,amp:number,dur:number,pan:number){const ctx=this.ctx;if(!ctx||!this.musicBus)return;const o=ctx.createOscillator(),g=ctx.createGain(),lp=ctx.createBiquadFilter(),p=ctx.createStereoPanner();o.type="triangle";o.frequency.value=midiHz(note);lp.type="lowpass";lp.frequency.value=3600;p.pan.value=pan;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(lp).connect(p).connect(g).connect(this.musicBus);o.start(t);o.stop(t+dur+.02);}
  private lead(t:number,note:number,amp:number,dur:number,pan:number){const ctx=this.ctx;if(!ctx||!this.musicBus)return;const o=ctx.createOscillator(),g=ctx.createGain(),lp=ctx.createBiquadFilter(),p=ctx.createStereoPanner();o.type=this.instrumentTier>=2?"square":"sine";o.frequency.value=midiHz(note);lp.type="lowpass";lp.frequency.value=4600;p.pan.value=pan;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(lp).connect(p).connect(g).connect(this.musicBus);o.start(t);o.stop(t+dur+.02);}
  private iGesture(t:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;this.duckBass(t);const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.setValueAtTime(1500,t);bp.frequency.exponentialRampToValueAtTime(5200,t+.17);bp.Q.value=1.5;const p=ctx.createStereoPanner();p.pan.value=-.28;const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.11,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+.19);s.connect(bp).connect(p).connect(g).connect(this.master);s.start(t);s.stop(t+.2);}
  private sweep(t:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.setValueAtTime(7000,t);hp.frequency.exponentialRampToValueAtTime(1300,t+dur);const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(amp,t+dur*.7);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}
  private crash(t:number,amp:number,dur:number){const ctx=this.ctx;if(!ctx||!this.master||!this.noise)return;const s=ctx.createBufferSource();s.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=4200;const g=ctx.createGain();g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(hp).connect(g).connect(this.master);s.start(t);s.stop(t+dur+.02);}

  private nextBeatTime(now:number){const p=this.musicalPosition(now);let target=Math.ceil(p.totalBeats-1e-5),t=this.startAt+target*this.beatDuration;if(t<now+.015){target++;t=this.startAt+target*this.beatDuration;}return t;}
  private musicalPosition(now:number){const elapsed=Math.max(0,now-this.startAt),totalBeats=elapsed/this.beatDuration,totalSteps=totalBeats*4;return{totalBeats,step:Math.floor(totalSteps)%16,frac:totalSteps-Math.floor(totalSteps),bar:Math.floor(totalBeats/4),beat:Math.floor(totalBeats%4)};}
  private emitStep(step:number,time:number){if(!this.onStep||!this.ctx)return;const delay=Math.max(0,(time-this.ctx.currentTime)*1000);window.setTimeout(()=>this.onStep?.(step,time),delay);}

  visual():VisualClock{
    const p=this.musicalPosition(this.ctx?.currentTime??this.startAt),vocal=p.bar>=this.rewardVocalStartBar&&p.bar<this.rewardVocalEndBar,air=p.bar===this.rewardBreakBar;
    const dna={bass:clamp(this.skinStage/4),harmony:clamp(this.phrases.length/6),hook:clamp(Math.max(0,this.phrases.length-4)/2),groove:clamp(this.skinStage/4),perc:clamp(this.instrumentTier/3),space:air?1:0,drive:this.tensionState==="CALM"?.15:this.tensionState==="PRESSURE"?.38:.7};
    const production:Production={gain:this.volume,filter:1,room:0,delay:0};const arrangement=air?"break":this.tensionState==="BUILD"?"build":vocal?"drop":"groove";
    return{step:p.step,frac:p.frac,bpm:BPM,bar:p.bar+1,beat:p.beat+1,arrangement,energy:this.energy,kickPulse:p.step%4===0?1-p.frac:0,duck:p.step%4===0?1-p.frac:0,dna,production,phrase:`${this.sectionVariant} · ${SKIN_NAMES[this.skinStage]} · ${this.inventoryName} · ${this.instrumentName}${vocal?" · VOCAL":""}`,mood:this.tensionState};
  }
  waveform():Uint8Array{if(!this.analyser||!this.analyserData)return new Uint8Array();this.analyser.getByteTimeDomainData(this.analyserData);return this.analyserData;}
  requestDrop(){if(this.ctx){const t=this.nextBeatTime(this.ctx.currentTime);this.crash(t,.12,.2);if(this.phrases.length)this.playBuiltChord(t+.02,this.musicalPosition(t).bar,.07,.35,0);}}
  requestRemix(){}
  nudge(_piece:PieceId){}
  notifyLock(piece:PieceId,_onTheOne:boolean){this.lock(piece);}
  notifyClear(lines:number,combo:number,_tspin:boolean,_perfect:boolean){this.clear(lines,combo,this.lineCount+lines,[]);}
  tapeStop(){if(!this.ctx||!this.master){this.stop();return;}this.stopVocal();this.stopChop();const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(Math.max(.0001,this.master.gain.value),t);this.master.gain.exponentialRampToValueAtTime(.0001,t+.45);window.setTimeout(()=>this.stop(),500);}
}
