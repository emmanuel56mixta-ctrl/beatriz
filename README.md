# Beatris

Tetris + house. El beat no se toca. El pozo escribe la siguiente frase. Hard drop en el uno.

125 BPM, 4/4. Kick, clap y hats corren siempre. Cada pieza empuja el ADN de la **próxima** frase de 8 compases (bajo, armonía, hook, groove…). La scanline dispara acentos sobre la composición actual.

## Jugar en local

Node 20 o 22.

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Controles

| Tecla | Acción |
| --- | --- |
| ← → | Mover |
| Z / ↑ | Rotar |
| ↓ | Caída suave |
| Espacio | Hard drop |
| C | Reserva |
| R | Remix (con carga) |
| F | Drop musical (con carga) |

Hard drop en el **1** del compás = **EN EL UNO** (puntos y carga extra).

## Subirlo a GitHub

1. Creá un repo vacío (`beatris`, público o privado).
2. En esta carpeta:

```bash
git init
git add .
git commit -m "Beatris v0.7"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/beatris.git
git push -u origin main
```

Si preferís no usar git en la terminal: GitHub → *Add file* → *Upload files* y arrastrá todo el contenido de esta carpeta (incluido `.github`).

## GitHub Pages (gratis)

El workflow `.github/workflows/pages.yml` publica `dist` en cada push a `main`.

1. Repo → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Push (o *Actions* → *GitHub Pages* → *Run workflow*)
4. La URL queda en `https://TU_USUARIO.github.io/beatris/`

Vite usa `base: "./"`, así que también funciona en un dominio propio.

## Vercel

[Importá el repo](https://vercel.com/new). Framework: Vite. Build: `npm run build`. Output: `dist`. Listo.

## Packs de audio

Los samples viven en `public/audio/house/`. Podés sustituir el kit (mismos nombres) o agregar otro pack más adelante (`public/audio/deep/`, `public/audio/afro/`, …) sin tocar el juego.

```
kick clap hat ohat shaker perc snare crash impact bass stab voxA voxB sweep
```

Si un wav falta, el motor cae a síntesis.

## Licencia

MIT. El beat es de la canción, no del tablero.

## ADN Lab integrado
Esta versión incluye el analizador local dentro del mismo repo. En macOS usa `run-beatris.command` para levantar a la vez Beatris (Vite) y el servicio de análisis local en el puerto 8765. La primera vez, para activar separación de stems, ejecuta `analyzer/install-stems.command`.

El botón **ADN LAB** de la pantalla inicial permite cargar audio, detectar BPM/tonalidad/Camelot, separar stems con Demucs y guardar el último `tetrishouse-dna.json` en el navegador como perfil local.
