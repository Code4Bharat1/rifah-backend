import mongoose from 'mongoose';
import { chapterService } from './src/modules/chapters/chapter.service.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    try {
      const details = await chapterService.getChapterDetails("6aab6d61504e19d5003c4a02", { role: 'central_admin' });
      console.log("Details found:", Object.keys(details));
    } catch (err) {
      console.error("Error fetching details:", err);
    }
    
    process.exit(0);
  });
