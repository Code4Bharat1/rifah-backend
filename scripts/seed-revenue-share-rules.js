/**
 * One-time setup: seeds the initial Revenue Share Rule versions (membership 50/25/25,
 * event 100% to organizer) if none exist yet for that revenueType. Safe to re-run — it
 * only creates a rule when the revenueType has no rows at all, never duplicates or edits
 * an existing version.
 *
 * Run once:  node scripts/seed-revenue-share-rules.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/rifah";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to ${MONGO_URI}`);

  const { RevenueShareRule } = await import("../src/modules/revenue-sharing/revenueShareRule.model.js");

  const seeds = [
    {
      revenueType: "membership",
      allocations: [
        { beneficiaryLevel: "chapter", percentage: 50 },
        { beneficiaryLevel: "state", percentage: 25 },
        { beneficiaryLevel: "central", percentage: 25 },
      ],
      notes: "Initial rule: Chapter 50% / State 25% / Central 25% of eligible membership amount.",
    },
    {
      revenueType: "event",
      allocations: [{ beneficiaryLevel: "organizer", percentage: 100 }],
      notes:
        "Initial rule: 100% of eligible event registration revenue to whichever Chapter or State organized the event. Central-organized (global-scope) events are out of this rule's scope entirely — Central retains that revenue directly, no ledger entries are created for them.",
    },
  ];

  for (const seed of seeds) {
    const existing = await RevenueShareRule.findOne({ revenueType: seed.revenueType });
    if (existing) {
      console.log(`Skipping "${seed.revenueType}" — already has a rule (v${existing.version}).`);
      continue;
    }
    const rule = await RevenueShareRule.create({
      revenueType: seed.revenueType,
      allocations: seed.allocations,
      version: 1,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      notes: seed.notes,
      createdBy: null,
    });
    console.log(`Created "${seed.revenueType}" rule v${rule.version}: ${JSON.stringify(seed.allocations)}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
