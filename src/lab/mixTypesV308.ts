export type FilterMode="LP"|"BP"|"HP";
export type MixParams={gain:number;cutoff:number;resonance:number;send:number;mode:FilterMode};

export const DEFAULT_MIX:MixParams={gain:1,cutoff:.86,resonance:.16,send:.08,mode:"LP"};

export function cutoffHz(normalized:number){
  const n=Math.max(0,Math.min(1,normalized));
  const min=120,max=16000;
  return min*Math.pow(max/min,n);
}

export function resonanceQ(normalized:number){
  return .45+Math.max(0,Math.min(1,normalized))*15;
}

export function filterType(mode:FilterMode):BiquadFilterType{
  return mode==="HP"?"highpass":mode==="BP"?"bandpass":"lowpass";
}
