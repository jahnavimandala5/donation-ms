/**
 * Restore credentials that a pre-fix admin bulk sync stripped from the user
 * collection. Seeded demo accounts get their documented passwords back;
 * anything unrecognised is given a random, unknowable credential so the
 * account is locked rather than left with a guessable or empty password.
 *
 *   node scripts/restore-credentials.js
 */

require("dotenv").config();
const crypto = require("crypto");
const { connect } = require("../db");
const models = require("../models");
const auth = require("../auth");

const SEED_PASSWORDS = {
  "admin@foodlink.app": "admin123",
  "rahul@foodlink.app": "donor123",
  "priya@foodlink.app": "donor123",
  "amit@foodlink.app": "donor123",
  "sunita@foodlink.app": "donor123",
  "karan@foodlink.app": "donor123",
  "neha@foodlink.app": "receiver123",
  "joseph@foodlink.app": "receiver123",
  "meera@foodlink.app": "receiver123",
  "asha@foodlink.app": "receiver123"
};

async function main() {
  await connect();
  const users = await models.User.find({}, "id email password", { lean: true });

  let restored = 0;
  let locked = 0;
  const untouched = [];

  for (const u of users) {
    if (auth.isHashed(u.password)) { untouched.push(u.id); continue; }
    const known = SEED_PASSWORDS[String(u.email || "").toLowerCase()];
    const secret = known || crypto.randomBytes(32).toString("hex");
    await models.User.updateOne({ id: u.id }, { $set: { password: auth.hashPassword(secret) } });
    if (known) {
      restored++;
      console.log(`[restore] ${u.email}: demo password reinstated`);
    } else {
      locked++;
      console.log(`[restore] ${u.email || u.id}: no known password - locked with a random one`);
    }
  }

  console.log(`[restore] reinstated=${restored} locked=${locked} already-ok=${untouched.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[restore] failed:", err && err.message);
  process.exit(1);
});
