import assert from "node:assert/strict";
import { sampleAdditiveLayer, sampleClip } from "../src/index.mjs";

const baseAttack = {
  id: "moving-rifle-shot",
  duration: 1,
  phases: [
    { id: "startup", start: 0, end: 0.2 },
    { id: "active", start: 0.2, end: 0.35 },
    { id: "recovery", start: 0.35, end: 1 }
  ],
  tracks: [
    { id: "root.position", keys: [
      { time: 0, value: [0, 0, 0] },
      { time: 1, value: [2, 0, 0] }
    ]},
    { id: "weapon.pitch", keys: [
      { time: 0, value: 10 },
      { time: 1, value: 20 }
    ]},
    { id: "spine.offset", keys: [
      { time: 0, value: [0, 0, 0] },
      { time: 1, value: [0.2, 0, 0] }
    ]}
  ],
  events: [{ time: 0.25, id: "fire" }]
};

const recoilLayer = {
  id: "rifle-recoil-additive",
  duration: 0.2,
  phases: [{ id: "kick", start: 0, end: 0.2 }],
  tracks: [
    { id: "weapon.pitch", keys: [
      { time: 0, value: 0 },
      { time: 0.1, value: -12 },
      { time: 0.2, value: 0 }
    ]},
    { id: "spine.offset", keys: [
      { time: 0, value: [0, 0, 0] },
      { time: 0.1, value: [-0.1, 0.04, 0] },
      { time: 0.2, value: [0, 0, 0] }
    ]}
  ],
  events: [{ time: 0.1, id: "recoil-peak" }]
};

const baseBefore = structuredClone(baseAttack);
const layerBefore = structuredClone(recoilLayer);
const layeredA = sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  referenceTime: 0,
  weight: 0.5,
  trackIds: ["weapon.pitch", "spine.offset"]
});
const layeredB = sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  referenceTime: 0,
  weight: 0.5,
  trackIds: ["weapon.pitch", "spine.offset"]
});

assert.equal(layeredA.receipt.sha256, layeredB.receipt.sha256);
assert.equal(layeredA.receipt.additivePoseOnly, true);
assert.equal(layeredA.receipt.preservesSource, true);
assert.equal(layeredA.values["weapon.pitch"], 6.5);
assert.deepEqual(layeredA.values["spine.offset"], [0, 0.02, 0]);
assert.deepEqual(layeredA.trackIds, ["weapon.pitch", "spine.offset"]);
assert.deepEqual(baseAttack, baseBefore);
assert.deepEqual(recoilLayer, layerBefore);

const zeroWeight = sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  referenceTime: 0,
  weight: 0,
  trackIds: ["weapon.pitch"]
});
assert.equal(zeroWeight.values["weapon.pitch"], sampleClip(baseAttack, 0.25).values["weapon.pitch"]);

const fullWeight = sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  referenceTime: 0,
  weight: 1,
  trackIds: ["weapon.pitch"]
});
assert.equal(fullWeight.values["weapon.pitch"], 0.5);

assert.throws(() => sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  weight: -0.1,
  trackIds: ["weapon.pitch"]
}));
assert.throws(() => sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  weight: 1.1,
  trackIds: ["weapon.pitch"]
}));
assert.throws(() => sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  trackIds: ["root.position"]
}));
assert.throws(() => sampleAdditiveLayer(baseAttack, recoilLayer, {
  baseTime: 1.1,
  additiveTime: 0.1,
  trackIds: ["weapon.pitch"]
}));

const mismatchedLayer = structuredClone(recoilLayer);
mismatchedLayer.tracks.find(track => track.id === "spine.offset").keys[1].value = [-0.1, 0.04];
assert.throws(() => sampleAdditiveLayer(baseAttack, mismatchedLayer, {
  baseTime: 0.25,
  additiveTime: 0.1,
  trackIds: ["spine.offset"]
}));

console.log("PASS additive action layer", layeredA.receipt.sha256);
