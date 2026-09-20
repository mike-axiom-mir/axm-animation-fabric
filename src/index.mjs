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

export function createPerformanceSet(clips, metadata = {}) {
  clips.forEach(validateClip);
  const body = { schema: SCHEMA, clips: structuredClone(clips), metadata: structuredClone(metadata) };
  return { ...body, receipt: { sha256: digest(body), deterministic: true } };
}
