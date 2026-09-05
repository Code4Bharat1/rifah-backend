import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Enquiry } from "../src/modules/enquiries/enquiry.model.js";
import { User } from "../src/modules/users/user.model.js";

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected to Mongo");

  const enquiries = await Enquiry.find({}).populate("requester");
  for (const e of enquiries) {
    console.log(`Enquiry ${e.referenceId}: title="${e.title}", requesterName="${e.requesterName}", user.name="${e.requester?.name}", user.email="${e.requester?.email}"`);
  }

  const users = await User.find({ role: { $in: ["customer", "Consumer", "customer_buyer"] } });
  console.log(`Found ${users.length} buyer users:`);
  for (const u of users) {
    console.log(`User: ${u._id}, name="${u.name}", email="${u.email}", role="${u.role}"`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
