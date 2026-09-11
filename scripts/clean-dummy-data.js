import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Review } from "../src/modules/reviews/review.model.js";
import { Lead } from "../src/modules/leads/lead.model.js";
import { Enquiry } from "../src/modules/enquiries/enquiry.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const cleanAllDummyData = async () => {
  try {
    console.log("🧹 Running wipe of all dummy data...");

    // 1. Remove all dummy businesses
    const bizRes = await Business.deleteMany({});
    console.log(`✅ Deleted ${bizRes.deletedCount} businesses.`);

    // 2. Remove all dummy catalogue items (products/services)
    const catRes = await Catalogue.deleteMany({});
    console.log(`✅ Deleted ${catRes.deletedCount} catalogue items.`);

    // 3. Remove all dummy reviews
    const revRes = await Review.deleteMany({});
    console.log(`✅ Deleted ${revRes.deletedCount} reviews.`);

    // 4. Remove all dummy events
    const evtRes = await Event.deleteMany({});
    console.log(`✅ Deleted ${evtRes.deletedCount} events.`);

    // 5. Remove all dummy leads & enquiries
    const leadRes = await Lead.deleteMany({});
    const enqRes = await Enquiry.deleteMany({});
    console.log(`✅ Deleted ${leadRes.deletedCount} leads and ${enqRes.deletedCount} enquiries.`);

    // 6. Remove all dummy notifications
    const notifRes = await Notification.deleteMany({});
    console.log(`✅ Deleted ${notifRes.deletedCount} notifications.`);

    // 7. Remove all non-admin dummy users (keep secretariat and admins)
    const userRes = await User.deleteMany({
      email: { $nin: ["secretariat@rifah.org", "admin@rifah.org"] },
      role: { $in: ["member", "business_owner"] },
    });
    console.log(`✅ Deleted ${userRes.deletedCount} dummy member users.`);

    // 8. Reset chapter stats (businessCount = 0, memberCount = 0, eventCount = 0)
    await Chapter.updateMany(
      {},
      {
        $set: {
          businessesCount: 0,
          membersCount: 0,
          eventsCount: 0,
        },
      }
    );
    console.log("✅ Reset chapter counters to 0.");

    // 9. Clean dummy upload files if any exist
    const uploadsDir = path.resolve(__dirname, "../uploads");
    const subdirs = ["covers", "logos", "catalogue", "documents", "avatars"];
    for (const sub of subdirs) {
      const folderPath = path.join(uploadsDir, sub);
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
          if (file !== ".gitkeep") {
            try {
              fs.unlinkSync(path.join(folderPath, file));
            } catch (e) {
              // ignore
            }
          }
        }
        console.log(`✅ Cleaned uploads/${sub} directory.`);
      }
    }

    console.log("\n🎉 ALL DUMMY DATA AND IMAGES SUCCESSFULLY REMOVED!");
    return true;
  } catch (error) {
    console.error("❌ Error cleaning dummy data:", error);
    return false;
  }
};

