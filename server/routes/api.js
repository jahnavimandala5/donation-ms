/**
 * REST API routes. The frontend treats the client cache as the source of
 * truth and pushes whole collections to the server with PUT, so a small,
 * generic collection API keeps the two perfectly in sync.
 *
 *   GET    /api/bootstrap            -> { users, donations, ... } (full dump)
 *   GET    /api/health               -> liveness + db state
 *   GET    /api/c/:name              -> one collection
 *   PUT    /api/c/:name              -> replace a collection (body: array)
 *   POST   /api/c/:name              -> insert one record
 *   PATCH  /api/c/:name/:id          -> partial update
 *   DELETE /api/c/:name/:id          -> delete one record
 *
 * Every payload is shape-validated and depth/size limited before it
 * reaches Mongo, and the replace endpoint is made atomic so a concurrent
 * reader can never observe a half-written collection.
 */

const express = require("express");
const mongoose = require("mongoose");
const models = require("../models");
const auth = require("../auth");

const router = express.Router();

const COLLECTIONS = {
  users: models.User,
  donations: models.Donation,
  requests: models.Request,
  notifications: models.Notification,
  favorites: models.Favorite,
  feedback: models.Feedback,
  contacts: models.Contact,
  settings: models.Setting
};

/* Guard rails against a single oversized request. */
const MAX_BATCH = 2000;
const MAX_STRING = 20000;
const MAX_DEPTH = 8;
const MAX_KEYS = 200;
const MAX_ID_LEN = 128;

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Reading the user collection is how leaderboards and listing cards get
 * donor names, so the list stays public - but only ever as a projection.
 * Credentials and contact details are served by /api/auth/me to the owner.
 *
 * Administrators, however, need the full record: approval, verification and
 * contact follow-up all depend on status/verified/email/phone, none of which
 * appear in the public projection. Without them an admin dashboard can never
 * approve anyone, and a sync would silently strip those fields.
 */
const USER_PUBLIC_PROJECTION = {
  id: 1, name: 1, orgName: 1, type: 1, role: 1, verified: 1,
  points: 1, badges: 1, avatar: 1, joinedAt: 1, city: 1, _id: 0
};

/** Everything except the credential itself. */
const USER_ADMIN_PROJECTION = { _id: 0, __v: 0, password: 0 };

const ADMIN_ONLY = new Set(["users"]);

function isAdmin(req) {
  return !!req.user && req.user.role === "admin";
}

/** Users are read as a projection; which one depends on the caller's role. */
function userProjectionFor(req) {
  return isAdmin(req) ? USER_ADMIN_PROJECTION : USER_PUBLIC_PROJECTION;
}

/* Keys that must never be written through the generic endpoints. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/* Fields owned by the server. Silently dropped rather than rejected: the
   frontend legitimately holds a round-tripped copy of them. */
const INTERNAL_KEYS = new Set(["_id", "__v"]);

/* Hide Mongo internals from every read. */
const PUBLIC_FIELDS = { _id: 0, __v: 0 };

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * Recursively validate and sanitise an untrusted record.
 * Strips Mongo operator objects and over-long values, and rejects
 * prototype-pollution keys outright.
 */
function sanitize(value, depth, keyHint) {
  if (depth > MAX_DEPTH) throw new ApiError(400, "Record nested too deeply");
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string") {
    if (value.length > MAX_STRING) throw new ApiError(413, `Field "${keyHint}" exceeds ${MAX_STRING} characters`);
    return value;
  }
  if (t === "number") return Number.isFinite(value) ? value : null;
  if (t === "boolean") return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return undefined; // never accept binary blobs
  if (Array.isArray(value)) {
    if (value.length > 500) throw new ApiError(413, `Field "${keyHint}" has too many items`);
    return value.map((v) => sanitize(v, depth + 1, keyHint));
  }
  if (t === "object") {
    if (value._bsontype || value.$__ || value.toHexString) {
      // A round-tripped ObjectId from an older payload: drop it rather
      // than failing the whole batch.
      return undefined;
    }
    const out = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new ApiError(400, `Illegal field name "${key}"`);
      if (key.charAt(0) === "$") throw new ApiError(400, `Illegal field name "${key}"`);
      if (INTERNAL_KEYS.has(key)) continue;
      if (++count > MAX_KEYS) throw new ApiError(413, "Record has too many fields");
      const cleaned = sanitize(value[key], depth + 1, key);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return undefined; // functions, symbols, undefined
}

function normalizeId(raw) {
  const id = String(raw == null ? "" : raw);
  if (!ID_RE.test(id)) throw new ApiError(400, "Invalid record id");
  return id;
}

function makeId() {
  return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function normalizeRecord(rec) {
  if (!isPlainObject(rec)) throw new ApiError(400, "Each record must be an object");
  const r = sanitize(rec, 0, "record");
  if (!isPlainObject(r)) throw new ApiError(400, "Each record must be an object");
  if (r.id === undefined || r.id === null || r.id === "") {
    r.id = makeId();
  } else {
    r.id = normalizeId(r.id);
  }
  return r;
}

function getModel(name) {
  const M = Object.prototype.hasOwnProperty.call(COLLECTIONS, name) ? COLLECTIONS[name] : null;
  if (!M) throw new ApiError(404, "Unknown collection");
  return M;
}

/* Strip server internals from a freshly created document. */
function publicDoc(doc) {
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  delete o._id;
  delete o.__v;
  return o;
}

/**
 * Never accept a client-supplied password. A bulk sync from an older build
 * may still carry plaintext credentials; those must be dropped rather than
 * written back into the database.
 */
function stripPasswords(docs) {
  for (const d of docs) {
    if (Object.prototype.hasOwnProperty.call(d, "password")) delete d.password;
  }
  return docs;
}

/**
 * Fields a bulk user replace must not be able to drop.
 *
 * The public projection carries neither credentials nor contact details, so
 * a client syncing what it holds would otherwise erase them: accounts would
 * lose their password hash and their email, and become permanently
 * unloginable. Any of these absent from the payload are carried over from
 * the stored record; whatever the payload does supply wins, which is how an
 * admin still edits a phone number or approves an account.
 */
const PRESERVED_ON_USER_REPLACE = ["password", "email", "phone", "address", "pincode", "description"];

async function preservePrivateFields(M, docs) {
  const ids = docs.map((d) => d.id);
  if (!ids.length) return 0;
  // MongoDB only tolerates `_id` as an exclusion inside an inclusion
  // projection; `__v: 0` here would be rejected outright.
  const wanted = { id: 1, _id: 0 };
  for (const key of PRESERVED_ON_USER_REPLACE) wanted[key] = 1;
  const existing = await M.find({ id: { $in: ids } }, wanted, { lean: true });
  const byId = new Map(existing.map((u) => [u.id, u]));
  let restored = 0;
  for (const d of docs) {
    const live = byId.get(d.id);
    if (!live) continue; // genuinely new id: no stored credential to carry over
    for (const key of PRESERVED_ON_USER_REPLACE) {
      if (d[key] === undefined && live[key] !== undefined) {
        d[key] = live[key];
        restored++;
      }
    }
    // __v is irrelevant here and is never copied across.
    delete d.__v;
  }
  return restored;
}

function requireList(body) {
  if (!Array.isArray(body)) throw new ApiError(400, "Request body must be an array");
  if (body.length > MAX_BATCH) throw new ApiError(413, `Batch too large (max ${MAX_BATCH} records)`);
  return body;
}

/**
 * Replacing a collection with an empty array deletes every record in it.
 * That is a legitimate "clear this out" intent, but it is also exactly what a
 * bugged or half-initialised client sends, so it has to be asked for
 * deliberately rather than accepted by accident.
 */
function assertNotAccidentalWipe(name, body, req) {
  if (body.length) return;
  if (req.query.confirm === "wipe") return;
  throw new ApiError(
    400,
    `Refusing to empty the "${name}" collection. Re-send with ?confirm=wipe if that is intended.`
  );
}

/* ---------- routes ---------- */

router.get("/bootstrap", async (req, res, next) => {
  try {
    const out = {};
    // Independent reads so one slow collection cannot serialise the rest.
    await Promise.all(Object.keys(COLLECTIONS).map(async (name) => {
      if (name === "users") {
        out[name] = await COLLECTIONS[name].find({}, userProjectionFor(req)).lean();
        return;
      }
      if (ADMIN_READ.has(name)) {
        // Private submissions are omitted from a public bootstrap entirely,
        // rather than sent and filtered client-side.
        if (isAdmin(req)) out[name] = await COLLECTIONS[name].find({}, PUBLIC_FIELDS).lean();
        return;
      }
      out[name] = await COLLECTIONS[name].find({}, PUBLIC_FIELDS).lean();
    }));
    res.json(out);
  } catch (e) { next(e); }
});

router.get("/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const ready = mongoose.connection.readyState;
  res.status(ready === 1 ? 200 : 503).json({
    ok: ready === 1,
    db: states[ready] || "unknown",
    uptime: Math.round(process.uptime()),
    time: Date.now()
  });
});

/** The signed-in user's own full record, including contact details. */
router.get("/c/users/me", auth.requireAuth, async (req, res, next) => {
  try {
    const me = await models.User.findOne({ id: req.user.id }, null, { lean: true });
    if (!me) throw new ApiError(404, "Record not found");
    delete me._id;
    delete me.__v;
    delete me.password;
    res.json(me);
  } catch (e) { next(e); }
});

router.get("/c/:name", async (req, res, next) => {
  try {
    const M = getModel(req.params.name);
    assertCanRead(req.params.name, req);
    if (req.params.name === "users") {
      return res.json(await M.find({}, userProjectionFor(req)).lean());
    }
    res.json(await M.find({}, PUBLIC_FIELDS).lean());
  } catch (e) { next(e); }
});

/**
 * Bulk replace. Guarded by role rather than merely by sign-in: the frontend
 * syncs whole collections, so an authenticated donor pushing `users` could
 * otherwise rewrite every account, including promoting themselves.
 */
/* Wholesale collection replacement is an administrative tool.

   It was previously open to any signed-in user, which meant a donor could
   overwrite every donation, request and notification in the database, and
   could pass `?confirm=wipe` to clear them. Ordinary writes now go through
   the ownership-checked POST / PATCH / DELETE routes, so this stays
   admin-only. */
router.put("/c/:name", auth.requireAuth, auth.requireRole("admin"), async (req, res, next) => {
  try {
    const M = getModel(req.params.name);
    const docs = requireList(req.body).map(normalizeRecord);
    assertNotAccidentalWipe(req.params.name, req.body, req);

    // A non-admin must never be able to write a user record at all, even
    // indirectly, because that is how role and status escalation happens.
    if (M === models.User && !isAdmin(req)) {
      throw new ApiError(403, "Only an administrator can modify accounts");
    }
    stripPasswords(docs);
    if (M === models.User) await preservePrivateFields(M, docs);

    // De-duplicate ids: insertMany would otherwise fail the whole batch.
    const seen = new Set();
    const unique = [];
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      unique.push(d);
    }

    // Replace the collection as a unit so no reader ever observes the
    // collection empty between the delete and the insert.
    //
    // Multi-document transactions require a replica set. A standalone
    // mongod (the local dev default) rejects them with code 251, so fall
    // back to a plain replace there.
    const replacePlain = async () => {
      await M.deleteMany({});
      if (unique.length) await M.insertMany(unique, { ordered: false });
    };

    const session = await M.startSession();
    try {
      await session.withTransaction(async () => {
        await M.deleteMany({}, { session });
        if (unique.length) await M.insertMany(unique, { ordered: false, session });
      });
    } catch (e) {
      if (e && (e.code === 251 || /Transaction numbers are only allowed/i.test(e.message || ""))) {
        await replacePlain();
      } else {
        throw e;
      }
    } finally {
      await session.endSession();
    }
    res.json({ ok: true, count: unique.length });
  } catch (e) { next(e); }
});

/**
 * Fields a signed-in user may change on their own account. Everything
 * else - role, status, verified, points, badges, id, password - is
 * server-authoritative and reachable only by an admin.
 */
const SELF_EDITABLE = new Set([
  "name", "orgName", "type", "phone", "address", "pincode",
  "city", "state", "description", "avatar"
]);

/** Collections whose records belong to exactly one account. */
const OWNED_COLLECTIONS = {
  donations: "donorId",
  requests: "receiverId",
  favorites: "receiverId",
  notifications: "userId",
  feedback: "userId",
  contacts: null // open submissions, handled separately
};

/**
 * The contact form is the one public write in the app, so anyone may submit
 * a message - but those messages are private correspondence and only an
 * administrator may read them back.
 */
const PUBLIC_SUBMIT = new Set(["contacts"]);
const ADMIN_READ = new Set(["contacts"]);

/** Reads an anonymous visitor must never receive. */
function assertCanRead(name, req) {
  if (ADMIN_READ.has(name) && !isAdmin(req)) {
    throw new ApiError(403, "Only an administrator can view submissions");
  }
}

/** Who may file which kind of listing. Admins may do both. */
const CREATE_ROLES = {
  donations: ["donor"],
  requests: ["receiver"],
  contacts: []   // open to anyone, including anonymous visitors
};

function assertCanCreate(name, req) {
  const allowed = CREATE_ROLES[name];
  if (allowed === undefined) return;      // no specific rule
  if (allowed.length === 0) return;       // open submission
  if (!req.user) throw new ApiError(401, "Sign in to continue");
  if (allowed.indexOf(req.user.role) === -1) {
    throw new ApiError(403, `A ${allowed[0]} account is required to create a ${name.replace(/s$/, "")} listing`);
  }
}

function isReceiver(req) {
  return !!req.user && req.user.role === "receiver";
}

/**
 * What a receiver may change on a donation they have not donated.
 * Reserving and releasing is a claim on the listing, not an edit of the
 * donor's own data, so the donor's descriptive fields stay off-limits.
 */
const RECEIVER_DONATION_FIELDS = new Set([
  "status", "reservedBy", "reservedByName", "completedAt", "updatedAt"
]);

function assertReceiverDonationPatch(patch, req) {
  for (const key of Object.keys(patch)) {
    if (!RECEIVER_DONATION_FIELDS.has(key)) {
      throw new ApiError(403, `Only an administrator can change "${key}"`);
    }
  }
  // A receiver reserves in their own name; they cannot claim on behalf of
  // someone else or hand the reservation to a third account.
  if (Object.prototype.hasOwnProperty.call(patch, "reservedBy")) {
    patch.reservedBy = req.user.id;
    patch.reservedByName = req.user.orgName || req.user.name || "";
  }
}

function canModifyRecord(collection, record, req) {
  if (isAdmin(req)) return true;
  const ownerField = OWNED_COLLECTIONS[collection];
  if (ownerField === undefined) return true; // no ownership model
  if (ownerField === null) return false; // admin-only collection
  return !!record && String(record[ownerField]) === String(req.user.id);
}

router.post("/c/:name", (req, res, next) => {
  if (PUBLIC_SUBMIT.has(req.params.name)) return next();
  return auth.requireAuth(req, res, next);
}, async (req, res, next) => {
  try {
    const M = getModel(req.params.name);
    if (M === models.User) {
      // Account creation belongs to /api/auth/register, which hashes the
      // password. Allowing a raw insert here would store credentials as sent.
      throw new ApiError(403, "Accounts are created through registration");
    }
    const doc = normalizeRecord(req.body || {});
    assertCanCreate(req.params.name, req);

    // Stamp ownership from the token so a client cannot file a record under
    // someone else's account. The public contact form has no token, so its
    // submissions simply carry no owner.
    const ownerField = OWNED_COLLECTIONS[req.params.name];
    if (ownerField) doc[ownerField] = req.user.id;
    if (req.params.name === "donations" || req.params.name === "requests") {
      const nameField = req.params.name === "donations" ? "donorName" : "receiverName";
      if (!doc[nameField] && req.user) doc[nameField] = req.user.orgName || req.user.name;
    }
    if (doc.createdAt === undefined) doc.createdAt = Date.now();

    const created = await M.create(doc);
    res.status(201).json(publicDoc(created));
  } catch (e) { next(e); }
});

router.patch("/c/:name/:id", auth.requireAuth, async (req, res, next) => {
  try {
    const M = getModel(req.params.name);
    const id = normalizeId(req.params.id);
    const patch = sanitize(req.body, 0, "patch");
    if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
      throw new ApiError(400, "Patch body must be a non-empty object");
    }
    delete patch.id; // the path id is authoritative

    if (M === models.User) {
      // Changing another account is an admin action.
      if (!isAdmin(req) && id !== req.user.id) {
        throw new ApiError(403, "You can only update your own profile");
      }
      if (!isAdmin(req)) {
        for (const key of Object.keys(patch)) {
          if (!SELF_EDITABLE.has(key)) {
            throw new ApiError(403, `"${key}" can only be changed by an administrator`);
          }
        }
      }
    } else {
      const existing = await M.findOne({ id }, null, { lean: true });
      if (!existing) throw new ApiError(404, "Record not found");
      if (!canModifyRecord(req.params.name, existing, req)) {
        // A receiver acting on a donation is the normal case: reserving
        // food is the whole point of the platform. It is a narrow,
        // field-limited permission rather than blanket write access.
        if (req.params.name === "donations" && isReceiver(req)) {
          assertReceiverDonationPatch(patch, req);
        } else {
          throw new ApiError(403, "You can only change your own records");
        }
      }
      // Ownership cannot be reassigned by the owner.
      const ownerField = OWNED_COLLECTIONS[req.params.name];
      if (ownerField) delete patch[ownerField];
    }

    const updated = await M.findOneAndUpdate(
      { id },
      { $set: patch },
      { new: true, runValidators: true, projection: PUBLIC_FIELDS }
    ).lean();
    if (!updated) throw new ApiError(404, "Record not found");
    if (M === models.User) delete updated.password;
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete("/c/:name/:id", auth.requireAuth, async (req, res, next) => {
  try {
    const M = getModel(req.params.name);
    if (M === models.User && !isAdmin(req)) {
      throw new ApiError(403, "Only an administrator can delete accounts");
    }
    const id = normalizeId(req.params.id);
    if (M === models.User && id === req.user.id) {
      throw new ApiError(400, "You cannot delete the account you are signed in with");
    }
    if (M !== models.User) {
      const existing = await M.findOne({ id }, null, { lean: true });
      if (!existing) throw new ApiError(404, "Record not found");
      if (!canModifyRecord(req.params.name, existing, req)) {
        throw new ApiError(403, "You can only remove your own records");
      }
    }
    const result = await M.deleteOne({ id });
    if (result.deletedCount === 0) throw new ApiError(404, "Record not found");
    res.json({ ok: true, deleted: 1 });
  } catch (e) { next(e); }
});

// 404 for any unknown /api path.
router.use((req, res) => {
  res.status(404).json({ error: "Unknown API endpoint" });
});

// Central error handler: never leak a stack trace to the client.
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err && (err.status || err.statusCode);
  if (status && err.expose) {
    return res.status(status).json({ error: err.message });
  }
  if (err && err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.name === "CastError") {
    return res.status(400).json({ error: "Malformed identifier" });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ error: "Duplicate record id" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large" });
  }
  console.error("[api]", err && err.stack ? err.stack : err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = router;
