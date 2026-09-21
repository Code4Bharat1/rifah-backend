import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import "../src/modules/users/user.model.js";
import { regenerateAllCertificates } from "../src/modules/courses/certificate.service.js";

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.DATABASE.URI);
    console.log("Connected. Regenerating certificates with new navy/gold UI design...");
    const results = await regenerateAllCertificates();
    console.log("Results:", JSON.stringify(results, null, 2));
    await mongoose.disconnect();
    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Error regenerating certificates:", err);
    process.exit(1);
  }
}

run();
