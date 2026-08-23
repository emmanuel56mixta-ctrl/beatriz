import { StemEngine } from "./audio/stemEngine";
import { TRACKS } from "./audio/library";
import { TetrisEngine } from "./engine";
import { Input, type Action } from "./input";
import { Juice } from "./juice";
import { analyze, cellsOnStep, stepToRow } from "./mix";
import { PIECE_COLOR_VAR } from "./pieces";
import { Renderer } from "./render";
import { POWER_COSTS, type Hud, type Mode, type PowerKind } from "./types";

const HI_KEY = "beatris-house-hi-v09";
function loadHigh(){try{return Number(localStorage.getItem(HI_KEY)||"0")||0;}catch{return 0;}}
function saveHigh(n:number){try{localStorage.setItem(HI_KEY,String(n));}catch{}}
function emptyHud():Hud{return{score:0,high:loadHigh(),lines:0,level:1,combo:0,maxCombo:0,tetrises:0,bpm:125,step:0,bar:1,beat:1,arrangement:"intro",flash:null,hold:null,canHold:true,next:[],charge:0,phrase:"FOUNDATION",musicLevel:0,boardHeight:0,layers:{drums:0,bass:0,music:0,vocals:0},pending:null,trackId:TRACKS[0]!.id,trackTitle:TRACKS[0]!.title};}

export class Session {
  engine=new TetrisEngine(); house=new StemEngine(); renderer:Renderer; juice=new Juice(); input=new Input(); hud:Hud=emptyHud(); mode:Mode="title";
  onHud:(hud:Hud,mode:Mode)=>void; muted=false; volume=0.78; raf=0; last=0; lastEmit=0; flashUntil=0; flashText:string|null=null; ro:ResizeObserver|null=null; charge=0; gravityAccumulator=0; softAccumulator=0; shake=true; starting=false; trackId=TRACKS[0]!.id;
  constructor(canvas:HTMLCanvasElement,onHud:(hud:Hud,mode:Mode)=>void){this.renderer=new Renderer(canvas);this.onHud=onHud;this.house.onStep=(step)=>this.scan(step);this.input.enabled=false;}
  attach(){this.input.attach();window.addEventListener("resize",this.onResize);document.addEventListener("visibilitychange",this.onVis);const parent=this.renderer.canvas.parentElement;if(parent){this.ro=new ResizeObserver(()=>this.renderer.resize());this.ro.observe(parent);}this.onResize();this.emit();}
  detach(){this.input.detach();window.removeEventListener("resize",this.onResize);document.removeEventListener("visibilitychange",this.onVis);this.ro?.disconnect();this.ro=null;this.stopLoop();this.house.dispose();}
  onResize=()=>this.renderer.resize();
  onVis=()=>{if(document.visibilityState==="visible"&&this.mode==="playing")void this.house.ctx?.resume();};
  setTrack(id:string){if(this.mode==="playing")return;this.trackId=id;this.hud={...this.hud,trackId:id,trackTitle:TRACKS.find(t=>t.id===id)?.title??id};this.emit();}
  async enter(){if(this.starting)return;this.starting=true;try{await this.house.unlock();await this.house.loadTrack(this.trackId);this.house.stop();this.house.setVolume(this.volume);this.house.setMuted(this.muted);this.engine.reset();this.charge=0;this.gravityAccumulator=0;this.softAccumulator=0;this.juice=new Juice();this.juice.enabled=this.shake;this.house.setBoardHeight(0);this.house.start();this.mode="playing";this.input.enabled=true;this.last=performance.now();this.stopLoop();this.loop(this.last);this.emit();}finally{this.starting=false;}}
  restart(){this.house.stop();void this.enter();}
  pause(){if(this.mode!=="playing")return;this.mode="paused";this.house.pause();this.input.enabled=false;this.emit();}
  resume(){if(this.mode!=="paused")return;this.mode="playing";this.house.resume();this.input.enabled=true;this.last=performance.now();this.emit();}
  setMuted(muted:boolean){this.muted=muted;this.house.setMuted(muted);this.emit();}
  setVolume(volume:number){this.volume=volume;this.house.setVolume(volume);}
  setShake(on:boolean){this.shake=on;this.juice.enabled=on;}
  usePower(kind:PowerKind){if(this.mode!=="playing")return;const cost=POWER_COSTS[kind];if(this.charge<cost)return;if(!this.house.request(kind))return;this.charge-=cost;const labels:Record<PowerKind,string>={flash:"FLASH",filter:"FILTER ARMED",boost:"BOOST ARMED",switch:"SWITCH ARMED",drop:"DROP SOLICITADO"};this.flash(labels[kind],kind==="drop"?1100:800);if(kind==="drop"||kind==="flash")this.juice.addTrauma(kind==="drop"?0.34:0.22);this.emit();}
  stopLoop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;}
  loop=(t:number)=>{this.raf=requestAnimationFrame(this.loop);const dt=Math.min(0.1,(t-this.last)/1000);this.last=t;this.handleInput(dt);if(this.mode==="playing"){this.engine.now=t;this.gravityAccumulator+=dt*1000;const gravityMs=this.engine.gravityIntervalMs();let gravityTicks=0;while(this.gravityAccumulator>=gravityMs&&gravityTicks<4){this.gravityAccumulator-=gravityMs;this.apply(this.engine.tickGravity());gravityTicks+=1;}if(this.input.soft){this.softAccumulator+=dt*1000;while(this.softAccumulator>=45){this.softAccumulator-=45;this.apply(this.engine.softDrop());}}else this.softAccumulator=0;this.apply(this.engine.advanceLock(dt));this.house.setBoardHeight(analyze(this.engine).stackHeight);}this.juice.update(dt);const snap=this.engine.snapshot();const clock=this.house.visual();if(this.flashText&&t>this.flashUntil)this.flashText=null;this.renderer.draw(snap,clock,this.juice,t/1000);if(t-this.lastEmit>70||this.flashText){this.syncHud(clock);this.lastEmit=t;}};
  scan(step:number){if(this.mode!=="playing")return;const mix=analyze(this.engine);for(const cell of cellsOnStep(mix.cells,step))this.renderer.flashCell(cell.col,stepToRow(step));}
  handleInput(dt:number){for(const action of this.input.pump())this.act(action);if(this.mode!=="playing")return;const steps=this.input.tickRepeat(dt);if(!steps)return;const dir=steps>0?1:-1;for(let i=0;i<Math.abs(steps);i++)this.apply(this.engine.move(dir));}
  act(action:Action){if(action==="mute"){this.setMuted(!this.muted);return;}if(action==="pause"){if(this.mode==="playing")this.pause();else if(this.mode==="paused")this.resume();return;}if(action==="flash"||action==="filter"||action==="boost"||action==="switch"||action==="drop"){this.usePower(action);return;}if(this.mode!=="playing")return;if(action==="left")this.apply(this.engine.move(-1));if(action==="right")this.apply(this.engine.move(1));if(action==="rotCW")this.apply(this.engine.rotate(1));if(action==="rotCCW")this.apply(this.engine.rotate(-1));if(action==="hard")this.apply(this.engine.hardDrop());if(action==="hold")this.apply(this.engine.holdPiece());if(action==="soft")this.apply(this.engine.softDrop());}
  apply(events:ReturnType<TetrisEngine["lock"]>){if(!events.length)return;const clock=this.house.visual();for(const event of events){if(event.kind==="lock"){const onBeat=clock.frac<0.16||clock.frac>0.92;const onTheOne=event.hardDrop&&onBeat&&clock.step===0;if(onTheOne){this.engine.score+=125*this.engine.level;this.charge=Math.min(100,this.charge+10);this.flash("EN EL UNO",760);this.juice.addTrauma(0.28);}this.juice.addTrauma(0.1);}if(event.kind==="clear"){const baseCharge=[0,12,24,40,70][event.lines]??70;this.charge=Math.min(100,this.charge+baseCharge+event.combo*5+(event.tspin?15:0)+(event.perfect?25:0));const label=event.perfect?"PERFECT":event.tspin?"T-SPIN":event.lines===4?"TETRIS":event.lines===3?"TRIPLE":event.lines===2?"DOUBLE":"SINGLE";this.flash(label,event.lines>=4?1100:700);this.juice.addTrauma(0.2+event.lines*0.12);if(event.lines>=4)this.juice.punch(0.07);const color=tokenColor(event.tspin?"T":"I");for(const row of event.clearedRows)for(let c=0;c<10;c++){const{x,y}=this.renderer.cellCenter(c,row);this.juice.burst(x,y,color,3);}const mid=this.renderer.cellCenter(5,10);this.juice.float(mid.x,mid.y,label);}if(event.kind==="harddrop")this.juice.addTrauma(0.16);if(event.kind==="gameover"){this.mode="over";this.input.enabled=false;this.house.tapeStop();const high=Math.max(this.hud.high,this.engine.score);saveHigh(high);this.hud.high=high;this.flash("FIN",2000);}}this.emit();}
  flash(text:string,ms:number){this.flashText=text;this.flashUntil=performance.now()+ms;}
  syncHud(clock:ReturnType<StemEngine["visual"]>){const snap=this.engine.snapshot();const next:Hud={score:snap.score,high:Math.max(this.hud.high,snap.score),lines:snap.lines,level:snap.level,combo:snap.combo,maxCombo:snap.maxCombo,tetrises:snap.tetrises,bpm:clock.bpm,step:clock.step,bar:clock.bar,beat:clock.beat,arrangement:clock.arrangement,flash:this.flashText,hold:snap.hold,canHold:snap.canHold,next:snap.next,charge:this.charge,phrase:this.house.phraseLabel,musicLevel:clock.musicLevel,boardHeight:clock.boardHeight,layers:clock.layers,pending:clock.pending,trackId:clock.trackId,trackTitle:clock.trackTitle};this.hud=next;this.onHud(next,this.mode);}
  emit(){this.syncHud(this.house.visual());}
}
function tokenColor(id:"I"|"T"){if(typeof document==="undefined")return"#e9e1cc";return getComputedStyle(document.documentElement).getPropertyValue(PIECE_COLOR_VAR[id]).trim()||"#e9e1cc";}
