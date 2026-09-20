import { createPerformanceSet, sampleClip } from "../src/index.mjs";

const swordSlash = {
  id: "sword-slash",
  duration: 0.9,
  phases: [
    { id: "anticipation", start: 0, end: 0.2 },
    { id: "active", start: 0.2, end: 0.36 },
    { id: "recovery", start: 0.36, end: 0.9 }
  ],
  tracks: [
    { id: "root.position", keys: [
      { time: 0, value: [0,0,0] },
      { time: 0.2, value: [0.05,0,0] },
      { time: 0.36, value: [0.72,0,0] },
      { time: 0.9, value: [0.82,0,0] }
    ]},
    { id: "weapon.rotation", keys: [
      { time: 0, value: -35 },
      { time: 0.2, value: -70 },
      { time: 0.31, value: 48 },
      { time: 0.9, value: 12 }
    ]}
  ],
  events: [{ time: 0.29, id: "impact-window" }]
};

const set = createPerformanceSet([swordSlash], { purpose: "attack-move proof" });
console.log(JSON.stringify({ set, activeSample: sampleClip(swordSlash, 0.29) }, null, 2));
