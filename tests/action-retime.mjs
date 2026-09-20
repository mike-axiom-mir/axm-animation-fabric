import assert from "node:assert/strict";
import { eventsBetween, sampleClip, validateClip } from "../src/index.mjs";
import { retimeClip } from "../src/action-retime.mjs";

const attack = {
  id: "arc-slash",
  duration: 1.2,
  metadata: { weapon: "blade", authoredBy: "test-fixture" },
  phases: [
    { id: "startup", start: 0, end: 0.4 },
    { id: "active", start: 0.4, end: 0.7 },
    { id: "recovery", start: 0.7, end: 1.2 }
  ],
  tracks: [
    {
      id: "root.position",
      keys: [
        { time: 0, value: [0, 0, 0] },
        { time: 0.6, value: [1.2, 0, 0] },
        { time: 1.2, value: [1.8, 0, 0] }
      ]
    },
    {
      id: "hand.rotation",
      keys: [
        { time: 0, value: 0 },
        { time: 0.55, value: 90 },
        { time: 1.2, value: 20 }
      ]
    }
  ],
  events: [
    { id: "swing", time: 0.4 },
    { id: "impact", time: 0.55 },
    { id: "recover-complete", time: 1.2 }
  ]
};

validateClip(attack);
const before = structuredClone(attack);
const fast = retimeClip(attack, { rate: 2, id: "arc-slash-fast" });

assert.equal(fast.clip.duration, 0.6);
assert.deepEqual(fast.clip.metadata, attack.metadata);
assert.deepEqual(fast.clip.phases, [
  { id: "startup", start: 0, end: 0.2 },
  { id: "active", start: 0.2, end: 0.35 },
  { id: "recovery", start: 0.35, end: 0.6 }
]);
assert.deepEqual(fast.clip.events, [
  { id: "swing", time: 0.2 },
  { id: "impact", time: 0.275 },
  { id: "recover-complete", time: 0.6 }
]);
assert.deepEqual(fast.clip.tracks[0].keys.map(key => key.time), [0, 0.3, 0.6]);
assert.deepEqual(fast.clip.tracks[1].keys.map(key => key.time), [0, 0.275, 0.6]);
assert.deepEqual(attack, before, "retiming must not mutate the authored source clip");
assert.equal(fast.sourceClip, "arc-slash");
assert.equal(fast.outputClip, "arc-slash-fast");
assert.equal(fast.rate, 2);
assert.equal(fast.timeScale, 0.5);
assert.equal(fast.receipt.deterministic, true);
assert.equal(fast.receipt.preservesSource, true);

const replay = retimeClip(attack, { rate: 2, id: "arc-slash-fast" });
assert.equal(replay.receipt.sha256, fast.receipt.sha256, "same input must replay to the same receipt");
assert.deepEqual(replay.clip, fast.clip);

const sourceImpactPose = sampleClip(attack, 0.55);
const fastImpactPose = sampleClip(fast.clip, 0.275);
assert.deepEqual(fastImpactPose.values, sourceImpactPose.values, "retiming changes time, not sampled authored values");
assert.deepEqual(fastImpactPose.phases, sourceImpactPose.phases);
assert.deepEqual(eventsBetween(fast.clip, 0.2, 0.275), [{ id: "impact", time: 0.275 }]);

const slow = retimeClip(attack, { rate: 0.5, id: "arc-slash-heavy" });
assert.equal(slow.clip.duration, 2.4);
assert.equal(slow.clip.events[1].time, 1.1);
assert.deepEqual(sampleClip(slow.clip, 1.1).values, sourceImpactPose.values);

assert.throws(() => retimeClip(attack, { rate: 0, id: "bad" }), /rate must be > 0/);
assert.throws(() => retimeClip(attack, { rate: -1, id: "bad" }), /rate must be > 0/);
assert.throws(() => retimeClip(attack, { rate: Number.NaN, id: "bad" }), /rate must be finite/);
assert.throws(() => retimeClip(attack, { rate: 1 }), /id must be a non-empty string/);
assert.throws(() => retimeClip(attack, { rate: 1, id: "arc-slash" }), /id must differ/);

console.log("action retime: ok");
