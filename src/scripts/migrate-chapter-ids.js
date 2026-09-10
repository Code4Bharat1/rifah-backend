/**
 * One-off backfill: populate chapterId (ObjectId ref -> Chapter) on Business, User and Enquiry
 * documents that only have the legacy free-text `chapter` name string.
 *
 * Run manually against a DB (take a backup first):
 *   node src/scripts/migrate-chapter-ids.js
 */
import { connectDatabase, disconnectDatabase } from "../infrastructure/database/mongoose.js";
import { Chapter } from "../modules/chapters/chapter.model.js";
import { User } from "../modules/users/user.model.js";
import { Business } from "../modules/businesses/business.model.js";
import { Enquiry } from "../modules/enquiries/enquiry.model.js";

const normalize = (name) => name.replace(/\b(chapter|chamber)\b/gi, "").trim();

const buildChapterLookup = (chapters) => {
  const byNormalizedName = new Map();
  for (const chapter of chapters) {
    byNormalizedName.set(normalize(chapter.name).toLowerCase(), chapter);
  }
  return (chapterNameText) => {
    if (!chapterNameText || typeof chapterNameText !== "string") return null;
    const needle = normalize(chapterNameText).toLowerCase();
    if (!needle) return null;

    if (byNormalizedName.has(needle)) return byNormalizedName.get(needle);

    // Fallback: substring match either direction (handles "Mumbai" vs "Mumbai Chapter" vs typos in casing)
    for (const [key, chapter] of byNormalizedName.entries()) {
      if (key.includes(needle) || needle.includes(key)) return chapter;
    }
    return null;
  };
};

const migrateCollection = async (Model, label) => {
  const docs = await Model.find({
    chapter: { $exists: true, $ne: "" },
    chapterId: { $in: [null, undefined] },
  }).select("_id chapter");

  const chapters = await Chapter.find({});
  const resolveChapter = buildChapterLookup(chapters);

  let matched = 0;
  let unmatched = 0;
  for (const doc of docs) {
    const chapter = resolveChapter(doc.chapter);
    if (chapter) {
      await Model.updateOne({ _id: doc._id }, { $set: { chapterId: chapter._id } });
      matched += 1;
    } else {
      unmatched += 1;
      console.warn(`[${label}] Could not resolve chapter for _id=${doc._id}, chapter="${doc.chapter}"`);
    }
  }

  console.log(`[${label}] Backfilled ${matched} document(s), left ${unmatched} unmatched (chapterId stays null).`);
};

const run = async () => {
  await connectDatabase();
  try {
    await migrateCollection(Business, "Business");
    await migrateCollection(User, "User");
    await migrateCollection(Enquiry, "Enquiry");
  } finally {
    await disconnectDatabase();
  }
};

run()
  .then(() => {
    console.log("Chapter ID migration complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Chapter ID migration failed:", err);
    process.exit(1);
  });
