#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
source .analyzer-venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install "demucs==4.0.1" --no-deps
python -m pip install "torch==2.2.2" "torchaudio==2.2.2" einops julius lameenc openunmix pyyaml tqdm "numpy<2" dora-search
printf '\nDemucs instalado. Prueba: python -m demucs --help\n'
read -k 1 "?Pulsa una tecla para cerrar…"
