import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

import { Business } from "./src/modules/businesses/business.model.js";
import { User } from "./src/modules/users/user.model.js";
import { Chapter } from "./src/modules/chapters/chapter.model.js";
import { Verification } from "./src/modules/verification/verification.model.js";

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/rifah";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // Find the Nashik chapter
    let chapter = await Chapter.findOne({ name: { $regex: /nashik/i } });
    if (!chapter) {
      console.log("Nashik chapter not found, creating one...");
      chapter = await Chapter.create({
        name: "Nashik",
        city: "Nashik",
        state: "Maharashtra",
        status: "Active",
      });
    }

    // Find an existing user to own the businesses
    let owner = await User.findOne({ email: "nashik.test@example.com" });
    if (!owner) {
      owner = await User.findOne();
    }
    
    if (!owner) {
      throw new Error("No users found in database to assign as owner.");
    }

    console.log(`Using Chapter: ${chapter.name} (${chapter._id})`);
    console.log(`Using Owner: ${owner.name} (${owner._id})`);

    // Create 3 test businesses with different verification statuses
    const businesses = [
      {
        name: "Nashik Agro Industries",
        slug: "nashik-agro-industries-test",
        industry: "Agriculture",
        businessType: "Private Limited",
        city: "Nashik",
        state: "Maharashtra",
        chapter: chapter.name,
        chapterId: chapter._id,
        owner: owner._id,
        verification: "pending",
        status: "Pending Verification",
        ownerEmail: owner.email,
        email: "info@nashikagro.test",
        phone: "8888888888",
        about: "Leading agro processing unit in Nashik.",
      },
      {
        name: "Godavari Tech Solutions",
        slug: "godavari-tech-solutions-test",
        industry: "Technology",
        businessType: "Partnership",
        city: "Nashik",
        state: "Maharashtra",
        chapter: chapter.name,
        chapterId: chapter._id,
        owner: owner._id,
        verification: "under_review",
        status: "Pending Verification",
        ownerEmail: owner.email,
        email: "contact@godavaritech.test",
        phone: "7777777777",
        about: "Innovative tech solutions for local businesses.",
      },
      {
        name: "Nashik Vintners",
        slug: "nashik-vintners-test",
        industry: "Food & Beverage",
        businessType: "Proprietorship",
        city: "Nashik",
        state: "Maharashtra",
        chapter: chapter.name,
        chapterId: chapter._id,
        owner: owner._id,
        verification: "unverified",
        status: "Active",
        ownerEmail: owner.email,
        email: "hello@nashikvintners.test",
        phone: "6666666666",
        about: "Premium local produce and beverages.",
      }
    ];

    for (const b of businesses) {
      const existing = await Business.findOne({ slug: b.slug });
      let bizDoc;
      if (!existing) {
        bizDoc = await Business.create(b);
        console.log(`Created business: ${b.name} (${b.verification})`);
      } else {
        existing.verification = b.verification;
        existing.status = b.status;
        existing.chapter = chapter.name;
        existing.chapterId = chapter._id;
        await existing.save();
        bizDoc = existing;
        console.log(`Updated existing business: ${b.name}`);
      }
      
      // Create Verification document if it's pending or under review
      if (bizDoc.verification === "pending" || bizDoc.verification === "under_review") {
        const existingVer = await Verification.findOne({ business: bizDoc._id });
        if (!existingVer) {
          await Verification.create({
            business: bizDoc._id,
            submittedBy: owner._id,
            status: bizDoc.verification,
            documents: [
              {
                type: "GST Certificate",
                name: "gst-certificate-mock.pdf",
                number: "27ABCDE1234F1Z5",
                fileUrl: "mock-url-gst.pdf",
                status: "pending"
              },
              {
                type: "Pan Card",
                name: "pan-card-mock.pdf",
                number: "ABCDE1234F",
                fileUrl: "mock-url-pan.pdf",
                status: "pending"
              }
            ],
            remarks: "Test submission for Chapter Admin",
          });
          console.log(`Created Verification doc for ${b.name}`);
        } else {
          existingVer.status = bizDoc.verification;
          await existingVer.save();
          console.log(`Updated Verification doc for ${b.name}`);
        }
      }
    }

    console.log("Seeding complete.");
  } catch (err) {
    console.error("Error seeding:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
