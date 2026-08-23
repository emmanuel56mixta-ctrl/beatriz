import { TetrisEngine } from "./engine";
import { CoreAudio, type SectionVariant, type SkinStage, type TensionState } from "./coreAudioFlow";
import { Renderer } from "./render";
import { Juice } from "./juice";
import { Input, type InputAction } from "./input";
import { analyze, cellsOnStep, stepToRow } from "./mix";
import { PIECE_COLOR_VAR } from "./pieces";
import type { GameEvent, PieceId } from "./types";

const HI_KEY = "beatris-v020-hi";
function loadHigh(){try{return Number(localStorage.getItem(HI_KEY)||"0")||0;}catch{return 0;}}
function saveHigh(n:number){try{localStorage.setItem(HI_KEY,String(n));}catch{/* ignore */}}

export type CoreHud={
  score:number;high:number;lines:number;level:number;combo:number;tetrises:number;bpm:number;bar:number;beat:number;step:number;
  boardHeight:number;skinStage:SkinStage;skinName:string;section:SectionVariant;tension:TensionState;lastGesture:string;flash:string|null;
  momentum:number;nextMomentum:number;
  hold:PieceId|null;canHold:boolean;next:PieceId[];
};
function emptyHud():CoreHud{return{score:0,high:loadHigh(),lines:0,level:1,combo:0,tetrises:0,bpm:124,bar:1,beat:1,step:0,boardHeight:0,skinStage:0,skinName:"SKELETON",section:"A",tension:"CALM",lastGesture:"READY",flash:null,momentum:0,nextMomentum:4,hold:null,canHold:true,next:[]};}

export class Session{
  engine=new TetrisEngine();house=new CoreAudio();renderer:Renderer;juice=new Juice();input=new Input();hud:CoreHud=emptyHud();
  mode:"title"|"playing"|"paused"|"over"="title";onHud:(h:CoreHud,mode:Session["mode"])=>void;muted=false;volume=0.72;
  private raf=0;private last=0;private lastEmit=0;private fallAcc=0;private softAcc=0;private flashUntil=0;private flashText:string|null=null;private ro:ResizeObserver|null=null;private starting=false;
  constructor(canvas:HTMLCanvasElement,onHud:Session["onHud"]){this.renderer=new Renderer(canvas);this.onHud=onHud;this.house.onStep=(step:number)=>this.scan(step);}
  attach(){this.input.attach();window.addEventListener("resize",this.onResize);document.addEventListener("visibilitychange",this.onVis);const parent=this.renderer.canvas.parentElement;if(parent){this.ro=new ResizeObserver(()=>this.renderer.resize());this.ro.observe(parent);}this.onResize();this.emit();}
  detach(){this.input.detach();window.removeEventListener("resize",this.onResize);document.removeEventListener("visibilitychange",this.onVis);this.ro?.disconnect();this.ro=null;this.stopLoop();this.house.dispose();}
  private onResize=()=>this.renderer.resize();
  private onVis=()=>{if(document.visibilityState==="visible"&&this.mode==="playing")this.house.resume();};
  async enter(){if(this.starting)return;this.starting=true;try{await this.house.unlock();this.house.stop();this.house.setVolume(this.volume);this.house.setMuted(this.muted);this.engine.reset();this.juice=new Juice();this.fallAcc=0;this.softAcc=0;this.house.start();this.mode="playing";this.input.enabled=true;this.last=performance.now();this.stopLoop();this.loop(this.last);this.emit();}finally{this.starting=false;}}
  restart(){this.house.stop();void this.enter();}
  pause(){if(this.mode!=="playing")return;this.mode="paused";this.house.pause();this.input.enabled=false;this.emit();}
  resume(){if(this.mode!=="paused")return;this.mode="playing";this.house.resume();this.input.enabled=true;this.last=performance.now();this.emit();}
  setMuted(v:boolean){this.muted=v;this.house.setMuted(v);this.emit();}
  setVolume(v:number){this.volume=v;this.house.setVolume(v);}
  setShake(v:boolean){this.juice.enabled=v;}
  remix(){}
  drop(){this.house.requestDrop();}
  perfectPiece(){}
  private stopLoop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;}
  private loop=(t:number)=>{this.raf=requestAnimationFrame(this.loop);const dt=Math.min(0.1,(t-this.last)/1000);this.last=t;this.handleInput(dt);if(this.mode==="playing"){this.engine.now=t;this.apply(this.engine.advanceLock(dt));this.fallAcc+=dt;const interval=this.engine.fallInterval();while(this.fallAcc>=interval){this.fallAcc-=interval;this.apply(this.engine.tickGravity());}if(this.input.soft){this.softAcc+=dt;while(this.softAcc>=0.045){this.softAcc-=0.045;this.apply(this.engine.softDrop());}}else this.softAcc=0;const mix=analyze(this.engine,this.house.energy);this.house.setBoardHeight(mix.stackHeight);}this.juice.update(dt);const snap=this.engine.snapshot();const clock=this.house.visual();if(this.flashText&&t>this.flashUntil)this.flashText=null;this.renderer.draw(snap,clock,this.juice,t/1000);if(t-this.lastEmit>60||this.flashText){this.syncHud();this.lastEmit=t;}};
  private scan(step:number){if(this.mode!=="playing")return;const mix=analyze(this.engine,this.house.energy);for(const cell of cellsOnStep(mix,step))this.renderer.flashCell(cell.col,stepToRow(step));}
  private handleInput(dt:number){for(const a of this.input.pump())this.act(a);if(this.mode!=="playing")return;const steps=this.input.tickRepeat(dt);if(!steps)return;const dir=steps>0?1:-1;for(let i=0;i<Math.abs(steps);i++)this.apply(this.engine.move(dir));}
  private act(a:InputAction){if(a==="mute"){this.setMuted(!this.muted);return;}if(a==="pause"){if(this.mode==="playing")this.pause();else if(this.mode==="paused")this.resume();return;}if(a==="remix")return;if(a==="drop"){this.drop();return;}if(this.mode!=="playing")return;if(a==="left")this.apply(this.engine.move(-1));if(a==="right")this.apply(this.engine.move(1));if(a==="rotCW")this.apply(this.engine.rotate(1));if(a==="rotCCW")this.apply(this.engine.rotate(-1));if(a==="hard"){const onOne=this.house.hardDrop();if(onOne)this.flash("ON THE 1",700);this.apply(this.engine.hardDrop());}if(a==="hold")this.apply(this.engine.holdPiece());if(a==="soft")this.apply(this.engine.softDrop());}
  private apply(events:GameEvent[]){if(!events.length)return;for(const ev of events){if(ev.kind==="harddrop")this.juice.addTrauma(0.14);if(ev.kind==="lock"){this.house.lock(ev.piece);this.juice.addTrauma(0.08);}if(ev.kind==="clear"){this.house.clear(ev.lines,ev.combo,this.engine.lines);const label=ev.lines===4?"TETRIS":ev.lines===3?"TRIPLE":ev.lines===2?"DOUBLE":"SINGLE";this.flash(label,ev.lines>=4?1000:650);this.juice.addTrauma(0.16+ev.lines*0.09);const color=tokenColor(ev.tspin?"T":"I");for(const row of ev.clearedRows)for(let c=0;c<10;c++){const{x,y}=this.renderer.cellCenter(c,row);this.juice.burst(x,y,color,3);}const mid=this.renderer.cellCenter(5,10);this.juice.float(mid.x,mid.y,label);}if(ev.kind==="gameover"){this.mode="over";this.input.enabled=false;this.house.tapeStop();const hi=Math.max(this.hud.high,this.engine.score);saveHigh(hi);this.hud.high=hi;this.flash("FIN",1600);}}this.emit();}
  private flash(text:string,ms:number){this.flashText=text;this.flashUntil=performance.now()+ms;}
  private syncHud(){const snap=this.engine.snapshot();const clock=this.house.visual();const mix=analyze(this.engine,this.house.energy);this.hud={score:snap.score,high:Math.max(this.hud.high,snap.score),lines:snap.lines,level:snap.level,combo:snap.combo,tetrises:snap.tetrises,bpm:clock.bpm,bar:clock.bar,beat:clock.beat,step:clock.step,boardHeight:mix.stackHeight,skinStage:this.house.skinStage,skinName:clock.phrase.split(" · ")[1]?.split(" · ")[0]??"SKELETON",section:this.house.sectionVariant,tension:this.house.tensionState,lastGesture:this.house.lastGesture,flash:this.flashText,momentum:this.house.momentum,nextMomentum:this.house.nextMomentumMilestone,hold:snap.hold,canHold:snap.canHold,next:snap.next};this.onHud(this.hud,this.mode);}
  private emit(){this.syncHud();}
}
function tokenColor(id:PieceId){if(typeof document==="undefined")return"#e8e4d9";return getComputedStyle(document.documentElement).getPropertyValue(PIECE_COLOR_VAR[id]).trim()||"#e8e4d9";}
