import dns from 'dns'; dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import dotenv from 'dotenv'; dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);
const { User } = await import('../src/modules/users/user.model.js');
const { Business } = await import('../src/modules/businesses/business.model.js');
const { Verification } = await import('../src/modules/verification/verification.model.js');
const { Chapter } = await import('../src/modules/chapters/chapter.model.js');
const { getChapterFilter } = await import('../src/shared/utils/chapter-scope.js');
const { verificationService } = await import('../src/modules/verification/verification.service.js');

const usaUser = await User.findOne({ email: 'usa@gmail.com' }).lean();
console.log('usa@gmail.com in DB:', {
  _id: usaUser?._id,
  role: usaUser?.role,
  country: usaUser?.country,
  countryId: usaUser?.countryId,
  countryCode: usaUser?.countryCode
});

const usaBizs = await Business.find({
  $or: [{ country: /United States/i }, { country: /USA/i }, { countryId: usaUser?.countryId }]
}).lean();
console.log('\nUSA Businesses in DB count:', usaBizs.length);
usaBizs.forEach(b => console.log(' - Biz:', b.name, 'country:', b.country, 'countryId:', b.countryId, 'verification:', b.verification, 'chapter:', b.chapter, 'chapterId:', b.chapterId));

const verifs = await Verification.find().populate('business').lean();
console.log('\nTotal Verifications in DB:', verifs.length);
verifs.forEach(v => console.log(' - Verif:', v._id, 'biz:', v.business?.name, 'country:', v.business?.country, 'countryId:', v.business?.countryId, 'status:', v.status));

const usaQueue = await verificationService.listVerifications({ country: usaUser?.country }, usaUser);
console.log('\nUSA Admin listVerifications result:', {
  count: usaQueue.verifications?.length,
  total: usaQueue.meta?.total
});
console.log('USA Admin verifications items:', usaQueue.verifications.map(v => ({ id: v._id, biz: v.business?.name, country: v.business?.country })));

const scope = await getChapterFilter(usaUser, 'business_ref');
console.log('\nusaUser getChapterFilter(business_ref):', scope);

const chapters = await Chapter.find({ $or: [{ countryId: usaUser?.countryId }, { country: /United States/i }] }).lean();
console.log('\nUSA Chapters in DB:', chapters.map(c => ({ name: c.name, country: c.country, countryId: c.countryId })));

await mongoose.disconnect();
