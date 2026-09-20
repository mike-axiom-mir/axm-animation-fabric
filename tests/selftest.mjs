import assert from "node:assert/strict";
import {
  advanceClip,
  createPerformanceSet,
  eventsBetween,
  rootMotionDelta,
  rootMotionDistance,
  sampleClip,
  sampleClipTransition,
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
  events: [
    { time: 0, id: "attack-start" },
    { time: 0.3, id: "hit" },
    { time: 0.6, id: "recover-cue" }
  ]
};

const followup = {
  id: "followup-attack",
  duration: 0.8,
  phases: [
    { id: "startup", start: 0, end: 0.2 },
    { id: "active", start: 0.2, end: 0.35 },
    { id: "recovery", start: 0.35, end: 0.8 }
  ],
  tracks: [
    { id: "root.x", keys: [
      { time: 0, value: 4 },
      { time: 0.8, value: 5 }
    ]},
    { id: "root.position", keys: [
      { time: 0, value: [4, 0.5, 0] },
      { time: 0.8, value: [5, 0.5, 0] }
    ]},
    { id: "weapon.angle", keys: [
      { time: 0, value: 20 },
      { time: 0.8, value: 80 }
    ]}
  ],
  events: [
    { time: 0, id: "followup-start" },
    { time: 0.25, id: "followup-hit" }
  ]
};

const a = createPerformanceSet([clip]);
const b = createPerformanceSet([clip]);
assert.equal(a.receipt.sha256, b.receipt.sha256);
assert.equal(sampleClip(clip, 0.3).phases[0], "active");
assert.equal(sampleClip(clip, 0.25).values["root.x"], 1);
assert.deepEqual(rootMotionDelta(clip), [2, 0, 0]);
assert.equal(rootMotionDistance(clip, { axes: [0, 2] }), 2);

assert.deepEqual(eventsBetween(clip, 0, 0.3).map(event => event.id), ["attack-start", "hit"]);
assert.deepEqual(eventsBetween(clip, 0.3, 0.6).map(event => event.id), ["recover-cue"]);
assert.deepEqual(eventsBetween(clip, 0, 0.6, { includeTo: false }).map(event => event.id), ["attack-start", "hit"]);

const interruptedA = advanceClip(clip, { from: 0.2, to: 0.8, interruptAt: 0.35 });
const interruptedB = advanceClip(clip, { from: 0.2, to: 0.8, interruptAt: 0.35 });
assert.equal(interruptedA.receipt.sha256, interruptedB.receipt.sha256);
assert.equal(interruptedA.interrupted, true);
assert.equal(interruptedA.completed, false);
assert.equal(interruptedA.effectiveTo, 0.35);
assert.equal(interruptedA.state.time, 0.35);
assert.deepEqual(interruptedA.events.map(event => event.id), ["hit"]);
assert.equal(interruptedA.events.some(event => event.id === "recover-cue"), false);

const completed = advanceClip(clip, { from: 0.35, to: 1 });
assert.equal(completed.interrupted, false);
assert.equal(completed.completed, true);
assert.deepEqual(completed.events.map(event => event.id), ["recover-cue"]);

const transitionBeforeClip = structuredClone(clip);
const transitionBeforeFollowup = structuredClone(followup);
const transitionA = sampleClipTransition(clip, followup, {
  fromTime: 0.35,
  toTime: 0,
  alpha: 0.5,
  trackIds: ["root.x", "root.position"]
});
const transitionB = sampleClipTransition(clip, followup, {
  fromTime: 0.35,
  toTime: 0,
  alpha: 0.5,
  trackIds: ["root.x", "root.position"]
});
assert.equal(transitionA.receipt.sha256, transitionB.receipt.sha256);
assert.equal(transitionA.receipt.poseBlendOnly, true);
assert.equal(transitionA.values["root.x"], 2.7);
assert.ok(Math.abs(transitionA.values["root.position"][0] - 2.35) < 1e-12);
assert.ok(Math.abs(transitionA.values["root.position"][1] - 0.37) < 1e-12);
assert.equal(transitionA.values["root.position"][2], 0);
assert.deepEqual(transitionA.from.phases, ["active"]);
assert.deepEqual(transitionA.to.phases, ["startup"]);
assert.deepEqual(clip, transitionBeforeClip);
assert.deepEqual(followup, transitionBeforeFollowup);

const outgoingPose = sampleClipTransition(clip, followup, {
  fromTime: 0.35,
  toTime: 0,
  alpha: 0,
  trackIds: ["root.x"]
});
const incomingPose = sampleClipTransition(clip, followup, {
  fromTime: 0.35,
  toTime: 0,
  alpha: 1,
  trackIds: ["root.x"]
});
assert.equal(outgoingPose.values["root.x"], sampleClip(clip, 0.35).values["root.x"]);
assert.equal(incomingPose.values["root.x"], sampleClip(followup, 0).values["root.x"]);

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
assert.throws(() => eventsBetween(clip, 0.7, 0.2));
assert.throws(() => advanceClip(clip, { from: 0.2, to: 0.8, interruptAt: 0.1 }));
assert.throws(() => advanceClip(clip, { from: 0.2, to: 0.8, interruptAt: 0.9 }));
assert.throws(() => sampleClipTransition(clip, followup, { alpha: -0.1 }));
assert.throws(() => sampleClipTransition(clip, followup, { alpha: 1.1 }));
assert.throws(() => sampleClipTransition(clip, followup, { alpha: 0.5, trackIds: ["missing"] }));
assert.throws(() => sampleClipTransition(clip, followup, { alpha: 0.5, trackIds: [] }));

const mismatched = structuredClone(followup);
mismatched.tracks.find(track => track.id === "root.position").keys[0].value = [4, 0.5];
assert.throws(() => sampleClipTransition(clip, mismatched, {
  fromTime: 0.35,
  toTime: 0,
  alpha: 0.5,
  trackIds: ["root.position"]
}));

console.log(
  "PASS animation-fabric selftest",
  a.receipt.sha256,
  warpedA.receipt.sha256,
  interruptedA.receipt.sha256,
  transitionA.receipt.sha256
);
