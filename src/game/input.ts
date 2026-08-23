import { ARR_RATE, DAS_DELAY } from "./pieces";

export type Action = "left" | "right" | "soft" | "hard" | "rotCW" | "rotCCW" | "hold" | "pause" | "mute" | "flash" | "filter" | "boost" | "switch" | "drop";

export class Input {
  down = new Set<string>(); repeat = { dir: 0, das: 0, arr: 0, primed: false }; soft = false; queued: Action[] = []; enabled = true;
  attach(){window.addEventListener("keydown",this.onKeyDown);window.addEventListener("keyup",this.onKeyUp);}
  detach(){window.removeEventListener("keydown",this.onKeyDown);window.removeEventListener("keyup",this.onKeyUp);this.down.clear();this.repeat.dir=0;this.soft=false;}
  pump(){const q=this.queued;this.queued=[];return q;}
  press(action:Action){if(!this.enabled&&action!=="pause"&&action!=="mute")return;if(action==="left")this.startRepeat(-1);else if(action==="right")this.startRepeat(1);else this.queued.push(action);if(action==="soft")this.soft=true;}
  release(action:Action){if(action==="left"&&this.repeat.dir===-1)this.repeat.dir=0;if(action==="right"&&this.repeat.dir===1)this.repeat.dir=0;if(action==="soft")this.soft=false;}
  tickRepeat(dt:number){if(this.repeat.dir===0||!this.repeat.primed)return 0;this.repeat.das+=dt;if(this.repeat.das<DAS_DELAY)return 0;this.repeat.arr+=dt;let steps=0;while(this.repeat.arr>=ARR_RATE){this.repeat.arr-=ARR_RATE;steps+=1;}return steps*this.repeat.dir;}
  startRepeat(dir:number){if(this.repeat.dir===dir)return;this.repeat={dir,das:0,arr:0,primed:true};this.queued.push(dir===-1?"left":"right");}
  onKeyDown=(e:KeyboardEvent)=>{if(e.repeat)return;const action=mapKey(e.code);if(!action)return;e.preventDefault();this.down.add(e.code);this.press(action);};
  onKeyUp=(e:KeyboardEvent)=>{const action=mapKey(e.code);if(!action)return;this.down.delete(e.code);this.release(action);};
}
function mapKey(code:string):Action|null{switch(code){case"ArrowLeft":case"KeyA":return"left";case"ArrowRight":case"KeyD":return"right";case"ArrowDown":case"KeyS":return"soft";case"ArrowUp":case"KeyW":case"KeyX":return"rotCW";case"KeyZ":case"ControlLeft":case"ControlRight":return"rotCCW";case"Space":return"hard";case"KeyC":case"ShiftLeft":case"ShiftRight":return"hold";case"Escape":case"KeyP":return"pause";case"KeyM":return"mute";case"Digit1":return"flash";case"Digit2":return"filter";case"Digit3":return"boost";case"Digit4":return"switch";case"Digit5":return"drop";default:return null;}}
