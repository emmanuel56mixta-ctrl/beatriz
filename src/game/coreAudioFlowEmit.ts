import { CoreAudio } from "./coreAudioFlow";

declare module "./coreAudioFlow" {
  interface CoreAudio {
    emitStep(step: number, time: number): void;
  }
}

CoreAudio.prototype.emitStep = function emitStep(step: number, time: number) {
  if (!this.onStep || !this.ctx) return;
  const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
  window.setTimeout(() => this.onStep?.(step, time), delay);
};
