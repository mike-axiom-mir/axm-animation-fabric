import assert from "node:assert/strict";
import {
  createPerformanceSet,
  rootMotionDelta,
  rootMotionDistance,
  sampleClip,
  warpRootMotionDistance
} from "../src/index.mjs";

const clip = {
  id: "test-attack",
  duration: 1,
  phases: [
    { id: "startup", start: 0, end: 0.25 },
    { id: "active", start: 0.25, end: 0.4 },
    { id: "recovery", start: 0.4, end: 1 }
  ],
  tracks: [
    { id: "root.x", keys: [
      { time: 0, value: 0 },
      { time: 0.5, value: 2 },
      { time: 1, value: 2.5 }
    ]},
    { id: "root.position", keys: [
      { time: 0, value: [0, 0.1, 0] },
      { time: 0.5, value: [1, 0.3, 0] },
      { time: 1, value: [2, 0.1, 0] }
    ]}
  ],
  events: [{ time: 0.3, id: "hit" }]
};

const a = createPerformanceSet([clip]);
const b = createPerformanceSet([clip]);
assert.equal(a.receipt.sha256, b.receipt.sha256);
assert.equal(sampleClip(clip, 0.3).phases[0], "active");
assert.equal(sampleClip(clip, 0.25).values["root.x"], 1);
assert.deepEqual(rootMotionDelta(clip), [2, 0, 0]);
assert.equal(rootMotionDistance(clip, { axes: [0, 2] }), 2);

const before = structuredClone(clip);
const warpedA = warpRootMotionDistance(clip, { targetDistance: 3.5, axes: [0, 2] });
const warpedB = warpRootMotionDistance(clip, { targetDistance: 3.5, axes: [0, 2] });
assert.equal(warpedA.receipt.sha256, warpedB.receipt.sha256);
assert.equal(warpedA.factor, 1.75);
assert.equal(rootMotionDistance(warpedA.clip, { axes: [0, 2] }), 3.5);
assert.equal(warpedA.clip.tracks.find(t => t.id === "root.position").keys[1].value[1], 0.3);
assert.deepEqual(clip, before);

assert.throws(() => createPerformanceSet([{...clip, duration: 0}]));
assert.throws(() => warpRootMotionDistance(clip, { targetDistance: -1, axes: [0, 2] }));
console.log("PASS animation-fabric selftest", a.receipt.sha256, warpedA.receipt.sha256);
