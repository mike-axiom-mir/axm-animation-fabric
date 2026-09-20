import { digest, validateClip } from "./index.mjs";

export const TIME_TRANSFORM_SCHEMA = "axm.animation-time-transform/v1";
export const TIME_POINT_MAP_SCHEMA = "axm.animation-time-point-map/v1";
export const TIME_INTERVAL_MAP_SCHEMA = "axm.animation-time-interval-map/v1";

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function scaleTime(value, timeScale, label) {
  finite(value, label);
  return value * timeScale;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " must be a non-empty string");
}

function timeTransformBody(transform) {
  return {
    schema: transform.schema,
    sourceClip: transform.sourceClip,
    sourceSha256: transform.sourceSha256,
    outputClip: transform.outputClip,
    outputSha256: transform.outputSha256,
    sourceDuration: transform.sourceDuration,
    outputDuration: transform.outputDuration,
    rate: transform.rate,
    timeScale: transform.timeScale
  };
}

function buildTimeTransform({ clip, retimed, rate, timeScale }) {
  const body = {
    schema: TIME_TRANSFORM_SCHEMA,
    sourceClip: clip.id,
    sourceSha256: digest(clip),
    outputClip: retimed.id,
    outputSha256: digest(retimed),
    sourceDuration: clip.duration,
    outputDuration: retimed.duration,
    rate,
    timeScale
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      uniform: true,
      sourceBound: true,
      outputBound: true
    }
  };
}

export function validateTimeTransform(transform, { sourceClip = null, outputClip = null } = {}) {
  if (!transform || typeof transform !== "object") throw new Error("time transform required");
  if (transform.schema !== TIME_TRANSFORM_SCHEMA) throw new Error("unsupported time transform schema");
  requireNonEmptyString(transform.sourceClip, "time transform sourceClip");
  requireNonEmptyString(transform.sourceSha256, "time transform sourceSha256");
  requireNonEmptyString(transform.outputClip, "time transform outputClip");
  requireNonEmptyString(transform.outputSha256, "time transform outputSha256");
  finite(transform.sourceDuration, "time transform sourceDuration");
  finite(transform.outputDuration, "time transform outputDuration");
  finite(transform.rate, "time transform rate");
  finite(transform.timeScale, "time transform timeScale");
  if (transform.sourceDuration <= 0 || transform.outputDuration <= 0) {
    throw new Error("time transform durations must be > 0");
  }
  if (transform.rate <= 0 || transform.timeScale <= 0) throw new Error("time transform rate and scale must be > 0");
  if (transform.timeScale !== 1 / transform.rate) throw new Error("time transform rate/scale mismatch");
  if (transform.outputDuration !== transform.sourceDuration * transform.timeScale) {
    throw new Error("time transform duration mismatch");
  }

  const expectedReceipt = digest(timeTransformBody(transform));
  if (transform.receipt?.sha256 !== expectedReceipt) throw new Error("time transform receipt mismatch");

  if (sourceClip != null) {
    validateClip(sourceClip);
    if (sourceClip.id !== transform.sourceClip) throw new Error("time transform source clip id mismatch");
    if (sourceClip.duration !== transform.sourceDuration) throw new Error("time transform source duration mismatch");
    if (digest(sourceClip) !== transform.sourceSha256) throw new Error("time transform source clip hash mismatch");
  }

  if (outputClip != null) {
    validateClip(outputClip);
    if (outputClip.id !== transform.outputClip) throw new Error("time transform output clip id mismatch");
    if (outputClip.duration !== transform.outputDuration) throw new Error("time transform output duration mismatch");
    if (digest(outputClip) !== transform.outputSha256) throw new Error("time transform output clip hash mismatch");
  }

  return true;
}

function validateSourceTime(transform, sourceTime, label) {
  validateTimeTransform(transform);
  finite(sourceTime, label);
  if (sourceTime < 0 || sourceTime > transform.sourceDuration) {
    throw new Error(label + " must be inside source duration");
  }
}

export function mapSourceTime(transform, sourceTime) {
  validateSourceTime(transform, sourceTime, "source time");
  const body = {
    schema: TIME_POINT_MAP_SCHEMA,
    transformSha256: transform.receipt.sha256,
    sourceClip: transform.sourceClip,
    outputClip: transform.outputClip,
    sourceTime,
    outputTime: scaleTime(sourceTime, transform.timeScale, "source time")
  };
  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      transformBound: true
    }
  };
}

export function mapSourceInterval(transform, { start, end } = {}) {
  validateSourceTime(transform, start, "source interval start");
  validateSourceTime(transform, end, "source interval end");
  if (end < start) throw new Error("source interval end must be >= start");

  const body = {
    schema: TIME_INTERVAL_MAP_SCHEMA,
    transformSha256: transform.receipt.sha256,
    sourceClip: transform.sourceClip,
    outputClip: transform.outputClip,
    sourceStart: start,
    sourceEnd: end,
    outputStart: scaleTime(start, transform.timeScale, "source interval start"),
    outputEnd: scaleTime(end, transform.timeScale, "source interval end")
  };
  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      transformBound: true
    }
  };
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
  const timeTransform = buildTimeTransform({ clip, retimed, rate, timeScale });
  validateTimeTransform(timeTransform, { sourceClip: clip, outputClip: retimed });

  const body = {
    sourceClip: clip.id,
    sourceSha256: digest(clip),
    outputClip: id,
    rate,
    timeScale,
    timeTransform,
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
      retimesEvents: true,
      emitsTimeTransform: true
    }
  };
}
