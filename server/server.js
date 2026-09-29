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

const { connect, mongoose } = require("./db");
const seedIfEmpty = require("./seed");
const models = require("./models");
const auth = require("./auth");
const api = require("./routes/api");
const authRoutes = require("./routes/auth").router;

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const IS_PROD = process.env.NODE_ENV === "production";

const app = app_init();

/* ------------------------------------------------------------------ *
 * Middleware written in-house so the deployment keeps working without
 * pulling extra packages. (helmet / express-rate-limit would be the
 * drop-in equivalents if the dependency budget ever changes.)
 * ------------------------------------------------------------------ */

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0"); // modern CSP supersedes the legacy auditor
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.removeHeader("X-Powered-By");

  if (IS_PROD) {
    // The app ships no inline event handlers, but it does use inline
    // <style> blocks, so 'unsafe-inline' is required for style-src.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://donation-ms-58do.onrender.com",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'"
      ].join("; ")
    );
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}

/**
 * Fixed-window limiter, keyed per client IP. In-process only: adequate for
 * a single dyno, and it fails open rather than 500s under memory pressure.
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs);
  // Never keep the event loop alive just for the sweeper.
  if (typeof sweep.unref === "function") sweep.unref();

  return function (req, res, next) {
    // Rate limiting a static asset storm is pointless and only punishes
    // legitimate page loads.
    if (req.method === "GET" && !req.path.startsWith("/api")) return next();

    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(entry.reset / 1000));
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/* Requests that never complete would otherwise hang a socket forever. */
function requestTimeout(ms) {
  return function (req, res, next) {
    if (!req.readable) return next();
    const timer = setTimeout(() => {
      res.status(408).json({ error: "Request timed out" });
    }, ms);
    timer.unref();
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}

function app_init() {
  const a = express();

  // Render terminates TLS in front of the app; without this every
  // req.ip collapses to the proxy's address and the rate limiter
  // throttles every visitor as one client.
  if (IS_PROD) a.set("trust proxy", 1);
  a.disable("x-powered-by");

  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  a.use(
    cors({
      // With CORS_ORIGINS set, an allowlist is enforced. Otherwise the API
      // stays open because the hosted deployment is consumed directly by
      // browsers from arbitrary origins.
      origin: allowedOrigins.length
        ? (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin))
        : true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600
    })
  );

  a.use(securityHeaders);
  a.use(requestTimeout(20000));
  a.use(rateLimit({ windowMs: 60000, max: 300, message: "Too many requests, slow down" }));
  // Writes are the expensive and abuse-prone path, so they get a tighter
  // budget than plain reads.
  a.use("/api", rateLimit({ windowMs: 60000, max: 90, message: "Too many write requests, slow down" }));

  a.use(express.json({ limit: "5mb" }));
  a.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // Populate req.user from a Bearer token when one is present. This never
  // rejects on its own; the individual routes decide what they require.
  a.use("/api", auth.attachUser(models));
  a.use("/api/auth", authRoutes);
  a.use("/api", api);

  a.use(
    express.static(ROOT, {
      etag: true,
      maxAge: IS_PROD ? "1h" : 0,
      setHeaders(res, filePath) {
        if (/\.html$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
      }
    })
  );

  // Unknown /api/* is handled inside the router; this is the SPA-style
  // fallback for real page routes only.
  a.use((req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Unknown API endpoint" });
    res.status(404).sendFile(path.join(ROOT, "index.html"));
  });

  // Last-resort handler. Must stay last and must not leak internals.
  a.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err && (err.status || err.statusCode);
    if (status && err.expose) return res.status(status).json({ error: err.message });
    console.error("[server]", err && err.stack ? err.stack : err);
    res.status(500).json({ error: "Internal server error" });
  });

  return a;
}

/* ------------------------------------------------------------------ */

async function start() {
  try {
    await connect();
  } catch (err) {
    // A missing database must not stop the static site from being served.
    console.error("MongoDB unavailable:", err.message);
    console.error("Serving the frontend with local-only data.");
  }

  try {
    await seedIfEmpty();
  } catch (err) {
    console.error("Seeding skipped:", err.message);
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`FoodLink server running at http://localhost:${PORT}`);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the other process or set PORT.`);
    } else {
      console.error("Listen error:", err.message);
    }
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// A rejected promise with no handler used to kill the process mid-request.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err && err.stack ? err.stack : err);
  process.exit(1);
});

if (require.main === module) start();

module.exports = app;
