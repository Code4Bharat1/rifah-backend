import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function deleteUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await mongoose.connection.collection('users').deleteMany({
      email: { $in: ['azeemahmad5226@gmail.com', 'azeemtech5226@gmail.com'] }
    });
    console.log('Deleted users:', result.deletedCount);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

deleteUsers();
