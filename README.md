# AXM Animation Fabric

Standalone deterministic animation-authoring specialist for AXM.

## Purpose

Animation Fabric owns **how things move through time**. It is not a renderer, gameplay-rules engine, VFX engine, or durable world-state owner.

Initial canonical output remains compatible with the earlier donor contract:

- `axm.performance-set/v1`

The executable body supports named clips, phase windows, keyframed scalar/vector tracks, root motion, joint/part tracks, exact timed animation events, deterministic sampling, replay validation, inspectable receipts, root-motion distance warping, cancel-safe clip advancement, cancel-transition pose blending, deterministic additive pose layers for action accents such as recoil or upper-body attack motion, and deterministic action retiming that scales clip phases, keys, and events together without mutating the authored source clip.

`advanceClip()` is intended for game-action playback where a clip may be cancelled or interrupted mid-step. It returns the sampled state at the effective stop time plus deterministic event evidence for that interval. It does not decide whether a gameplay cancel is allowed; that policy belongs to the gameplay/ability layer.

`sampleAdditiveLayer()` applies the difference between an additive clip's sampled pose and an explicit reference pose onto selected shared tracks of a base action. The caller controls weight from 0 to 1 and the exact tracks affected, so a recoil/flinch/attack accent can be layered without rewriting the base clip or root motion unless that track is deliberately selected. Additive sampling is pose-only: it does not merge or replay either clip's event stream.

`retimeClip()` lives in `src/action-retime.mjs`. It derives a new clip identity at an explicit playback rate and scales duration, phase windows, keyframe times, and event times by the same factor. This lets one authored action produce deliberate faster/slower variants while keeping its internal motion/event alignment inspectable. It does not decide gameplay cooldowns, hit timing policy, balance, or whether a retimed action feels good.

## Donor provenance

The genesis implementation is informed by the earlier experimental `character-animation-mocap-studio` in `mike-axiom-mir/axm-collaboration-platform`, observed at commit `c335244e9005df26c0edb99114164765addf6ed0`.

That donor proved a small `axm.performance-set/v1` shape with idle/walk/run/etc., measured drift, events, visemes, transitions, and compression. This repository is the new standalone specialist and does not depend on the Collaboration Platform at runtime.

## Run

```sh
npm test
node examples/attack-move.mjs
```

## Truth boundary

Passing structural and deterministic tests does not prove animation quality, physical plausibility, good posing, clean deformation, contact quality, collision correctness, or game feel. Those require rendered/runtime evidence and an explicit visual-review boundary.
