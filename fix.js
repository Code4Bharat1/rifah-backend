import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Event from './src/modules/events/event.model.js';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const res = await Event.updateMany({ status: 'Pending Approval' }, { $set: { status: 'Upcoming' } });
  console.log('Updated events:', res);
  process.exit(0);
});
