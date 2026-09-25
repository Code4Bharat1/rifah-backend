import mongoose from 'mongoose';

mongoose.connect('mongodb+srv://khandarevishwajeet4:khandare123@cluster0.letgjbr.mongodb.net')
  .then(async () => {
    const db = mongoose.connection.db;
    const Business = db.collection('businesses');
    const bResult = await Business.updateOne(
        { userId: new mongoose.Types.ObjectId('6aa28b352048ef20cba96252') },
        { $set: { chapter: 'Mumbai Chapter', chapterId: null } }
    );
    console.log('Business update result:', bResult);
    process.exit(0);
  });
