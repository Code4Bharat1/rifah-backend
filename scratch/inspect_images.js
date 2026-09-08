import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";

async function inspectImages() {
  try {
    await mongoose.connect(env.DATABASE.URI);
    console.log("Connected to DB");

    const sampleBusinesses = await Business.find({}).limit(5).select("name logo coverImage gallery");
    console.log("\n--- BUSINESS IMAGES ---");
    sampleBusinesses.forEach(b => {
      console.log(`Business: "${b.name}"`);
      console.log(`  Logo: ${b.logo}`);
      console.log(`  Cover: ${b.coverImage}`);
      console.log(`  Gallery: ${JSON.stringify(b.gallery)}`);
    });

    const sampleCatalogues = await Catalogue.find({}).limit(5).select("name images");
    console.log("\n--- CATALOGUE IMAGES ---");
    sampleCatalogues.forEach(c => {
      console.log(`Product: "${c.name}"`);
      console.log(`  Images: ${JSON.stringify(c.images)}`);
    });

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

inspectImages();
