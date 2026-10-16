import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { connectDatabase, disconnectDatabase } from "../src/infrastructure/database/mongoose.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { emailService } from "../src/infrastructure/email/email.service.js";
import { ROLES } from "../src/shared/constants/roles.js";
import { generateSlug } from "../src/shared/utils/generate-id.js";
import { getNextMembershipId, getStateCode } from "../src/shared/utils/sequence-generator.js";

// City / State typo sanitization map
const TYPO_FIXES = {
  mumbaai: "Mumbai",
  maharashra: "Maharashtra",
  maharashtr: "Maharashtra",
  banglore: "Bengaluru",
  bengalore: "Bengaluru",
};

function normalizeBusinessType(val) {
  if (!val) return "Proprietorship";
  const lower = String(val).trim().toLowerCase();
  if (lower.includes("pvt") || lower.includes("private")) return "Private Limited";
  if (lower.includes("pub") || lower.includes("public")) return "Public Limited";
  if (lower.includes("llp")) return "LLP";
  if (lower.includes("partner")) return "Partnership";
  if (lower.includes("proprietor")) return "Proprietorship";
  if (lower.includes("trust") || lower.includes("ngo")) return "Trust / NGO";
  return "Proprietorship";
}

function sanitizeLocation(val) {
  if (!val) return "";
  const clean = String(val).trim();
  const lower = clean.toLowerCase();
  return TYPO_FIXES[lower] || clean;
}

function extractCellValue(cell) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    // ExcelJS hyperlink cell: { text: "...", hyperlink: "..." }
    if (cell.text) return String(cell.text).trim();
    if (cell.result) return String(cell.result).trim();
    if (cell instanceof Date) return cell;
    return String(cell).trim();
  }
  return String(cell).trim();
}

function parseDate(val, fallback = new Date()) {
  if (!val) return fallback;
  if (val instanceof Date && !isNaN(val)) return val;
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  // Try DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD-MM-YYYY
      const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return fallback;
}

function generateReadablePassword(length = 8) {
  // Generates easily readable passwords without confusing 0/O, 1/l
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
  let pass = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

async function runImport(filePath) {
  const targetFile = filePath || "c:/Projects/rifah/testData.xlsx";
  console.log("=======================================================");
  console.log("      RIFAH CONNECT - BULK MEMBER IMPORT ENGINE        ");
  console.log("=======================================================");
  console.log(`Target Excel: ${targetFile}\n`);

  if (!fs.existsSync(targetFile)) {
    throw new Error(`File not found: ${targetFile}`);
  }

  await connectDatabase();
  console.log("Connected to MongoDB successfully.\n");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(targetFile);

  const worksheet = workbook.worksheets[0];
  console.log(`Reading worksheet: "${worksheet.name}"...`);

  // Map header row
  const headerRow = worksheet.getRow(1);
  const colIndexMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const headerName = String(cell.value || "").trim().toLowerCase();
    colIndexMap[headerName] = colNumber;
  });

  console.log("Headers detected:", Object.keys(colIndexMap));

  function getColVal(row, possibleNames) {
    for (const name of possibleNames) {
      const idx = colIndexMap[name.toLowerCase()];
      if (idx) {
        return extractCellValue(row.getCell(idx).value);
      }
    }
    return "";
  }

  const results = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: [],
    importedMembers: [],
  };

  // Iterate rows (Row 2 onwards)
  const rowsToProcess = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      rowsToProcess.push({ row, rowNumber });
    }
  });

  results.total = rowsToProcess.length;
  console.log(`Found ${rowsToProcess.length} data rows to process.\n`);

  if (process.argv.includes("--clean")) {
    console.log("🧹 --clean flag provided: Purging previously imported test records for these emails...");
    for (const { row } of rowsToProcess) {
      const email = getColVal(row, ["email", "email address"]).toLowerCase().trim();
      if (email) {
        const u = await User.findOne({ email });
        if (u) {
          const biz = await Business.findOne({ owner: u._id });
          if (biz) {
            await Membership.deleteMany({ business: biz._id });
            await Business.deleteOne({ _id: biz._id });
          }
          await User.deleteOne({ _id: u._id });
          console.log(`  Cleaned previous test record: ${email}`);
        }
      }
    }
    console.log("Cleanup done.\n");
  }

  for (const { row, rowNumber } of rowsToProcess) {
    const fullName = getColVal(row, ["full name", "name", "owner name", "member name"]);
    const rawEmail = getColVal(row, ["email", "email address"]);
    const cleanEmail = rawEmail.toLowerCase().trim();

    if (!cleanEmail || !fullName) {
      console.warn(`[Row ${rowNumber}] Skipped: Missing name or email.`);
      results.skipped++;
      continue;
    }

    const phone = getColVal(row, ["phone number", "phone", "mobile", "mobile number"]);
    const businessName = getColVal(row, ["business name", "company name", "organization"]) || `${fullName}'s Business`;
    const membershipPlan = getColVal(row, ["membership plan", "membership tier", "plan"]) || "Silver";
    const rawJoiningDate = getColVal(row, ["joining date", "start date"]);
    const rawExpiryDate = getColVal(row, ["expiry date", "end date"]);
    const joiningDate = parseDate(rawJoiningDate, new Date());
    const expiryDate = parseDate(rawExpiryDate, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    const chapterRaw = getColVal(row, ["chapter", "chapter name"]) || "Mumbai Chapter";
    const cityRaw = sanitizeLocation(getColVal(row, ["city"]));
    const stateRaw = sanitizeLocation(getColVal(row, ["state"]));
    const country = getColVal(row, ["country"]) || "India";
    const industry = getColVal(row, ["industry", "category"]) || "General";
    const designation = getColVal(row, ["designation", "role in business"]) || "Founder / Owner";
    const businessType = normalizeBusinessType(getColVal(row, ["business type", "type"]));

    console.log(`-------------------------------------------------------`);
    console.log(`[Row ${rowNumber}] Processing: ${fullName} (${cleanEmail})`);

    try {
      // 1. Check if user already exists
      let existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        console.warn(`  ⚠️ User with email ${cleanEmail} already exists. Skipping.`);
        results.skipped++;
        continue;
      }

      // 2. Resolve Chapter (Lookup or Create)
      let chapterDoc = null;
      const cleanChapterName = chapterRaw.trim();
      
      // Match by exact or case-insensitive name
      chapterDoc = await Chapter.findOne({
        name: new RegExp(`^${cleanChapterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });

      if (!chapterDoc && cityRaw) {
        // Fallback: match by city
        chapterDoc = await Chapter.findOne({
          city: new RegExp(`^${cityRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        });
      }

      if (!chapterDoc) {
        console.log(`  Creating new Chapter: "${cleanChapterName}" (City: ${cityRaw}, State: ${stateRaw})`);
        const slug = generateSlug(cleanChapterName);
        chapterDoc = await Chapter.create({
          name: cleanChapterName,
          slug,
          city: cityRaw || "General",
          state: stateRaw || "",
          country: country || "India",
          status: "Active",
          businessesCount: 0,
          membersCount: 0,
        });
      } else {
        console.log(`  Matched existing Chapter: "${chapterDoc.name}" (${chapterDoc._id})`);
      }

      // 3. Generate Temporary Password & Hash
      const temporaryPassword = generateReadablePassword(8);
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      // 4. Create User
      const userDoc = await User.create({
        name: fullName,
        email: cleanEmail,
        passwordHash,
        phone: String(phone || "").trim(),
        country,
        state: stateRaw || chapterDoc.state || "",
        city: cityRaw || chapterDoc.city || "",
        chapter: chapterDoc.name,
        chapterId: chapterDoc._id,
        designation,
        roleInBusiness: designation,
        role: ROLES.BUSINESS_OWNER,
        accountType: "business",
        membershipPlan,
        subscriberTier: "tier_1", // FREE TIER for online software features
        forcePasswordChange: true, // Forces password change upon first login
        isProfileComplete: false,  // Prompts document upload & verification flow
        status: "Active",
        joiningDate,
      });

      // 5. Generate Slug & MembershipId for Business
      let slug = generateSlug(businessName);
      const slugConflict = await Business.findOne({ slug });
      if (slugConflict) {
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      let membershipId = "";
      try {
        membershipId = await getNextMembershipId({
          state: stateRaw || chapterDoc.state,
          chapter: chapterDoc.name,
          city: cityRaw || chapterDoc.city,
        });
      } catch (err) {
        const stateCode = getStateCode(stateRaw || chapterDoc.state, chapterDoc.name, cityRaw || chapterDoc.city);
        membershipId = `RCCI/${stateCode}/${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 6. Create Business
      const businessDoc = await Business.create({
        name: businessName,
        membershipId,
        slug,
        owner: userDoc._id,
        industry,
        categories: [industry],
        businessType: businessType || "Proprietorship",
        city: cityRaw || chapterDoc.city || "",
        state: stateRaw || chapterDoc.state || "",
        country,
        chapter: chapterDoc.name,
        chapterId: chapterDoc._id,
        membership: membershipPlan, // Chamber Membership: e.g. Premium / Diamond
        subscriberTier: "tier_1",   // Software Subscription: Free Tier
        paymentStatus: "Pending",
        isPaid: false,
        verification: "unverified", // Unverified: normal verification flow applies
        status: "Active",
        phone: String(phone || "").trim(),
        ownerEmail: cleanEmail,
        email: cleanEmail,
        designation,
        roleInBusiness: designation,
        contactPerson: fullName,
        joiningDate,
      });

      // 7. Create Membership Record
      const planKey = membershipPlan.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await Membership.create({
        business: businessDoc._id,
        planId: planKey,
        planName: membershipPlan,
        subscriberTier: "tier_1",
        price: 0,
        billingCycle: "Annual",
        startDate: joiningDate,
        endDate: expiryDate,
        status: "Active",
        features: ["Chamber Directory Presence", "Basic Networking Access"],
      });

      // 8. Increment Chapter member/business count
      await Chapter.findByIdAndUpdate(chapterDoc._id, {
        $inc: { membersCount: 1, businessesCount: 1 },
      });

      // 9. Send Welcome Email with Password
      let emailSent = false;
      try {
        await emailService.sendAdminCreatedWelcomeEmail({
          email: cleanEmail,
          name: fullName,
          password: temporaryPassword,
          businessName,
        });
        emailSent = true;
        console.log(`  ✉️ Welcome email with password sent to ${cleanEmail}`);
      } catch (emailErr) {
        console.error(`  ⚠️ Email delivery failed for ${cleanEmail}:`, emailErr.message);
      }

      results.created++;
      results.importedMembers.push({
        name: fullName,
        email: cleanEmail,
        password: temporaryPassword,
        businessName,
        membershipId,
        membershipPlan,
        chapter: chapterDoc.name,
        emailSent,
      });

      console.log(`  ✓ Successfully provisioned: Member ID ${membershipId}`);
    } catch (err) {
      console.error(`  ✗ Error processing row ${rowNumber}:`, err.message);
      results.errors.push({ rowNumber, email: cleanEmail, error: err.message });
    }
  }

  console.log("\n=======================================================");
  console.log("                 IMPORT SUMMARY REPORT                 ");
  console.log("=======================================================");
  console.log(`Total Rows Analyzed:   ${results.total}`);
  console.log(`Successfully Created:  ${results.created}`);
  console.log(`Skipped (Duplicates):  ${results.skipped}`);
  console.log(`Errors Encountered:    ${results.errors.length}`);
  console.log("=======================================================\n");

  if (results.importedMembers.length > 0) {
    console.log("PROVISIONED MEMBER CREDENTIALS:");
    console.table(
      results.importedMembers.map((m) => ({
        "Full Name": m.name,
        Email: m.email,
        "Temporary Password": m.password,
        "Business Name": m.businessName,
        "Membership ID": m.membershipId,
        Chapter: m.chapter,
        "Email Sent": m.emailSent ? "YES" : "NO",
      }))
    );
  }

  await disconnectDatabase();
  console.log("\nProcess completed successfully.");
}

runImport().catch((err) => {
  console.error("Fatal Error running import:", err);
  process.exit(1);
});
