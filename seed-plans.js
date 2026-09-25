import "dotenv/config";
import mongoose from "mongoose";
import { Plan } from "./src/modules/memberships/plan.model.js";
import { DEFAULT_MEMBERSHIP_PLANS } from "./src/modules/memberships/membership.service.js";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/rifah";

// NOTE: this used to hardcode its own Free/Basic/Premium/Enterprise plan list, which
// drifted from the app's real canonical plan catalog (Silver/Gold/Platinum/Diamond,
// defined once in membership.service.js's DEFAULT_MEMBERSHIP_PLANS and used by
// membershipService.getPlans()/upgradePlan() at runtime). Running this script with the
// old list would have created a second, divergent set of Plan documents alongside the
// canonical ones — which is the most likely cause of "Membership Plan names differ
// between pages" (BUG-053). It now seeds from the single canonical source instead.
async function seedPlans() {
  try {
    console.log("Connecting to MongoDB...", uri);
    await mongoose.connect(uri);
    console.log("Connected.");

    for (const [planId, data] of Object.entries(DEFAULT_MEMBERSHIP_PLANS)) {
      const existing = await Plan.findOne({ planId });
      if (!existing) {
        await Plan.create({ planId, ...data });
        console.log(`Created plan: ${planId}`);
      } else {
        console.log(`Plan ${planId} already exists`);
      }
    }

    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedPlans();
