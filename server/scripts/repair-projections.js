/**
 * Non-destructive repair of records that a bulk replace stripped.
 *
 * A public projection contains no email/phone, so a `PUT /c/users` sync
 * removes those fields. This reapplies the canonical seed records for any
 * seed-owned id that is missing them, and restores seed donations that are
 * absent. Records the seeder does not own are never touched or deleted.
 *
 *   node scripts/repair-projections.js
 */

require("dotenv").config();
const { connect } = require("../db");
const models = require("../models");
const seed = require("../seed");

/** Fields a public projection drops from a user record. */
const RESTORE_FOR_USER = [
  "email", "phone", "orgName", "type", "city", "state",
  "address", "pincode", "description", "status", "verified", "password"
];

async function main() {
  await connect();
  const data = seed.buildData();

  let restoredUsers = 0;
  for (const u of data.users) {
    const live = await models.User.findOne({ id: u.id }, null, { lean: true });
    if (!live) {
      console.log(`[repair] seed user ${u.id} is absent - left absent (a prior wipe may have been intentional)`);
      continue;
    }
    const missing = RESTORE_FOR_USER.filter((k) => live[k] === undefined || live[k] === null);
    // Only the projection-stripped fields are refilled; anything the
    // operator changed by hand (points, badges, name) is left alone.
    const set = {};
    for (const k of missing) set[k] = u[k];
    if (Object.keys(set).length) {
      await models.User.updateOne({ id: u.id }, { $set: set });
      restoredUsers++;
      console.log(`[repair] ${u.id} (${u.email}) restored: ${missing.join(", ")}`);
    }
  }

  let restoredDonations = 0;
  for (const d of data.donations) {
    const live = await models.Donation.findOne({ id: d.id }, "id", { lean: true });
    if (!live) {
      await models.Donation.create(d);
      restoredDonations++;
      console.log(`[repair] donation ${d.id} (${d.foodName}) re-inserted`);
    }
  }

  console.log(`[repair] users patched: ${restoredUsers}; donations re-inserted: ${restoredDonations}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[repair] failed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
