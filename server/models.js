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
function makeModel(name) {
  const schema = new mongoose.Schema(
    { id: { type: String, required: true, unique: true } },
    { versionKey: false, strict: false }
  );
  return mongoose.model(name, schema);
}

module.exports = {
  User: makeModel("User"),
  Donation: makeModel("Donation"),
  Request: makeModel("Request"),
  Notification: makeModel("Notification"),
  Favorite: makeModel("Favorite"),
  Feedback: makeModel("Feedback"),
  Contact: makeModel("Contact"),
  Setting: makeModel("Setting")
};
