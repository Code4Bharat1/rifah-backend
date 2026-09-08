import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { cloudinaryService } from "../src/infrastructure/storage/cloudinary.service.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Verification } from "../src/modules/verification/verification.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUploadDir = path.resolve(__dirname, `../${env.STORAGE.UPLOAD_DIR}`);

const uploadLocalPathToCloudinary = async (rawPath, folder) => {
  if (!rawPath || typeof rawPath !== "string") return rawPath;
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://") || rawPath.startsWith("data:")) {
    return rawPath; // Already remote or Cloudinary URL
  }

  // Clean local relative path
  const cleanRelative = rawPath.replace(new RegExp(`^/?${env.STORAGE.UPLOAD_DIR}/?`), "");
  const fullDiskPath = path.join(baseUploadDir, cleanRelative);

  if (fs.existsSync(fullDiskPath)) {
    try {
      console.log(`📤 Uploading to Cloudinary [${folder}]: ${path.basename(fullDiskPath)}...`);
      const result = await cloudinaryService.upload(fullDiskPath, {
        folder: `rifah/${folder}`,
        resource_type: "auto",
      });
      console.log(`   ✅ Success: ${result.secure_url}`);
      return result.secure_url;
    } catch (err) {
      console.error(`   ❌ Failed to upload ${fullDiskPath} to Cloudinary:`, err.message);
      return rawPath;
    }
  } else {
    console.warn(`   ⚠️ File not found on disk: ${fullDiskPath}`);
    return rawPath;
  }
};

const runMigration = async () => {
  try {
    if (!cloudinaryService.isConfigured()) {
      console.error("❌ Cloudinary is not configured! Please check your CLOUDINARY_CLOUD_NAME, API_KEY, and API_SECRET in .env");
      process.exit(1);
    }

    console.log("🔗 Connecting to MongoDB Atlas...");
    await mongoose.connect(env.DATABASE.URI);
    console.log("✅ MongoDB Connected.\n");

    // 1. Migrate Businesses (Logo, Cover, Gallery, Certifications)
    const businesses = await Business.find({});
    console.log(`🏢 Found ${businesses.length} businesses to inspect.`);
    for (const b of businesses) {
      let changed = false;

      // Logo
      if (b.logo && !b.logo.startsWith("http")) {
        const newLogo = await uploadLocalPathToCloudinary(b.logo, "logos");
        if (newLogo !== b.logo) {
          b.logo = newLogo;
          changed = true;
        }
      }

      // Cover
      if (b.coverImage && !b.coverImage.startsWith("http")) {
        const newCover = await uploadLocalPathToCloudinary(b.coverImage, "covers");
        if (newCover !== b.coverImage) {
          b.coverImage = newCover;
          changed = true;
        }
      }

      // Gallery
      if (Array.isArray(b.gallery) && b.gallery.length > 0) {
        const updatedGallery = [];
        for (const item of b.gallery) {
          if (item && !item.startsWith("http")) {
            const newUrl = await uploadLocalPathToCloudinary(item, "gallery");
            updatedGallery.push(newUrl);
            if (newUrl !== item) changed = true;
          } else {
            updatedGallery.push(item);
          }
        }
        b.gallery = updatedGallery;
      }

      // Certifications
      if (Array.isArray(b.certifications) && b.certifications.length > 0) {
        const updatedCerts = [];
        for (const cert of b.certifications) {
          if (cert && !cert.startsWith("http")) {
            const newCert = await uploadLocalPathToCloudinary(cert, "certificates");
            updatedCerts.push(newCert);
            if (newCert !== cert) changed = true;
          } else {
            updatedCerts.push(cert);
          }
        }
        b.certifications = updatedCerts;
      }

      if (changed) {
        await b.save();
        console.log(`✨ Updated Business: "${b.name}" with Cloudinary URLs.`);
      }
    }

    // 2. Migrate Catalogue Items
    const catalogueItems = await Catalogue.find({});
    console.log(`\n📦 Found ${catalogueItems.length} catalogue items to inspect.`);
    for (const item of catalogueItems) {
      let changed = false;
      if (Array.isArray(item.images) && item.images.length > 0) {
        const updatedImages = [];
        for (const img of item.images) {
          if (img && !img.startsWith("http")) {
            const newUrl = await uploadLocalPathToCloudinary(img, "catalogue");
            updatedImages.push(newUrl);
            if (newUrl !== img) changed = true;
          } else {
            updatedImages.push(img);
          }
        }
        if (changed) {
          item.images = updatedImages;
          await item.save();
          console.log(`✨ Updated Catalogue Item: "${item.title}"`);
        }
      }
    }

    // 3. Migrate Events
    const events = await Event.find({});
    console.log(`\n📅 Found ${events.length} events to inspect.`);
    for (const ev of events) {
      if (ev.coverImage && !ev.coverImage.startsWith("http")) {
        const newCover = await uploadLocalPathToCloudinary(ev.coverImage, "covers");
        if (newCover !== ev.coverImage) {
          ev.coverImage = newCover;
          await ev.save();
          console.log(`✨ Updated Event: "${ev.title}"`);
        }
      }
    }

    // 4. Migrate Verification Documents
    const verifications = await Verification.find({});
    console.log(`\n🛡️ Found ${verifications.length} verification records to inspect.`);
    for (const verif of verifications) {
      let changed = false;
      if (Array.isArray(verif.documents) && verif.documents.length > 0) {
        for (const doc of verif.documents) {
          if (doc.fileUrl && !doc.fileUrl.startsWith("http")) {
            const newUrl = await uploadLocalPathToCloudinary(doc.fileUrl, "documents");
            if (newUrl !== doc.fileUrl) {
              doc.fileUrl = newUrl;
              changed = true;
            }
          }
        }
        if (changed) {
          await verif.save();
          console.log(`✨ Updated Verification Record ID: ${verif._id}`);
        }
      }
    }

    console.log("\n🎉 Migration to Cloudinary completed successfully!");
    console.log("All existing photos and documents in MongoDB are now permanent Cloudinary CDN URLs!");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  }
};

runMigration();
