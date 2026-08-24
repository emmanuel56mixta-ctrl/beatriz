import { animate } from "animejs";

export type VisualSettings = {
  enabled: boolean;
  intensity: number;
  motion: number;
  trail: number;
};

const DEFAULTS: VisualSettings = { enabled: true, intensity: 0.82, motion: 0.78, trail: 0.62 };

export class VisualPerformanceV307 {
  private root: HTMLElement | null = null;
  private settings: VisualSettings = { ...DEFAULTS };

  bind(root: HTMLElement | null) {
    this.root = root;
  }

  setSettings(next: Partial<VisualSettings>) {
    this.settings = { ...this.settings, ...next };
  }

  armButton(button: HTMLElement | null, id: string) {
    if (!button || !this.settings.enabled) return;
    const amount = 1 + this.settings.intensity * 0.035;
    animate(button, {
      scale: [1, 0.95, amount, 1],
      duration: 240 + this.settings.motion * 140,
      ease: "out(4)",
    });
    this.label(id, "ARM", 0.34);
  }

  trigger(id: string) {
    if (!this.root || !this.settings.enabled) return;
    switch (id) {
      case "IMPACT": return this.impact(id);
      case "RISER": return this.riser(id);
      case "REVERSE": return this.reverse(id);
      case "WASH": return this.wash(id);
      case "DOWN": return this.down(id);
      case "SWEEP": return this.sweep(id);
      case "VOCAL20": return this.vocal(id);
      case "SHAKER": return this.particles(id, 12, "micro");
      case "GHOST": return this.ghost(id);
      case "RIDE": return this.rings(id, 2);
      case "STABS": return this.slashes(id, 4);
      case "ARP": return this.nodes(id, 7);
      case "TOMFILL": return this.columns(id, 5);
      case "BUILD": return this.build(id);
      case "CLUB": return this.impact(id, 0.72);
      case "CHORDS": return this.panels(id, 4);
      case "RESPONSE": return this.panels(id, 3, true);
      case "MOTIF": return this.nodes(id, 5);
      case "PERC": return this.particles(id, 9, "warm");
      case "VOCAL": return this.vocal(id, "VOCAL");
      case "HOOK": return this.slashes(id, 5);
      default: return this.label(id, "ON", 0.48);
    }
  }

  private add(className: string) {
    if (!this.root) return null;
    const el = document.createElement("div");
    el.className = `vis-node ${className}`;
    this.root.appendChild(el);
    return el;
  }

  private cleanup(el: HTMLElement | null) {
    if (el?.parentElement) el.parentElement.removeChild(el);
  }

  private duration(base: number) {
    return Math.max(180, base * (0.55 + this.settings.motion * 0.8));
  }

  private label(id: string, suffix: string, alpha = 0.5) {
    const el = this.add("vis-label");
    if (!el) return;
    el.textContent = `${id} · ${suffix}`;
    el.style.opacity = "0";
    animate(el, {
      opacity: [0, Math.min(1, alpha + this.settings.intensity * 0.2), 0],
      y: [10, 0, -18],
      scale: [0.94, 1, 1.03],
      duration: this.duration(720),
      ease: "out(3)",
      onComplete: () => this.cleanup(el),
    });
  }

  private impact(id: string, scale = 1) {
    const flash = this.add("vis-flash");
    const ring = this.add("vis-ring vis-impact-ring");
    if (flash) animate(flash, {
      opacity: [0, 0.22 + this.settings.intensity * 0.45, 0],
      scale: [0.92, 1.04 + this.settings.intensity * 0.05, 1],
      duration: this.duration(520),
      ease: "outExpo",
      onComplete: () => this.cleanup(flash),
    });
    if (ring) animate(ring, {
      opacity: [0.85, 0],
      scale: [0.25, (2.2 + this.settings.intensity) * scale],
      duration: this.duration(780),
      ease: "out(4)",
      onComplete: () => this.cleanup(ring),
    });
    this.label(id, "HIT", 0.7);
  }

  private riser(id: string) {
    const count = Math.max(5, Math.round(7 + this.settings.trail * 7));
    for (let i = 0; i < count; i++) {
      const el = this.add("vis-riser-bar");
      if (!el) continue;
      el.style.left = `${8 + (84 * i) / Math.max(1, count - 1)}%`;
      el.style.opacity = "0";
      const delay = i * 34;
      animate(el, {
        opacity: [0, 0.12 + this.settings.intensity * 0.5, 0],
        scaleY: [0.05, 1 + this.settings.intensity * 1.7],
        y: [80, -60],
        duration: this.duration(920),
        delay,
        ease: "inOut(3)",
        onComplete: () => this.cleanup(el),
      });
    }
    this.label(id, "RISE", 0.56);
  }

  private reverse(id: string) {
    const ring = this.add("vis-ring vis-reverse-ring");
    if (!ring) return;
    animate(ring, {
      opacity: [0, 0.75, 0],
      scale: [2.4, 0.35, 0.12],
      rotate: [0, -70],
      duration: this.duration(620),
      ease: "inOutExpo",
      onComplete: () => this.cleanup(ring),
    });
    this.label(id, "PULL", 0.48);
  }

  private wash(id: string) {
    const wash = this.add("vis-wash");
    if (!wash) return;
    animate(wash, {
      opacity: [0, 0.2 + this.settings.intensity * 0.42, 0],
      scale: [0.7, 1.35 + this.settings.trail * 0.35],
      rotate: [-8, 9],
      duration: this.duration(1650),
      ease: "inOutSine",
      onComplete: () => this.cleanup(wash),
    });
    this.label(id, "AIR", 0.36);
  }

  private down(id: string) {
    const veil = this.add("vis-down");
    if (!veil) return;
    animate(veil, {
      opacity: [0, 0.25 + this.settings.intensity * 0.38, 0],
      y: [-120, 260],
      scaleY: [0.5, 1.5],
      duration: this.duration(1100),
      ease: "out(3)",
      onComplete: () => this.cleanup(veil),
    });
    this.label(id, "DROP", 0.38);
  }

  private sweep(id: string) {
    const beam = this.add("vis-sweep");
    if (!beam) return;
    animate(beam, {
      opacity: [0, 0.55 + this.settings.intensity * 0.3, 0],
      x: [-900, 900],
      scaleX: [0.55, 1.25],
      duration: this.duration(720),
      ease: "inOutExpo",
      onComplete: () => this.cleanup(beam),
    });
    this.label(id, "MOVE", 0.32);
  }

  private vocal(id: string, text = "20 FINGERS") {
    const word = this.add("vis-vocal");
    if (!word) return;
    word.textContent = text;
    animate(word, {
      opacity: [0, 0.42 + this.settings.intensity * 0.38, 0],
      scale: [0.72, 1.05, 1.16],
      letterSpacing: ["0.18em", "0.04em", "0.12em"],
      duration: this.duration(1550),
      ease: "outExpo",
      onComplete: () => this.cleanup(word),
    });
    this.rings(id, 3);
  }

  private particles(id: string, baseCount: number, flavor: "micro" | "warm") {
    const count = Math.max(4, Math.round(baseCount * (0.55 + this.settings.trail)));
    for (let i = 0; i < count; i++) {
      const dot = this.add(`vis-particle vis-${flavor}`);
      if (!dot) continue;
      const angle = (Math.PI * 2 * i) / count;
      const radius = 45 + this.settings.intensity * 150;
      dot.style.left = "50%";
      dot.style.top = "50%";
      animate(dot, {
        opacity: [0, 0.85, 0],
        x: [0, Math.cos(angle) * radius],
        y: [0, Math.sin(angle) * radius],
        scale: [0.4, 1.2, 0.3],
        duration: this.duration(680 + (i % 3) * 80),
        delay: i * 12,
        ease: "out(4)",
        onComplete: () => this.cleanup(dot),
      });
    }
    this.label(id, "TEXTURE", 0.3);
  }

  private ghost(id: string) {
    const a = this.add("vis-ghost vis-ghost-a");
    const b = this.add("vis-ghost vis-ghost-b");
    [a, b].forEach((el, i) => {
      if (!el) return;
      animate(el, {
        opacity: [0, 0.4 + this.settings.intensity * 0.35, 0],
        x: [i ? 28 : -28, 0, i ? -16 : 16],
        scale: [0.8, 1.1, 0.9],
        duration: this.duration(500),
        delay: i * 45,
        ease: "out(4)",
        onComplete: () => this.cleanup(el),
      });
    });
    this.label(id, "GHOST", 0.3);
  }

  private rings(id: string, count: number) {
    for (let i = 0; i < count; i++) {
      const ring = this.add("vis-ring vis-soft-ring");
      if (!ring) continue;
      animate(ring, {
        opacity: [0.7, 0],
        scale: [0.25 + i * 0.18, 1.55 + i * 0.42 + this.settings.intensity * 0.25],
        duration: this.duration(700 + i * 160),
        delay: i * 75,
        ease: "out(4)",
        onComplete: () => this.cleanup(ring),
      });
    }
    this.label(id, "HALO", 0.3);
  }

  private slashes(id: string, count: number) {
    for (let i = 0; i < count; i++) {
      const el = this.add("vis-slash");
      if (!el) continue;
      el.style.top = `${18 + i * (64 / Math.max(1, count - 1))}%`;
      animate(el, {
        opacity: [0, 0.5 + this.settings.intensity * 0.35, 0],
        x: [i % 2 ? -500 : 500, 0, i % 2 ? 180 : -180],
        scaleX: [0.4, 1.1 + this.settings.trail * 0.6, 0.7],
        duration: this.duration(620),
        delay: i * 48,
        ease: "outExpo",
        onComplete: () => this.cleanup(el),
      });
    }
    this.label(id, "STAB", 0.35);
  }

  private nodes(id: string, count: number) {
    for (let i = 0; i < count; i++) {
      const el = this.add("vis-node-dot");
      if (!el) continue;
      el.style.left = `${12 + (76 * i) / Math.max(1, count - 1)}%`;
      el.style.top = `${65 - (i % 3) * 18}%`;
      animate(el, {
        opacity: [0, 0.85, 0],
        y: [24, -34 - (i % 2) * 22],
        scale: [0.4, 1.35, 0.25],
        duration: this.duration(680),
        delay: i * 74,
        ease: "out(4)",
        onComplete: () => this.cleanup(el),
      });
    }
    this.label(id, "PHRASE", 0.34);
  }

  private columns(id: string, count: number) {
    for (let i = 0; i < count; i++) {
      const el = this.add("vis-column");
      if (!el) continue;
      el.style.left = `${34 + i * 8}%`;
      animate(el, {
        opacity: [0, 0.65, 0],
        scaleY: [0.05, 0.7 + i * 0.18, 0.12],
        duration: this.duration(430 + i * 70),
        delay: i * 40,
        ease: "out(4)",
        onComplete: () => this.cleanup(el),
      });
    }
    this.label(id, "FILL", 0.34);
  }

  private panels(id: string, count: number, reverse = false) {
    for (let i = 0; i < count; i++) {
      const el = this.add("vis-panel");
      if (!el) continue;
      el.style.left = `${i * (100 / count)}%`;
      el.style.width = `${100 / count + 0.5}%`;
      animate(el, {
        opacity: [0, 0.14 + this.settings.intensity * 0.28, 0],
        y: [reverse ? -140 : 140, 0, reverse ? 70 : -70],
        duration: this.duration(760),
        delay: i * 65,
        ease: "outExpo",
        onComplete: () => this.cleanup(el),
      });
    }
    this.label(id, reverse ? "ANSWER" : "CHORD", 0.34);
  }

  private build(id: string) {
    this.riser(id);
    const tunnel = this.add("vis-tunnel");
    if (!tunnel) return;
    animate(tunnel, {
      opacity: [0, 0.55, 0],
      scale: [1.65, 0.55, 0.2],
      rotate: [0, 48],
      duration: this.duration(1500),
      ease: "inExpo",
      onComplete: () => this.cleanup(tunnel),
    });
  }
}
