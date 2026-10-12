import mongoose from "mongoose";

const normalize = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").toLowerCase();

const connect = async () => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/rifah_db";
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);
};

const dedupeCategories = async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is not active");

  const collection = db.collection("categories");

  try {
    await collection.dropIndex("name_1").catch(() => {});
  } catch {}

  const duplicates = await collection
    .aggregate([
      {
        $addFields: {
          normalizedName: { $toLower: { $trim: { input: "$name" } } },
        },
      },
      {
        $group: {
          _id: "$normalizedName",
          docs: { $push: { _id: "$_id", name: "$name", slug: "$slug" } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const dup of duplicates) {
    const docs = dup.docs.sort((a, b) =>
      String(a._id).localeCompare(String(b._id)),
    );
    const keep = docs[0];
    for (const doc of docs.slice(1)) {
      await collection.deleteOne({ _id: doc._id });
      console.log(
        `Deleted duplicate category: ${doc.name} (${doc.slug}) keeping ${keep.name}`,
      );
    }
  }

  try {
    await collection.createIndex(
      { name: 1 },
      {
        unique: true,
        collation: { locale: "en", strength: 2 },
        background: true,
      },
    );
    console.log("Recreated unique case-insensitive index on category names");
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
    const names = await collection
      .aggregate([
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$name" } } },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    if (names.length) {
      throw new Error(
        `Duplicate category names still remain after cleanup: ${JSON.stringify(names)}`,
      );
    }
    throw error;
  }
};

const main = async () => {
  await connect();
  await dedupeCategories();
  console.log("Category duplicate cleanup complete");
};

main()
  .catch((error) => {
    console.error("Category cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
