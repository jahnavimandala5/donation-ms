/**
 * Mongoose models for every FoodLink collection.
 *
 * Documents store a client-generated string `id` (e.g. "u_d1", "d_3") as the
 * primary key so records map 1:1 to the frontend. Schemas are kept open
 * (strict: false) so extra fields coming from the client are preserved.
 */

const mongoose = require("mongoose");

function makeModel(name) {
  const schema = new mongoose.Schema(
    { id: { type: String, required: true, unique: true } },
    { _id: false, versionKey: false, strict: false }
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
