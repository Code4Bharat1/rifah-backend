import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Event = mongoose.model("EventDebug", new mongoose.Schema({}, { strict: false, collection: "events" }));
  const events = await Event.find({ registeredCount: { $gt: 0 } }).lean();
  events.forEach(e => {
    console.log("Event:", e.title);
    console.log("registeredUsers:", JSON.stringify(e.registeredUsers, null, 2));
  });
  process.exit(0);
};
run().catch(e => { console.error(e); process.exit(1); });
