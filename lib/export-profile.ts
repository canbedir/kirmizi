// How big an export is allowed to be.
//
// A downloaded clip is the one you keep, so it gets a generous bitrate and
// whatever size it was recorded at. A shared clip is a different job: it has to
// travel, it will be watched in a browser once or twice, and it lands in
// storage somebody has to pay for. Encoding it smaller in the first place is
// the only lever available — there is no server to transcode on, and there was
// never going to be one.
//
// The two profiles run through the same exporter; only the numbers differ.

export interface ExportProfile {
  /** Longest edge the exported frame may have. */
  maxLongEdge: number;
  /** Shortest edge it may have. Together these are a box to fit inside. */
  maxShortEdge: number;
  /**
   * Bits spent per pixel per frame before the floor and ceiling apply. The
   * download's 0.2 is deliberately more than a codec needs; the share's is
   * about what a screen recording actually asks for.
   */
  bitsPerPixel: number;
  minVideoBitrate: number;
  maxVideoBitrate: number;
  audioBitrate: number;
}

export const DOWNLOAD_PROFILE: ExportProfile = {
  maxLongEdge: Infinity,
  maxShortEdge: Infinity,
  bitsPerPixel: 0.2,
  minVideoBitrate: 8_000_000,
  maxVideoBitrate: 100_000_000,
  audioBitrate: 192_000,
};

/**
 * 1080p at 2.5 Mbps. Screen content is mostly flat colour and text, which
 * compresses far better than camera footage, so this stays readable where the
 * same number would look poor on a film.
 */
export const SHARE_PROFILE: ExportProfile = {
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  bitsPerPixel: 0.07,
  minVideoBitrate: 600_000,
  maxVideoBitrate: 2_500_000,
  audioBitrate: 128_000,
};

/** How long a clip may be to be shared, in seconds. */
export const SHARE_MAX_SECONDS = 120;

/**
 * And how large the finished file may be. The profile above should land a
 * full-length clip near 40 MB; this is the backstop for the ones that don't,
 * because the bitrate is a target and not a promise.
 */
export const SHARE_MAX_BYTES = 50 * 1024 * 1024;

/** H.264 in 4:2:0 can't encode an odd width or height. */
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * The frame scaled to fit the profile's box, keeping its shape.
 *
 * The box is oriented by the frame rather than fixed landscape, so a vertical
 * export is held to 1080×1920 rather than being squeezed to fit a shape it was
 * never going to be. Nothing is ever scaled up: a small capture stays small.
 */
export function fitFrame(
  w: number,
  h: number,
  profile: ExportProfile,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 2, h: 2 };
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const scale = Math.min(
    1,
    profile.maxLongEdge / long,
    profile.maxShortEdge / short,
  );
  return { w: even(w * scale), h: even(h * scale) };
}

/**
 * The bitrate to encode a frame of this size at.
 *
 * The ceiling is applied last and so wins outright — a share of a 4K capture
 * is held to the share's number even though the floor is higher than it.
 */
export function videoBitrate(
  w: number,
  h: number,
  fps: number,
  profile: ExportProfile,
): number {
  const wanted = Math.round(w * h * fps * profile.bitsPerPixel);
  return Math.min(
    profile.maxVideoBitrate,
    Math.max(profile.minVideoBitrate, wanted),
  );
}

/** Roughly what a clip will weigh, for saying so before anyone waits for it. */
export function estimateBytes(
  seconds: number,
  w: number,
  h: number,
  fps: number,
  profile: ExportProfile,
): number {
  if (seconds <= 0) return 0;
  const bits = (videoBitrate(w, h, fps, profile) + profile.audioBitrate) * seconds;
  return Math.round(bits / 8);
}

/** Why this clip can't be shared, or null if it can. */
export function shareRefusal(seconds: number): string | null {
  if (seconds <= 0) return "There's nothing to share.";
  if (seconds > SHARE_MAX_SECONDS) {
    const limit = Math.round(SHARE_MAX_SECONDS / 60);
    return `Links are for clips up to ${limit} minutes — cut it down, or download this one instead.`;
  }
  return null;
}
