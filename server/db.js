const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/foodlink";

let cached = null;

async function connect() {
  if (cached && cached.readyState === 1) return cached;
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 6000 });
  console.log("[db] Connected to MongoDB ->", mongoose.connection.name);
  cached = mongoose.connection;
  return cached;
}

module.exports = { connect, MONGODB_URI, mongoose };
