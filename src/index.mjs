import { createHash } from "node:crypto";

export const SCHEMA = "axm.performance-set/v1";

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function finite(n, label) {
  if (!Number.isFinite(n)) throw new Error(label + " must be finite");
}

function lerp(a, b, t) {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerp(v, b[i], t));
  return a + (b - a) * t;
}

function subtract(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => subtract(v, b[i]));
  return a - b;
}

function scaleSelected(value, origin, factor, axes = null) {
  if (Array.isArray(value) && Array.isArray(origin)) {
    if (value.length !== origin.length) throw new Error("root-motion key shape mismatch");
    const selected = axes == null ? value.map((_, i) => i) : axes;
    const selectedSet = new Set(selected);
    return value.map((v, i) => selectedSet.has(i) ? origin[i] + (v - origin[i]) * factor : v);
  }
  if (axes != null) throw new Error("axes are only valid for vector root-motion tracks");
  return origin + (value - origin) * factor;
}

function magnitude(value, axes = null) {
  if (Array.isArray(value)) {
    const selected = axes == null ? value.map((_, i) => i) : axes;
    if (!selected.length) throw new Error("axes must select at least one vector component");
    let sum = 0;
    for (const axis of selected) {
      if (!Number.isInteger(axis) || axis < 0 || axis >= value.length) throw new Error("invalid root-motion axis: " + axis);
      finite(value[axis], "root-motion component");
      sum += value[axis] * value[axis];
    }
    return Math.sqrt(sum);
  }
  finite(value, "root-motion delta");
  if (axes != null) throw new Error("axes are only valid for vector root-motion tracks");
  return Math.abs(value);
}

function findTrack(clip, trackId) {
  const track = (clip.tracks || []).find(item => item.id === trackId);
  if (!track) throw new Error("root-motion track not found: " + trackId);
  return track;
}

function validateClipRange(clip, from, to) {
  finite(from, "clip range from");
  finite(to, "clip range to");
  if (from < 0 || to > clip.duration || to < from) throw new Error("invalid clip range");
}

export function sampleTrack(track, time) {
  const keys = track.keys;
  if (!keys.length) throw new Error("track requires keys");
  if (time <= keys[0].time) return structuredClone(keys[0].value);
  if (time >= keys.at(-1).time) return structuredClone(keys.at(-1).value);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (time >= a.time && time <= b.time) {
      if (a.interpolation === "hold") return structuredClone(a.value);
      const u = (time - a.time) / (b.time - a.time);
      return lerp(a.value, b.value, u);
    }
  }
  throw new Error("unreachable sample");
}

export function validateClip(clip) {
  if (!clip?.id) throw new Error("clip.id required");
  finite(clip.duration, "clip.duration");
  if (clip.duration <= 0) throw new Error("clip.duration must be > 0");

  let phaseEnd = 0;
  for (const phase of clip.phases || []) {
    finite(phase.start, "phase.start");
    finite(phase.end, "phase.end");
    if (phase.start < phaseEnd || phase.end <= phase.start || phase.end > clip.duration) {
      throw new Error("invalid or overlapping phase: " + phase.id);
    }
    phaseEnd = phase.end;
  }

  for (const track of clip.tracks || []) {
    let previous = -Infinity;
    for (const key of track.keys || []) {
      finite(key.time, "key.time");
      if (key.time < 0 || key.time > clip.duration || key.time <= previous) {
        throw new Error("track keys must be strictly ordered and inside clip");
      }
      previous = key.time;
    }
  }

  let eventTime = -Infinity;
  for (const event of clip.events || []) {
    finite(event.time, "event.time");
    if (event.time < eventTime || event.time < 0 || event.time > clip.duration) {
      throw new Error("events must be ordered and inside clip");
    }
    eventTime = event.time;
  }
  return true;
}

export function sampleClip(clip, time) {
  validateClip(clip);
  finite(time, "time");
  const t = Math.max(0, Math.min(clip.duration, time));
  const values = Object.fromEntries((clip.tracks || []).map(track => [track.id, sampleTrack(track, t)]));
  const phases = (clip.phases || []).filter(p => t >= p.start && t < p.end).map(p => p.id);
  return { clip: clip.id, time: t, phases, values };
}

export function eventsBetween(clip, from, to, { includeFrom = from === 0, includeTo = true } = {}) {
  validateClip(clip);
  validateClipRange(clip, from, to);
  if (typeof includeFrom !== "boolean" || typeof includeTo !== "boolean") {
    throw new Error("event range inclusivity flags must be boolean");
  }

  const selected = (clip.events || []).filter(event => {
    const afterStart = includeFrom ? event.time >= from : event.time > from;
    const beforeEnd = includeTo ? event.time <= to : event.time < to;
    return afterStart && beforeEnd;
  });
  return structuredClone(selected);
}

export function advanceClip(clip, {
  from = 0,
  to = clip.duration,
  interruptAt = null,
  includeFrom = from === 0
} = {}) {
  validateClip(clip);
  validateClipRange(clip, from, to);
  if (typeof includeFrom !== "boolean") throw new Error("includeFrom must be boolean");

  let effectiveTo = to;
  let interrupted = false;
  if (interruptAt != null) {
    finite(interruptAt, "interruptAt");
    if (interruptAt < from || interruptAt > to) throw new Error("interruptAt must be inside the advance range");
    effectiveTo = interruptAt;
    interrupted = true;
  }

  const body = {
    clip: clip.id,
    from,
    to,
    effectiveTo,
    interruptAt,
    interrupted,
    completed: !interrupted && effectiveTo === clip.duration,
    events: eventsBetween(clip, from, effectiveTo, { includeFrom, includeTo: true }),
    state: sampleClip(clip, effectiveTo)
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      cancelSafe: true
    }
  };
}

function blendTransitionValue(fromValue, toValue, alpha, label) {
  const fromVector = Array.isArray(fromValue);
  const toVector = Array.isArray(toValue);
  if (fromVector !== toVector) throw new Error(label + " shape mismatch");
  if (fromVector) {
    if (fromValue.length !== toValue.length) throw new Error(label + " shape mismatch");
    return fromValue.map((value, index) =>
      blendTransitionValue(value, toValue[index], alpha, label + "[" + index + "]")
    );
  }
  finite(fromValue, label + " from");
  finite(toValue, label + " to");
  return lerp(fromValue, toValue, alpha);
}

function applyAdditiveValue(baseValue, layerValue, referenceValue, weight, label) {
  const baseVector = Array.isArray(baseValue);
  const layerVector = Array.isArray(layerValue);
  const referenceVector = Array.isArray(referenceValue);
  if (baseVector !== layerVector || layerVector !== referenceVector) throw new Error(label + " shape mismatch");
  if (baseVector) {
    if (baseValue.length !== layerValue.length || layerValue.length !== referenceValue.length) {
      throw new Error(label + " shape mismatch");
    }
    return baseValue.map((value, index) =>
      applyAdditiveValue(value, layerValue[index], referenceValue[index], weight, label + "[" + index + "]")
    );
  }
  finite(baseValue, label + " base");
  finite(layerValue, label + " layer");
  finite(referenceValue, label + " reference");
  return baseValue + (layerValue - referenceValue) * weight;
}

export function sampleClipTransition(fromClip, toClip, {
  fromTime = fromClip.duration,
  toTime = 0,
  alpha,
  trackIds = null
} = {}) {
  validateClip(fromClip);
  validateClip(toClip);
  finite(fromTime, "transition fromTime");
  finite(toTime, "transition toTime");
  finite(alpha, "transition alpha");
  if (fromTime < 0 || fromTime > fromClip.duration) throw new Error("transition fromTime must be inside source clip");
  if (toTime < 0 || toTime > toClip.duration) throw new Error("transition toTime must be inside target clip");
  if (alpha < 0 || alpha > 1) throw new Error("transition alpha must be between 0 and 1");

  const fromState = sampleClip(fromClip, fromTime);
  const toState = sampleClip(toClip, toTime);
  const fromIds = Object.keys(fromState.values);
  const toIds = new Set(Object.keys(toState.values));

  let selected;
  if (trackIds == null) {
    selected = fromIds.filter(id => toIds.has(id));
    if (!selected.length) throw new Error("transition clips share no tracks");
  } else {
    if (!Array.isArray(trackIds) || !trackIds.length) throw new Error("trackIds must be a non-empty array");
    if (new Set(trackIds).size !== trackIds.length) throw new Error("trackIds must not contain duplicates");
    selected = [...trackIds];
  }

  const values = {};
  for (const trackId of selected) {
    if (typeof trackId !== "string" || !trackId) throw new Error("transition track id must be a non-empty string");
    if (!(trackId in fromState.values) || !(trackId in toState.values)) {
      throw new Error("transition track missing from one clip: " + trackId);
    }
    values[trackId] = blendTransitionValue(
      fromState.values[trackId],
      toState.values[trackId],
      alpha,
      "transition track " + trackId
    );
  }

  const body = {
    from: { clip: fromClip.id, time: fromTime, phases: fromState.phases },
    to: { clip: toClip.id, time: toTime, phases: toState.phases },
    alpha,
    trackIds: selected,
    values
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      poseBlendOnly: true
    }
  };
}

export function sampleAdditiveLayer(baseClip, additiveClip, {
  baseTime = 0,
  additiveTime = 0,
  referenceTime = 0,
  weight = 1,
  trackIds = null
} = {}) {
  validateClip(baseClip);
  validateClip(additiveClip);
  finite(baseTime, "additive baseTime");
  finite(additiveTime, "additive additiveTime");
  finite(referenceTime, "additive referenceTime");
  finite(weight, "additive weight");
  if (baseTime < 0 || baseTime > baseClip.duration) throw new Error("additive baseTime must be inside base clip");
  if (additiveTime < 0 || additiveTime > additiveClip.duration) throw new Error("additive additiveTime must be inside additive clip");
  if (referenceTime < 0 || referenceTime > additiveClip.duration) throw new Error("additive referenceTime must be inside additive clip");
  if (weight < 0 || weight > 1) throw new Error("additive weight must be between 0 and 1");

  const baseState = sampleClip(baseClip, baseTime);
  const additiveState = sampleClip(additiveClip, additiveTime);
  const referenceState = sampleClip(additiveClip, referenceTime);
  const additiveIds = new Set(Object.keys(additiveState.values));

  let selected;
  if (trackIds == null) {
    selected = Object.keys(baseState.values).filter(id => additiveIds.has(id));
    if (!selected.length) throw new Error("base and additive clips share no tracks");
  } else {
    if (!Array.isArray(trackIds) || !trackIds.length) throw new Error("trackIds must be a non-empty array");
    if (new Set(trackIds).size !== trackIds.length) throw new Error("trackIds must not contain duplicates");
    selected = [...trackIds];
  }

  const values = {};
  for (const trackId of selected) {
    if (typeof trackId !== "string" || !trackId) throw new Error("additive track id must be a non-empty string");
    if (!(trackId in baseState.values) || !(trackId in additiveState.values) || !(trackId in referenceState.values)) {
      throw new Error("additive track missing from one clip: " + trackId);
    }
    values[trackId] = applyAdditiveValue(
      baseState.values[trackId],
      additiveState.values[trackId],
      referenceState.values[trackId],
      weight,
      "additive track " + trackId
    );
  }

  const body = {
    base: { clip: baseClip.id, time: baseTime, phases: baseState.phases },
    additive: { clip: additiveClip.id, time: additiveTime, phases: additiveState.phases },
    referenceTime,
    weight,
    trackIds: selected,
    values
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      additivePoseOnly: true,
      preservesSource: true
    }
  };
}

export function rootMotionDelta(clip, { trackId = "root.position", from = 0, to = clip.duration } = {}) {
  validateClip(clip);
  finite(from, "root-motion from");
  finite(to, "root-motion to");
  if (from < 0 || to > clip.duration || to < from) throw new Error("invalid root-motion sampling range");
  const track = findTrack(clip, trackId);
  return subtract(sampleTrack(track, to), sampleTrack(track, from));
}

export function rootMotionDistance(clip, { trackId = "root.position", from = 0, to = clip.duration, axes = null } = {}) {
  return magnitude(rootMotionDelta(clip, { trackId, from, to }), axes);
}

export function warpRootMotionDistance(clip, { trackId = "root.position", targetDistance, axes = null } = {}) {
  validateClip(clip);
  finite(targetDistance, "targetDistance");
  if (targetDistance < 0) throw new Error("targetDistance cannot be negative");

  const track = findTrack(clip, trackId);
  if (!(track.keys || []).length) throw new Error("root-motion track requires keys");
  const authoredDistance = rootMotionDistance(clip, { trackId, axes });
  if (authoredDistance === 0 && targetDistance !== 0) {
    throw new Error("cannot warp zero-distance root motion to a non-zero target");
  }
  const factor = authoredDistance === 0 ? 1 : targetDistance / authoredDistance;
  const origin = structuredClone(track.keys[0].value);
  const warped = structuredClone(clip);
  const targetTrack = findTrack(warped, trackId);
  targetTrack.keys = targetTrack.keys.map(key => ({
    ...key,
    value: scaleSelected(key.value, origin, factor, axes)
  }));

  const body = {
    sourceClip: clip.id,
    trackId,
    axes: axes == null ? null : [...axes],
    authoredDistance,
    targetDistance,
    factor,
    clip: warped
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      preservesSource: true
    }
  };
}

export function createPerformanceSet(clips, metadata = {}) {
  clips.forEach(validateClip);
  const body = { schema: SCHEMA, clips: structuredClone(clips), metadata: structuredClone(metadata) };
  return { ...body, receipt: { sha256: digest(body), deterministic: true } };
}
