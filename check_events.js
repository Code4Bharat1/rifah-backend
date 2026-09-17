import mongoose from 'mongoose';
import { Event } from './src/modules/events/event.model.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const events = await Event.find().sort({ createdAt: -1 }).limit(3);
  console.log("Recent Events:");
  events.forEach(e => {
    console.log(`Title: ${e.title}`);
    console.log(`Audience:`, e.targetAudience);
    console.log(`States:`, e.targetStates);
    console.log(`Chapters:`, e.targetChapters);
    console.log(`Status:`, e.status);
    console.log('---');
  });
  mongoose.disconnect();
}
check();
