/**
 * One-off migration: convert any plaintext `password` field into a bcrypt
 * hash. Safe to re-run - already-hashed values are left alone.
 *
 *   node scripts/migrate-passwords.js
 *
 * Run this against any database created before the auth layer existed.
 */

require("dotenv").config();
const { connect } = require("../db");
const models = require("../models");
const auth = require("../auth");

async function main() {
  await connect();
  const users = await models.User.find({}, "id email password", { lean: true });

  let migrated = 0;
  let alreadyHashed = 0;
  let unusable = 0;

  for (const u of users) {
    if (auth.isHashed(u.password)) { alreadyHashed++; continue; }
    if (typeof u.password !== "string" || !u.password) {
      // No credential on file: lock the account rather than leaving a
      // passwordless record that anyone could claim.
      await models.User.updateOne({ id: u.id }, { $set: { password: auth.hashPassword(require("crypto").randomBytes(32).toString("hex")) } });
      unusable++;
      continue;
    }
    await models.User.updateOne({ id: u.id }, { $set: { password: auth.hashPassword(u.password) } });
    migrated++;
  }

  console.log(`[migrate] hashed: ${migrated}, already hashed: ${alreadyHashed}, unusable (random): ${unusable}`);
  console.log("[migrate] done. Plaintext passwords are gone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err && err.message);
  process.exit(1);
});
