/**
 * Non-destructive repair of the user collection.
 *
 * An earlier admin bulk sync replaced `users` with the public projection,
 * which strips email/phone/password. That data is fully reproducible for the
 * demo accounts, so this reapplies the canonical seed records by id.
 *
 * Accounts the seeder does not know about are left completely untouched:
 * they are never deleted and never given an invented password.
 *
 *   node scripts/repair-users.js
 */

require("dotenv").config();
const { connect } = require("../db");
const models = require("../models");
const auth = require("../auth");
const seed = require("../seed");

async function main() {
  await connect();
  const seedUsers = seed.buildData().users;
  const known = new Set(seedUsers.map((u) => u.id));

  let repaired = 0;
  for (const u of seedUsers) {
    await models.User.updateOne({ id: u.id }, { $set: u }, { upsert: false });
    repaired++;
    console.log(`[repair] ${u.id}  ${u.email}  (password re-hashed)`);
  }

  // Anything outside the seed set keeps whatever it has now. Report it so
  // the operator knows those accounts need a password reset.
  const all = await models.User.find({}, "id email role", { lean: true });
  const strangers = all.filter((u) => !known.has(u.id));
  for (const s of strangers) {
    const hasHash = auth.isHashed(
      (await models.User.findOne({ id: s.id }, "password", { lean: true })).password
    );
    console.log(
      `[repair] ${s.id} (${s.role}) left as-is - ${hasHash ? "password intact" : "NO USABLE PASSWORD, needs a reset"}`
    );
  }

  console.log(`[repair] demo accounts repaired: ${repaired}; other accounts untouched: ${strangers.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[repair] failed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
