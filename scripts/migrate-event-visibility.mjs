/**
 * One-time migration: Backfill creator-scope RBAC fields on all existing events.
 *
 * Run once:  node scripts/migrate-event-visibility.mjs
 */

import mongoose from "mongoose";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env manually for ESM compatibility
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
  console.log("✅ .env loaded from:", envPath);
} catch (e) {
  console.warn("⚠️  Could not read .env:", e.message);
}

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || "mongodb://localhost:27017/rifah";
console.log("Using URI:", MONGO_URI.replace(/\/\/[^@]+@/, "//***@").slice(0, 60) + "...");

await mongoose.connect(MONGO_URI);
console.log("✅ Connected to MongoDB:", MONGO_URI.replace(/\/\/.*@/, "//***@"));

const Event = mongoose.model("Event", new mongoose.Schema({}, { strict: false }), "events");
const User  = mongoose.model("User",  new mongoose.Schema({}, { strict: false }), "users");

const events = await Event.find({
  $or: [
    { visibilityScope: { $exists: false } },
    { visibilityScope: null },
    { visibilityScope: "" },
  ],
}).lean();

console.log(`Found ${events.length} events to migrate.`);

let updated = 0;
let skipped = 0;

for (const ev of events) {
  let visibilityScope = "global";
  let creatorRole     = "super_admin";
  let creatorChapter  = "";
  let creatorState    = "";

  if (ev.createdBy) {
    const creator = await User.findById(ev.createdBy).lean();
    if (creator) {
      creatorRole    = creator.role    || "super_admin";
      creatorChapter = creator.chapter || "";
      creatorState   = creator.state   || "";

      if (creator.role === "chapter_admin") {
        visibilityScope = "chapter";
      } else if (creator.role === "state_admin") {
        visibilityScope = "state";
      } else {
        visibilityScope = "global";
      }
    }
  }

  // Also infer from targetChapters / targetStates if createdBy is missing
  if (!ev.createdBy) {
    const tc = ev.targetChapters || [];
    const ts = ev.targetStates   || [];
    const hasAllChapters = tc.includes("All") || tc.length === 0;
    const hasAllStates   = ts.includes("All") || ts.length === 0;

    if (!hasAllChapters) {
      visibilityScope = "chapter";
      creatorChapter  = ev.chapter || tc[0] || "";
      creatorState    = ev.targetStates?.[0] || "";
    } else if (!hasAllStates) {
      visibilityScope = "state";
      creatorState    = ts[0] || "";
    } else {
      visibilityScope = "global";
    }
  }

  await Event.updateOne(
    { _id: ev._id },
    {
      $set: {
        visibilityScope,
        creatorRole,
        creatorChapter,
        creatorState,
      },
    }
  );

  console.log(`  [${visibilityScope.padEnd(7)}] "${ev.title || ev._id}" → creatorChapter="${creatorChapter}" creatorState="${creatorState}"`);
  updated++;
}

console.log(`\n✅ Migration complete. Updated: ${updated}, Skipped: ${skipped}`);
await mongoose.disconnect();
