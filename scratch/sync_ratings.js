import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Review } from "../src/modules/reviews/review.model.js";

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected to MongoDB Atlas");

  const businesses = await Business.find({});
  console.log(`Found ${businesses.length} businesses. Syncing reviews & ratings...`);

  for (const b of businesses) {
    const reviews = await Review.find({
      business: b._id,
      status: { $in: ["approved", "published", "pending"] },
    });
    const count = reviews.length;
    let avg = 0;
    if (count > 0) {
      const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      avg = Number((sum / count).toFixed(1));
    }

    await Business.findByIdAndUpdate(b._id, {
      rating: avg,
      reviewsCount: count,
    });
    console.log(`- ${b.name}: reviews=${count}, rating=${avg}`);
  }

  console.log("Sync complete!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error syncing ratings:", err);
  process.exit(1);
});
