export type MixParams={gain:number;hpf:number;lpf:number;resonance:number};

export const DEFAULT_MIX:MixParams={gain:1,hpf:0,lpf:1,resonance:.12};

const clamp=(n:number)=>Math.max(0,Math.min(1,n));

export function hpfHz(normalized:number){
  const n=clamp(normalized);
  const min=20,max=5000;
  return min*Math.pow(max/min,n);
}

export function lpfHz(normalized:number){
  const n=clamp(normalized);
  const min=500,max=20000;
  return min*Math.pow(max/min,n);
}

export function resonanceQ(normalized:number){
  return .7+clamp(normalized)*11.3;
}

export function filterWindow(m:MixParams){
  const hp=hpfHz(m.hpf);
  const lp=Math.max(hp*1.18,lpfHz(m.lpf));
  return {hp:Math.min(hp,16000),lp:Math.min(lp,20000)};
}
