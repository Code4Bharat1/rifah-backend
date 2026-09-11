import "dotenv/config";
import mongoose from "mongoose";
import { env } from "./src/config/env.js";
import { verificationController } from "./src/modules/verification/verification.controller.js";

async function test() {
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected to MongoDB");

  const req = {
    params: { id: "6aa3fa38355ca007c3f2bbe2" },
    body: { status: "verified", remarks: "test" },
    user: { id: new mongoose.Types.ObjectId().toString(), name: "Test Admin", role: "chapter_admin", chapter: "Mumbai" },
    ip: "127.0.0.1"
  };

  const res = {
    status: function(s) { this.statusCode = s; return this; },
    json: function(d) { console.log("Response:", this.statusCode, d); }
  };

  const next = function(err) { console.error("Error from next:", err); };

  try {
    await verificationController.reviewVerification(req, res, next);
  } catch (err) {
    console.error("Uncaught Error:", err);
  }

  process.exit();
}

test();
