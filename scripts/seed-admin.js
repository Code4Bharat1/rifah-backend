import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { ROLES } from "../src/shared/constants/roles.js";
import { STATUSES } from "../src/shared/constants/statuses.js";

const seedAdmin = async () => {
  try {
    console.log("Connecting to MongoDB for Admin Seeding...");
    await mongoose.connect(env.DATABASE.URI);

    const adminEmail = "secretariat@rifah.org";
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log(`Admin account already exists (${adminEmail}). Updating credentials...`);
      existingAdmin.passwordHash = await hashPassword("Admin@123456");
      existingAdmin.role = ROLES.SUPER_ADMIN;
      existingAdmin.status = STATUSES.USER.ACTIVE;
      await existingAdmin.save();
      console.log(`✅ Admin account (${adminEmail}) updated successfully!`);
    } else {
      const passwordHash = await hashPassword("Admin@123456");
      await User.create({
        name: "RIFAH Secretariat General",
        email: adminEmail,
        passwordHash,
        phone: "+91 22 2345 6789",
        role: ROLES.SUPER_ADMIN,
        status: STATUSES.USER.ACTIVE,
        chapter: "Mumbai Chapter",
      });
      console.log(`✅ Super Admin created successfully: ${adminEmail} / Admin@123456`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Admin seeding error:", error);
    process.exit(1);
  }
};

seedAdmin();
