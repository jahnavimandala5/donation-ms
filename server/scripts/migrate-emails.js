/*
 * Normalise user emails and enforce the unique login key.
 *
 * Safe to run repeatedly. It only rewrites the casing/whitespace of existing
 * email strings; it never deletes records and never touches password hashes.
 * If two accounts would normalise to the same address it aborts before
 * writing anything, so the operator can resolve the conflict manually.
 */
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection("users");

  const users = await col.find({}, { projection: { id: 1, email: 1 } }).toArray();
  console.log("[migrate-emails] scanned", users.length, "accounts");

  const seen = new Map();
  const conflicts = [];
  for (const u of users) {
    if (typeof u.email !== "string" || !u.email.trim()) continue;
    const normal = u.email.trim().toLowerCase();
    if (seen.has(normal)) {
      conflicts.push({ email: normal, ids: [seen.get(normal), u.id] });
    } else {
      seen.set(normal, u.id);
    }
  }

  if (conflicts.length) {
    console.error("[migrate-emails] ABORT: duplicate emails after normalisation");
    for (const c of conflicts) console.error("  ", c.email, "->", c.ids.join(", "));
    await mongoose.disconnect();
    process.exit(1);
  }

  let changed = 0;
  for (const u of users) {
    if (typeof u.email !== "string") continue;
    const normal = u.email.trim().toLowerCase();
    if (normal && normal !== u.email) {
      await col.updateOne({ id: u.id }, { $set: { email: normal } });
      changed += 1;
    }
  }
  console.log("[migrate-emails] normalised", changed, "email(s)");

  const models = require("../models");
  await models.User.syncIndexes();
  const indexes = await col.indexes();
  const hasUnique = indexes.some((i) => i.name === "uniq_user_email" && i.unique);
  console.log("[migrate-emails] unique email index present:", hasUnique);

  await mongoose.disconnect();
  if (!hasUnique) process.exit(1);
})().catch((e) => { console.error("[migrate-emails] ERR", e.message); process.exit(1); });
