import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { Event } from "./src/modules/events/event.model.js";

async function fixEvents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to DB");
    
    const result = await Event.updateMany(
      { mode: "In-person" },
      { $set: { mode: "Offline" } },
      { strict: false }
    );
    console.log("Fixed 'In-person' events:", result);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixEvents();
