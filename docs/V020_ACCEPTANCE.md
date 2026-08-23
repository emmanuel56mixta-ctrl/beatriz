# Beatris v0.20 — Acceptance Tests (FROZEN)

All seven tests are required. None is optional.

## Test 1 — Lock is audible

With eyes closed, the listener can tell that a piece locked.

Pass conditions:
- every lock leaves a short musical trace;
- the trace is 40–80 ms and does not dominate the groove;
- repeated locks do not create a geiger-counter texture or continuous buzz.

## Test 2 — I vs T is unmistakable

With eyes closed, the listener can distinguish an I lock from a T lock reliably.

Pass conditions:
- I = long/straight sweep or contour, outside the bass register;
- T = syncopated stab;
- identity remains recognizable across context variants.

Do not design S/Z/J/L further until this passes.

## Test 3 — Hard drop timing is obvious

With eyes closed, hard drop **on the 1** and hard drop **off the 1** must sound immediately different.

Pass conditions:
- on the 1 = large body + crash/impact;
- off the 1 = short dry rim/impact;
- no visual information is needed to distinguish them.

## Test 4 — Clear magnitude has a learnable grammar

The listener can infer the scale of a line clear from its response.

Required mapping:
- SINGLE = accent, not fill;
- DOUBLE = mini-fill ≤ 1/2 bar;
- TRIPLE = fill ≤ 1 bar;
- TETRIS = phrase-level response and may occupy the next 1.

Responses must be quantized and must not destroy clap 2/4 or four-on-the-floor.

## Test 5 — No eight-bar photocopy

During a 60–90 second run:
- no eight consecutive bars are exactly identical;
- kick four-on-the-floor and clap 2/4 remain recognizable throughout;
- variations are limited to skin: hats, ghosts, extra kick, bass and player-written gestures.

The groove must remain identifiable as the same instrument within ~4 seconds.

## Test 6 — Head-nod test

> Eyes closed, I still want to keep moving my head.

This test has equal priority to tests 1–5.

Pass conditions:
- the stable House floor remains intact under normal gameplay;
- reactive gestures do not accumulate into mud;
- fills do not constantly interrupt the groove;
- danger does not become an infinite riser;
- after ~60 seconds the result still feels like House, not a sound-effect generator.

## Test 7 — Clears improve; stacking does not

With eyes closed, two runs at similar height must reveal different musical progress if one player clears rows and the other merely stacks.

Pass conditions:
- stacking can increase tension but must never unlock richer arrangement;
- cleared rows permanently improve the skin until the capped FULL state;
- soft/hard drop score does not unlock skin;
- after the fill/accent caused by a clear, the persistent floor on the other side is audibly richer;
- later levels change `A → A' → B → A'` variants without changing kick 1-2-3-4 or clap 2/4;
- a run with no clears remains musically lean even if the score rises from drops.

# Experiment boundary

Run the first v0.20 validation with:

- one House instrument;
- 124 BPM fixed;
- no song selector;
- no Demucs;
- no FOUNDATION/TENSION/DROP architecture;
- no S/Z/J/L named gestures;
- I and T only;
- gravity independent from musical clock.

# Release gate

**Do not expand v0.20 until all seven tests pass in the same build.**
