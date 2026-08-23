# Beatris v0.10 — Real Stem Director

Esta carpeta registra la integración del motor de stems reales preparada el 23 de agosto de 2026.

## Qué cambia

Beatris deja de tratar cada pieza como un instrumento independiente y pasa a dirigir capas reales de una canción: **DRUMS / BASS / MUSIC (OTHER) / VOCALS**.

La altura de la pila controla la energía musical. Las líneas eliminadas no hacen retroceder el nivel musical alcanzado. BUILD, BREAK, FILTER, BOOST y DROP trabajan sobre los stems disponibles; el DROP se cuantiza al inicio de frase.

## Catálogo integrado

- 20 FINGERS — Putang Ina Mo: 131 BPM, 3 stems útiles.
- City Of Dreams — Alt Control / Millero: 124 BPM, 4 stems.
- Modjo — Lady: referencia parcial, 126 BPM, solo OTHER.
- Café Du MIDI — Your House: 122 BPM, 4 stems.
- ZeLeo — I Just Want To Live: 125 BPM, 4 stems.
- Bullshit — MATRODA / KLP: 130 BPM, 4 stems.

Total validado: **20 stems**.

## Audio

Los MP3 no se incluyen en este repositorio porque actualmente es **público** y el set de prueba contiene grabaciones comerciales. El código y el manifest conservan las rutas esperadas para que el mismo motor funcione al colocar audio autorizado/local en `public/audio/stems/`.

Estructura esperada:

```text
public/audio/stems/
├── 20-fingers-putang-ina-mo/
│   ├── drums.mp3
│   ├── other.mp3
│   └── vocals.mp3
├── city-of-dreams-alt-control-millero/
│   ├── drums.mp3
│   ├── bass.mp3
│   ├── other.mp3
│   └── vocals.mp3
├── modjo-lady-other/
│   └── other.mp3
├── cafe-du-midi-your-house/
│   ├── drums.mp3
│   ├── bass.mp3
│   ├── other.mp3
│   └── vocals.mp3
├── zeleo-i-just-want-to-live/
│   ├── drums.mp3
│   ├── bass.mp3
│   ├── other.mp3
│   └── vocals.mp3
└── bullshit-matroda-klp/
    ├── drums.mp3
    ├── bass.mp3
    ├── other.mp3
    └── vocals.mp3
```

## Progresión musical

1. FOUNDATION: batería y armonía filtradas.
2. BASSLINE: entra el bajo si existe; si no, se refuerza OTHER.
3. GROOVE: se abre DRUMS.
4. DRIVE: gana presencia MUSIC y comienza VOCALS.
5. HOOK: mezcla más abierta.
6. BUILD: baja parte de la base y aumenta tensión.
7. DROP PREP: prepara el cambio.
8. DROP: abre el espectro y las cuatro capas disponibles.

El motor nunca presupone que una canción tenga exactamente cuatro stems.
