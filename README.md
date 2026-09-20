# AXM Animation Fabric

Standalone deterministic animation-authoring specialist for AXM.

## Purpose

Animation Fabric owns **how things move through time**. It is not a renderer, gameplay-rules engine, VFX engine, or durable world-state owner.

Initial canonical output remains compatible with the earlier donor contract:

- `axm.performance-set/v1`

The first executable body supports named clips, phase windows, keyframed scalar/vector tracks, root motion, joint/part tracks, exact timed animation events, deterministic sampling, replay validation, and inspectable receipts.

## Donor provenance

The genesis implementation is informed by the earlier experimental `character-animation-mocap-studio` in `mike-axiom-mir/axm-collaboration-platform`, observed at commit `c335244e9005df26c0edb99114164765addf6ed0`.

That donor proved a small `axm.performance-set/v1` shape with idle/walk/run/etc., measured drift, events, visemes, transitions, and compression. This repository is the new standalone specialist and does not depend on the Collaboration Platform at runtime.

## Run

```sh
npm test
node examples/attack-move.mjs
```

## Truth boundary

Passing structural and deterministic tests does not prove animation quality, physical plausibility, good posing, clean deformation, or game feel. Those require rendered/runtime evidence and an explicit visual-review boundary.
