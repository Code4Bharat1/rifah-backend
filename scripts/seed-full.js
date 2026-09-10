/**
 * Full database reset + comprehensive dummy data seed.
 * Wipes every collection, then repopulates all of them with realistic,
 * cross-referenced data across every module (chapters, users of every role,
 * businesses, catalogue, events, memberships, plans, reviews, categories,
 * enquiries/leads exercising the chapter-routing + escalation flow,
 * payments, notifications, announcements, verification, messages, audit).
 *
 * Run: node scripts/seed-full.js
 */
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { generateSlug, generateReferenceId } from "../src/shared/utils/generate-id.js";
import { addDays } from "../src/shared/utils/date.js";
import { ROLES } from "../src/shared/constants/roles.js";

import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Category } from "../src/modules/categories/category.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { Plan } from "../src/modules/memberships/plan.model.js";
import { Review } from "../src/modules/reviews/review.model.js";
import { Enquiry } from "../src/modules/enquiries/enquiry.model.js";
import { Lead } from "../src/modules/leads/lead.model.js";
import { Payment } from "../src/modules/payments/payment.model.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { Announcement } from "../src/modules/announcements/announcement.model.js";
import { Verification } from "../src/modules/verification/verification.model.js";
import { Message } from "../src/modules/messages/message.model.js";
import { Audit } from "../src/modules/audit/audit.model.js";
import { Settings } from "../src/modules/settings/settings.model.js";

const run = async () => {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.DATABASE.URI);

  console.log("Dropping database (full wipe)...");
  await mongoose.connection.dropDatabase();

  const pwHash = await hashPassword("User@123456");
  const adminPwHash = await hashPassword("12345678");

  // ---------------------------------------------------------------------
  // 1. Settings (global singleton)
  // ---------------------------------------------------------------------
  console.log("Seeding Settings...");
  await Settings.create({ isSingleton: "global" });

  // ---------------------------------------------------------------------
  // 2. Chapters
  // ---------------------------------------------------------------------
  console.log("Seeding Chapters...");
  const chapterDefs = [
    {
      name: "Mumbai Chapter", city: "Mumbai", state: "Maharashtra", lead: "Tariq Farooqi",
      units: [
        { name: "Trade Facilitation Unit", focus: "Cross-border trade & customs guidance", membersCount: 18, status: "Active" },
        { name: "Digital Adoption Cell", focus: "Cloud onboarding, ERP & digital payments", membersCount: 12, status: "Active" },
      ],
    },
    {
      name: "Delhi NCR Chapter", city: "Delhi", state: "Delhi", lead: "Rashid Kamal",
      units: [
        { name: "Policy Advocacy & Liaison", focus: "Chamber representation with ministries", membersCount: 8, status: "Active" },
      ],
    },
    {
      name: "Hyderabad Chapter", city: "Hyderabad", state: "Telangana", lead: "Ayesha Siddiqui",
      units: [
        { name: "IT & Startup Accelerator", focus: "Tech scaling and angel connects", membersCount: 14, status: "Active" },
      ],
    },
    {
      name: "Bengaluru Chapter", city: "Bengaluru", state: "Karnataka", lead: "Kiran Rao",
      units: [
        { name: "SaaS & Product Guild", focus: "B2B SaaS go-to-market support", membersCount: 20, status: "Active" },
      ],
    },
    {
      name: "Pune Chapter", city: "Pune", state: "Maharashtra", lead: "Sameer Joshi",
      units: [
        { name: "Auto & Manufacturing Cluster", focus: "Component sourcing & vendor development", membersCount: 16, status: "Active" },
      ],
    },
  ];

  const chapters = await Chapter.insertMany(
    chapterDefs.map((c) => ({ ...c, slug: generateSlug(c.name), status: "Active" }))
  );
  const chapterByCity = Object.fromEntries(chapters.map((c) => [c.city, c]));

  // ---------------------------------------------------------------------
  // 3. Categories
  // ---------------------------------------------------------------------
  console.log("Seeding Categories...");
  const categoryDefs = [
    { name: "IT & Software Services", parent: "Technology", icon: "laptop" },
    { name: "Industrial Machinery & Tools", parent: "Manufacturing", icon: "cog" },
    { name: "Food & Spices Export", parent: "Trading & Export", icon: "utensils" },
    { name: "Solar & Clean Energy", parent: "Green Tech", icon: "sun" },
    { name: "Fintech & Advisory", parent: "Financial Services", icon: "briefcase" },
    { name: "Textiles & Apparel", parent: "Manufacturing", icon: "tshirt" },
    { name: "Healthcare & Pharmaceuticals", parent: "Healthcare", icon: "heart" },
    { name: "Logistics & Supply Chain", parent: "Logistics", icon: "truck" },
  ];
  const categories = await Category.insertMany(
    categoryDefs.map((c) => ({ name: c.name, slug: generateSlug(c.name), parent: c.parent, icon: c.icon, businessCount: 2, status: "Active" }))
  );

  // ---------------------------------------------------------------------
  // 4. Plans
  // ---------------------------------------------------------------------
  console.log("Seeding Plans...");
  await Plan.insertMany([
    { planId: "free", name: "Free", price: 0, priceUsd: 0, summary: "Get started on RIFAH Connect", features: ["Directory listing", "Basic search", "5 leads / mo"] },
    { planId: "basic", name: "Basic", price: 4999, priceUsd: 59, summary: "For growing businesses", features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
    { planId: "premium", name: "Premium", price: 12999, priceUsd: 159, summary: "For established businesses", features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
    { planId: "enterprise", name: "Enterprise", price: 29999, priceUsd: 359, summary: "For market leaders", features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] },
  ]);

  // ---------------------------------------------------------------------
  // 5. Users: super admin, secretariat, chapter admins, business owners, customers
  // ---------------------------------------------------------------------
  console.log("Seeding Users...");

  const superAdmin = await User.create({
    name: "RIFAH Super Admin", email: "admin@gmail.com", passwordHash: adminPwHash,
    phone: "+91 22 2345 6789", role: ROLES.SUPER_ADMIN, status: "Active",
  });

  const secretariat = await User.create({
    name: "RIFAH Secretariat", email: "secretariat@rifah.org", passwordHash: adminPwHash,
    phone: "+91 22 2345 6790", role: ROLES.SECRETARIAT, status: "Active",
  });

  const chapterAdmins = [];
  for (const chapter of chapters) {
    const admin = await User.create({
      name: `${chapter.lead}`,
      email: `admin.${chapter.slug}@rifah.org`,
      passwordHash: pwHash,
      phone: "+91 98" + Math.floor(10000000 + Math.random() * 89999999),
      role: ROLES.CHAPTER_ADMIN,
      chapter: chapter.name,
      chapterId: chapter._id,
      city: chapter.city,
      status: "Active",
    });
    chapterAdmins.push(admin);
  }

  const businessOwnerDefs = [
    { name: "Zameer Qureshi", city: "Mumbai", biz: "Al-Ameen Industrial Machinery Ltd.", industry: "Manufacturing", category: "Industrial Machinery & Tools", tier: "Enterprise" },
    { name: "Irfan Merchant", city: "Mumbai", biz: "Barakah Agro & Spices Export", industry: "Trading & Export", category: "Food & Spices Export", tier: "Premium" },
    { name: "Rahul Gupta", city: "Delhi", biz: "Gupta Textiles & Apparel Co.", industry: "Manufacturing", category: "Textiles & Apparel", tier: "Basic" },
    { name: "Neha Malhotra", city: "Delhi", biz: "Malhotra Logistics Network", industry: "Logistics", category: "Logistics & Supply Chain", tier: "Premium" },
    { name: "Farhan Ansari", city: "Hyderabad", biz: "Crescent Enterprise Solutions", industry: "Technology", category: "IT & Software Services", tier: "Basic" },
    { name: "Priya Reddy", city: "Hyderabad", biz: "Reddy Pharma Distributors", industry: "Healthcare", category: "Healthcare & Pharmaceuticals", tier: "Enterprise" },
    { name: "Karthik Iyer", city: "Bengaluru", biz: "Iyer SaaS Labs", industry: "Technology", category: "IT & Software Services", tier: "Premium" },
    { name: "Ananya Rao", city: "Bengaluru", biz: "Rao Solar Solutions", industry: "Green Tech", category: "Solar & Clean Energy", tier: "Basic" },
    { name: "Suresh Deshmukh", city: "Pune", biz: "Deshmukh Auto Components", industry: "Manufacturing", category: "Industrial Machinery & Tools", tier: "Premium" },
    { name: "Meera Kulkarni", city: "Pune", biz: "Kulkarni Fintech Advisors", industry: "Financial Services", category: "Fintech & Advisory", tier: "Free" },
  ];

  const owners = [];
  for (const def of businessOwnerDefs) {
    const chapter = chapterByCity[def.city];
    const emailSafe = def.name.toLowerCase().replace(/\s+/g, ".");
    const owner = await User.create({
      name: def.name,
      email: `${emailSafe}@example.com`,
      passwordHash: pwHash,
      phone: "+91 97" + Math.floor(10000000 + Math.random() * 89999999),
      role: ROLES.BUSINESS_OWNER,
      chapter: chapter.name,
      chapterId: chapter._id,
      city: def.city,
      status: "Active",
    });
    owners.push({ user: owner, ...def, chapter });
  }

  const customerDefs = [
    { name: "Bilal Sheikh", city: "Mumbai" },
    { name: "Sana Khan", city: "Delhi" },
    { name: "Vikram Nair", city: "Hyderabad" },
    { name: "Divya Menon", city: "Bengaluru" },
    { name: "Arjun Patil", city: "Pune" },
  ];
  const customers = [];
  for (const def of customerDefs) {
    const chapter = chapterByCity[def.city];
    const emailSafe = def.name.toLowerCase().replace(/\s+/g, ".");
    const customer = await User.create({
      name: def.name,
      email: `${emailSafe}@example.com`,
      passwordHash: pwHash,
      phone: "+91 96" + Math.floor(10000000 + Math.random() * 89999999),
      role: ROLES.CUSTOMER,
      chapter: chapter.name,
      chapterId: chapter._id,
      city: def.city,
      status: "Active",
    });
    customers.push({ user: customer, city: def.city, chapter });
  }

  console.log(`Seeded ${1 + 1 + chapterAdmins.length + owners.length + customers.length} Users`);

  // ---------------------------------------------------------------------
  // 6. Businesses
  // ---------------------------------------------------------------------
  console.log("Seeding Businesses...");
  const accents = ["from-blue-600 to-indigo-800", "from-emerald-600 to-teal-800", "from-purple-600 to-indigo-900", "from-amber-600 to-orange-800", "from-rose-600 to-pink-800"];
  const businesses = [];
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    const slug = generateSlug(o.biz);
    const business = await Business.create({
      name: o.biz,
      slug,
      tagline: `Trusted ${o.category.toLowerCase()} partner based in ${o.city}`,
      about: `${o.biz} is a RIFAH-verified member providing ${o.category.toLowerCase()} solutions across India, serving domestic and export markets with certified quality standards.`,
      industry: o.industry,
      categories: [o.category],
      businessType: "Private Limited",
      city: o.city,
      state: o.chapter.state,
      address: `${100 + i} Business Park Road`,
      pincode: "400001",
      chapter: o.chapter.name,
      chapterId: o.chapter._id,
      membership: o.tier,
      verification: "verified",
      rating: Number((4.2 + Math.random() * 0.7).toFixed(1)),
      reviewsCount: 0,
      employees: "10–50",
      founded: String(2008 + i),
      website: `https://${slug.replace(/-/g, "")}.example.com`,
      phone: o.user.phone,
      email: o.user.email,
      featured: i % 3 === 0,
      accent: accents[i % accents.length],
      status: "Active",
      owner: o.user._id,
    });
    businesses.push({ doc: business, ...o });
  }
  console.log(`Seeded ${businesses.length} Businesses`);

  // ---------------------------------------------------------------------
  // 7. Catalogue items (1-2 per business)
  // ---------------------------------------------------------------------
  console.log("Seeding Catalogue items...");
  const catalogueDocs = [];
  for (const b of businesses) {
    const item = await Catalogue.create({
      name: `${b.biz} — Flagship ${b.industry === "Technology" ? "Service" : "Product"} Offering`,
      slug: generateSlug(`${b.biz}-flagship-offering`),
      business: b.doc._id,
      type: b.industry === "Technology" || b.industry === "Financial Services" ? "Service" : "Product",
      category: b.category,
      description: `Flagship ${b.category.toLowerCase()} offering from ${b.biz}, available for bulk and export orders.`,
      city: b.city,
      moq: "As per requirement",
      price: "On Request",
      status: "Active",
    });
    catalogueDocs.push(item);
  }
  console.log(`Seeded ${catalogueDocs.length} Catalogue items`);

  // ---------------------------------------------------------------------
  // 8. Memberships (subscription record per business)
  // ---------------------------------------------------------------------
  console.log("Seeding Memberships...");
  const tierPrice = { Free: 0, Basic: 4999, Premium: 12999, Enterprise: 29999 };
  for (const b of businesses) {
    if (tierPrice[b.tier] === 0) continue;
    await Membership.create({
      business: b.doc._id,
      planId: b.tier.toLowerCase(),
      planName: b.tier,
      price: tierPrice[b.tier],
      startDate: new Date(),
      endDate: addDays(365),
      status: "Active",
      features: ["Directory listing", "Verified badge"],
    });
  }

  // ---------------------------------------------------------------------
  // 9. Reviews (customers reviewing businesses in their own chapter)
  // ---------------------------------------------------------------------
  console.log("Seeding Reviews...");
  let reviewCount = 0;
  for (const c of customers) {
    const localBiz = businesses.filter((b) => b.city === c.city);
    for (const b of localBiz) {
      await Review.create({
        business: b.doc._id,
        author: c.user._id,
        authorName: c.user.name,
        rating: 4 + Math.round(Math.random()),
        title: "Reliable partner, great communication",
        body: `Worked with ${b.biz} on a recent order — quality and turnaround were exactly as promised.`,
        status: "approved",
      });
      await Business.findByIdAndUpdate(b.doc._id, { $inc: { reviewsCount: 1 } });
      reviewCount++;
    }
  }
  console.log(`Seeded ${reviewCount} Reviews`);

  // ---------------------------------------------------------------------
  // 10. Events (2 per chapter)
  // ---------------------------------------------------------------------
  console.log("Seeding Events...");
  const events = [];
  for (const chapter of chapters) {
    const e1 = await Event.create({
      title: `${chapter.name.replace(" Chapter", "")} Business Summit 2026`,
      slug: generateSlug(`${chapter.name}-business-summit-2026`),
      summary: `Annual trade congregation for ${chapter.name} members — networking, B2B matchmaking, and policy briefings.`,
      date: "2026-11-15",
      time: "09:30 AM - 05:30 PM",
      venue: `${chapter.city} Convention Centre`,
      city: chapter.city,
      chapter: chapter.name,
      mode: "In-person",
      organizer: "RIFAH Central Secretariat",
      fee: "Complimentary for Members",
      seats: 200,
      registeredCount: Math.floor(Math.random() * 100),
      status: "Upcoming",
      agenda: [
        { time: "09:30 AM", title: "Keynote: Regional Trade Corridors", speaker: chapter.lead },
        { time: "02:00 PM", title: "B2B Matchmaking Sessions", speaker: "Chamber Trade Officers" },
      ],
    });
    const e2 = await Event.create({
      title: `${chapter.name.replace(" Chapter", "")} Digital Export Masterclass`,
      slug: generateSlug(`${chapter.name}-digital-export-masterclass`),
      summary: `Hands-on workshop for members on digital export readiness and ONDC onboarding.`,
      date: "2026-10-05",
      time: "03:00 PM - 06:00 PM",
      venue: "Virtual Chamber Webcast Room",
      city: chapter.city,
      chapter: chapter.name,
      mode: "Online",
      organizer: "Digital Adoption Cell",
      fee: "Free",
      seats: 150,
      registeredCount: Math.floor(Math.random() * 80),
      status: "Upcoming",
      agenda: [{ time: "03:00 PM", title: "Export Compliance & Standards" }],
    });
    events.push(e1, e2);
  }
  console.log(`Seeded ${events.length} Events`);

  // ---------------------------------------------------------------------
  // 11. Announcements (1 per chapter, authored by that chapter's admin)
  // ---------------------------------------------------------------------
  console.log("Seeding Announcements...");
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const admin = chapterAdmins[i];
    await Announcement.create({
      title: `Welcome to the ${chapter.name} Digital Directory`,
      message: `All verified members of ${chapter.name} are now listed on the RIFAH digital directory. Complete your business profile to start receiving buyer leads.`,
      status: "Published",
      chapter: chapter.name,
      author: admin._id,
      publishedAt: new Date(),
    });
  }

  // ---------------------------------------------------------------------
  // 12. Verification records (mixed statuses across a few businesses)
  // ---------------------------------------------------------------------
  console.log("Seeding Verification records...");
  const verificationStatuses = ["verified", "pending", "under_review", "correction_requested"];
  for (let i = 0; i < businesses.length; i++) {
    const b = businesses[i];
    const status = verificationStatuses[i % verificationStatuses.length];
    await Verification.create({
      business: b.doc._id,
      submittedBy: b.user._id,
      documents: [
        { type: "gst_tax_registration", name: "GST Certificate.pdf", fileUrl: "/uploads/dummy/gst-certificate.pdf", status: status === "verified" ? "verified" : "pending" },
        { type: "pan_card", name: "Business PAN.pdf", fileUrl: "/uploads/dummy/pan-card.pdf", status: status === "verified" ? "verified" : "pending" },
      ],
      status,
      remarks: status === "correction_requested" ? "Please re-upload a clearer scan of the GST certificate." : "",
      reviewedBy: status === "verified" ? superAdmin._id : undefined,
      reviewedAt: status === "verified" ? new Date() : undefined,
    });
  }

  // ---------------------------------------------------------------------
  // 13. Payments (one paid membership invoice per non-free business)
  // ---------------------------------------------------------------------
  console.log("Seeding Payments...");
  let paymentCount = 0;
  for (const b of businesses) {
    if (tierPrice[b.tier] === 0) continue;
    await Payment.create({
      invoiceNumber: `INV-${1000 + paymentCount}`,
      payer: b.user._id,
      business: b.doc._id,
      itemType: "Membership",
      description: `${b.tier} Membership Subscription (INR)`,
      amount: tierPrice[b.tier],
      currency: "INR",
      method: "Razorpay Online",
      status: "Paid",
      transactionId: `pay_dummy_${1000 + paymentCount}`,
      paidAt: new Date(),
    });
    paymentCount++;
  }
  console.log(`Seeded ${paymentCount} Payments`);

  // ---------------------------------------------------------------------
  // 14. Enquiries + Leads — exercise the chapter-routing/escalation feature
  // ---------------------------------------------------------------------
  console.log("Seeding Enquiries & Leads...");

  const makeTimeline = () => ([
    { label: "Enquiry submitted", at: "Just now", done: true },
    { label: "Routing to matching businesses", at: "Pending", done: false },
    { label: "Business responses", at: "Pending", done: false },
    { label: "Enquiry closed", at: "Pending", done: false },
  ]);

  const enquiries = [];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const localCategory = businesses.find((b) => b.city === c.city)?.category || "IT & Software Services";
    const enquiry = await Enquiry.create({
      referenceId: generateReferenceId("ENQ", 4),
      title: `Sourcing requirement — ${localCategory}`,
      requester: c.user._id,
      requesterName: c.user.name,
      requesterRole: "Verified Customer",
      targetType: "all",
      chapter: c.chapter.name,
      chapterId: c.chapter._id,
      category: localCategory,
      quantity: "Bulk order",
      budget: "Competitive / Market standard",
      location: c.city,
      requiredBy: "Within 30 days",
      description: `Looking for a verified ${localCategory.toLowerCase()} supplier based in or near ${c.city} for a recurring bulk order.`,
      status: "New",
      timeline: makeTimeline(),
    });
    enquiries.push({ doc: enquiry, chapter: c.chapter, city: c.city });
  }

  // One genuinely unassigned enquiry (location matches no configured chapter)
  const unassignedEnquiry = await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Sourcing requirement — Textiles & Apparel",
    requester: customers[0].user._id,
    requesterName: customers[0].user.name,
    requesterRole: "Verified Customer",
    targetType: "all",
    chapter: "Unassigned",
    chapterId: null,
    category: "Textiles & Apparel",
    quantity: "500 units",
    budget: "To be discussed",
    location: "Nagpur",
    requiredBy: "Within 45 days",
    description: "Looking for a textiles supplier — no RIFAH chapter covers this city yet.",
    status: "New",
    timeline: makeTimeline(),
  });

  // Route enquiry #0 (Mumbai) within-chapter by the Mumbai chapter admin
  const mumbaiChapterIdx = chapters.findIndex((c) => c.city === "Mumbai");
  const mumbaiAdmin = chapterAdmins[mumbaiChapterIdx];
  const mumbaiBiz = businesses.find((b) => b.city === "Mumbai");
  if (mumbaiBiz) {
    await Lead.create({ enquiry: enquiries[0].doc._id, business: mumbaiBiz.doc._id, status: "New" });
    enquiries[0].doc.status = "Routed";
    await enquiries[0].doc.save();
  }

  // Escalate enquiry #1 (Delhi) to Head Office, then route it to a business in another chapter
  const delhiEnquiry = enquiries[1];
  delhiEnquiry.doc.status = "Escalated";
  delhiEnquiry.doc.escalatedAt = new Date();
  delhiEnquiry.doc.escalatedBy = chapterAdmins[chapters.findIndex((c) => c.city === "Delhi")]._id;
  delhiEnquiry.doc.resolutionNote = "Escalating — need a supplier outside our chapter's network.";
  delhiEnquiry.doc.timeline.push({ label: "Escalated to Head Office by chapter admin", at: "Just now", done: true });
  await delhiEnquiry.doc.save();
  const hyderabadBiz = businesses.find((b) => b.city === "Hyderabad");
  if (hyderabadBiz) {
    await Lead.create({ enquiry: delhiEnquiry.doc._id, business: hyderabadBiz.doc._id, status: "New" });
    delhiEnquiry.doc.status = "Routed";
    await delhiEnquiry.doc.save();
  }

  // Leave the rest (#2, #3, #4) and the unassigned one as "New" — untouched, ready to test routing/escalation live
  console.log(`Seeded ${enquiries.length + 1} Enquiries (1 routed within-chapter, 1 escalated + routed by Head Office, ${enquiries.length - 2} untouched, 1 unassigned)`);

  // ---------------------------------------------------------------------
  // 15. Notifications (a few per a couple of users)
  // ---------------------------------------------------------------------
  console.log("Seeding Notifications...");
  let notifCount = 0;
  for (const b of businesses.slice(0, 4)) {
    await Notification.create({
      recipient: b.user._id,
      type: "Lead",
      title: "New Lead Assigned",
      body: `You have received a new lead matching your business: "Sourcing requirement".`,
      link: "/biz/leads",
      isRead: Math.random() > 0.5,
    });
    notifCount++;
  }
  for (const admin of chapterAdmins) {
    await Notification.create({
      recipient: admin._id,
      type: "System",
      title: "Chapter Dashboard Ready",
      body: "Your chapter workspace has been set up with member businesses and dummy leads for testing.",
      link: "/chapter-admin",
      isRead: false,
    });
    notifCount++;
  }
  console.log(`Seeded ${notifCount} Notifications`);

  // ---------------------------------------------------------------------
  // 16. Messages (one thread tied to the routed Mumbai enquiry)
  // ---------------------------------------------------------------------
  console.log("Seeding Messages...");
  if (mumbaiBiz) {
    const conversationId = [customers[0].user._id.toString(), mumbaiBiz.user._id.toString()].sort().join("_");
    await Message.create({
      conversationId,
      enquiry: enquiries[0].doc._id,
      sender: mumbaiBiz.user._id,
      recipient: customers[0].user._id,
      text: "Thanks for your enquiry! We can fulfil this order — sharing a formal quotation shortly.",
      isRead: false,
    });
  }

  // ---------------------------------------------------------------------
  // 17. Audit log (a few representative entries)
  // ---------------------------------------------------------------------
  console.log("Seeding Audit logs...");
  for (let i = 0; i < chapters.length; i++) {
    await Audit.create({
      actor: superAdmin._id,
      actorName: superAdmin.name,
      actorRole: superAdmin.role,
      action: "CREATE",
      targetModel: "Chapter",
      targetId: chapters[i]._id.toString(),
      summary: `Created new chapter: ${chapters[i].name}`,
    });
    await Audit.create({
      actor: superAdmin._id,
      actorName: superAdmin.name,
      actorRole: superAdmin.role,
      action: "CREATE",
      targetModel: "User",
      targetId: chapterAdmins[i]._id.toString(),
      summary: `Assigned ${chapterAdmins[i].name} as Chapter Admin for ${chapters[i].name}`,
    });
  }

  console.log("\nALL SEEDING COMPLETE.");
  console.log("--------------------------------------------------------------");
  console.log("Super Admin:    admin@gmail.com / 12345678");
  console.log("Secretariat:    secretariat@rifah.org / 12345678");
  console.log("Chapter Admins: admin.<chapter-slug>@rifah.org / User@123456");
  chapterAdmins.forEach((a, i) => console.log(`   - ${chapters[i].name}: ${a.email}`));
  console.log("Business Owners & Customers: <name.with.dots>@example.com / User@123456");
  console.log("--------------------------------------------------------------\n");

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
