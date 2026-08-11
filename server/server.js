/**
 * FoodLink server - Express + MongoDB.
 *
 * Serves the static frontend from the project root and exposes the REST API
 * under /api. Connect to MongoDB, seed demo data on first run, then listen.
 */

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { connect } = require("./db");
const seedIfEmpty = require("./seed");
const api = require("./routes/api");

const PORT = process.env.PORT || 4000;
const ROOT = path.resolve(__dirname, "..");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", api);

app.use(express.static(ROOT));

app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));

// API error handler
app.use("/api", (err, req, res, next) => {
  console.error("[api] error:", err.message);
  res.status(500).json({ error: err.message });
});

async function start() {
  try {
    await connect();
    await seedIfEmpty();
    app.listen(PORT, () => {
      console.log(`FoodLink server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start FoodLink server:", err.message);
    process.exit(1);
  }
}

start();
