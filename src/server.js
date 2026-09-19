import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/mongoose.js";
import { logger } from "./infrastructure/logger/logger.js";
import { initSocket } from "./infrastructure/socket/socket.js";
import { eventService } from "./modules/events/event.service.js";
import { birthdayService } from "./modules/birthdays/birthday.service.js";
import { anniversaryService } from "./modules/anniversaries/anniversary.service.js";
import { announcementService } from "./modules/announcements/announcement.service.js";
import { membershipService } from "./modules/memberships/membership.service.js";
import { seedInitialCategories } from "./modules/categories/categories.data.js";
import { User } from "./modules/users/user.model.js";
import { Business } from "./modules/businesses/business.model.js";
import { Chapter } from "./modules/chapters/chapter.model.js";
import { Verification } from "./modules/verification/verification.model.js";
import { hashPassword } from "./infrastructure/auth/password.js";
import { ROLES } from "./shared/constants/roles.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
let server;

const ensureUserAccount = async () => {
  try {
    const email = "rs994086@gmail.com";
    const password = "Password@123";
    const passwordHash = await hashPassword(password);

    let chapterDoc = await Chapter.findOne({ status: "Active" });
    const chapterName = chapterDoc ? chapterDoc.name : "Mumbai";
    const chapterId = chapterDoc ? chapterDoc._id : null;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: "Raj",
        email,
        passwordHash,
        phone: "9876543210",
        whatsapp: "9876543210",
        chapter: chapterName,
        chapterId,
        role: ROLES.BUSINESS_OWNER,
        status: "Active",
        isProfileComplete: true,
        dob: new Date("2026-09-18"),
        timezone: "Asia/Kolkata",
      });
      logger.info(`[USER SETUP] Created user ${email} with password: ${password}`);
    } else {
      user.passwordHash = passwordHash;
      user.status = "Active";
      user.isProfileComplete = true;
      user.dob = new Date("2026-09-18");
      user.timezone = "Asia/Kolkata";
      await user.save();
      logger.info(`[USER SETUP] Updated user ${email} password to: ${password}`);
    }

    let business = await Business.findOne({ owner: user._id });
    if (!business) {
      business = await Business.create({
        name: "Raj Enterprises",
        slug: `raj-enterprises-${Date.now().toString().slice(-4)}`,
        owner: user._id,
        contactPerson: "Raj",
        industry: "Information Technology",
        categories: ["Information Technology", "Software Services"],
        businessType: "Proprietorship",
        city: "Mumbai",
        state: "Maharashtra",
        chapter: chapterName,
        chapterId,
        membership: "Premium",
        dob: new Date("2026-09-18"),
        timezone: "Asia/Kolkata",
        phone: "9876543210",
        whatsapp: "9876543210",
        email: email,
        ownerEmail: email,
        status: "Active",
        verification: "verified",
        verificationStatus: "verified",
      });
      logger.info(`[BUSINESS SETUP] Created business for ${email}`);
    } else {
      business.status = "Active";
      business.verification = "verified";
      business.verificationStatus = "verified";
      business.dob = new Date("2026-09-18");
      business.timezone = "Asia/Kolkata";
      await business.save();
    }

    // Create a Verification Request for Raj Enterprises to show up in "Awaiting Review"
    let rajVerification = await Verification.findOne({ business: business._id });
    if (!rajVerification) {
      await Verification.create({
        business: business._id,
        submittedBy: user._id,
        status: "pending",
        documents: [{ type: "GST Registration", name: "GST.pdf", fileUrl: "/uploads/documents/dummy-gst.pdf" }]
      });
      logger.info(`[VERIFICATION SETUP] Created pending verification request for ${business.name}`);
    } else if (rajVerification.status !== "pending") {
      rajVerification.status = "pending";
      await rajVerification.save();
    }
    
    // Update the business model to match the pending status for Raj Enterprises
    business.verification = "pending";
    business.verificationStatus = "pending";
    await business.save();

    // Create a Rejected Business for testing the "Rejected" queue
    const rejectedEmail = "rejected@test.com";
    let rejectedUser = await User.findOne({ email: rejectedEmail });
    if (!rejectedUser) {
      rejectedUser = await User.create({
        name: "Test Reject",
        email: rejectedEmail,
        passwordHash,
        phone: "9876543211",
        chapter: chapterName,
        chapterId,
        role: ROLES.BUSINESS_OWNER,
        status: "Active",
      });
    }
    let rejectedBusiness = await Business.findOne({ owner: rejectedUser._id });
    if (!rejectedBusiness) {
      rejectedBusiness = await Business.create({
        name: "Rejected Enterprises",
        slug: `rejected-ent-${Date.now()}`,
        owner: rejectedUser._id,
        industry: "Retail",
        city: "Mumbai",
        chapter: chapterName,
        chapterId,
        status: "Active",
        verification: "rejected",
        verificationStatus: "rejected",
      });
      await Verification.create({
        business: rejectedBusiness._id,
        submittedBy: rejectedUser._id,
        status: "rejected",
        remarks: "Invalid documents. Needs clear scanned copy of PAN.",
        documents: [{ type: "PAN Card", name: "pan.pdf", fileUrl: "/uploads/documents/dummy-pan.pdf" }]
      });
      logger.info(`[VERIFICATION SETUP] Created rejected business verification`);
    }

    // Also ensure shweta's business is verified so she doesn't see locked modules in /biz
    let shwetaUser = await User.findOne({ email: "kedareshweta9696@gmail.com" });
    if (shwetaUser) {
      let shwetaBusiness = await Business.findOne({ owner: shwetaUser._id });
      if (shwetaBusiness) {
        shwetaBusiness.verification = "verified";
        shwetaBusiness.verificationStatus = "verified";
        await shwetaBusiness.save();
        logger.info("[BUSINESS SETUP] Verified business for kedareshweta9696@gmail.com");
      }
    }

  } catch (err) {
    logger.error("[USER SETUP ERROR]", err);
  }
};

/**
 * Seeds test chapters across multiple states so testers aren't blocked by
 * a single chapter going Inactive. Uses findOneAndUpdate with upsert so the
 * existing Mumbai chapter is refreshed (not duplicated) and its _id is preserved.
 */
const ensureChapters = async () => {
  try {
    const SEED_CHAPTERS = [
      // ── Maharashtra ──────────────────────────────────────────────────────
      {
        name: "Mumbai Chapter",
        slug: "mumbai-chapter",
        city: "Mumbai",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Pune Chapter",
        slug: "pune-chapter",
        city: "Pune",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Nagpur Chapter",
        slug: "nagpur-chapter",
        city: "Nagpur",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Delhi / NCR ──────────────────────────────────────────────────────
      {
        name: "Delhi Central Chapter",
        slug: "delhi-central-chapter",
        city: "New Delhi",
        state: "Delhi",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Gurugram Chapter",
        slug: "gurugram-chapter",
        city: "Gurugram",
        state: "Delhi",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Karnataka ────────────────────────────────────────────────────────
      {
        name: "Bengaluru Chapter",
        slug: "bengaluru-chapter",
        city: "Bengaluru",
        state: "Karnataka",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Tamil Nadu ───────────────────────────────────────────────────────
      {
        name: "Chennai Chapter",
        slug: "chennai-chapter",
        city: "Chennai",
        state: "Tamil Nadu",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Coimbatore Chapter",
        slug: "coimbatore-chapter",
        city: "Coimbatore",
        state: "Tamil Nadu",
        lead: "Chapter Secretary",
        status: "Active",
      },
    ];

    let upserted = 0;
    for (const ch of SEED_CHAPTERS) {
      await Chapter.findOneAndUpdate(
        { slug: ch.slug },
        { $setOnInsert: { name: ch.name, city: ch.city, state: ch.state, lead: ch.lead, slug: ch.slug }, $set: { status: ch.status } },
        { upsert: true, new: true }
      );
      upserted++;
    }

    const total = await Chapter.countDocuments();
    logger.info(`[CHAPTER SETUP] Ensured ${upserted} seed chapters. Total chapters in DB: ${total}`);
  } catch (err) {
    logger.error("[CHAPTER SETUP ERROR]", err);
  }
};



const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 1.1 Ensure Categories & Subcategories are populated (500+ items)
    await seedInitialCategories();

    // 1.2 Ensure User Account for testing
    await ensureUserAccount();

    // 1.3 Ensure test chapters across multiple states exist
    await ensureChapters();

    // 1.4 Clean up any seeded Anniversary Test Data
    await anniversaryService.cleanAnniversaryTestData();

    // 2. Start Scheduled Background Tasks
    eventService.startEventScheduler();
    birthdayService.startBirthdayScheduler();
    anniversaryService.startAnniversaryScheduler();
    membershipService.startMembershipExpiryScheduler();

    // 3. Start HTTP Server
    server = app.listen(env.PORT, () => {
      logger.info(`Port:${env.PORT}`);
      logger.info(`Health Check: http://localhost:${env.PORT}/health`);
    });

    // 3. Initialize Socket.io Server
    initSocket(server);
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdowns
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down...`);
  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed.");
      await disconnectDatabase();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

startServer();
