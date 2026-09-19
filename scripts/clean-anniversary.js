import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";

async function cleanAnniversaryData() {
  try {
    console.log("Connecting to MongoDB to clean Anniversary test data...");
    await mongoose.connect(env.DATABASE.URI);

    const testEmails = [
      "tariq.ansari@rifahtest.com",
      "zubair.khan@rifahtest.com",
      "amina.siddiqui@rifahtest.com",
    ];

    const testSlugs = [
      "ansari-precision-engineering",
      "al-barakah-logistics",
      "siddiqui-fine-textiles",
    ];

    const deletedUsers = await User.deleteMany({ email: { $in: testEmails } });
    const deletedBusinesses = await Business.deleteMany({ slug: { $in: testSlugs } });

    console.log(`Successfully removed ${deletedUsers.deletedCount} test user(s) and ${deletedBusinesses.deletedCount} test business(es).`);
  } catch (error) {
    console.error("Failed to clean anniversary test data:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
}

cleanAnniversaryData();
