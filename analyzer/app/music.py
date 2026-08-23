from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

CAMELOT_MAJOR = {'B':'1B','F#':'2B','Db':'3B','Ab':'4B','Eb':'5B','Bb':'6B','F':'7B','C':'8B','G':'9B','D':'10B','A':'11B','E':'12B'}
CAMELOT_MINOR = {'Ab':'1A','Eb':'2A','Bb':'3A','F':'4A','C':'5A','G':'6A','D':'7A','A':'8A','E':'9A','B':'10A','F#':'11A','C#':'12A'}
NOTE_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]

@dataclass
class Analysis:
    bpm: Optional[float]=None
    key: Optional[str]=None
    mode: Optional[str]=None
    camelot: Optional[str]=None
    duration: Optional[float]=None
    sample_rate: Optional[int]=None
    confidence: Optional[float]=None


def _corr(a,b):
    import numpy as np
    a=np.asarray(a,dtype=float); b=np.asarray(b,dtype=float)
    a=(a-a.mean())/(a.std()+1e-9); b=(b-b.mean())/(b.std()+1e-9)
    return float((a*b).mean())


def _estimate_key_from_chroma(chroma):
    import numpy as np
    candidates=[]
    for root in range(12):
        candidates.append((_corr(chroma,np.roll(MAJOR_PROFILE,root)),root,'major'))
        candidates.append((_corr(chroma,np.roll(MINOR_PROFILE,root)),root,'minor'))
    candidates.sort(reverse=True)
    best, second=candidates[0],candidates[1]
    conf=max(0.0,min(1.0,(best[0]-second[0])*2.5+0.5))
    return NOTE_NAMES[best[1]],best[2],conf


def _camelot(key,mode):
    return (CAMELOT_MAJOR if mode=='major' else CAMELOT_MINOR).get(key)


def _decode_audio(path: Path, target_sr: int = 22050):
    import miniaudio
    import numpy as np
    decoded=miniaudio.decode_file(str(path), output_format=miniaudio.SampleFormat.FLOAT32, nchannels=1, sample_rate=target_sr)
    y=np.asarray(decoded.samples,dtype=np.float32)
    if y.size == 0:
        raise RuntimeError('El archivo de audio está vacío o no pudo decodificarse.')
    return y, int(decoded.sample_rate)


def _estimate_bpm(y, sr):
    import numpy as np
    # Lightweight onset-strength envelope using frame-to-frame RMS change.
    hop=512; frame=2048
    if len(y)<frame*4: return None
    n=1+(len(y)-frame)//hop
    rms=np.empty(n,dtype=np.float32)
    win=np.hanning(frame).astype(np.float32)
    for i in range(n):
        x=y[i*hop:i*hop+frame]*win
        rms[i]=np.sqrt(np.mean(x*x)+1e-12)
    onset=np.maximum(0,np.diff(rms,prepend=rms[0]))
    # Accent stronger transients; remove DC.
    onset=onset-onset.mean()
    env_sr=sr/hop
    min_bpm,max_bpm=70.0,180.0
    min_lag=max(1,int(env_sr*60/max_bpm)); max_lag=max(min_lag+1,int(env_sr*60/min_bpm))
    corr=np.correlate(onset,onset,mode='full')[len(onset)-1:]
    region=corr[min_lag:max_lag+1]
    if not np.any(np.isfinite(region)) or region.size==0: return None
    lag=min_lag+int(np.argmax(region))
    bpm=60.0*env_sr/lag
    # House-friendly octave normalization.
    while bpm<90: bpm*=2
    while bpm>160: bpm/=2
    return float(bpm)


def _estimate_chroma(y,sr):
    import numpy as np
    # Analyze up to 90 s spread across the track for a fast, dependency-light key estimate.
    max_seconds=90
    if len(y)>sr*max_seconds:
        idx=np.linspace(0,len(y)-sr*30,3,dtype=int)
        y=np.concatenate([y[i:i+sr*30] for i in idx])
    frame=4096; hop=2048
    chroma=np.zeros(12,dtype=np.float64)
    window=np.hanning(frame)
    freqs=np.fft.rfftfreq(frame,1.0/sr)
    valid=(freqs>=55)&(freqs<=5000)
    f=freqs[valid]
    midi=np.rint(69+12*np.log2(f/440.0)).astype(int)
    pcs=np.mod(midi,12)
    for start in range(0,max(1,len(y)-frame),hop):
        x=y[start:start+frame]
        if len(x)<frame: break
        mag=np.abs(np.fft.rfft(x*window))[valid]
        weights=np.sqrt(mag+1e-12)
        for pc in range(12):
            chroma[pc]+=weights[pcs==pc].sum()
    s=chroma.sum()
    return chroma/(s+1e-12)


def analyze_audio(path: Path) -> Analysis:
    y,sr=_decode_audio(path)
    duration=float(len(y)/sr)
    bpm=_estimate_bpm(y,sr)
    chroma=_estimate_chroma(y,sr)
    key,mode,confidence=_estimate_key_from_chroma(chroma)
    return Analysis(bpm=round(bpm,2) if bpm else None,key=key,mode=mode,camelot=_camelot(key,mode),duration=round(duration,2),sample_rate=sr,confidence=round(confidence,2))


def separate_stems(path: Path, output_root: Path) -> dict:
    try:
        import demucs  # noqa
    except Exception:
        return {'ok':False,'error':'Demucs no está instalado todavía. El análisis BPM/Key/Camelot sí funciona.','stems':{}}
    model_name='htdemucs'
    cmd=[sys.executable,'-m','demucs','-n',model_name,'--out',str(output_root),str(path)]
    proc=subprocess.run(cmd,capture_output=True,text=True,check=False)
    if proc.returncode!=0:
        return {'ok':False,'error':(proc.stderr or proc.stdout)[-2500:],'stems':{}}
    track_dir=output_root/model_name/path.stem
    stems={}
    for name in ('drums','bass','vocals','other'):
        p=track_dir/f'{name}.wav'
        if p.exists(): stems[name]=str(p)
    return {'ok':True,'stems':stems,'log':proc.stdout[-1200:]}


def transcribe_midi(audio_path: Path, midi_dir: Path, label: str) -> dict:
    midi_dir.mkdir(parents=True,exist_ok=True)
    try:
        from basic_pitch.inference import predict
    except Exception as exc:
        return {'ok':False,'error':f'Basic Pitch no está instalado todavía: {exc}'}
    try:
        _,midi_data,note_events=predict(str(audio_path))
        out=midi_dir/f'{label}.mid'; midi_data.write(str(out))
        notes_json=midi_dir/f'{label}_notes.json'
        serial=[]
        for ev in note_events:
            if isinstance(ev,dict): serial.append(ev)
            else:
                try: serial.append(list(ev))
                except Exception: serial.append(str(ev))
        notes_json.write_text(json.dumps(serial,indent=2,ensure_ascii=False),encoding='utf-8')
        return {'ok':True,'midi':str(out),'notes':str(notes_json),'note_count':len(note_events)}
    except Exception as exc:
        return {'ok':False,'error':str(exc)}


def build_dna(analysis: Analysis, stems: dict, midis: dict, output_path: Path):
    payload={'version':'0.1.2','analysis':asdict(analysis),'stems':stems,'midi':midis,'engine_hints':{'recommended_grid':'1/16','phrase_bars':8,'compatible_camelot_moves':camelot_neighbors(analysis.camelot),'tetris_event_mapping':{'I':'bass_contour_mutation','O':'chord_stab_density','T':'hook_call_response','S':'hat_syncopation','Z':'percussion_fill','J':'filter_tension_down','L':'filter_tension_up','line_clear':'phrase_transition','tetris_clear':'drop_or_hook_reveal'}}}
    output_path.write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding='utf-8')
    return payload


def camelot_neighbors(code: Optional[str]):
    if not code or len(code)<2: return []
    try: number=int(code[:-1]); letter=code[-1]
    except Exception: return []
    prev_num=12 if number==1 else number-1; next_num=1 if number==12 else number+1; other='A' if letter=='B' else 'B'
    return [f'{prev_num}{letter}',f'{number}{letter}',f'{next_num}{letter}',f'{number}{other}']
