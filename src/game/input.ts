import { ARR_RATE, DAS_DELAY } from "./pieces";

export type InputAction =
  | "left"
  | "right"
  | "soft"
  | "hard"
  | "rotCW"
  | "rotCCW"
  | "hold"
  | "pause"
  | "mute"
  | "remix"
  | "drop";

type Repeat = { dir: -1 | 1 | 0; das: number; arr: number; primed: boolean };

export class Input {
  private down = new Set<string>();
  repeat: Repeat = { dir: 0, das: 0, arr: 0, primed: false };
  soft = false;
  private queued: InputAction[] = [];
  enabled = true;

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.down.clear();
    this.repeat.dir = 0;
    this.soft = false;
  }

  pump(): InputAction[] {
    const q = this.queued;
    this.queued = [];
    return q;
  }

  press(action: InputAction) {
    if (!this.enabled && action !== "pause" && action !== "mute") return;
    if (action === "left") this.startRepeat(-1);
    else if (action === "right") this.startRepeat(1);
    else this.queued.push(action);
    if (action === "soft") this.soft = true;
  }

  release(action: InputAction) {
    if (action === "left" && this.repeat.dir === -1) this.repeat.dir = 0;
    if (action === "right" && this.repeat.dir === 1) this.repeat.dir = 0;
    if (action === "soft") this.soft = false;
  }

  tickRepeat(dt: number): number {
    if (this.repeat.dir === 0) return 0;
    if (!this.repeat.primed) return 0;
    this.repeat.das += dt;
    if (this.repeat.das < DAS_DELAY) return 0;
    this.repeat.arr += dt;
    let steps = 0;
    while (this.repeat.arr >= ARR_RATE) {
      this.repeat.arr -= ARR_RATE;
      steps += 1;
    }
    return steps * this.repeat.dir;
  }

  private startRepeat(dir: -1 | 1) {
    if (this.repeat.dir === dir) return;
    this.repeat = { dir, das: 0, arr: 0, primed: true };
    this.queued.push(dir === -1 ? "left" : "right");
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const action = mapKey(e.code);
    if (!action) return;
    e.preventDefault();
    this.down.add(e.code);
    this.press(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = mapKey(e.code);
    if (!action) return;
    this.down.delete(e.code);
    this.release(action);
  };
}

function mapKey(code: string): InputAction | null {
  switch (code) {
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    case "ArrowDown":
    case "KeyS":
      return "soft";
    case "ArrowUp":
    case "KeyW":
    case "KeyX":
      return "rotCW";
    case "KeyZ":
    case "ControlLeft":
    case "ControlRight":
      return "rotCCW";
    case "Space":
      return "hard";
    case "KeyC":
    case "ShiftLeft":
    case "ShiftRight":
      return "hold";
    case "Escape":
    case "KeyP":
      return "pause";
    case "KeyM":
      return "mute";
    case "KeyR":
      return "remix";
    case "KeyF":
      return "drop";
    default:
      return null;
  }
}
