import mongoose from "mongoose";
import dotenv from "dotenv";
import { Plan } from "./src/modules/memberships/plan.model.js";
import { DEFAULT_MEMBERSHIP_PLANS } from "./src/modules/memberships/membership.service.js";

dotenv.config();

// NOTE: this used to hardcode its own Free/Basic/Premium/Enterprise plan list, which
// drifted from the app's real canonical plan catalog (Silver/Gold/Platinum/Diamond,
// defined once in membership.service.js's DEFAULT_MEMBERSHIP_PLANS and used by
// membershipService.getPlans()/upgradePlan() at runtime). Running this script with the
// old list would have created a second, divergent set of Plan documents alongside the
// canonical ones — which is the most likely cause of "Membership Plan names differ
// between pages" (BUG-053). It now seeds from the single canonical source instead.
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    for (const [planId, data] of Object.entries(DEFAULT_MEMBERSHIP_PLANS)) {
      await Plan.findOneAndUpdate(
        { planId },
        { planId, ...data },
        { upsert: true, new: true }
      );
    }

    console.log("Plans seeded successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding plans:", error);
    process.exit(1);
  }
}

seed();
