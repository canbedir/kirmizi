// The share endpoint.
//
// One clip goes up, one link comes back, and a day later a cron takes it away
// again. There is nothing else here: no accounts, no sessions, no record of
// who watched what. A link is the only thing that identifies a clip.
//
// Every limit lives in policy.ts and is checked before a single byte is read,
// because Cloudflare bills past the free tier rather than stopping.

import {
  checkAddress,
  checkBudget,
  checkClip,
  dayKey,
  expiryFor,
  hasExpired,
  hourKey,
  newId,
  newToken,
  tokenMatches,
  type Refusal,
  type Usage,
} from "./policy";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  /** Verifies the Turnstile token. Set with `wrangler secret put`. */
  TURNSTILE_SECRET: string;
  /** Salts the address hashes, so the usage table can't become a visitor log. */
  ADDRESS_SALT: string;
  /** The site allowed to post here. */
  ALLOWED_ORIGIN: string;
}

const VIDEO_TYPE = "video/mp4";
/** How long a browser may hold a clip. Short enough that a deletion shows. */
const CACHE_SECONDS = 900;

/* ---------------------------------------------------------------- */
/* Plumbing                                                          */
/* ---------------------------------------------------------------- */

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-delete-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(env) },
  });
}

function refuse(refusal: Refusal, env: Env): Response {
  return json({ error: refusal.message }, env, refusal.status);
}

/**
 * The address, as a number to count against rather than an address.
 *
 * Salted and hashed so what's stored can't be turned back into who was here.
 * The salt is per deployment; rotating it just resets the counters.
 */
async function addressKey(
  request: Request,
  env: Env,
  window: string,
): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const data = new TextEncoder().encode(`${address}:${window}:${env.ADDRESS_SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)]
    .slice(0, 10)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ip:${hex}`;
}

async function readUsage(env: Env, bucket: string): Promise<Usage> {
  const row = await env.DB.prepare(
    "SELECT bytes, uploads FROM usage WHERE bucket = ?",
  )
    .bind(bucket)
    .first<{ bytes: number; uploads: number }>();
  return { bytes: row?.bytes ?? 0, uploads: row?.uploads ?? 0 };
}

async function addUsage(
  env: Env,
  bucket: string,
  bytes: number,
  staleAt: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage (bucket, bytes, uploads, stale_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET bytes = bytes + excluded.bytes,
                                       uploads = uploads + 1`,
  )
    .bind(bucket, bytes, staleAt)
    .run();
}

/** Cloudflare's own check that there's a person here. */
async function passesTurnstile(
  token: string | null,
  request: Request,
  env: Env,
): Promise<boolean> {
  // An unset secret means a local run, where there is no Turnstile to ask.
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  const result = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  ).catch(() => null);
  if (!result) return false;
  const outcome = (await result.json().catch(() => null)) as { success?: boolean } | null;
  return outcome?.success === true;
}

/* ---------------------------------------------------------------- */
/* Routes                                                            */
/* ---------------------------------------------------------------- */

async function share(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const seconds = Number(url.searchParams.get("seconds"));
  const width = Number(url.searchParams.get("w")) || 0;
  const height = Number(url.searchParams.get("h")) || 0;
  const bytes = Number(request.headers.get("content-length"));

  // Everything below happens before the body is touched. A clip that isn't
  // going to be accepted should cost nothing to refuse.
  const badClip = checkClip(bytes, seconds);
  if (badClip) return refuse(badClip, env);

  if (!(await passesTurnstile(url.searchParams.get("token"), request, env))) {
    return refuse(
      { status: 403, message: "Couldn't verify that you're a person. Reload and try again." },
      env,
    );
  }

  const now = Date.now();
  const day = dayKey(now);
  const dayBucket = `day:${day}`;
  const hourBucket = await addressKey(request, env, hourKey(now));
  const ipDayBucket = await addressKey(request, env, day);

  const [dayUsed, hourUsed, ipDayUsed] = await Promise.all([
    readUsage(env, dayBucket),
    readUsage(env, hourBucket),
    readUsage(env, ipDayBucket),
  ]);

  const overBudget = checkBudget(dayUsed, bytes);
  if (overBudget) return refuse(overBudget, env);
  const overAddress = checkAddress(hourUsed, ipDayUsed, bytes);
  if (overAddress) return refuse(overAddress, env);

  if (!request.body) return refuse({ status: 400, message: "No clip arrived." }, env);

  const id = newId();
  const key = `v/${id}.mp4`;
  const object = await env.BUCKET.put(key, request.body, {
    httpMetadata: { contentType: VIDEO_TYPE },
  });
  if (!object) {
    return refuse({ status: 500, message: "Couldn't store that clip." }, env);
  }

  // What actually landed, not what was claimed: content-length is a header and
  // headers are whatever the client felt like sending.
  const stored = object.size;
  const overSized = checkClip(stored, seconds);
  if (overSized) {
    await env.BUCKET.delete(key);
    return refuse(overSized, env);
  }

  const deleteToken = newToken();
  const expiresAt = expiryFor(now);
  await env.DB.prepare(
    `INSERT INTO shares (id, key, bytes, seconds, width, height, created_at, expires_at, delete_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, key, stored, seconds, width, height, now, expiresAt, deleteToken)
    .run();

  const tomorrow = now + 36 * 60 * 60 * 1000;
  await Promise.all([
    addUsage(env, dayBucket, stored, tomorrow),
    addUsage(env, hourBucket, stored, tomorrow),
    addUsage(env, ipDayBucket, stored, tomorrow),
  ]);

  return json({ id, deleteToken, expiresAt }, env, 201);
}

async function findLive(env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT id, key, bytes, seconds, width, height, created_at, expires_at FROM shares WHERE id = ?",
  )
    .bind(id)
    .first<{
      id: string;
      key: string;
      bytes: number;
      seconds: number;
      width: number;
      height: number;
      created_at: number;
      expires_at: number;
    }>();
  // Expiry is enforced on the way out as well as by the sweeper: a clip whose
  // hour has come is gone whether or not the cron has run yet.
  if (!row || hasExpired(row.expires_at, Date.now())) return null;
  return row;
}

async function serve(request: Request, env: Env, id: string): Promise<Response> {
  const row = await findLive(env, id);
  if (!row) return new Response("Gone", { status: 404, headers: cors(env) });

  const range = request.headers.get("range");
  const object = await env.BUCKET.get(row.key, range ? { range: request.headers } : undefined);
  if (!object) return new Response("Gone", { status: 404, headers: cors(env) });

  const headers = new Headers(cors(env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", `public, max-age=${CACHE_SECONDS}`);
  // A 206 answers a Range request and nothing else. R2 reports a range on the
  // object either way, so asking it instead of asking what was requested
  // returns partial content to someone who asked for the whole file — which
  // some players refuse outright.
  if (range && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? row.bytes - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${row.bytes}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

async function describe(env: Env, id: string): Promise<Response> {
  const row = await findLive(env, id);
  if (!row) return json({ error: "That link has expired." }, env, 404);
  return json(
    {
      id: row.id,
      bytes: row.bytes,
      seconds: row.seconds,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    env,
  );
}

async function remove(request: Request, env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT key, delete_token FROM shares WHERE id = ?",
  )
    .bind(id)
    .first<{ key: string; delete_token: string }>();
  // The same answer either way, so a missing link and a wrong token are not
  // distinguishable from outside.
  if (!row || !tokenMatches(request.headers.get("x-delete-token") ?? "", row.delete_token)) {
    return json({ error: "Nothing to delete." }, env, 404);
  }
  await env.BUCKET.delete(row.key);
  await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
  return json({ deleted: true }, env);
}

/** Everything whose day is up, and the counters that outlived their window. */
async function sweep(env: Env): Promise<number> {
  const now = Date.now();
  const expired = await env.DB.prepare(
    "SELECT id, key FROM shares WHERE expires_at <= ? LIMIT 500",
  )
    .bind(now)
    .all<{ id: string; key: string }>();
  const rows = expired.results ?? [];
  if (rows.length) {
    await env.BUCKET.delete(rows.map((r) => r.key));
    await env.DB.prepare(
      `DELETE FROM shares WHERE id IN (${rows.map(() => "?").join(",")})`,
    )
      .bind(...rows.map((r) => r.id))
      .run();
  }
  await env.DB.prepare("DELETE FROM usage WHERE stale_at <= ?").bind(now).run();
  return rows.length;
}

/* ---------------------------------------------------------------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const [, route, rest] = url.pathname.split("/");
    const id = (rest ?? "").replace(/\.mp4$/, "");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (request.method === "POST" && route === "share") return share(request, env);
    if (request.method === "GET" && route === "f" && id) return serve(request, env, id);
    if (request.method === "GET" && route === "i" && id) return describe(env, id);
    if (request.method === "DELETE" && route === "d" && id) return remove(request, env, id);
    if (request.method === "GET" && route === "sweep" && url.searchParams.has("run")) {
      // Only reachable locally: the deployed route is the cron below.
      return json({ swept: await sweep(env) }, env);
    }
    return new Response("Not found", { status: 404, headers: cors(env) });
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await sweep(env);
  },
};
