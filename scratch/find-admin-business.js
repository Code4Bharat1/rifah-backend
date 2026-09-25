import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import { User } from '../src/modules/users/user.model.js';
import { Business } from '../src/modules/businesses/business.model.js';

await mongoose.connect(MONGODB_URI);
console.log('Connected to DB\n');

// Find all admin-role users
const admins = await User.find({
  role: { $in: ['central_admin', 'state_admin', 'chapter_admin'] }
}).select('_id name email role chapter state previousRole').lean();

console.log(`Total admin users: ${admins.length}\n`);

let found = 0;
for (const admin of admins) {
  const biz = await Business.findOne({ owner: admin._id })
    .select('_id name slug verification membership status')
    .lean();

  if (biz) {
    found++;
    console.log('============ ADMIN + BUSINESS OWNER ============');
    console.log('User ID    :', String(admin._id));
    console.log('Name       :', admin.name);
    console.log('Email      :', admin.email);
    console.log('Admin Role :', admin.role);
    console.log('Chapter    :', admin.chapter || 'N/A');
    console.log('State      :', admin.state || 'N/A');
    console.log('prevRole   :', admin.previousRole || 'N/A');
    console.log('Business ID:', String(biz._id));
    console.log('Biz Name   :', biz.name);
    console.log('Biz Slug   :', biz.slug);
    console.log('Membership :', biz.membership || 'N/A');
    console.log('Verification:', biz.verification);
    console.log('Biz Status :', biz.status);
    console.log('=================================================\n');
  }
}

if (found === 0) {
  console.log('No admin users with a registered business found.\n');
  console.log('--- All businesses and owner roles ---');
  const allBiz = await Business.find({}).populate('owner', 'name email role').limit(30).lean();
  for (const b of allBiz) {
    if (b.owner) {
      console.log(`Biz: ${b.name?.padEnd(30)} | Role: ${b.owner.role?.padEnd(15)} | Email: ${b.owner.email}`);
    }
  }
  
  console.log('\n--- All admin users ---');
  for (const admin of admins) {
    console.log(`Name: ${admin.name?.padEnd(25)} | Role: ${admin.role?.padEnd(15)} | Email: ${admin.email}`);
  }
}

await mongoose.disconnect();
process.exit(0);
