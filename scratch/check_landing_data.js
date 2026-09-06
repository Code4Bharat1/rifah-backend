import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Plan } from "../src/modules/memberships/plan.model.js";
import { Category } from "../src/modules/categories/category.model.js";

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected to MongoDB Atlas");

  const businessCount = await Business.countDocuments({});
  const featuredBizCount = await Business.countDocuments({ featured: true });
  const activeBizCount = await Business.countDocuments({ status: { $ne: "Suspended" } });
  console.log(`Businesses: total=${businessCount}, featured=${featuredBizCount}, active=${activeBizCount}`);

  const businesses = await Business.find({}).limit(5);
  for (const b of businesses) {
    console.log(`- Biz: "${b.name}", status="${b.status}", featured=${b.featured}, membership="${b.membership}", verification="${b.verification}"`);
  }

  const catalogueCount = await Catalogue.countDocuments({});
  const activeCatalogueCount = await Catalogue.countDocuments({ status: "Active" });
  console.log(`Catalogue: total=${catalogueCount}, active=${activeCatalogueCount}`);
  const items = await Catalogue.find({}).limit(5);
  for (const it of items) {
    console.log(`- Item: "${it.name}", status="${it.status}", business="${it.business}"`);
  }

  const eventCount = await Event.countDocuments({});
  console.log(`Events: total=${eventCount}`);
  const events = await Event.find({}).limit(5);
  for (const ev of events) {
    console.log(`- Event: "${ev.title}", status="${ev.status}", date="${ev.date}"`);
  }

  const planCount = await Plan.countDocuments({});
  console.log(`Plans: total=${planCount}`);
  const plans = await Plan.find({});
  for (const p of plans) {
    console.log(`- Plan: planId="${p.planId}", name="${p.name}", price=${p.price}`);
  }

  const catCount = await Category.countDocuments({});
  console.log(`Categories: total=${catCount}`);

  await mongoose.disconnect();
}

main().catch(console.error);
