from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .music import analyze_audio, separate_stems, transcribe_midi, build_dna

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / 'uploads'
OUTPUTS = ROOT / 'outputs'
STATIC = ROOT / 'static'
for p in (UPLOADS, OUTPUTS):
    p.mkdir(exist_ok=True, parents=True)

app = FastAPI(title='Beatris ADN Lab', version='0.2.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5173','http://localhost:5173'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
app.mount('/static', StaticFiles(directory=STATIC), name='static')
app.mount('/outputs', StaticFiles(directory=OUTPUTS), name='outputs')

@app.get('/')
def index():
    return FileResponse(STATIC / 'index.html')

@app.get('/api/health')
def health():
    modules = {}
    for mod in ('miniaudio', 'demucs', 'basic_pitch'):
        try:
            __import__(mod)
            modules[mod] = True
        except Exception:
            modules[mod] = False
    return {'ok': True, 'modules': modules}

@app.post('/api/analyze')
async def analyze(file: UploadFile = File(...), separate: bool = True, midi: bool = True):
    ext = Path(file.filename or 'track.wav').suffix.lower()
    if ext not in {'.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aiff', '.aif'}:
        raise HTTPException(400, 'Formato no soportado.')

    job_id = f'{int(time.time())}-{uuid.uuid4().hex[:7]}'
    job_dir = OUTPUTS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = UPLOADS / f'{job_id}{ext}'
    with input_path.open('wb') as f:
        shutil.copyfileobj(file.file, f)

    try:
        analysis = analyze_audio(input_path)
    except Exception as exc:
        raise HTTPException(500, f'Error de análisis: {exc}')

    stem_result = {'ok': False, 'stems': {}, 'error': 'Separación desactivada'}
    if separate:
        stem_result = separate_stems(input_path, job_dir / 'separated')

    midi_results = {}
    if midi:
        # Transcribe bass + other when stems exist; otherwise transcribe full mix as fallback.
        candidates = {}
        if stem_result.get('ok'):
            for name in ('bass', 'other'):
                if stem_result['stems'].get(name):
                    candidates[name] = Path(stem_result['stems'][name])
        if not candidates:
            candidates['mix'] = input_path
        for name, p in candidates.items():
            midi_results[name] = transcribe_midi(p, job_dir / 'midi', name)

    def rel(p):
        try:
            return '/' + str(Path(p).relative_to(ROOT)).replace('\\', '/')
        except Exception:
            return p

    stems_public = {k: rel(v) for k, v in stem_result.get('stems', {}).items()}
    midi_public = {}
    for k, v in midi_results.items():
        midi_public[k] = dict(v)
        if v.get('midi'): midi_public[k]['midi'] = rel(v['midi'])
        if v.get('notes'): midi_public[k]['notes'] = rel(v['notes'])

    dna_file = job_dir / 'tetrishouse-dna.json'
    dna = build_dna(analysis, stems_public, midi_public, dna_file)
    return {
        'job_id': job_id,
        'analysis': analysis.__dict__,
        'stems': {'ok': stem_result.get('ok'), 'error': stem_result.get('error'), 'files': stems_public},
        'midi': midi_public,
        'dna': dna,
        'dna_url': rel(dna_file)
    }
