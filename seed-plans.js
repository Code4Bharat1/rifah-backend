import "dotenv/config";
import mongoose from "mongoose";
import { Plan } from "./src/modules/memberships/plan.model.js";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/rifah";

const PLANS = {
  free: { name: "Free", price: 0, summary: "Get started on RIFAH Connect", features: ["Directory listing", "Basic search", "5 leads / mo"] },
  basic: { name: "Basic", price: 4999, summary: "For growing businesses", features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
  premium: { name: "Premium", price: 12999, summary: "For established businesses", features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
  enterprise: { name: "Enterprise", price: 29999, summary: "For market leaders", features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] },
};

async function seedPlans() {
  try {
    console.log("Connecting to MongoDB...", uri);
    await mongoose.connect(uri);
    console.log("Connected.");
    
    for (const [planId, data] of Object.entries(PLANS)) {
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
