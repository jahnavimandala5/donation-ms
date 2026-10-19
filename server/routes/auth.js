/**
 * Authentication endpoints.
 *
 *   POST /api/auth/register  -> create an account, returns a token
 *   POST /api/auth/login     -> verify credentials, returns a token
 *   POST /api/auth/password  -> the owner changes their own password
 *   POST /api/auth/admin/reset-password -> an admin sets any account's password
 *   GET  /api/auth/me        -> the signed-in user's own record
 *
 * The password never leaves this module: every response body is built from
 * PUBLIC_USER, and the stored value is a bcrypt hash.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const models = require("../models");
const auth = require("../auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/* Credential stuffing guard, per IP. In-process: a single dyno is enough for
   a project of this size, and it fails open rather than erroring. */
const attempts = new Map();

function throttle(key) {
  const now = Date.now();
  for (const [k, e] of attempts) if (e.reset <= now) attempts.delete(k);
  let e = attempts.get(key);
  if (!e) { e = { count: 0, reset: now + WINDOW_MS }; attempts.set(key, e); }
  e.count++;
  return e;
}

/* A successful sign-in must clear the failure tally. Without this the counter
   only ever grew, so ten legitimate sign-ins from one address - a shared
   office NAT, a classroom, the demo buttons - locked the next real user out
   with a 429, which is a denial of service rather than a protection. */
function clearThrottle(key) {
  attempts.delete(key);
}

function clientKey(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
}

function fail(res, message) {
  // One message for both branches so the response cannot be used to
  // enumerate which email addresses have accounts.
  res.status(401).json({ error: message });
}

/** Fields any visitor may see (leaderboards, listing cards, reviews). */
const USER_PUBLIC_PROJECTION = "id name orgName type role verified points badges avatar joinedAt city _id: 0";

/** Fields only the account owner or an admin may see. */
const PRIVATE_USER = "id name orgName type role verified points badges avatar joinedAt city email phone address pincode status description";

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    orgName: user.orgName,
    type: user.type,
    role: user.role,
    verified: !!user.verified,
    status: user.status,
    points: Number(user.points) || 0,
    badges: Array.isArray(user.badges) ? user.badges : [],
    avatar: user.avatar || null,
    joinedAt: user.joinedAt || null,
    city: user.city || ""
  };
}

function cleanStr(v, max) {
  return String(v == null ? "" : v).replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);
}

function newId() {
  return "u_" + Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
}

router.post("/register", async (req, res, next) => {
  try {
    const gate = throttle("reg:" + clientKey(req));
    if (gate.count > 5) {
      return res.status(429).json({ error: "Too many sign-up attempts. Try again later." });
    }

    const body = req.body || {};
    const email = cleanStr(body.email, 160).toLowerCase();
    const password = String(body.password == null ? "" : body.password);
    const role = body.role === "receiver" ? "receiver" : "donor"; // admin is never self-service
    const name = cleanStr(body.name, 80);
    const orgName = cleanStr(body.orgName, 120);
    const type = cleanStr(body.type, 40) || (role === "donor" ? "Restaurant" : "NGO");

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Password must be 72 bytes or fewer" });
    }
    if (!name && !orgName) {
      return res.status(400).json({ error: "Enter a name or an organization" });
    }

    const existing = await models.User.findOne({ email }, "id", { lean: true });
    if (existing) {
      return res.status(409).json({ error: "That email is already registered" });
    }

    const doc = {
      id: newId(),
      role: role,
      name: name || orgName,
      email: email,
      password: auth.hashPassword(password),
      orgName: orgName || name,
      type: type,
      city: cleanStr(body.city, 80),
      state: cleanStr(body.state, 80),
      address: cleanStr(body.address, 200),
      pincode: cleanStr(body.pincode, 12),
      description: cleanStr(body.description, 500),
      status: "pending",
      verified: false,
      points: 0,
      badges: [],
      joinedAt: Date.now(),
      avatar: null
    };

    const created = await models.User.create(doc);
    const token = auth.signToken({ sub: created.id, role: created.role });
    res.status(201).json({ token: token, user: publicUser(created) });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "That email is already registered" });
    }
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const key = "login:" + clientKey(req);
    const gate = throttle(key);
    if (gate.count > MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many failed attempts. Try again in a few minutes." });
    }

    const body = req.body || {};
    const email = cleanStr(body.email, 160).toLowerCase();
    const password = String(body.password == null ? "" : body.password);

    if (!email || !password) return fail(res, "Incorrect email or password.");

    const user = await models.User.findOne({ email }, null, { lean: true });
    // Hash against a dummy value when the account is unknown so the
    // response time does not reveal whether the email exists.
    const stored = user ? user.password : "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
    const result = auth.verifyPassword(password, stored);

    if (!user || !result.ok) {
      fail(res, "Incorrect email or password.");
      return;
    }
    if (user.status === "disabled") {
      return res.status(403).json({ error: "This account has been disabled" });
    }

    // Transparently upgrade a legacy plaintext credential now that we hold it.
    if (result.needsRehash) {
      try {
        await models.User.updateOne({ id: user.id }, { $set: { password: auth.hashPassword(password) } });
      } catch (e) {
        console.warn("[auth] could not upgrade password hash for", user.id);
      }
    }

    const token = auth.signToken({ sub: user.id, role: user.role });
    clearThrottle(key);
    res.json({ token: token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.get("/me", auth.requireAuth, async (req, res, next) => {
  try {
    const user = await models.User.findOne({ id: req.user.id }, PRIVATE_USER, { lean: true });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

/** Minimal liveness probe for the client's sign-in state. */
router.get("/session", auth.requireAuth, (req, res) => {
  res.json({ ok: true, id: req.user.id, role: req.user.role });
});

/* The owner changing their own password. The current password is required so
   a stolen token alone cannot be used to lock the real owner out. */
router.post("/password", auth.requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const current = String(body.currentPassword == null ? "" : body.currentPassword);
    const password = String(body.password == null ? "" : body.password);

    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Password must be 72 bytes or fewer" });

    const user = await models.User.findOne({ id: req.user.id }, "id password", { lean: true });
    if (!user) return res.status(404).json({ error: "Account not found" });

    const result = auth.verifyPassword(current, user.password);
    if (!result.ok) return res.status(403).json({ error: "Current password is incorrect" });

    await models.User.updateOne({ id: user.id }, { $set: { password: auth.hashPassword(password) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Administrative reset, for accounts that have no hash a login can match -
   records created before passwords were hashed, or damaged ones. There is no
   self-service email reset, so without this an admin has no way to restore
   access, and the account is stranded for good. */
router.post("/admin/reset-password", auth.requireAuth, auth.requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = cleanStr(body.email, 160).toLowerCase();
    const id = cleanStr(body.id, 80);
    const password = String(body.password == null ? "" : body.password);

    if (!email && !id) return res.status(400).json({ error: "Provide the account email or id" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Password must be 72 bytes or fewer" });

    const user = await models.User.findOne(id ? { id } : { email }, "id email role", { lean: true });
    if (!user) return res.status(404).json({ error: "Account not found" });

    await models.User.updateOne({ id: user.id }, { $set: { password: auth.hashPassword(password) } });
    res.json({ ok: true, id: user.id, email: user.email });
  } catch (e) { next(e); }
});

module.exports = { router: router, publicUser: publicUser, USER_PUBLIC_PROJECTION: USER_PUBLIC_PROJECTION, PRIVATE_USER: PRIVATE_USER };
