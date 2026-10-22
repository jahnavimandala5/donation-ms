/**
 * Mongoose models for every FoodLink collection.
 *
 * Documents store a client-generated string `id` (e.g. "u_d1", "d_3") as the
 * primary key so records map 1:1 to the frontend. Schemas are kept open
 * (strict: false) so extra fields coming from the client are preserved.
 */

const mongoose = require("mongoose");

/**
 * The client-facing primary key is the string `id`. Mongo's `_id` is an
 * internal implementation detail: it must never reach the browser, because
 * a client that could write `_id` could aim a record at another document's
 * slot. Models keep the default ObjectId so `create()`/`save()` work, and
 * the API layer projects it away on every read and drops it on every write.
 */
function makeModel(name, configure) {
  const schema = new mongoose.Schema(
    { id: { type: String, required: true, unique: true } },
    { versionKey: false, strict: false }
  );
  if (configure) configure(schema);
  return mongoose.model(name, schema);
}

module.exports = {
  // Email is the login key, so it must be unique. The partial filter skips
  // records with no usable email (legacy imports), which would otherwise
  // collide on null. Without this, two documents could share an email and
  // login's findOne() would verify against whichever one Mongo returned
  // first - a correct password could still produce a 401.
  User: makeModel("User", (schema) => {
    schema.index(
      { email: 1 },
      {
        unique: true,
        name: "uniq_user_email",
        partialFilterExpression: { email: { $type: "string", $gt: "" } }
      }
    );
    schema.index({ role: 1, status: 1 }, { name: "user_role_status" });
  }),
  Donation: makeModel("Donation"),
  Request: makeModel("Request"),
  Notification: makeModel("Notification"),
  Favorite: makeModel("Favorite"),
  Feedback: makeModel("Feedback"),
  Contact: makeModel("Contact"),
  Setting: makeModel("Setting")
};
