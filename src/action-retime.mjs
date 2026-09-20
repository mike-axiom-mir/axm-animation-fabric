import { digest, validateClip } from "./index.mjs";

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function scaleTime(value, timeScale, label) {
  finite(value, label);
  return value * timeScale;
}

export function retimeClip(clip, { rate, id } = {}) {
  validateClip(clip);
  finite(rate, "retime rate");
  if (rate <= 0) throw new Error("retime rate must be > 0");
  if (typeof id !== "string" || !id.trim()) throw new Error("retime id must be a non-empty string");
  if (id === clip.id) throw new Error("retime id must differ from source clip id");

  const timeScale = 1 / rate;
  const retimed = structuredClone(clip);
  retimed.id = id;
  retimed.duration = scaleTime(clip.duration, timeScale, "clip.duration");

  if (Array.isArray(retimed.phases)) {
    retimed.phases = retimed.phases.map(phase => ({
      ...phase,
      start: scaleTime(phase.start, timeScale, "phase.start"),
      end: scaleTime(phase.end, timeScale, "phase.end")
    }));
  }

  if (Array.isArray(retimed.tracks)) {
    retimed.tracks = retimed.tracks.map(track => ({
      ...track,
      keys: (track.keys || []).map(key => ({
        ...key,
        time: scaleTime(key.time, timeScale, "key.time")
      }))
    }));
  }

  if (Array.isArray(retimed.events)) {
    retimed.events = retimed.events.map(event => ({
      ...event,
      time: scaleTime(event.time, timeScale, "event.time")
    }));
  }

  validateClip(retimed);

  const body = {
    sourceClip: clip.id,
    sourceSha256: digest(clip),
    outputClip: id,
    rate,
    timeScale,
    clip: retimed
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      preservesSource: true,
      retimesPhases: true,
      retimesTracks: true,
      retimesEvents: true
    }
  };
}
