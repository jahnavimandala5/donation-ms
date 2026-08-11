/**
 * REST API routes. The frontend treats the client cache as the source of
 * truth and pushes whole collections to the server with PUT, so a small,
 * generic collection API keeps the two perfectly in sync.
 *
 *   GET    /api/bootstrap            -> { users, donations, ... } (full dump)
 *   GET    /api/c/:name              -> one collection
 *   PUT    /api/c/:name              -> replace a collection (body: array)
 *   POST   /api/c/:name              -> insert one record
 *   PATCH  /api/c/:name/:id          -> partial update
 *   DELETE /api/c/:name/:id          -> delete one record
 */

const express = require("express");
const router = express.Router();
const models = require("../models");

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

function asList(docs) {
  return docs.map((d) => (typeof d.toObject === "function" ? d.toObject() : d));
}

function normalizeRecord(rec) {
  const r = Object.assign({}, rec);
  if (!r.id) {
    r.id = "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  return r;
}

router.get("/bootstrap", async (req, res, next) => {
  try {
    const out = {};
    for (const name of Object.keys(COLLECTIONS)) {
      out[name] = asList(await COLLECTIONS[name].find().lean());
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.get("/health", (req, res) => res.json({ ok: true, time: Date.now() }));

router.get("/c/:name", async (req, res, next) => {
  try {
    const M = COLLECTIONS[req.params.name];
    if (!M) return res.status(404).json({ error: "Unknown collection" });
    res.json(asList(await M.find().lean()));
  } catch (e) { next(e); }
});

router.put("/c/:name", async (req, res, next) => {
  try {
    const M = COLLECTIONS[req.params.name];
    if (!M) return res.status(404).json({ error: "Unknown collection" });
    const list = Array.isArray(req.body) ? req.body.map(normalizeRecord) : [];
    await M.deleteMany({});
    if (list.length) await M.insertMany(list, { ordered: false });
    res.json({ ok: true, count: list.length });
  } catch (e) { next(e); }
});

router.post("/c/:name", async (req, res, next) => {
  try {
    const M = COLLECTIONS[req.params.name];
    if (!M) return res.status(404).json({ error: "Unknown collection" });
    const doc = await M.create(normalizeRecord(req.body || {}));
    res.status(201).json(doc.toObject());
  } catch (e) { next(e); }
});

router.patch("/c/:name/:id", async (req, res, next) => {
  try {
    const M = COLLECTIONS[req.params.name];
    if (!M) return res.status(404).json({ error: "Unknown collection" });
    const updated = await M.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated.toObject());
  } catch (e) { next(e); }
});

router.delete("/c/:name/:id", async (req, res, next) => {
  try {
    const M = COLLECTIONS[req.params.name];
    if (!M) return res.status(404).json({ error: "Unknown collection" });
    await M.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
