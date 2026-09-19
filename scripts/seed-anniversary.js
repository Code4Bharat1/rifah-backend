import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { ROLES } from "../src/shared/constants/roles.js";

async function seedAnniversaryData() {
  try {
    console.log("Connecting to MongoDB for Anniversary Test Seeding...");
    await mongoose.connect(env.DATABASE.URI);

    // 1. Identify active chapter (default: Mumbai)
    let chapterDoc = await Chapter.findOne({ status: "Active" });
    const targetChapter = chapterDoc ? chapterDoc.name : "Mumbai";
    const targetChapterId = chapterDoc ? chapterDoc._id : null;

    console.log(`Using chapter: ${targetChapter}`);

    // 2. Compute dynamic anniversary dates matching TODAY
    const now = new Date();
    // Exactly 2 years ago today (2nd Anniversary)
    const twoYearsAgoToday = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate(), 10, 0, 0);
    // Exactly 1 year ago today (1st Anniversary)
    const oneYearAgoToday = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 11, 30, 0);
    // Exactly 3 years ago today (3rd Anniversary)
    const threeYearsAgoToday = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate(), 9, 15, 0);

    const defaultPassword = await hashPassword("Password@123");

    // 3. Test Users & Businesses to Seed
    const testData = [
      {
        userEmail: "tariq.ansari@rifahtest.com",
        userName: "Tariq Ansari",
        userPhone: "9820123456",
        businessName: "Ansari Precision Engineering Works",
        businessSlug: "ansari-precision-engineering",
        industry: "Manufacturing & Heavy Engineering",
        joiningDate: twoYearsAgoToday,
        yearsExpected: 2,
      },
      {
        userEmail: "zubair.khan@rifahtest.com",
        userName: "Zubair Khan",
        userPhone: "9833456789",
        businessName: "Al-Barakah Logistics & Freight Solutions",
        businessSlug: "al-barakah-logistics",
        industry: "Logistics & Supply Chain",
        joiningDate: oneYearAgoToday,
        yearsExpected: 1,
      },
      {
        userEmail: "amina.siddiqui@rifahtest.com",
        userName: "Amina Siddiqui",
        userPhone: "9819987654",
        businessName: "Siddiqui Fine Textiles & Garments",
        businessSlug: "siddiqui-fine-textiles",
        industry: "Textiles & Apparel",
        joiningDate: threeYearsAgoToday,
        yearsExpected: 3,
      },
    ];

    for (const item of testData) {
      // Find or create user
      let user = await User.findOne({ email: item.userEmail });
      if (!user) {
        user = await User.create({
          name: item.userName,
          email: item.userEmail,
          passwordHash: defaultPassword,
          phone: item.userPhone,
          whatsapp: item.userPhone,
          role: ROLES.BUSINESS_OWNER,
          chapter: targetChapter,
          chapterId: targetChapterId,
          status: "Active",
          joiningDate: item.joiningDate,
          lastAnniversaryWishYear: 0, // Reset to 0 so fresh celebration triggers!
        });
        console.log(`Created test member: ${item.userName} (${item.userEmail})`);
      } else {
        user.joiningDate = item.joiningDate;
        user.lastAnniversaryWishYear = 0;
        user.chapter = targetChapter;
        user.chapterId = targetChapterId;
        await user.save();
        console.log(`Updated test member: ${item.userName} joiningDate to ${item.joiningDate.toDateString()}`);
      }

      // Find or create business
      let biz = await Business.findOne({ slug: item.businessSlug });
      if (!biz) {
        biz = await Business.create({
          name: item.businessName,
          slug: item.businessSlug,
          owner: user._id,
          industry: item.industry,
          chapter: targetChapter,
          chapterId: targetChapterId,
          city: targetChapter,
          state: chapterDoc?.state || "Maharashtra",
          phone: item.userPhone,
          whatsapp: item.userPhone,
          email: item.userEmail,
          ownerEmail: item.userEmail,
          status: "Active",
          verification: "verified",
          verificationStatus: "Verified",
          isPaid: true,
          membership: "Premium",
          joiningDate: item.joiningDate,
          createdAt: item.joiningDate,
          lastAnniversaryWishYear: 0, // Reset so fresh celebration triggers!
        });
        console.log(`Created business: ${item.businessName} (${item.yearsExpected} years completed today!)`);
      } else {
        biz.joiningDate = item.joiningDate;
        biz.createdAt = item.joiningDate;
        biz.lastAnniversaryWishYear = 0;
        biz.chapter = targetChapter;
        biz.chapterId = targetChapterId;
        biz.status = "Active";
        await biz.save();
        console.log(`Updated business: ${item.businessName} joiningDate to ${item.joiningDate.toDateString()}`);
      }
    }

    // 4. Also set primary test account (rs994086@gmail.com) if it exists, matching chapter
    const primaryTestUser = await User.findOne({ email: "rs994086@gmail.com" });
    if (primaryTestUser) {
      primaryTestUser.chapter = targetChapter;
      primaryTestUser.chapterId = targetChapterId;
      await primaryTestUser.save();
      console.log(`Ensured primary test user rs994086@gmail.com belongs to ${targetChapter}`);
    }

    console.log("\n=======================================================");
    console.log(`🎉 SUCCESS! Seeded 3 active businesses celebrating their`);
    console.log(`   anniversary TODAY in chapter "${targetChapter}":`);
    console.log(`   1. Ansari Precision Engineering (2nd Anniversary)`);
    console.log(`   2. Al-Barakah Logistics (1st Anniversary)`);
    console.log(`   3. Siddiqui Fine Textiles (3rd Anniversary)`);
    console.log("=======================================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding anniversary test data:", error);
    process.exit(1);
  }
}

seedAnniversaryData();
