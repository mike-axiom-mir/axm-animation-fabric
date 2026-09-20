import assert from "node:assert/strict";
import { digest, eventsBetween, sampleClip, validateClip } from "../src/index.mjs";
import {
  mapSourceInterval,
  mapSourceTime,
  retimeClip,
  TIME_INTERVAL_MAP_SCHEMA,
  TIME_POINT_MAP_SCHEMA,
  TIME_TRANSFORM_SCHEMA,
  validateTimeTransform
} from "../src/action-retime.mjs";

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
assert.equal(fast.receipt.emitsTimeTransform, true);

assert.equal(fast.timeTransform.schema, TIME_TRANSFORM_SCHEMA);
assert.equal(fast.timeTransform.sourceClip, "arc-slash");
assert.equal(fast.timeTransform.outputClip, "arc-slash-fast");
assert.equal(fast.timeTransform.sourceSha256, digest(attack));
assert.equal(fast.timeTransform.outputSha256, digest(fast.clip));
assert.equal(fast.timeTransform.sourceDuration, 1.2);
assert.equal(fast.timeTransform.outputDuration, 0.6);
assert.equal(fast.timeTransform.rate, 2);
assert.equal(fast.timeTransform.timeScale, 0.5);
assert.equal(fast.timeTransform.receipt.sourceBound, true);
assert.equal(fast.timeTransform.receipt.outputBound, true);
assert.equal(validateTimeTransform(fast.timeTransform, { sourceClip: attack, outputClip: fast.clip }), true);

const gameplayImpact = mapSourceTime(fast.timeTransform, 0.29);
assert.equal(gameplayImpact.schema, TIME_POINT_MAP_SCHEMA);
assert.equal(gameplayImpact.sourceTime, 0.29);
assert.equal(gameplayImpact.outputTime, 0.145);
assert.equal(gameplayImpact.transformSha256, fast.timeTransform.receipt.sha256);
assert.equal(gameplayImpact.receipt.transformBound, true);

const gameplayActiveWindow = mapSourceInterval(fast.timeTransform, { start: 0.24, end: 0.4 });
assert.equal(gameplayActiveWindow.schema, TIME_INTERVAL_MAP_SCHEMA);
assert.equal(gameplayActiveWindow.sourceStart, 0.24);
assert.equal(gameplayActiveWindow.sourceEnd, 0.4);
assert.equal(gameplayActiveWindow.outputStart, 0.12);
assert.equal(gameplayActiveWindow.outputEnd, 0.2);
assert.equal(gameplayActiveWindow.transformSha256, fast.timeTransform.receipt.sha256);

const gameplayImpactReplay = mapSourceTime(fast.timeTransform, 0.29);
const gameplayWindowReplay = mapSourceInterval(fast.timeTransform, { start: 0.24, end: 0.4 });
assert.equal(gameplayImpactReplay.receipt.sha256, gameplayImpact.receipt.sha256);
assert.equal(gameplayWindowReplay.receipt.sha256, gameplayActiveWindow.receipt.sha256);

const replay = retimeClip(attack, { rate: 2, id: "arc-slash-fast" });
assert.equal(replay.receipt.sha256, fast.receipt.sha256, "same input must replay to the same receipt");
assert.equal(replay.timeTransform.receipt.sha256, fast.timeTransform.receipt.sha256);
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
assert.equal(mapSourceTime(slow.timeTransform, 0.29).outputTime, 0.58);

const tamperedTransform = structuredClone(fast.timeTransform);
tamperedTransform.outputClip = "arc-slash-counterfeit";
assert.throws(() => validateTimeTransform(tamperedTransform), /receipt mismatch/);

const modifiedSource = structuredClone(attack);
modifiedSource.metadata.weapon = "hammer";
assert.throws(
  () => validateTimeTransform(fast.timeTransform, { sourceClip: modifiedSource, outputClip: fast.clip }),
  /source clip hash mismatch/
);

const modifiedOutput = structuredClone(fast.clip);
modifiedOutput.metadata.weapon = "hammer";
assert.throws(
  () => validateTimeTransform(fast.timeTransform, { sourceClip: attack, outputClip: modifiedOutput }),
  /output clip hash mismatch/
);

assert.throws(() => mapSourceTime(fast.timeTransform, -0.01), /inside source duration/);
assert.throws(() => mapSourceTime(fast.timeTransform, 1.21), /inside source duration/);
assert.throws(() => mapSourceInterval(fast.timeTransform, { start: 0.4, end: 0.2 }), /end must be >= start/);

assert.throws(() => retimeClip(attack, { rate: 0, id: "bad" }), /rate must be > 0/);
assert.throws(() => retimeClip(attack, { rate: -1, id: "bad" }), /rate must be > 0/);
assert.throws(() => retimeClip(attack, { rate: Number.NaN, id: "bad" }), /rate must be finite/);
assert.throws(() => retimeClip(attack, { rate: 1 }), /id must be a non-empty string/);
assert.throws(() => retimeClip(attack, { rate: 1, id: "arc-slash" }), /id must differ/);

console.log("action retime: ok");
