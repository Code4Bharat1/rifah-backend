import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Enquiry = mongoose.model('Enquiry', new mongoose.Schema({}, { strict: false }), 'enquiries');
    
    const userUpdate = await User.updateMany(
      { chapter: 'mumbai' },
      { $set: { chapter: 'Mumbai Chapter' } }
    );
    console.log('User update result:', userUpdate);

    const enquiryUpdate = await Enquiry.updateMany(
      { chapter: 'mumbai' },
      { $set: { chapter: 'Mumbai Chapter' } }
    );
    console.log('Enquiry update result:', enquiryUpdate);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
