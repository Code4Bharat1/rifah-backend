import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

const eventSchema = new mongoose.Schema({}, { strict: false, collection: 'events' });
const Event = mongoose.model('Event', eventSchema);

async function checkGuestRegistration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/rifah");
    
    const users = await User.find({ role: 'customer' }).lean();
    if (users.length === 0) {
      console.log('No guest user found.');
      return;
    }

    for (const user of users) {
      console.log('-------------------------');
      console.log('Guest User ID:', user._id.toString(), 'Email:', user.email);

      const events = await Event.find({ 'registeredUsers.user': user._id }).lean();
      console.log(`User is registered for ${events.length} events.`);

      for (const event of events) {
        console.log(`- ${event.title} (${event._id.toString()})`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

checkGuestRegistration().catch(console.error);
