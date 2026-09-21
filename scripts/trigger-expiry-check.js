import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { membershipService } from "../src/modules/memberships/membership.service.js";

async function runCheck() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(env.DATABASE.URI);
    console.log("Connected. Running membership expiry check...");
    
    const result = await membershipService.checkAndSendMembershipExpiryReminders();
    console.log("Check complete! Result:", result);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

runCheck();
