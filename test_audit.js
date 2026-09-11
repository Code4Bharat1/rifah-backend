import "dotenv/config";
import { auditService } from "./src/modules/audit/audit.service.js";
import mongoose from "mongoose";
import { env } from "./src/config/env.js";

async function test() {
  await mongoose.connect(env.MONGO_URI);
  try {
    await auditService.logAction({
      actor: { _id: new mongoose.Types.ObjectId(), name: "Test", role: "admin" },
      action: "VERIFY_APPROVE",
      targetModel: "Verification",
      targetId: new mongoose.Types.ObjectId().toString(),
      summary: "Test",
      ipAddress: "127.0.0.1"
    });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit();
}
test();
