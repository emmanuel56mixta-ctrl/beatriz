function hash(n: number) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
type Particle = { x:number;y:number;vx:number;vy:number;life:number;max:number;w:number;h:number;color:string;rot:number;vr:number };
type Floater = { x:number;y:number;text:string;life:number;max:number };
export class Juice {
  trauma=0; particles:Particle[]=[]; floaters:Floater[]=[]; reduced=false; enabled=true; hitstop=0;
  constructor(){if(typeof window!=="undefined")this.reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;}
  addTrauma(n:number){if(this.reduced||!this.enabled)return;this.trauma=Math.min(1,this.trauma+n);}
  punch(frames=0.05){if(this.reduced)return;this.hitstop=Math.max(this.hitstop,frames);}
  burst(x:number,y:number,color:string,n=8){if(this.reduced)return;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2;const s=40+Math.random()*180;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:0.35+Math.random()*0.4,max:0.7,w:3+Math.random()*6,h:3+Math.random()*6,color,rot:Math.random()*Math.PI,vr:(Math.random()-0.5)*8});}}
  float(x:number,y:number,text:string){this.floaters.push({x,y,text,life:0.9,max:0.9});}
  update(dt:number){if(this.hitstop>0){this.hitstop-=dt;dt*=0.15;}this.trauma=Math.max(0,this.trauma-dt*1.8);for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;p.rot+=p.vr*dt;}this.particles=this.particles.filter(p=>p.life>0);for(const f of this.floaters){f.life-=dt;f.y-=28*dt;}this.floaters=this.floaters.filter(f=>f.life>0);if(this.particles.length>180)this.particles.splice(0,this.particles.length-180);}
  offset(t:number){if(this.reduced||!this.enabled||this.trauma<=0)return{x:0,y:0,r:0};const s=this.trauma*this.trauma;return{x:(hash(t*17.2)*2-1)*s*10,y:(hash(t*13.7+2)*2-1)*s*10,r:(hash(t*9.1+5)*2-1)*s*0.018};}
}
