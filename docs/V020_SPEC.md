# Beatris v0.20 — Core Specification (FROZEN)

**Status:** FROZEN  
**BPM:** 124 fixed  
**Product:** House instrument-game  

> **Esqueleto estable, piel que cambia, el jugador escribe los fills.**

## 1. Product rule

Beatris v0.20 is **not a song player** and must not use the word **song/canción** in the v0.20 product copy.

The goal is a playable House instrument whose groove remains recognizably House while player actions leave deterministic musical traces.

## 2. Stable House skeleton

The floor must survive gameplay.

- Kick: four-on-the-floor, fixed on 1-2-3-4.
- Clap: fixed on 2 and 4.
- These anchors are not rewritten by piece locks.
- Hats, ghosts, one optional extra kick and bass may vary every 1–2 bars.
- Ground variation follows a small learnable form such as `A → A' → B → A'`.
- Eight identical bars are forbidden.
- Eight bars without the same recognizable skeleton are also forbidden.

## 3. Lock grammar

### Normal lock

Every lock is audible, but not every lock is a solo.

- Normal lock = short tick, 40–80 ms.
- Material: wood / rim / short noise.
- Never use a sine tone for the tick.
- Small velocity variation is allowed.
- The tick must not become a geiger-counter texture.

### I piece

I is one of only two named piece gestures in this experiment.

- Character: long / straight / sweep / contour.
- Must be unmistakable with eyes closed.
- Must not become a second bass line.
- Keep it in a different band than the bass.
- If necessary, duck the bass for ~80 ms.

### T piece

T is the second named piece gesture.

- Character: syncopated stab.
- Must be unmistakable with eyes closed.
- Same action = same contour.
- Timbre variants may depend on context, never random choice.

### S/Z/J/L

Out of scope for v0.20 core validation. Do not spend design time on them until I/T passes acceptance.

## 4. Hard drop timing language

Gravity is **not** synchronized to the beat. Off-time is meaningful information.

- Hard drop on the 1 = deliberately exaggerated body + crash / impact.
- Hard drop off the 1 = dry rim / short impact, clearly different.
- The distinction must be immediate and obvious, not subtle.

## 5. Line-clear grammar

The magnitude of the clear defines the musical response.

| Event | Musical response |
|---|---|
| SINGLE | Accent only; e.g. one extra hit on the next 2. **Not a fill.** |
| DOUBLE | Mini-fill, maximum half a bar. |
| TRIPLE | Fill, maximum one bar. |
| TETRIS | Phrase-level response; the only clear allowed to occupy the next 1. |

- The immediate lock tick still happens.
- Clear responses are quantized to the next 16th or next beat as appropriate.
- A fill must not collide randomly with the clap skeleton.

## 6. Board state = context, not composer

Height, holes, combo and danger may influence context, but they do not replace the lock grammar.

### Holes

- May cause a ghost hit or unusual note **for that bar**.
- Never create a continuous dissonant pad or permanent filter bed.

### Danger

Danger is a latch, not a raw threshold.

1. Enter danger once.
2. Run a finite build of 4 or 8 bars.
3. Settle into a stable tense groove and wait.
4. Exit danger → clear release event.
5. Do not re-enter danger build until danger has first been exited.

No infinite riser. No repeated threshold yo-yo build.

## 7. Determinism and learnability

Beatris must behave like an instrument, not a generator.

- Gesture identity is deterministic from action + timing + context.
- The same I always reads as I.
- The same T always reads as T.
- Context can alter timbre/intensity, not identity.
- Ground variation depends on bar index plus limited state, not a hash of all prior moves.

Two runs at the same height may sound different because they were played differently, but both must still sound like the same House instrument within four seconds.

## 8. Demucs and previous architecture

Demucs is **out** of the v0.20 core experiment.

- No separated song stems as the playback engine.
- No `other` stem fader.
- No raw 8-bar stem phrase loops.
- No FOUNDATION/TENSION/DROP scene selector from previous experiments.
- No song selector.

Demucs may return later only as a quarry for curated one-shots/chops/fills/timbres after the core passes acceptance.

## 9. Explicit non-goals

v0.20 does **not** need to prove:

- a complete song structure;
- narrative drops;
- multiple tracks;
- remixes;
- S/Z/J/L identity;
- Demucs integration;
- synchronized gravity;
- adaptive soundtrack behavior.

It must prove one thing: **the same House instrument, played differently.**

## 10. Freeze rule

Do not add hooks, song scenes, extra piece languages, more tracks, more powers or richer orchestration until `V020_ACCEPTANCE.md` passes all required tests.

## 11. Progression axis — FROZEN ADDENDUM

> **Action → gesture. Board → tension. Cleared rows / level → arrangement.**

Height and musical progress are opposite forces and must never be collapsed into the same fader.

- Stacking = risk/tension only. It never makes the groove richer.
- Cleared rows = musical progress. The House skin improves and never rewinds.
- Soft/hard drop score is small gameplay score only; it never unlocks arrangement.
- Level (every 10 cleared rows) changes the deterministic ground variant `A → A' → B → A'` without changing the four-on-the-floor skeleton.
- Raw score must never map linearly to density.
- Groove richness is capped. After FULL, later levels change variant rather than add more layers.

Clear progression for the core experiment:

| Progress | Persistent floor change |
|---|---|
| 0 lines | kick + clap, almost no hats, two-note bass |
| first singles | eighth-note/offbeat hats |
| double or ~3 lines | full bass grammar |
| triple/combo or ~6 lines | open hat + secondary ghost/perc |
| TETRIS or ~10 lines | FULL/B variant; no further layer stacking |

The clear response is the **door**: lock tick → quantized accent/fill → on the other side the floor is permanently a little better.
