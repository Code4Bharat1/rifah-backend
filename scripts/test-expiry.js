import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { ROLES } from "../src/shared/constants/roles.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { generateSlug } from "../src/shared/utils/generate-id.js";

async function createTestRecords() {
  try {
    console.log("Connecting to Database:", env.DATABASE.URI);
    await mongoose.connect(env.DATABASE.URI);
    console.log("Connected successfully.");

    const chapterName = "Mumbai";

    // 1. Check or Create Chapter
    let chapter = await Chapter.findOne({ name: chapterName });
    if (!chapter) {
      chapter = await Chapter.create({
        name: chapterName,
        slug: generateSlug(chapterName),
        city: "Mumbai",
        state: "Maharashtra",
        status: "Active"
      });
      console.log("Created Chapter:", chapterName);
    } else {
      console.log("Chapter already exists:", chapterName);
    }

    // 2. Create a Dummy Chapter Admin for Mumbai
    const adminEmail = "mumbai.admin.test@rifah.org";
    let chapterAdmin = await User.findOne({ email: adminEmail });
    if (!chapterAdmin) {
      const passwordHash = await hashPassword("Test@1234");
      chapterAdmin = await User.create({
        name: "Test Mumbai Admin",
        email: adminEmail,
        passwordHash,
        role: ROLES.CHAPTER_ADMIN,
        chapter: chapterName,
        chapterId: chapter._id,
        city: "Mumbai",
        state: "Maharashtra",
        status: "Active"
      });
      console.log(`Created Chapter Admin: ${adminEmail} (Password: Test@1234)`);
    } else {
      console.log("Chapter Admin already exists:", adminEmail);
    }

    // 3. Create a Dummy Business Owner User
    const ownerEmail = "test.business.owner@rifah.org";
    let owner = await User.findOne({ email: ownerEmail });
    if (!owner) {
      const passwordHash = await hashPassword("Test@1234");
      owner = await User.create({
        name: "Test Business Owner",
        email: ownerEmail,
        passwordHash,
        role: ROLES.BUSINESS_OWNER,
        chapter: chapterName,
        chapterId: chapter._id,
        city: "Mumbai",
        state: "Maharashtra",
        status: "Active"
      });
      console.log(`Created Business Owner: ${ownerEmail} (Password: Test@1234)`);
    } else {
      console.log("Business Owner already exists:", ownerEmail);
    }

    // 4. Create a Dummy Business
    const businessName = "Mumbai Test Enterprises";
    let business = await Business.findOne({ owner: owner._id });
    if (!business) {
      business = await Business.create({
        name: businessName,
        slug: generateSlug(businessName),
        owner: owner._id,
        chapter: chapterName,
        chapterId: chapter._id,
        city: "Mumbai",
        state: "Maharashtra",
        membership: "Basic",
        verificationStatus: "Verified"
      });
      console.log("Created Business:", businessName);
    } else {
      console.log("Business already exists:", business.name);
    }

    // 5. Create a Membership that is expiring today
    let membership = await Membership.findOne({ business: business._id });
    if (membership) {
      // Update it to expire today
      membership.endDate = new Date(); // Today
      membership.planId = "basic";
      membership.planName = "Basic";
      membership.status = "Active";
      membership.remindersSent = []; // Reset reminders
      await membership.save();
      console.log("Updated existing membership to expire today.");
    } else {
      // Create new
      membership = await Membership.create({
        business: business._id,
        planId: "basic",
        planName: "Basic",
        price: 4999,
        startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
        endDate: new Date(), // Today
        status: "Active",
        features: ["Test Feature"],
        remindersSent: []
      });
      console.log("Created new expiring membership for business.");
    }

    console.log("\n=============================================");
    console.log("✅ TEST DATA CREATED SUCCESSFULLY!");
    console.log("=============================================");
    console.log("Chapter Admin Login Email:", adminEmail);
    console.log("Password:", "Test@1234");
    console.log("Expiring Business:", businessName);
    console.log("\nTo test the feature:");
    console.log("1. Restart your backend server (this will trigger the 15-second startup check).");
    console.log("2. Wait 20 seconds, then log into the frontend using the Chapter Admin credentials above.");
    console.log("3. Check the notifications for the 'Member Expiry' alert!");

  } catch (error) {
    console.error("Error creating test records:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
  }
}

createTestRecords();
