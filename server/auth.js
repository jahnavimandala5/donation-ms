/**
 * Authentication primitives: password hashing, stateless session tokens and
 * the Express guards that protect the data routes.
 *
 * Passwords are stored as bcrypt hashes. Tokens are compact HMAC-SHA256
 * signed payloads (JWT-shaped, but built on node:crypto so the deployment
 * carries no extra signing dependency).
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const MAX_PASSWORD_LEN = 200;

/* A stable secret is required in production: regenerating one per boot
   would silently log every user out on each deploy, and a secret derived
   from something guessable would let anyone mint a valid token. */
const IS_PROD = process.env.NODE_ENV === "production";
const DEV_SECRET = crypto.randomBytes(32).toString("hex");
const SECRET = process.env.AUTH_SECRET || DEV_SECRET;

if (IS_PROD && !process.env.AUTH_SECRET) {
  // This used to only log a warning while continuing to serve traffic, which
  // meant a production deploy could quietly run with an unconfigured secret.
  // Fail fast instead: an operator can set the variable and start again.
  console.error("[auth] AUTH_SECRET is required when NODE_ENV=production. Refusing to start.");
  process.exit(1);
}
if (!process.env.AUTH_SECRET) {
  console.warn("[auth] AUTH_SECRET is not set - generated an ephemeral one. Sessions reset on restart.");
}

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[\./A-Za-z0-9]{53}$/;

function isHashed(value) {
  return typeof value === "string" && BCRYPT_RE.test(value);
}

/** Hash a plaintext password. Rejects input bcrypt cannot represent. */
function hashPassword(plain) {
  const s = String(plain == null ? "" : plain);
  if (!s) throw Object.assign(new Error("Password is required"), { status: 400, expose: true });
  // bcrypt silently truncates beyond 72 bytes, so reject rather than let
  // a long passphrase match a shorter prefix.
  if (Buffer.byteLength(s, "utf8") > 72) {
    throw Object.assign(new Error("Password must be 72 bytes or fewer"), { status: 400, expose: true });
  }
  return bcrypt.hashSync(s, BCRYPT_ROUNDS);
}

/**
 * Verify a password against what is on file.
 *
 * Legacy records from before hashing hold plaintext. Those are accepted once
 * and flagged so the caller can transparently upgrade them to a hash on the
 * next successful sign-in.
 */
function verifyPassword(plain, stored) {
  if (typeof stored !== "string" || !stored) return { ok: false, needsRehash: false };
  if (isHashed(stored)) {
    let ok = false;
    try { ok = bcrypt.compareSync(String(plain == null ? "" : plain), stored); } catch (e) { ok = false; }
    // A hash produced with different cost settings should be upgraded too.
    return { ok, needsRehash: ok && !costMatches(stored) };
  }
  const a = Buffer.from(String(plain == null ? "" : plain), "utf8");
  const b = Buffer.from(stored, "utf8");
  let ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}

function costMatches(hash) {
  const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return !!m && Number(m[1]) === BCRYPT_ROUNDS;
}

/* ---------------- tokens ---------------- */

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signToken(payload, ttlMs) {
  const body = Object.assign({}, payload, {
    iat: Date.now(),
    exp: Date.now() + (ttlMs || TOKEN_TTL_MS)
  });
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  return data + "." + sig;
}

function verifyToken(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest();
  let given;
  try { given = b64urlDecode(sig); } catch (e) { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let body;
  try { body = JSON.parse(b64urlDecode(data).toString("utf8")); } catch (e) { return null; }
  if (!body || typeof body !== "object") return null;
  if (typeof body.exp !== "number" || Date.now() > body.exp) return null;
  if (typeof body.sub !== "string") return null;
  return body;
}

function readToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  return null;
}

/* ---------------- guards ---------------- */

/**
 * Attach req.user when a valid token is present. Never rejects - use
 * requireAuth for that. Roles are re-read from the database on every
 * request so a demoted admin loses access immediately.
 */
function attachUser(models) {
  return async function (req, res, next) {
    req.user = null;
    const token = readToken(req);
    if (!token) return next();
    const claims = verifyToken(token);
    if (!claims) return next();
    try {
      const user = await models.User.findOne({ id: claims.sub }, "id role status verified", { lean: true });
      if (user && user.status !== "disabled") req.user = user;
    } catch (e) {
      return next(e);
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Sign in to continue" });
  }
  next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Sign in to continue" });
    if (req.user.role !== role) {
      // 403, not 404: the caller is authenticated, just not permitted.
      return res.status(403).json({ error: "You do not have access to this resource" });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHashed,
  signToken,
  verifyToken,
  readToken,
  attachUser,
  requireAuth,
  requireRole,
  BCRYPT_ROUNDS,
  TOKEN_TTL_MS
};
