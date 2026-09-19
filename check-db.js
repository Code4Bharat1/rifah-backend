import { connectDatabase, disconnectDatabase } from "./src/infrastructure/database/mongoose.js";
import { Verification } from "./src/modules/verification/verification.model.js";
import { Business } from "./src/modules/businesses/business.model.js";
import { User } from "./src/modules/users/user.model.js";

async function check() {
  await connectDatabase();
  const verifications = await Verification.find().populate("business");
  for (const v of verifications) {
    console.log(`Business: ${v.business?.name}, Raw SubmittedBy: ${v.submittedBy}`);
  }
  await disconnectDatabase();
}

check();
