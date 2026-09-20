import assert from "node:assert/strict";
import { createPerformanceSet, sampleClip } from "../src/index.mjs";

const clip = {
  id: "test-attack",
  duration: 1,
  phases: [
    { id: "startup", start: 0, end: 0.25 },
    { id: "active", start: 0.25, end: 0.4 },
    { id: "recovery", start: 0.4, end: 1 }
  ],
  tracks: [{ id: "root.x", keys: [
    { time: 0, value: 0 },
    { time: 0.5, value: 2 },
    { time: 1, value: 2.5 }
  ]}],
  events: [{ time: 0.3, id: "hit" }]
};

const a = createPerformanceSet([clip]);
const b = createPerformanceSet([clip]);
assert.equal(a.receipt.sha256, b.receipt.sha256);
assert.equal(sampleClip(clip, 0.3).phases[0], "active");
assert.equal(sampleClip(clip, 0.25).values["root.x"], 1);
assert.throws(() => createPerformanceSet([{...clip, duration: 0}]));
console.log("PASS animation-fabric selftest", a.receipt.sha256);
