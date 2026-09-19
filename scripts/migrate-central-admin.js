import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { ROLES } from "../src/shared/constants/roles.js";

const migrateCentralAdmin = async () => {
  try {
    console.log("Connecting to MongoDB for Central Admin Migration...");
    await mongoose.connect(env.DATABASE.URI);

    const result = await User.updateMany(
      { role: { $in: ["super_admin", "admin"] } },
      { $set: { role: ROLES.CENTRAL_ADMIN } }
    );

    console.log(`✅ Central Admin migration complete: ${result.modifiedCount} user(s) updated to role '${ROLES.CENTRAL_ADMIN}'.`);

    // List all central admins
    const centralAdmins = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("name email role");
    console.log("Current Central Admin users in database:", centralAdmins);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
};

migrateCentralAdmin();
