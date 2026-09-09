import mongoose from "mongoose";
import dotenv from "dotenv";
import { Plan } from "./src/modules/memberships/plan.model.js";

dotenv.config();

const plans = [
  { planId: "free", name: "Free", price: 0, priceUsd: 0, summary: "Get started on RIFAH Connect", features: ["Directory listing", "Basic search", "5 leads / mo"] },
  { planId: "basic", name: "Basic", price: 4999, priceUsd: 59, summary: "For growing businesses", features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
  { planId: "premium", name: "Premium", price: 12999, priceUsd: 159, summary: "For established businesses", features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
  { planId: "enterprise", name: "Enterprise", price: 29999, priceUsd: 359, summary: "For market leaders", features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    for (const plan of plans) {
      await Plan.findOneAndUpdate(
        { planId: plan.planId },
        plan,
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
