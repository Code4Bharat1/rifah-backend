/**
 * ============================================================================
 * RIFAH CONNECT - COMPREHENSIVE CLIENT DEMO SEED SCRIPT
 * ============================================================================
 * Master seed file creating a fully populated, realistic chamber ecosystem
 * across all roles, panels, and features without leaving any screen empty.
 *
 * Credentials Summary (Password: "Nexcore1234" for ALL accounts):
 * ----------------------------------------------------------------------------
 * Central Admin:
 *   - admin@gmail.com
 *
 * Country Admins (Country Module):
 *   - USA:   usa@gmail.com
 *   - Japan: japan@gmail.com
 *
 * State Admins:
 *   - Maharashtra: maharashtra@gmail.com
 *   - Delhi:       delhi@gmail.com
 *
 * Chapter Admins:
 *   - Mumbai:        mumbai@gmail.com
 *   - Pune:          pune@gmail.com
 *   - Central Delhi: centraldelhi@gmail.com
 *   - South Delhi:   southdelhi@gmail.com
 *   - New York:      nychapter@gmail.com
 *   - Tokyo:         tokyochapter@gmail.com
 *
 * Member Businesses (Personal Names & Emails):
 *   - Mumbai 1:        amit@gmail.com     (Amit Sharma - Amit Precision Engineering - Verified / Live)
 *   - Mumbai 2:        rajesh@gmail.com   (Rajesh Patel - Patel Agro & Food Exports - Pending Approval)
 *   - Central Delhi 1: rahul@gmail.com    (Rahul Verma - Rahul Cloud & IT Solutions - Verified / Live)
 *   - Central Delhi 2: suresh@gmail.com   (Suresh Gupta - Gupta Logistics & Supply Chain - Pending Approval)
 *   - USA 1:           john@gmail.com     (John Miller - Miller Global Trade Horizons - Verified / Live)
 *   - USA 2:           sarah@gmail.com    (Sarah Jenkins - Jenkins BioTech Research - Pending Approval)
 *   - Japan 1:         takashi@gmail.com  (Takashi Yamada - Yamada Robotics & Automation - Verified / Live)
 *   - Japan 2:         yuki@gmail.com     (Yuki Tanaka - Tanaka Artisan Fabrics - Pending Approval)
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "../src/config/env.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { generateSlug, generateReferenceId } from "../src/shared/utils/generate-id.js";
import { ROLES } from "../src/shared/constants/roles.js";

// Models
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Category } from "../src/modules/categories/category.model.js";
import { Country } from "../src/modules/countries/country.model.js";
import { StateProfile } from "../src/modules/states/state-profile.model.js";
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
import { Advertisement } from "../src/modules/advertisements/advertisement.model.js";
import { Course } from "../src/modules/courses/course.model.js";
import { Post } from "../src/modules/posts/post.model.js";
import { ThankYouNote } from "../src/modules/networking/thank-you-note.model.js";
import { OneToOne } from "../src/modules/networking/one-to-one.model.js";
import { Referral } from "../src/modules/networking/referral.model.js";
import { RevenueShareRule } from "../src/modules/revenue-sharing/revenueShareRule.model.js";
import { RevenueClaim } from "../src/modules/revenue-sharing/revenueClaim.model.js";
import { RevenueLedgerEntry } from "../src/modules/revenue-sharing/revenueLedgerEntry.model.js";
import { PowerRequirement, PowerConnection } from "../src/modules/power-networking/power-networking.model.js";
import { VisaReferral } from "../src/modules/visa-referrals/visa-referral.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { Dignitary } from "../src/modules/dignitaries/dignitary.model.js";
import { Followup } from "../src/modules/followups/followup.model.js";
import { Document } from "../src/modules/documents/document.model.js";
import { EventMedia } from "../src/modules/gallery/gallery.model.js";
import { Query } from "../src/modules/queries/query.model.js";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URI = env.DATABASE?.URI || process.env.MONGODB_URI || "mongodb://localhost:27017/rifah";
const DEMO_PASSWORD = "Nexcore1234";

async function seed() {
  console.log("==========================================================");
  console.log("Starting RIFAH Demo Database Population...");
  console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
  console.log("==========================================================");

  await mongoose.connect(MONGO_URI);

  console.log("Wiping collections for a clean, deterministic seed...");
  await Promise.all([
    User.deleteMany({}),
    Business.deleteMany({}),
    Category.deleteMany({}),
    Country.deleteMany({}),
    StateProfile.deleteMany({}),
    Chapter.deleteMany({}),
    Catalogue.deleteMany({}),
    Event.deleteMany({}),
    Membership.deleteMany({}),
    Plan.deleteMany({}),
    Review.deleteMany({}),
    Enquiry.deleteMany({}),
    Lead.deleteMany({}),
    Payment.deleteMany({}),
    Notification.deleteMany({}),
    Announcement.deleteMany({}),
    Verification.deleteMany({}),
    Message.deleteMany({}),
    Audit.deleteMany({}),
    Settings.deleteMany({}),
    Advertisement.deleteMany({}),
    Course.deleteMany({}),
    Post.deleteMany({}),
    ThankYouNote.deleteMany({}),
    OneToOne.deleteMany({}),
    Referral.deleteMany({}),
    RevenueShareRule.deleteMany({}),
    RevenueClaim.deleteMany({}),
    RevenueLedgerEntry.deleteMany({}),
    PowerRequirement.deleteMany({}),
    PowerConnection.deleteMany({}),
    VisaReferral.deleteMany({}),
    Ticket.deleteMany({}),
    Dignitary.deleteMany({}),
    Followup.deleteMany({}),
    Document.deleteMany({}),
    EventMedia.deleteMany({}),
    Query.deleteMany({}),
  ]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // -------------------------------------------------------------------------
  // 1. SETTINGS (Singleton Global Config)
  // -------------------------------------------------------------------------
  console.log("[1/19] Seeding Global Settings...");
  await Settings.create({
    isSingleton: "global",
    platformName: "RIFAH Connect",
    supportEmail: "support@rifah.org",
    supportPhone: "+91 22 2490 8888",
    defaultCurrency: "INR",
    taxRate: 18,
    gstEnabled: true,
  });

  // -------------------------------------------------------------------------
  // 2. COUNTRIES (India, USA, Japan)
  // -------------------------------------------------------------------------
  console.log("[2/19] Seeding Countries (India, USA, Japan)...");
  const countries = await Country.insertMany([
    { name: "India", code: "IN", slug: "india", status: "Active" },
    { name: "United States", code: "US", slug: "usa", status: "Active" },
    { name: "Japan", code: "JP", slug: "japan", status: "Active" },
  ]);
  const [indiaDoc, usaDoc, japanDoc] = countries;

  // -------------------------------------------------------------------------
  // 3. STATES (State Profiles linked to Countries)
  // -------------------------------------------------------------------------
  console.log("[3/19] Seeding States (Maharashtra, Delhi, New York, Tokyo)...");
  const states = await StateProfile.insertMany([
    { name: "maharashtra", countryId: indiaDoc._id, countryName: "India", entityType: "state", email: "maharashtra@gmail.com", phone: "+91 98200 11223" },
    { name: "delhi", countryId: indiaDoc._id, countryName: "India", entityType: "state", email: "delhi@gmail.com", phone: "+91 98100 44556" },
    { name: "new york", countryId: usaDoc._id, countryName: "United States", entityType: "state", email: "newyork@gmail.com", phone: "+1 212 555 0199" },
    { name: "tokyo", countryId: japanDoc._id, countryName: "Japan", entityType: "state", email: "tokyo@gmail.com", phone: "+81 3 5555 0188" },
  ]);
  const [mhState, dlState, nyState, tkState] = states;

  // -------------------------------------------------------------------------
  // 4. CHAPTERS
  // -------------------------------------------------------------------------
  console.log("[4/19] Seeding Chapters across States...");
  const chapterDefs = [
    // Maharashtra Chapters
    {
      name: "Mumbai Chapter",
      city: "Mumbai",
      state: "Maharashtra",
      stateId: mhState._id,
      country: "India",
      countryId: indiaDoc._id,
      lead: "Tariq Farooqi",
      units: [
        { name: "B2B Trade Cell", focus: "Industrial manufacturing and heavy engineering", membersCount: 24, status: "Active" },
        { name: "Export Guild", focus: "GCC & African cross-border trade", membersCount: 16, status: "Active" },
      ],
    },
    {
      name: "Pune Chapter",
      city: "Pune",
      state: "Maharashtra",
      stateId: mhState._id,
      country: "India",
      countryId: indiaDoc._id,
      lead: "Sameer Joshi",
      units: [
        { name: "Auto Cluster", focus: "Automotive components and tier-1 vendor development", membersCount: 18, status: "Active" },
      ],
    },
    // Delhi Chapters
    {
      name: "Central Delhi Chapter",
      city: "Central Delhi",
      state: "Delhi",
      stateId: dlState._id,
      country: "India",
      countryId: indiaDoc._id,
      lead: "Rashid Kamal",
      units: [
        { name: "IT & Digital Cell", focus: "Enterprise software, cloud services, and AI", membersCount: 20, status: "Active" },
        { name: "Government Liaison", focus: "MSME ministry tenders and chambers policy", membersCount: 12, status: "Active" },
      ],
    },
    {
      name: "South Delhi Chapter",
      city: "South Delhi",
      state: "Delhi",
      stateId: dlState._id,
      country: "India",
      countryId: indiaDoc._id,
      lead: "Imran Sheikh",
      units: [
        { name: "Retail & Consumer Trade", focus: "FMCG, fashion, and logistics", membersCount: 15, status: "Active" },
      ],
    },
    // USA Chapters
    {
      name: "New York Chapter",
      city: "New York",
      state: "New York",
      stateId: nyState._id,
      country: "United States",
      countryId: usaDoc._id,
      lead: "David Miller",
      units: [
        { name: "Wall Street Trade Desk", focus: "Cross-border investment & fintech", membersCount: 14, status: "Active" },
      ],
    },
    // Japan Chapters
    {
      name: "Tokyo Chapter",
      city: "Tokyo",
      state: "Tokyo",
      stateId: tkState._id,
      country: "Japan",
      countryId: japanDoc._id,
      lead: "Kenji Sato",
      units: [
        { name: "Robotics & Hardware Unit", focus: "Industrial automation & precision tooling", membersCount: 15, status: "Active" },
      ],
    },
  ];

  const chapters = await Chapter.insertMany(
    chapterDefs.map((c) => ({
      ...c,
      slug: generateSlug(c.name),
      status: "Active",
    }))
  );
  const chapterByName = Object.fromEntries(chapters.map((c) => [c.name, c]));

  // -------------------------------------------------------------------------
  // 5. MASTER CATEGORIES
  // -------------------------------------------------------------------------
  console.log("[5/19] Seeding Master Business Categories...");
  const categories = await Category.insertMany([
    { name: "Manufacturing", slug: "manufacturing", icon: "Factory", description: "Industrial machinery, auto components, fabrication" },
    { name: "Information Technology", slug: "information-technology", icon: "Laptop", description: "Cloud software, cybersecurity, AI tools" },
    { name: "Trading & Export", slug: "trading-export", icon: "Ship", description: "Commodity trading, agro exports, GCC distribution" },
    { name: "Logistics & Supply Chain", slug: "logistics", icon: "Truck", description: "Freight forwarding, warehousing, cold chains" },
    { name: "Construction & Infrastructure", slug: "construction", icon: "HardHat", description: "Structural steel, turnkey contracting, MEP" },
    { name: "Healthcare & Pharmaceuticals", slug: "healthcare", icon: "FlaskConical", description: "Medical devices, bulk drugs, diagnostic labs" },
  ]);

  // -------------------------------------------------------------------------
  // 6. MASTER USERS & ADMIN ACCOUNTS
  // -------------------------------------------------------------------------
  console.log("[6/19] Seeding Admins & Chapter Heads (Password: Nexcore1234)...");

  // 6.1 Central Admin
  const centralAdmin = await User.create({
    _id: new mongoose.Types.ObjectId("650000000000000000000001"),
    name: "RIFAH Central Admin",
    email: "admin@gmail.com",
    passwordHash,
    phone: "+91 98200 00001",
    role: ROLES.CENTRAL_ADMIN,
    accountType: "admin",
    designation: "Executive Director",
    country: "India",
    countryId: indiaDoc._id,
    city: "Mumbai",
    status: "Active",
    isProfileComplete: true,
  });

  // 6.2 Country Admins (For USA & Japan in Country Module)
  const usaCountryAdmin = await User.create({
    _id: new mongoose.Types.ObjectId("650000000000000000000002"),
    name: "USA Country Director",
    email: "usa@gmail.com",
    passwordHash,
    phone: "+1 212 555 0100",
    role: ROLES.COUNTRY_ADMIN,
    accountType: "admin",
    country: "United States",
    countryId: usaDoc._id,
    city: "New York",
    status: "Active",
    isProfileComplete: true,
  });

  const japanCountryAdmin = await User.create({
    _id: new mongoose.Types.ObjectId("650000000000000000000003"),
    name: "Japan Country Director",
    email: "japan@gmail.com",
    passwordHash,
    phone: "+81 3 5555 0100",
    role: ROLES.COUNTRY_ADMIN,
    accountType: "admin",
    country: "Japan",
    countryId: japanDoc._id,
    city: "Tokyo",
    status: "Active",
    isProfileComplete: true,
  });

  // Assign Country Admins to Countries
  await Country.findByIdAndUpdate(indiaDoc._id, { assignedAdmin: centralAdmin._id });
  await Country.findByIdAndUpdate(usaDoc._id, { assignedAdmin: usaCountryAdmin._id });
  await Country.findByIdAndUpdate(japanDoc._id, { assignedAdmin: japanCountryAdmin._id });

  // 6.3 State Admins
  const stateAdmins = await User.insertMany([
    {
      _id: new mongoose.Types.ObjectId("650000000000000000000004"),
      name: "Maharashtra State President",
      email: "maharashtra@gmail.com",
      passwordHash,
      phone: "+91 98200 11223",
      role: ROLES.STATE_ADMIN,
      accountType: "admin",
      state: "Maharashtra",
      country: "India",
      countryId: indiaDoc._id,
      city: "Mumbai",
      status: "Active",
      isProfileComplete: true,
    },
    {
      _id: new mongoose.Types.ObjectId("650000000000000000000005"),
      name: "Delhi State President",
      email: "delhi@gmail.com",
      passwordHash,
      phone: "+91 98100 44556",
      role: ROLES.STATE_ADMIN,
      accountType: "admin",
      state: "Delhi",
      country: "India",
      countryId: indiaDoc._id,
      city: "Delhi",
      status: "Active",
      isProfileComplete: true,
    },
  ]);

  // 6.4 Chapter Admins
  const chapterAdminDefs = [
    { name: "Tariq Farooqi", email: "mumbai@gmail.com", phone: "+91 98200 33441", chapter: "Mumbai Chapter", state: "Maharashtra", country: "India" },
    { name: "Sameer Joshi", email: "pune@gmail.com", phone: "+91 98200 33442", chapter: "Pune Chapter", state: "Maharashtra", country: "India" },
    { name: "Rashid Kamal", email: "centraldelhi@gmail.com", phone: "+91 98100 55661", chapter: "Central Delhi Chapter", state: "Delhi", country: "India" },
    { name: "Imran Sheikh", email: "southdelhi@gmail.com", phone: "+91 98100 55662", chapter: "South Delhi Chapter", state: "Delhi", country: "India" },
    { name: "David Miller", email: "nychapter@gmail.com", phone: "+1 212 555 0144", chapter: "New York Chapter", state: "New York", country: "United States" },
    { name: "Kenji Sato", email: "tokyochapter@gmail.com", phone: "+81 3 5555 0177", chapter: "Tokyo Chapter", state: "Tokyo", country: "Japan" },
  ];

  const chapterAdmins = [];
  for (const cad of chapterAdminDefs) {
    const ch = chapterByName[cad.chapter];
    const userDoc = await User.create({
      name: cad.name,
      email: cad.email,
      passwordHash,
      phone: cad.phone,
      role: ROLES.CHAPTER_ADMIN,
      accountType: "admin",
      chapter: ch.name,
      chapterId: ch._id,
      state: cad.state,
      country: cad.country,
      city: ch.city,
      status: "Active",
      isProfileComplete: true,
    });
    chapterAdmins.push(userDoc);
  }

  // -------------------------------------------------------------------------
  // 7. BUSINESS OWNERS & PROFILES (Clean Personal Names & Emails)
  // -------------------------------------------------------------------------
  console.log("[7/19] Seeding Member Businesses (Amit, Rajesh, Rahul, Suresh, etc.)...");

  const businessConfigs = [
    // --- Mumbai Businesses ---
    {
      ownerEmail: "amit@gmail.com",
      ownerName: "Amit Sharma",
      bizName: "Amit Precision Engineering Pvt Ltd",
      chapterName: "Mumbai Chapter",
      industry: "Manufacturing",
      category: "Manufacturing",
      tier: "Platinum",
      subscriberTier: "tier_3",
      verification: "verified", // LIVE IN DIRECTORY
      rating: 4.9,
      reviewsCount: 14,
      tagline: "High-precision CNC machined components & industrial fabrication",
      about: "Amit Precision Engineering is an ISO 9001:2015 certified manufacturer delivering machined components for aerospace, defense, and heavy machinery.",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      countryId: indiaDoc._id,
      address: "Plot 42, Marol MIDC Industrial Estate, Andheri East",
      phone: "+91 22 2830 4567",
    },
    {
      ownerEmail: "rajesh@gmail.com",
      ownerName: "Rajesh Patel",
      bizName: "Patel Agro & Food Exports",
      chapterName: "Mumbai Chapter",
      industry: "Trading & Export",
      category: "Trading & Export",
      tier: "Gold",
      subscriberTier: "tier_2",
      verification: "pending", // PENDING IN VERIFICATION QUEUE
      rating: 4.6,
      reviewsCount: 0,
      tagline: "Premium Indian whole spices & agricultural export commodities",
      about: "Exporter of organic turmeric, cardamom, black pepper, and non-GMO grains serving wholesale buyers across GCC and Southeast Asia.",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      countryId: indiaDoc._id,
      address: "APMC Grain Market Phase II, Vashi, Navi Mumbai",
      phone: "+91 22 2788 8899",
    },

    // --- Central Delhi Businesses ---
    {
      ownerEmail: "rahul@gmail.com",
      ownerName: "Rahul Verma",
      bizName: "Rahul Cloud & IT Solutions Ltd",
      chapterName: "Central Delhi Chapter",
      industry: "Information Technology",
      category: "Information Technology",
      tier: "Platinum",
      subscriberTier: "tier_3",
      verification: "verified", // LIVE IN DIRECTORY
      rating: 4.8,
      reviewsCount: 19,
      tagline: "Enterprise cloud infrastructure, ERP modernization & AI tools",
      about: "Rahul Cloud enables enterprises to migrate and modernize mission-critical operations with automated cloud governance and custom ERP workflows.",
      city: "Central Delhi",
      state: "Delhi",
      country: "India",
      countryId: indiaDoc._id,
      address: "8th Floor, Statesman House, Barakhamba Road, Connaught Place",
      phone: "+91 11 4350 7890",
    },
    {
      ownerEmail: "suresh@gmail.com",
      ownerName: "Suresh Gupta",
      bizName: "Gupta Logistics & Supply Chain Network",
      chapterName: "Central Delhi Chapter",
      industry: "Logistics & Supply Chain",
      category: "Logistics & Supply Chain",
      tier: "Gold",
      subscriberTier: "tier_2",
      verification: "under_review", // UNDER REVIEW IN VERIFICATION QUEUE
      rating: 4.5,
      reviewsCount: 0,
      tagline: "Pan-India multimodal container transport & bonded warehousing",
      about: "End-to-end 3PL logistics provider managing cold chain, dry cargo, and domestic multimodal freight distribution networks.",
      city: "Central Delhi",
      state: "Delhi",
      country: "India",
      countryId: indiaDoc._id,
      address: "Inland Container Depot Complex, Tughlakabad",
      phone: "+91 11 2636 1234",
    },

    // --- USA Businesses ---
    {
      ownerEmail: "john@gmail.com",
      ownerName: "John Miller",
      bizName: "Miller Global Trade Horizons LLC",
      chapterName: "New York Chapter",
      industry: "Trading & Export",
      category: "Trading & Export",
      tier: "Diamond",
      subscriberTier: "tier_4",
      verification: "verified", // LIVE IN DIRECTORY
      rating: 5.0,
      reviewsCount: 8,
      tagline: "Connecting North American buyers with Indian industrial producers",
      about: "Strategic trade consultancy providing sourcing, compliance, and import logistics for industrial raw materials into the US market.",
      city: "New York",
      state: "New York",
      country: "United States",
      countryId: usaDoc._id,
      address: "140 Broadway, 32nd Floor, Financial District, Manhattan",
      phone: "+1 212 555 0188",
    },
    {
      ownerEmail: "sarah@gmail.com",
      ownerName: "Sarah Jenkins",
      bizName: "Jenkins BioTech Research Inc",
      chapterName: "New York Chapter",
      industry: "Healthcare & Pharmaceuticals",
      category: "Healthcare & Pharmaceuticals",
      tier: "Silver",
      subscriberTier: "tier_1",
      verification: "pending", // PENDING IN VERIFICATION QUEUE
      rating: 4.2,
      reviewsCount: 0,
      tagline: "Specialized clinical trials coordination & healthcare analytics",
      about: "Clinical research organization bridging pharmaceutical manufacturing partners with global clinical trials registries.",
      city: "New York",
      state: "New York",
      country: "United States",
      countryId: usaDoc._id,
      address: "450 Lexington Ave, New York, NY 10017",
      phone: "+1 212 555 0244",
    },

    // --- Japan Businesses ---
    {
      ownerEmail: "takashi@gmail.com",
      ownerName: "Takashi Yamada",
      bizName: "Yamada Robotics & Automation K.K.",
      chapterName: "Tokyo Chapter",
      industry: "Manufacturing",
      category: "Manufacturing",
      tier: "Diamond",
      subscriberTier: "tier_4",
      verification: "verified", // LIVE IN DIRECTORY
      rating: 4.9,
      reviewsCount: 11,
      tagline: "High-speed pick-and-place cobots & CNC factory automation",
      about: "Manufacturer of collaborative robotic arms, automated optical inspection scanners, and PLC-driven factory production cells.",
      city: "Tokyo",
      state: "Tokyo",
      country: "Japan",
      countryId: japanDoc._id,
      address: "Shibuya Dogenzaka Tower 14F, Shibuya-ku, Tokyo",
      phone: "+81 3 5555 9900",
    },
    {
      ownerEmail: "yuki@gmail.com",
      ownerName: "Yuki Tanaka",
      bizName: "Tanaka Artisan Fabrics & Silks",
      chapterName: "Tokyo Chapter",
      industry: "Trading & Export",
      category: "Trading & Export",
      tier: "Silver",
      subscriberTier: "tier_1",
      verification: "pending", // PENDING IN VERIFICATION QUEUE
      rating: 4.3,
      reviewsCount: 0,
      tagline: "Authentic Kyoto jacquard textiles & heritage fabrics",
      about: "Textile artisan house producing custom silk fabrics, woven tapestries, and interior textile materials for boutique architects worldwide.",
      city: "Tokyo",
      state: "Tokyo",
      country: "Japan",
      countryId: japanDoc._id,
      address: "Ginza 6-Chome, Chuo-ku, Tokyo",
      phone: "+81 3 5555 8811",
    },
  ];

  const seededBusinesses = [];
  const verificationQueueItems = [];

  for (const cfg of businessConfigs) {
    const ch = chapterByName[cfg.chapterName];
    const userDoc = await User.create({
      name: cfg.ownerName,
      email: cfg.ownerEmail,
      passwordHash,
      phone: cfg.phone,
      role: ROLES.BUSINESS_OWNER,
      accountType: "business",
      businessName: cfg.bizName,
      chapter: ch.name,
      chapterId: ch._id,
      state: cfg.state,
      country: cfg.country,
      countryId: cfg.countryId,
      city: cfg.city,
      status: "Active",
      isProfileComplete: true,
      membershipId: `RIFAH-MBR-${Math.floor(1000 + Math.random() * 9000)}`,
      dob: new Date(1985, 4, 15),
      weddingAnniversary: new Date(2014, 9, 18),
    });

    const slug = generateSlug(cfg.bizName);
    const bizDoc = await Business.create({
      name: cfg.bizName,
      slug,
      tagline: cfg.tagline,
      about: cfg.about,
      industry: cfg.industry,
      categories: [cfg.category],
      businessType: "Private Limited",
      city: cfg.city,
      state: cfg.state,
      country: cfg.country,
      countryId: cfg.countryId,
      address: cfg.address,
      chapter: ch.name,
      chapterId: ch._id,
      membership: cfg.tier,
      subscriberTier: cfg.subscriberTier,
      verification: cfg.verification,
      rating: cfg.rating,
      reviewsCount: cfg.reviewsCount,
      phone: cfg.phone,
      email: cfg.ownerEmail,
      featured: cfg.verification === "verified",
      status: "Active",
      owner: userDoc._id,
      website: `https://${slug.replace(/-/g, "")}.com`,
      founded: "2015",
      employees: "25–100",
    });

    seededBusinesses.push({ user: userDoc, business: bizDoc, config: cfg, chapter: ch });

    // If business is Pending or Under Review, generate realistic documents in the Verification queue!
    if (["pending", "under_review"].includes(cfg.verification)) {
      const vDoc = await Verification.create({
        business: bizDoc._id,
        submittedBy: userDoc._id,
        status: cfg.verification === "under_review" ? "under_review" : "pending",
        remarks: "New registration application submitted. Documents pending chamber officer review.",
        documents: [
          {
            type: "gst",
            name: "GST Registration Certificate",
            number: "27AABCP8891Q1ZP",
            fileUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&q=80",
            status: "pending",
            uploadedAt: new Date(),
          },
          {
            type: "incorporation",
            name: "Certificate of Incorporation / Business PAN",
            number: "U72200MH2015PTC261234",
            fileUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1000&q=80",
            status: "pending",
            uploadedAt: new Date(),
          },
        ],
      });
      verificationQueueItems.push(vDoc);
    }
  }

  console.log(`Seeded ${seededBusinesses.length} Businesses (${verificationQueueItems.length} awaiting approval in Verification Queue)`);

  const amitBiz = seededBusinesses.find((b) => b.business.name.includes("Amit"));
  const rahulBiz = seededBusinesses.find((b) => b.business.name.includes("Rahul"));
  const johnBiz = seededBusinesses.find((b) => b.business.name.includes("Miller"));
  const yamadaBiz = seededBusinesses.find((b) => b.business.name.includes("Yamada"));

  if (amitBiz && rahulBiz) {
    await Review.create({
      business: amitBiz.business._id,
      author: rahulBiz.user._id,
      authorName: "Rahul Verma",
      authorRole: "Verified Buyer",
      rating: 5,
      title: "Exceptional precision engineering & prompt dispatch",
      body: "Amit Precision supplied 5-axis CNC valve bodies with zero dimensional variance. Exceeded our technical testing standards.",
      status: "approved",
    });
    await Review.create({
      business: rahulBiz.business._id,
      author: amitBiz.user._id,
      authorName: "Amit Sharma",
      authorRole: "Verified Member",
      rating: 5,
      title: "Reliable ERP implementation with excellent support",
      body: "Rahul Cloud deployed factory telemetry and automated inventory sync seamlessly across our manufacturing floors.",
      status: "approved",
    });
    if (johnBiz) {
      await Review.create({
        business: johnBiz.business._id,
        author: amitBiz.user._id,
        authorName: "Amit Sharma",
        authorRole: "Verified Exporter",
        rating: 5,
        title: "Seamless cross-border export logistics & clear trade escrow",
        body: "Miller Global Trade handled our US East Coast port clearance and distribution flawlessly. Highly recommended for international trade.",
        status: "approved",
      });
    }
    if (yamadaBiz) {
      await Review.create({
        business: yamadaBiz.business._id,
        author: amitBiz.user._id,
        authorName: "Amit Sharma",
        authorRole: "Verified Member",
        rating: 5,
        title: "World-class industrial cobots and automation support",
        body: "Yamada Robotics supplied pick-and-place cobots that reduced our machine cycle times by 35%. Exceptional Japanese engineering.",
        status: "approved",
      });
    }
  }

  // -------------------------------------------------------------------------
  // 8. PRODUCT CATALOGUE (Populating Marketplace for Verified Businesses)
  // -------------------------------------------------------------------------
  console.log("[8/19] Seeding Product Catalogues for Marketplace...");

  if (amitBiz) {
    await Catalogue.insertMany([
      {
        business: amitBiz.business._id,
        name: "5-Axis CNC Machined Flanges & Valve Bodies",
        slug: generateSlug("5-Axis CNC Machined Flanges & Valve Bodies"),
        description: "Heavy forged alloy steel flanges machined within 5-micron tolerance for high-pressure petro-chemical pipelines.",
        price: "₹18,500",
        category: "Manufacturing",
        city: "Mumbai",
        moq: "50 Units",
        images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&q=80"],
        status: "Active",
      },
      {
        business: amitBiz.business._id,
        name: "Custom Hydraulic Cylinders & Actuators",
        slug: generateSlug("Custom Hydraulic Cylinders & Actuators"),
        description: "Double-acting hydraulic cylinders engineered for heavy mobile earthmoving and industrial stamping presses.",
        price: "₹45,000",
        category: "Manufacturing",
        city: "Mumbai",
        moq: "10 Sets",
        images: ["https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=800&q=80"],
        status: "Active",
      },
    ]);
  }

  if (rahulBiz) {
    await Catalogue.insertMany([
      {
        business: rahulBiz.business._id,
        name: "Rahul Cloud ERP — Manufacturing & SCM Suite",
        slug: generateSlug("Rahul Cloud ERP Manufacturing SCM Suite"),
        description: "Modular enterprise resource planning system tailored for mid-market factories, covering bill-of-materials and live inventory tracking.",
        price: "₹1,20,000",
        category: "Information Technology",
        city: "Delhi",
        moq: "1 License",
        images: ["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"],
        status: "Active",
      },
      {
        business: rahulBiz.business._id,
        name: "24/7 Managed Cloud Security & SOC Monitoring",
        slug: generateSlug("24 7 Managed Cloud Security SOC Monitoring"),
        description: "Managed threat detection, firewall governance, and ISO 27001 compliance audit assistance for chamber businesses.",
        price: "₹35,000/mo",
        category: "Information Technology",
        city: "Delhi",
        moq: "Monthly",
        images: ["https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80"],
        status: "Active",
      },
    ]);
  }

  if (yamadaBiz) {
    await Catalogue.create({
      business: yamadaBiz.business._id,
      name: "Cobot-6X Collaborative Robotic Arm (Payload 10kg)",
      slug: generateSlug("Cobot 6X Collaborative Robotic Arm"),
      description: "Smart 6-axis collaborative robotic manipulator with integrated computer vision for conveyor sorting and welding.",
      price: "¥2,800,000",
      category: "Manufacturing",
      city: "Tokyo",
      moq: "1 Unit",
      images: ["https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80"],
      status: "Active",
    });
  }

  // -------------------------------------------------------------------------
  // 9. MEMBERSHIP PLANS & PAID INVOICES
  // -------------------------------------------------------------------------
  console.log("[9/19] Seeding Membership Plans & Invoices...");
  const plans = await Plan.insertMany([
    {
      planId: "silver",
      name: "Silver",
      price: 12000,
      priceUsd: 150,
      durationYears: 1,
      gstRate: 18,
      displayOrder: 1,
      isActive: true,
      summary: "Essential chamber networking for emerging small businesses",
      features: ["Verified Business Profile", "Up to 5 Products in Catalogue", "Public Enquiries", "Chapter Networking Access"],
    },
    {
      planId: "gold",
      name: "Gold",
      price: 25000,
      priceUsd: 320,
      durationYears: 1,
      gstRate: 18,
      displayOrder: 2,
      isActive: true,
      isRecommended: true,
      summary: "Accelerated growth with statewide B2B matchmaking",
      features: ["All Silver perks", "Up to 25 Products", "Statewide Inquiries", "1-on-1 Business Matching", "Discounted Conclave Tickets"],
    },
    {
      planId: "platinum",
      name: "Platinum",
      price: 50000,
      priceUsd: 650,
      durationYears: 1,
      gstRate: 18,
      displayOrder: 3,
      isActive: true,
      summary: "National visibility with priority RFQ matching",
      features: ["All Gold perks", "Unlimited Catalogue Listings", "National Sourcing Radar", "Featured Search Placement", "Free Event Passes"],
    },
    {
      planId: "diamond",
      name: "Diamond",
      price: 100000,
      priceUsd: 1300,
      durationYears: 1,
      gstRate: 18,
      displayOrder: 4,
      isActive: true,
      summary: "VIP Chamber Council & Global Export Delegations",
      features: ["VIP Chamber Council Membership", "International Trade Delegations", "Dedicated Lead Concierge", "Sponsor Spotlight"],
    },
  ]);

  // Create real Paid Invoices for Verified Businesses to populate payment analytics
  let invCounter = 1001;
  const createdPayments = [];
  for (const sb of seededBusinesses.filter((b) => b.config.verification === "verified")) {
    const fee = sb.config.tier === "Diamond" ? 100000 : sb.config.tier === "Platinum" ? 50000 : 25000;
    const gst = Math.round(fee * 0.18);
    const pDoc = await Payment.create({
      invoiceNumber: `INV-2026-${invCounter++}`,
      payer: sb.user._id,
      business: sb.business._id,
      itemType: "Membership",
      planTier: sb.config.tier,
      chapter: sb.chapter.name,
      state: sb.config.state,
      collectingChapter: sb.chapter.name,
      collectingState: sb.config.state,
      description: `RIFAH Chamber ${sb.config.tier} Annual Membership`,
      subtotal: fee,
      gstRate: 18,
      gstAmount: gst,
      amount: fee + gst,
      currency: "INR",
      method: "Razorpay Online (UPI/Cards)",
      status: "Paid",
      transactionId: `pay_demo_${invCounter}_live`,
      paidAt: new Date(Date.now() - 15 * 86400000),
      payerName: sb.user.name,
      payerEmail: sb.user.email,
      businessName: sb.business.name,
    });
    createdPayments.push(pDoc);
  }

  // -------------------------------------------------------------------------
  // 10. ADVERTISEMENTS (Active Banners + Pending Admin Approval)
  // -------------------------------------------------------------------------
  console.log("[10/19] Seeding Advertisements (Active Carousel & Pending Queue)...");
  if (amitBiz) {
    // 1. Active Global Banner Ad (visible in hero carousel)
    await Advertisement.create({
      title: "Precision Engineering Solutions For Global Supply Chains",
      description: "ISO certified CNC components, high-pressure valves, and turnkey contract fabrication. Request your enterprise quote from Amit Sharma.",
      bannerImage: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=1200&q=80",
      linkUrl: `/business/${amitBiz.business.slug}`,
      businessId: amitBiz.business._id,
      businessName: amitBiz.business.name,
      userId: amitBiz.user._id,
      chapterId: amitBiz.chapter._id,
      chapterName: amitBiz.chapter.name,
      targetScope: "global",
      state: "Maharashtra",
      requestedDate: new Date(),
      approvedStartDate: new Date(Date.now() - 86400000),
      approvedEndDate: new Date(Date.now() + 30 * 86400000),
      durationDays: 30,
      status: "Active",
    });
  }

  if (rahulBiz) {
    // 2. Active Statewide Banner Ad
    await Advertisement.create({
      title: "Modernize Your Enterprise With Rahul Cloud ERP",
      description: "Automate manufacturing inventory, multi-currency invoicing, and supply chain reporting on a sovereign secure cloud.",
      bannerImage: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
      linkUrl: `/business/${rahulBiz.business.slug}`,
      businessId: rahulBiz.business._id,
      businessName: rahulBiz.business.name,
      userId: rahulBiz.user._id,
      chapterId: rahulBiz.chapter._id,
      chapterName: rahulBiz.chapter.name,
      targetScope: "state",
      state: "Delhi",
      requestedDate: new Date(),
      approvedStartDate: new Date(Date.now() - 86400000),
      approvedEndDate: new Date(Date.now() + 25 * 86400000),
      durationDays: 30,
      status: "Active",
    });
  }

  // 3. PENDING AD (Awaiting Central/Chapter Admin approval so user can demonstrate clicking Approve!)
  const rajeshBiz = seededBusinesses.find((b) => b.business.name.includes("Patel"));
  if (rajeshBiz) {
    await Advertisement.create({
      title: "Direct Sourcing Of Export-Quality Indian Whole Spices",
      description: "Organic certified Malabar black pepper, Alleppey green cardamom, and Salem turmeric available for international export.",
      bannerImage: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=1200&q=80",
      linkUrl: `/business/${rajeshBiz.business.slug}`,
      businessId: rajeshBiz.business._id,
      businessName: rajeshBiz.business.name,
      userId: rajeshBiz.user._id,
      chapterId: rajeshBiz.chapter._id,
      chapterName: rajeshBiz.chapter.name,
      targetScope: "global",
      state: "Maharashtra",
      requestedDate: new Date(),
      durationDays: 15,
      status: "Pending", // Awaiting Admin Review in /admin/advertisements!
      adminRemarks: "Awaiting payment verification before spotlight activation.",
    });
  }

  // -------------------------------------------------------------------------
  // 11. EVENTS & OPERATIONS CENTER (With Live Check-In Attendee List)
  // -------------------------------------------------------------------------
  console.log("[11/19] Seeding Flagship Events & Weekly Chapter Meetings...");
  const mumbaiChapter = chapterByName["Mumbai Chapter"];
  const delhiChapter = chapterByName["Central Delhi Chapter"];

  // 1. National Flagship Summit (Central Scope)
  const summitEvent = await Event.create({
    title: "RIFAH Global Trade & Investment Summit 2026",
    slug: "rifah-global-trade-summit-2026",
    summary: "Flagship annual summit bringing together 500+ industrial leaders, international diplomats, and venture partners.",
    description: "Experience 2 full days of keynote addresses, high-value B2B buyer-seller meets, investment roundtables, and the prestigious RIFAH Business Excellence Awards.",
    date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    time: "09:30 AM – 06:00 PM IST",
    venue: "Grand Ballroom, Jio World Convention Centre, BKC",
    city: "Mumbai",
    chapter: "All Chapters (National)",
    mode: "Offline",
    eventCategory: "Meet",
    isPaid: true,
    ticketPrice: 2500,
    fee: "₹2500",
    totalSeats: 300,
    registeredCount: 8,
    status: "Upcoming",
    agenda: [
      { id: 1, title: "Registration, Welcome Breakfast & Networking", duration: "60 mins", speaker: "Chamber Secretariat" },
      { id: 2, title: "Inaugural Keynote: Scaling Indian MSMEs to Global Giants", duration: "90 mins", speaker: "Dr. A. K. Sharma (Ministry of MSME)" },
      { id: 3, title: "Executive Networking Lunch & Bilateral Meets", duration: "75 mins", speaker: "Trade Delegates" },
      { id: 4, title: "Panel Discussion: Cross-Border Trade & GCC Expansion", duration: "60 mins", speaker: "Industry Panel" },
    ],
    registeredUsers: [
      // 2 Attendees marked as Present / Checked-In with rich Asks & Gives
      {
        user: amitBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Present",
        paymentStatus: "Paid",
        amountPaid: 2500,
        ticketId: "TCK-SUMMIT-01",
        checkedIn: true,
        checkedInAt: new Date(),
        asks: [
          "Bulk titanium alloy bar stock (Ti-6Al-4V) distributors",
          "Aerospace AS9100 quality audit consultants",
          "High-capacity surface grinding machine partners",
        ],
        gives: [
          "5-Axis CNC milling capacity (tolerances to 5 microns)",
          "Petrochemical valve body manufacturing",
          "Mid-scale contract precision fabrication",
        ],
      },
      {
        user: rahulBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Present",
        paymentStatus: "Paid",
        amountPaid: 2500,
        ticketId: "TCK-SUMMIT-02",
        checkedIn: true,
        checkedInAt: new Date(),
        asks: [
          "Industrial IoT sensor vendors for manufacturing line telemetry",
          "Mid-market factories seeking ERP migration",
          "ISO 27001 cybersecurity certification auditors",
        ],
        gives: [
          "Custom ERP & inventory automation suite",
          "Cloud infrastructure migration & DevOps pipelines",
          "SOC monitoring & disaster recovery setup",
        ],
      },
      // 2 Attendees marked as Pending (for live QR Check-In demo)
      {
        user: rajeshBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Pending",
        paymentStatus: "Paid",
        amountPaid: 2500,
        ticketId: "TCK-SUMMIT-03",
        checkedIn: false,
        asks: [
          "Reefer container freight forwarders to UAE & Saudi Arabia",
          "Organic turmeric farmers collective connections",
          "Commercial food grain fumigation services",
        ],
        gives: [
          "Direct export supply of Malabar black pepper & Salem turmeric",
          "Wholesale agro commodity consolidation",
          "GCC import compliance & phytosanitary guidance",
        ],
      },
      {
        user: johnBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Pending",
        paymentStatus: "Paid",
        amountPaid: 2500,
        ticketId: "TCK-SUMMIT-04",
        checkedIn: false,
        asks: [
          "Direct Indian OEM manufacturers for engineering hardware",
          "Custom packaging suppliers for US retail distribution",
          "Supply chain trade escrow partners",
        ],
        gives: [
          "North American wholesale distribution network access",
          "FDA & US customs import advisory",
          "B2B buyer introductions across New York & East Coast",
        ],
      },
    ],
    roleAssignments: [
      { role: "entranceIncharge", user: amitBiz.user._id, assignedAt: new Date() },
      { role: "eventCoordinator", user: chapterAdmins[0]._id, assignedAt: new Date() },
      { role: "guestManager", user: rahulBiz.user._id, assignedAt: new Date() },
      { role: "followupCoordinator", user: rajeshBiz.user._id, assignedAt: new Date() },
      { role: "treasurer", user: stateAdmins[0]._id, assignedAt: new Date() },
    ],
    teamAssignments: {
      chapterAdmin: "Tariq Farooqi",
      entranceIncharge: "Amit Sharma",
      followupCoordinator: "Rajesh Patel",
      treasurer: "Maharashtra State President",
      guestManager: "Rahul Verma",
      eventCoordinator: "Tariq Farooqi",
      presidentWelcome: "Tariq Farooqi",
      secretaryIntro: "Rashid Kamal",
      keynote1: "Dr. Anand K. Joshi",
      keynote1Topic: "Scaling Indian MSMEs to Global Giants",
      closingRemarks: "RIFAH Central Secretariat",
      voteOfThanks: "Sameer Joshi",
    },
    finance: {
      moneyIn: [
        {
          id: "1",
          desc: "Delegate Registration Fees (Collected Online via Razorpay)",
          amount: 450000,
          from: "Chamber Delegates & Attendees",
          method: "Online",
          date: new Date().toISOString().split("T")[0],
        },
        {
          id: "2",
          desc: "Platinum Title Sponsorship",
          amount: 150000,
          from: "Apex Industrial Corp",
          method: "Bank Transfer",
          date: new Date().toISOString().split("T")[0],
        },
      ],
      moneyOut: [
        {
          id: "1",
          desc: "Convention Hall Audio-Visual & Stage LED Wall Rental",
          amount: 120000,
          to: "BKC Media Solutions",
          date: new Date().toISOString().split("T")[0],
        },
        {
          id: "2",
          desc: "Executive Buffet Banquets (500 Pax)",
          amount: 180000,
          to: "Grand Ballroom Banquets",
          date: new Date().toISOString().split("T")[0],
        },
      ],
      notes: "Accounts audited and verified by Mumbai Chapter Secretariat.",
      isClosed: false,
    },
    scripts: [
      {
        segmentId: "welcome",
        customText: "Distinguished guests, chamber council members, and international delegates, welcome to the RIFAH Global Trade & Investment Conclave 2026.",
        language: "English",
      },
      {
        segmentId: "keynote",
        customText: "We now invite Dr. Anand K. Joshi, Additional Secretary Ministry of MSME, to deliver the inaugural keynote.",
        language: "English",
      },
    ],
  });

  // 2. Mumbai Weekly Breakfast Meeting (Chapter Level)
  await Event.create({
    title: "Mumbai Chapter Weekly Business Breakfast & Referral Meet",
    slug: "mumbai-chapter-weekly-meet-oct",
    summary: "Weekly chapter meeting for 1-to-1 networking, passing verified referrals, and business showcases.",
    description: "Join fellow chamber members for structured networking, member 10-minute presentations, and referral passing.",
    date: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
    time: "07:30 AM – 09:30 AM IST",
    venue: "The Mirador Hotel, Chakala, Andheri East",
    city: "Mumbai",
    chapter: "Mumbai Chapter",
    mode: "Offline",
    eventCategory: "Meet",
    isPaid: true,
    ticketPrice: 850,
    fee: "₹850",
    totalSeats: 50,
    registeredCount: 4,
    status: "Upcoming",
    registeredUsers: [
      {
        user: amitBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Present",
        paymentStatus: "Paid",
        amountPaid: 850,
        ticketId: "TCK-MUM-01",
        checkedIn: true,
        asks: ["Looking for industrial chrome plating partners"],
        gives: ["Precision turning & fabrication capacity"],
      },
      {
        user: rajeshBiz.user._id,
        role: "member",
        status: "Confirmed",
        attendanceStatus: "Pending",
        paymentStatus: "Paid",
        amountPaid: 850,
        ticketId: "TCK-MUM-02",
        checkedIn: false,
        asks: ["Need corrugated export carton boxes supplier"],
        gives: ["Direct supply of spices & whole commodities"],
      },
    ],
    roleAssignments: [
      { role: "entranceIncharge", user: amitBiz.user._id, assignedAt: new Date() },
      { role: "eventCoordinator", user: chapterAdmins[0]._id, assignedAt: new Date() },
      { role: "guestManager", user: rajeshBiz.user._id, assignedAt: new Date() },
    ],
  });

  // -------------------------------------------------------------------------
  // 12. NETWORKING TRANSACTIONS (Thank You Notes, Referrals, 1-to-1s)
  // -------------------------------------------------------------------------
  console.log("[12/19] Seeding Networking Analytics (Closed Business Volume & Leaderboards)...");

  // Thank You Notes (Real closed business in INR creating impressive leaderboards)
  await ThankYouNote.create({
    giverUser: rahulBiz.user._id,
    giverBusiness: rahulBiz.business._id,
    giverChapterId: delhiChapter._id,
    giverState: "Delhi",
    receiverUser: amitBiz.user._id,
    receiverBusiness: amitBiz.business._id,
    receiverChapterId: mumbaiChapter._id,
    receiverState: "Maharashtra",
    amount: 1250000, // ₹12.5 Lakhs closed deal!
    note: "Awarded contract for precision CNC valve manifolds for our data center cooling system.",
    source: "direct",
  });

  await ThankYouNote.create({
    giverUser: amitBiz.user._id,
    giverBusiness: amitBiz.business._id,
    giverChapterId: mumbaiChapter._id,
    giverState: "Maharashtra",
    receiverUser: rahulBiz.user._id,
    receiverBusiness: rahulBiz.business._id,
    receiverChapterId: delhiChapter._id,
    receiverState: "Delhi",
    amount: 480000, // ₹4.8 Lakhs closed deal!
    note: "Annual subscription for Rahul Cloud ERP across 2 of our manufacturing plant locations.",
    source: "referral",
  });

  await ThankYouNote.create({
    giverUser: johnBiz.user._id,
    giverBusiness: johnBiz.business._id,
    giverChapterId: chapterByName["New York Chapter"]._id,
    giverState: "New York",
    receiverUser: amitBiz.user._id,
    receiverBusiness: amitBiz.business._id,
    receiverChapterId: mumbaiChapter._id,
    receiverState: "Maharashtra",
    amount: 2850000, // ₹28.5 Lakhs cross-border export deal!
    note: "Initial export consignment of industrial components delivered to our Long Island distributor.",
    source: "direct",
  });

  // 1-to-1 Meeting
  await OneToOne.create({
    initiatorUser: amitBiz.user._id,
    initiatorBusiness: amitBiz.business._id,
    initiatorChapterId: mumbaiChapter._id,
    initiatorState: "Maharashtra",
    memberUser: rahulBiz.user._id,
    memberBusiness: rahulBiz.business._id,
    memberChapterId: delhiChapter._id,
    memberState: "Delhi",
    meetingDate: new Date(Date.now() - 5 * 86400000),
    meetingTime: "11:00 AM",
    location: "Trident Hotel Executive Lounge, BKC Mumbai",
    description: "Deep-dive discussion into ERP integration for factory shop-floor telemetry.",
    initiatedBy: "self",
  });

  await OneToOne.create({
    initiatorUser: johnBiz.user._id,
    initiatorBusiness: johnBiz.business._id,
    initiatorChapterId: chapterByName["New York Chapter"]._id,
    initiatorState: "New York",
    memberUser: amitBiz.user._id,
    memberBusiness: amitBiz.business._id,
    memberChapterId: mumbaiChapter._id,
    memberState: "Maharashtra",
    meetingDate: new Date(Date.now() - 2 * 86400000),
    meetingTime: "06:30 PM",
    location: "Virtual Conclave Room (Google Meet)",
    description: "Cross-border export distribution and North American compliance review.",
    initiatedBy: "member",
  });

  // Outgoing Referral by Amit Sharma
  await Referral.create({
    referrerUser: amitBiz.user._id,
    referrerBusiness: amitBiz.business._id,
    referrerChapterId: mumbaiChapter._id,
    referrerState: "Maharashtra",
    referredUser: rahulBiz.user._id,
    referredBusiness: rahulBiz.business._id,
    referredChapterId: delhiChapter._id,
    referredState: "Delhi",
    leadName: "Sunil Deshmukh (Deshmukh Auto Ancillaries)",
    leadContact: "+91 98201 12345",
    leadIsMember: false,
    description: "Looking for ERP implementation for their 3 auto manufacturing units in Pune.",
    status: "Open",
  });

  // Incoming Referral for Amit Sharma (received from Rahul Verma)
  await Referral.create({
    referrerUser: rahulBiz.user._id,
    referrerBusiness: rahulBiz.business._id,
    referrerChapterId: delhiChapter._id,
    referrerState: "Delhi",
    referredUser: amitBiz.user._id,
    referredBusiness: amitBiz.business._id,
    referredChapterId: mumbaiChapter._id,
    referredState: "Maharashtra",
    leadName: "Kiran Mazumdar (Mazumdar Aerospace Components)",
    leadContact: "+91 98110 99887",
    leadIsMember: false,
    description: "Urgently seeking high-precision 5-axis CNC machining partner for defense export tender.",
    status: "Open",
  });

  await ThankYouNote.create({
    giverUser: rajeshBiz.user._id,
    giverBusiness: rajeshBiz.business._id,
    giverChapterId: mumbaiChapter._id,
    giverState: "Maharashtra",
    receiverUser: amitBiz.user._id,
    receiverBusiness: amitBiz.business._id,
    receiverChapterId: mumbaiChapter._id,
    receiverState: "Maharashtra",
    amount: 350000,
    note: "Consulting and vendor introductions for industrial food packaging machinery.",
    source: "referral",
  });

  // -------------------------------------------------------------------------
  // 13. REVENUE SHARING (Rules, Ledger Entries, Pending Claims)
  // -------------------------------------------------------------------------
  console.log("[13/19] Seeding Revenue Sharing (Commission Splits & Pending Payout Claim)...");

  // Rule Setup
  const masterRule = await RevenueShareRule.create({
    revenueType: "membership",
    allocations: [
      { beneficiaryLevel: "chapter", percentage: 50 },
      { beneficiaryLevel: "state", percentage: 25 },
      { beneficiaryLevel: "central", percentage: 25 },
    ],
    version: 1,
    effectiveFrom: new Date(),
    isActive: true,
    notes: "Master Rule: Chapter receives 50%, State 25%, and Central retains 25%.",
  });

  // Ledger Entries tied to real payments
  const primaryPayment = createdPayments[0];
  const ledger1 = await RevenueLedgerEntry.create({
    sourcePaymentId: primaryPayment._id,
    sourceReference: {
      type: "membership",
      refId: primaryPayment.business,
    },
    revenueType: "membership",
    payerUserId: primaryPayment.payer,
    businessId: primaryPayment.business,
    chapterId: mumbaiChapter._id,
    chapter: mumbaiChapter.name,
    state: "Maharashtra",
    grossAmount: primaryPayment.amount,
    eligibleBase: primaryPayment.subtotal,
    ruleId: masterRule._id,
    ruleVersion: 1,
    beneficiaryLevel: "state",
    percentage: 25,
    allocatedAmount: Math.round(primaryPayment.subtotal * 0.25),
    accountingPeriod: "2026-10",
    transactionDate: primaryPayment.paidAt,
    status: "payable",
  });

  const ledger2 = await RevenueLedgerEntry.create({
    sourcePaymentId: primaryPayment._id,
    sourceReference: {
      type: "membership",
      refId: primaryPayment.business,
    },
    revenueType: "membership",
    payerUserId: primaryPayment.payer,
    businessId: primaryPayment.business,
    chapterId: mumbaiChapter._id,
    chapter: mumbaiChapter.name,
    state: "Maharashtra",
    grossAmount: primaryPayment.amount,
    eligibleBase: primaryPayment.subtotal,
    ruleId: masterRule._id,
    ruleVersion: 1,
    beneficiaryLevel: "chapter",
    percentage: 50,
    allocatedAmount: Math.round(primaryPayment.subtotal * 0.5),
    accountingPeriod: "2026-10",
    transactionDate: primaryPayment.paidAt,
    status: "payable",
  });

  // 1 PENDING CLAIM for Maharashtra State Admin (to demonstrate Central Admin reviewing and approving payouts!)
  await RevenueClaim.create({
    claimNumber: "CLM-MH-2026-001",
    beneficiaryLevel: "state",
    state: "Maharashtra",
    revenueType: "membership",
    payingOrgLevel: "central",
    claimedAmount: 12500,
    periodFrom: "2026-10",
    periodTo: "2026-10",
    status: "submitted", // WAITING FOR CENTRAL ADMIN APPROVAL IN /admin/revenue-sharing!
    notes: "Q1 State membership share settlement claim for Maharashtra Chapter renewals.",
    submittedBy: stateAdmins[0]._id, // Maharashtra State Admin
    submittedAt: new Date(Date.now() - 2 * 86400000),
    createdBy: stateAdmins[0]._id,
    ledgerEntryIds: [ledger1._id],
  });

  // -------------------------------------------------------------------------
  // 14. LMS COURSES & ACADEMY (Published & Pending Moderation)
  // -------------------------------------------------------------------------
  console.log("[14/19] Seeding LMS Academy (Published Courses + Pending Admin Moderation)...");

  // 1. Published Course: B2B Export Mastery (Live)
  await Course.create({
    title: "B2B Export Mastery: Navigating GCC & Global Markets",
    description: "Comprehensive step-by-step masterclass on export documentation, letter of credit (LC) terms, customs clearance, and securing international buyers.",
    category: "Trading & Export",
    createdBy: centralAdmin._id,
    scope: "centre",
    isActive: true,
    approvalStatus: "approved",
    isPaid: false,
    chapters: [
      {
        title: "Module 1: Foundations of Global Trade",
        description: "Understanding Incoterms 2020 and International HS Codes.",
        order: 1,
        contents: [
          {
            title: "Lesson 1: Demystifying Incoterms (FOB vs CIF)",
            type: "video",
            url: "https://www.w3schools.com/html/mov_bbb.mp4",
            order: 1,
          },
          {
            title: "Export Compliance Checklist & Proforma Invoicing (PDF)",
            type: "pdf",
            url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
            order: 2,
          },
        ],
      },
      {
        title: "Module 2: Risk Mitigation & LC Financing",
        description: "Securing export credit guarantees via ECGC and bank guarantees.",
        order: 2,
        contents: [
          {
            title: "Lesson 2: Letter of Credit (LC) Walkthrough",
            type: "video",
            url: "https://www.w3schools.com/html/mov_bbb.mp4",
            order: 1,
          },
        ],
      },
    ],
  });

  // 2. Published Paid Course: GST Compliance & Tax Strategy
  await Course.create({
    title: "GST Compliance & Tax Strategy For Growing MSMEs",
    description: "Practical guide to input tax credit (ITC) reconciliation, E-invoicing workflows, and tax-efficient corporate structuring.",
    category: "Information Technology",
    createdBy: centralAdmin._id,
    scope: "centre",
    isActive: true,
    approvalStatus: "approved",
    isPaid: true,
    price: 1999,
    chapters: [
      {
        title: "Module 1: Input Tax Credit Audit Preparation",
        description: "Reconciling GSTR-2B with internal purchase ledgers.",
        order: 1,
        contents: [
          {
            title: "Lesson 1: Avoiding Common ITC Audit Triggers",
            type: "video",
            url: "https://www.w3schools.com/html/mov_bbb.mp4",
            order: 1,
          },
        ],
      },
    ],
  });

  // 3. PENDING COURSE SUBMISSION (Submitted by Mumbai Chapter Admin, awaiting Central Admin approval!)
  await Course.create({
    title: "Digital Factory: Automating Assembly Lines With Sensor Telemetry",
    description: "Hands-on implementation guide for small factory owners looking to install low-cost IoT telemetry on traditional mechanical machinery.",
    category: "Manufacturing",
    createdBy: chapterAdmins[0]._id, // Tariq Farooqi (Mumbai Head)
    scope: "chapter",
    chapterId: mumbaiChapter._id,
    state: "Maharashtra",
    isActive: false,
    approvalStatus: "pending", // PENDING IN /admin/lms FOR APPROVAL DEMO!
    approvalRemark: "Submitted by Mumbai Chapter Admin for platform-wide accreditation.",
    chapters: [
      {
        title: "Module 1: Low-Cost Vibration & Heat Sensors",
        description: "Choosing industrial sensor probes.",
        order: 1,
        contents: [
          {
            title: "Overview of IoT Sensors on Stamping Presses",
            type: "video",
            url: "https://www.w3schools.com/html/mov_bbb.mp4",
            order: 1,
          },
        ],
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 15. CHAMBER FEEDS (Social Timeline with Posts, Likes, Comments)
  // -------------------------------------------------------------------------
  console.log("[15/19] Seeding Chamber Feeds (Posts, Announcements & Comments)...");
  await Post.create({
    author: centralAdmin._id,
    authorName: "RIFAH Secretariat HQ",
    authorRole: "central_admin",
    authorAvatar: "",
    title: "RIFAH Global Business Summit 2026 Dates Announced!",
    caption: "We are thrilled to formally announce the dates for the RIFAH Global Trade Summit 2026 at Jio World Convention Centre, Mumbai. Over 500+ industrial enterprises and delegates from 12 countries are participating. Early-bird delegate passes are now open for chapter members!",
    images: ["https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80"],
    likesCount: 28,
    likedBy: [amitBiz.user._id, rahulBiz.user._id],
    comments: [
      {
        author: amitBiz.user._id,
        authorName: "Amit Sharma (Amit Precision)",
        text: "Looking forward! Our engineering team will be hosting a dedicated buyer-seller pavilion.",
        createdAt: new Date(Date.now() - 3600000),
      },
      {
        author: rahulBiz.user._id,
        authorName: "Rahul Verma (Rahul Cloud)",
        text: "Delighted to sponsor the Cloud & Digital Acceleration workshop at the summit.",
        createdAt: new Date(Date.now() - 1800000),
      },
    ],
  });

  await Post.create({
    author: amitBiz.user._id,
    authorName: "Amit Sharma (Amit Precision)",
    authorRole: "business_owner",
    chapter: "Mumbai Chapter",
    state: "Maharashtra",
    caption: "Proud to share that Amit Precision Engineering has completed the installation of our brand-new 5-Axis Hermle CNC machining center at our Mumbai facility. Special gratitude to fellow RIFAH member Rahul Cloud for implementing automated telemetry on the line!",
    images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1000&q=80"],
    likesCount: 19,
    likedBy: [rahulBiz.user._id],
    comments: [],
  });

  // -------------------------------------------------------------------------
  // 16. ENQUIRIES & LEADS (New, Quoted, and Converted Flow)
  // -------------------------------------------------------------------------
  console.log("[16/25] Seeding B2B Buyer Enquiries & Lead Pipeline (Populating My Asks)...");
  const enq1 = await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Requirement for 500 sets of CNC Machined Stainless Steel Flanges",
    requester: rahulBiz.user._id,
    requesterName: "Rahul Verma",
    requesterRole: "Verified Member",
    targetType: "all",
    chapter: "Mumbai Chapter",
    chapterId: mumbaiChapter._id,
    category: "Manufacturing",
    quantity: "500 Sets (Recurring Monthly)",
    budget: "₹15,00,000 – ₹20,00,000",
    location: "Mumbai",
    requiredBy: "Within 45 days",
    description: "Looking for a certified precision manufacturer capable of supplying SS 316L machined flanges tested to hydro-pressure standards.",
    status: "Responded",
    responsesCount: 1,
  });

  await Lead.create({
    enquiry: enq1._id,
    business: amitBiz.business._id,
    status: "Won", // Converted lead!
    quotation: {
      amount: "₹18,50,000",
      deliveryTime: "45 Days",
      terms: "30% Advance, balance against dispatch",
      submittedAt: new Date(Date.now() - 86400000),
    },
    notes: "Formal technical drawing approved. Purchase Order released.",
  });

  // Fresh Pending Enquiry from John Miller
  const enq2 = await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Urgent Procurement: 20 Metric Tons of Export-Grade Turmeric",
    requester: johnBiz.user._id,
    requesterName: "John Miller",
    requesterRole: "International Trade Member",
    targetType: "all",
    chapter: "Mumbai Chapter",
    chapterId: mumbaiChapter._id,
    category: "Trading & Export",
    quantity: "20 Metric Tons",
    budget: "Competitive Export Rates",
    location: "New York / Nhava Sheva Port",
    requiredBy: "Next 2 weeks",
    description: "Need whole dried Salem turmeric with minimum 3.5% curcumin content, phytosanitary certified for direct shipping to US East Coast.",
    status: "New", // FRESH PENDING ENQUIRY!
    responsesCount: 1,
  });

  await Lead.create({
    enquiry: enq2._id,
    business: rajeshBiz.business._id,
    status: "New",
  });

  // 16.1 "MY ASK" Sourcing Requirements Posted by Amit Sharma (amit@gmail.com)
  const enqAmit1 = await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Requirement for 200 Sets of High-Grade Titanium Bar Stock (Grade 5 Ti-6Al-4V)",
    requester: amitBiz.user._id,
    requesterName: "Amit Sharma",
    requesterRole: "Verified Member",
    targetType: "all",
    chapter: "Mumbai Chapter",
    chapterId: mumbaiChapter._id,
    category: "Manufacturing",
    quantity: "200 Rods (100mm dia x 1000mm length)",
    budget: "₹8,50,000",
    location: "Mumbai MIDC",
    requiredBy: "Within 30 days",
    description: "Seeking authorized prime mill distributors for certified titanium bars with mill test certificates (MTC 3.1) for aerospace machining.",
    status: "Responded",
    responsesCount: 1,
  });

  await Lead.create({
    enquiry: enqAmit1._id,
    business: rahulBiz.business._id,
    status: "Responded",
    quotation: {
      amount: "₹8,20,000",
      deliveryTime: "25 Days",
      terms: "LC / Escrow bank transfer",
      submittedAt: new Date(Date.now() - 43200000),
    },
    notes: "Prime material verified from certified distributor warehouse in Taloja.",
  });

  const enqAmit2 = await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Urgent Sourcing: ISO 17025 Certified Metallurgy Testing & Radiography Labs",
    requester: amitBiz.user._id,
    requesterName: "Amit Sharma",
    requesterRole: "Verified Member",
    targetType: "all",
    chapter: "Mumbai Chapter",
    chapterId: mumbaiChapter._id,
    category: "Manufacturing",
    quantity: "50 Batches / Year",
    budget: "₹2,50,000 Annual Retainer",
    location: "Mumbai",
    requiredBy: "Within 15 days",
    description: "Looking for third-party NDT (non-destructive testing) and radiography lab partners with ultrasonic immersion testing capabilities.",
    status: "New",
    responsesCount: 0,
  });

  // 16.2 "MY ASK" Sourcing Requirement Posted by Rajesh Patel (rajesh@gmail.com)
  await Enquiry.create({
    referenceId: generateReferenceId("ENQ", 4),
    title: "Bulk Sourcing: Multi-Wall Kraft Paper Bags for Food Grain Export Packaging",
    requester: rajeshBiz.user._id,
    requesterName: "Rajesh Patel",
    requesterRole: "Chamber Member",
    targetType: "all",
    chapter: "Mumbai Chapter",
    chapterId: mumbaiChapter._id,
    category: "Trading & Export",
    quantity: "10,000 Bags (25kg Capacity)",
    budget: "₹3,50,000",
    location: "Navi Mumbai APMC",
    requiredBy: "Immediate",
    description: "Need food-grade multi-layer kraft paper bags with moisture barrier liners for international container shipment.",
    status: "New",
    responsesCount: 0,
  });

  // -------------------------------------------------------------------------
  // 17. POWER NETWORKING REQUIREMENTS & DIRECT CONNECTIONS
  // -------------------------------------------------------------------------
  console.log("[17/25] Seeding Power Networking Requirements & Active Network Connections...");
  const reqAmit = await PowerRequirement.create({
    title: "Bulk Supply Of Heavy Gauge Mild Steel Wire Rods (SAE 1008)",
    category: "Manufacturing",
    productService: "MS Wire Rods (5.5mm - 8mm)",
    quantity: "250 Tons",
    requiredBy: new Date(Date.now() + 20 * 86400000),
    location: "Mumbai / Pune",
    preferredLocation: "Maharashtra",
    budget: "Market Mill Price",
    urgency: "High",
    description: "Looking for primary steel plant distributors or rolling mills able to deliver coil stock directly to our plant.",
    business: amitBiz.business._id,
    createdBy: amitBiz.user._id,
    status: "Active",
  });

  const reqRahul = await PowerRequirement.create({
    title: "Real-time Telemetry Sensors for Industrial CNC Machine Beds",
    category: "Information Technology",
    productService: "IoT Vibration & Temperature Probes",
    quantity: "100 Nodes",
    requiredBy: new Date(Date.now() + 15 * 86400000),
    location: "Delhi / NCR",
    preferredLocation: "Delhi",
    budget: "Competitive Hardware Rate",
    urgency: "High",
    description: "Need RS-485 Modbus compatible industrial sensor probes for integration with factory floor analytics gateway.",
    business: rahulBiz.business._id,
    createdBy: rahulBiz.user._id,
    status: "Active",
  });

  const reqRajesh = await PowerRequirement.create({
    title: "Reefer Freight Forwarding Partners for 40ft Food Grain Containers",
    category: "Trading & Export",
    productService: "Reefer Ocean Freight Logistics",
    quantity: "4 Containers / Month",
    requiredBy: new Date(Date.now() + 10 * 86400000),
    location: "Nhava Sheva Port",
    preferredLocation: "Maharashtra",
    budget: "Standard Freight Index",
    urgency: "Immediate",
    description: "Looking for shipping line agents with guaranteed reefer plug-in slots for Jebel Ali and Dammam trade lanes.",
    business: rajeshBiz.business._id,
    createdBy: rajeshBiz.user._id,
    status: "Active",
  });

  const reqJohn = await PowerRequirement.create({
    title: "Direct Indian OEM Castings & Precision Forgings for US Industrial Buyers",
    category: "Manufacturing",
    productService: "High-Pressure Castings",
    quantity: "5,000 Units / Quarter",
    requiredBy: new Date(Date.now() + 45 * 86400000),
    location: "New York / Global",
    preferredLocation: "India",
    budget: "Wholesale Export Contract",
    urgency: "Medium",
    description: "Seeking ISO/TS certified precision foundries to fulfill recurring supply agreements for our North American clients.",
    business: johnBiz.business._id,
    createdBy: johnBiz.user._id,
    status: "Active",
  });

  const reqYamada = await PowerRequirement.create({
    title: "Custom Tooling Fixtures for 6-Axis Collaborative Robotic Manipulators",
    category: "Manufacturing",
    productService: "Cobot Arm Tooling",
    quantity: "20 Sets",
    requiredBy: new Date(Date.now() + 30 * 86400000),
    location: "Tokyo / Global",
    preferredLocation: "Global",
    budget: "¥1,800,000",
    urgency: "High",
    description: "Looking for precision CNC machine shops capable of machining anodized aluminum quick-change end-effectors.",
    business: yamadaBiz.business._id,
    createdBy: yamadaBiz.user._id,
    status: "Active",
  });

  // 17.1 POWER CONNECTIONS (Populating "My Power Network", "Connections", & "Requests")
  // Connection 1: Amit Sharma <-> Rahul Verma (ACCEPTED - in My Network)
  await PowerConnection.create({
    requesterBusiness: amitBiz.business._id,
    requesterUser: amitBiz.user._id,
    receiverBusiness: rahulBiz.business._id,
    receiverUser: rahulBiz.user._id,
    requirement: reqRahul._id,
    message: "Connecting regarding IoT telemetry sensors and CNC machining integration.",
    status: "Accepted",
    respondedAt: new Date(Date.now() - 3 * 86400000),
  });

  // Connection 2: John Miller <-> Amit Sharma (ACCEPTED - in My Network)
  await PowerConnection.create({
    requesterBusiness: johnBiz.business._id,
    requesterUser: johnBiz.user._id,
    receiverBusiness: amitBiz.business._id,
    receiverUser: amitBiz.user._id,
    requirement: reqJohn._id,
    message: "Miller Global Trade would like to add Amit Precision to our verified US export network.",
    status: "Accepted",
    respondedAt: new Date(Date.now() - 86400000),
  });

  // Connection 3: Takashi Yamada -> Amit Sharma (PENDING INCOMING - for Amit to demonstrate clicking Accept!)
  await PowerConnection.create({
    requesterBusiness: yamadaBiz.business._id,
    requesterUser: yamadaBiz.user._id,
    receiverBusiness: amitBiz.business._id,
    receiverUser: amitBiz.user._id,
    requirement: reqYamada._id,
    message: "Yamada Robotics is seeking Indian manufacturing partners for collaborative robotic arm fixtures.",
    status: "Pending", // PENDING INCOMING REQUEST!
  });

  // Connection 4: Amit Sharma -> Rajesh Patel (PENDING OUTGOING - waiting for partner response)
  await PowerConnection.create({
    requesterBusiness: amitBiz.business._id,
    requesterUser: amitBiz.user._id,
    receiverBusiness: rajeshBiz.business._id,
    receiverUser: rajeshBiz.user._id,
    requirement: reqRajesh._id,
    message: "Exploring joint port warehousing logistics and consolidation opportunities.",
    status: "Pending", // PENDING OUTGOING REQUEST!
  });

  // -------------------------------------------------------------------------
  // 18. VISA REFERRAL DESK (1 Approved + 1 Pending Review)
  // -------------------------------------------------------------------------
  console.log("[18/19] Seeding Visa Referral Applications (Approved & Pending)...");
  // 1. Approved Visa Recommendation Letter
  await VisaReferral.create({
    referenceNumber: "VISA-2026-0041",
    applicant: amitBiz.user._id,
    applicantType: "Member",
    fullName: "Amit Sharma",
    email: "amit@gmail.com",
    phone: "+91 22 2830 4567",
    nationality: "Indian",
    destinationCountry: "United States",
    purposeOfVisit: "B2B Trade Conclave & Supplier Evaluation (New York)",
    detailedDescriptionOfVisit: "Representing Amit Precision Engineering at the B2B Industrial Meet hosted by RIFAH New York Chapter.",
    aadharCardUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&q=80",
    panCardUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1000&q=80",
    passportDocUrl: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=1000&q=80",
    addressProofUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1000&q=80",
    passportNumber: "Z5889104",
    passportExpiryDate: new Date(2032, 5, 20),
    status: "Approved", // APPROVED RECOMMENDATION
    adminNotes: "Official chamber recommendation letter issued with digital seal.",
  });

  // 2. Pending Visa Recommendation Letter (Waiting for Admin approval demo!)
  await VisaReferral.create({
    referenceNumber: "VISA-2026-0042",
    applicant: rajeshBiz.user._id,
    applicantType: "Member",
    fullName: "Rajesh Patel",
    email: "rajesh@gmail.com",
    phone: "+91 22 2788 8899",
    nationality: "Indian",
    destinationCountry: "Japan",
    purposeOfVisit: "Tokyo Food & Agriculture Expo 2026",
    detailedDescriptionOfVisit: "Attending trade fair as a delegate to negotiate supply contracts with Tokyo commodity importers.",
    aadharCardUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&q=80",
    panCardUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1000&q=80",
    passportDocUrl: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=1000&q=80",
    addressProofUrl: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1000&q=80",
    passportNumber: "R9940122",
    passportExpiryDate: new Date(2031, 8, 14),
    status: "Pending", // PENDING IN /admin/visa-referrals FOR DEMO!
    adminNotes: "Application documents received; awaiting passport copy verification.",
  });

  // -------------------------------------------------------------------------
  // 19. SUPPORT TICKETS & NOTIFICATIONS
  // -------------------------------------------------------------------------
  console.log("[19/19] Seeding Support Tickets & Real-Time Alerts...");
  await Ticket.create({
    ticketNumber: "TCK-8810",
    business: amitBiz.business._id,
    businessName: amitBiz.business.name,
    contactPerson: "Amit Sharma",
    contactEmail: "amit@gmail.com",
    chapter: "Mumbai Chapter",
    state: "Maharashtra",
    createdBy: amitBiz.user._id,
    category: "Catalogue & Media",
    priority: "Medium",
    subject: "Assistance with 4K video upload on product listing",
    description: "We are attempting to upload a high-resolution CNC machine demo clip. Requesting help with media format optimization.",
    status: "In_Progress",
  });

  await Ticket.create({
    ticketNumber: "TCK-8811",
    business: rahulBiz.business._id,
    businessName: rahulBiz.business.name,
    contactPerson: "Rahul Verma",
    contactEmail: "rahul@gmail.com",
    chapter: "Central Delhi Chapter",
    state: "Delhi",
    createdBy: rahulBiz.user._id,
    category: "Invoicing & GST",
    priority: "Low",
    subject: "Receipt copy for Platinum membership payment",
    description: "Please send our accounts department an e-signed GST invoice copy for the FY 2026-27 renewal.",
    status: "Resolved",
  });

  // Welcome Notification for Central Admin
  await Notification.create({
    recipient: centralAdmin._id,
    type: "System",
    title: "System Ready for Client Presentation",
    body: "All chapters, verification queues, networking leaderboards, and pending workflow items are seeded and active.",
    link: "/admin",
    isRead: false,
  });

  // Summary announcement
  await Announcement.create({
    title: "RIFAH Connect 2.0 Platform Launch & Chapter Rollout",
    message: "Welcome to the unified RIFAH chamber platform. All state secretariats, chapter offices, and verified members can now access live networking and business discovery tools.",
    chapter: "All Chapters",
    author: centralAdmin._id,
    status: "Published",
    publishedAt: new Date(),
  });

  // -------------------------------------------------------------------------
  // 20. MEMBER-TO-MEMBER DIRECT CHAT (Populating Messages Inbox)
  // -------------------------------------------------------------------------
  console.log("[20/25] Seeding Direct Messages & Real-Time Chat Conversation...");
  const convId = `conv_${[String(amitBiz.user._id), String(rahulBiz.user._id)].sort()[0]}_${[String(amitBiz.user._id), String(rahulBiz.user._id)].sort()[1]}`;

  await Message.create({
    conversationId: convId,
    sender: rahulBiz.user._id,
    recipient: amitBiz.user._id,
    text: "Hello Amit! Great connecting at the chamber meet. Wanted to confirm if you received the ERP telemetry specifications?",
    isRead: true,
    createdAt: new Date(Date.now() - 3600000 * 3),
  });

  await Message.create({
    conversationId: convId,
    sender: amitBiz.user._id,
    recipient: rahulBiz.user._id,
    text: "Hi Rahul! Yes, our engineering team reviewed them. The data payload looks solid. Let's review the API architecture on our 1-on-1 meeting tomorrow.",
    isRead: true,
    createdAt: new Date(Date.now() - 3600000 * 2),
  });

  await Message.create({
    conversationId: convId,
    sender: rahulBiz.user._id,
    recipient: amitBiz.user._id,
    text: "Sounds great, see you at Trident BKC lounge! I will bring the sensor datasheets.",
    isRead: false, // UNREAD MESSAGE FOR AMIT SHARMA!
    createdAt: new Date(Date.now() - 1800000),
  });

  // -------------------------------------------------------------------------
  // 21. CHAPTER ADMIN PUBLIC QUERIES DESK
  // -------------------------------------------------------------------------
  console.log("[21/25] Seeding Public Chapter Inquiries Desk...");
  await Query.create({
    fullName: "Vikramaditya Singhania",
    organization: "Singhania Heavy Industries Ltd",
    email: "vikram@singhaniagroup.com",
    phone: "+91 98204 55112",
    desk: "Industrial Trade Desk",
    chapter: "Mumbai Chapter",
    message: "We would like to inquire about reserving a double booth space at the B2B Industrial Pavilion for our precision metal casting machinery.",
    status: "Open", // OPEN INQUIRY WAITING FOR CHAPTER ADMIN!
  });

  await Query.create({
    fullName: "Meera Nair",
    organization: "Nair Global Logistics Solutions",
    email: "meera.nair@nairlogistics.in",
    phone: "+91 98100 88223",
    desk: "Membership & Delegations",
    chapter: "Central Delhi Chapter",
    message: "Requesting guidance on the processing timeline for RIFAH trade visa recommendation letters for our upcoming Tokyo delegation.",
    status: "Replied",
    replyMessage: "Trade delegation letters are processed within 48 chamber business hours upon submission of passport verification documents.",
    repliedAt: new Date(),
    repliedBy: chapterAdmins[2]._id, // Rashid Kamal (Central Delhi Head)
  });

  // -------------------------------------------------------------------------
  // 22. EVENT OPERATIONS - MASTER DIGNITARIES
  // -------------------------------------------------------------------------
  console.log("[22/25] Seeding Event Master Dignitaries & VIP Guest Speakers...");
  await Dignitary.create({
    name: "Dr. Anand K. Joshi",
    category: "Government Official",
    mobile: "+91 98200 77112",
    email: "anand.joshi@msme.gov.in",
    org: "Ministry of MSME, Government of India",
    designation: "Additional Secretary",
    type: "Chief Guest",
    topic: "Scaling Indian MSMEs to Global Supply Chains",
    notes: "Confirmed VIP keynote speaker for Day 1 inaugural plenary.",
    city: "Mumbai",
    state: "Maharashtra",
    createdBy: centralAdmin._id,
  });

  await Dignitary.create({
    name: "His Excellency Tariq Al-Hashimi",
    category: "Diplomatic Delegation",
    mobile: "+971 50 123 4567",
    email: "tariq.hashimi@dubaichamber.ae",
    org: "Dubai Chamber of Commerce & Industry",
    designation: "Head of International Trade Relations",
    type: "Keynote Speaker",
    topic: "Unlocking GCC Bilateral Investment Opportunities",
    notes: "Leading 15-member GCC trade delegation to the Summit.",
    city: "Mumbai",
    state: "Maharashtra",
    createdBy: centralAdmin._id,
  });

  await Dignitary.create({
    name: "Dr. Sunita Mehra",
    category: "Industry Council",
    mobile: "+91 98110 33445",
    email: "sunita.mehra@nsic.co.in",
    org: "National Small Industries Corporation (NSIC)",
    designation: "Director (Technical Cooperation)",
    type: "Guest Speaker",
    topic: "Government Subsidies and Tech Modernization Grants for MSMEs",
    notes: "Hosting afternoon interactive clinic on MSME cluster schemes.",
    city: "Mumbai",
    state: "Maharashtra",
    createdBy: centralAdmin._id,
  });

  // -------------------------------------------------------------------------
  // 23. EVENT OPERATIONS - ATTENDEE FOLLOW-UPS
  // -------------------------------------------------------------------------
  console.log("[23/25] Seeding Event Follow-ups & Post-Meeting Pipelines...");
  await Followup.create({
    type: "event",
    name: "Suresh Gupta",
    mobile: "+91 11 2636 1234",
    email: "suresh@gmail.com",
    company: "Gupta Logistics & Supply Chain",
    status: "interested",
    priority: "high",
    category: "Attendee",
    event: summitEvent._id,
    chapter: "Mumbai Chapter",
    assignedTo: rajeshBiz.user._id,
    notes: [{ content: "Expressed strong interest in upgrading to Platinum Chamber Tier for national freight routing radar.", author: "Rajesh Patel" }],
  });

  await Followup.create({
    type: "event",
    name: "Sarah Jenkins",
    mobile: "+1 212 555 0244",
    email: "sarah@gmail.com",
    company: "Jenkins BioTech Research Inc",
    status: "pending",
    priority: "medium",
    category: "Attendee",
    event: summitEvent._id,
    chapter: "Mumbai Chapter",
    assignedTo: amitBiz.user._id,
    notes: [{ content: "Follow-up requested on clinical trial data center cooling requirements.", author: "Amit Sharma" }],
  });

  await Followup.create({
    type: "membership",
    name: "Sunil Deshmukh",
    mobile: "+91 98201 12345",
    email: "sunil@deshmukhancillaries.com",
    company: "Deshmukh Auto Ancillaries",
    status: "contacted",
    priority: "urgent",
    category: "Prospective Member",
    chapter: "Mumbai Chapter",
    assignedTo: chapterAdmins[0]._id, // Tariq Farooqi
    notes: [{ content: "Passed by Amit Sharma as a warm member referral. Sent welcome brochure.", author: "Tariq Farooqi" }],
  });

  // -------------------------------------------------------------------------
  // 24. EVENT OPERATIONS - DOCUMENTS & CIRCULARS
  // -------------------------------------------------------------------------
  console.log("[24/25] Seeding Event Operations Documents & Circulars...");
  await Document.create({
    title: "RIFAH Global Trade Summit 2026 - Conclave Guide & Floor Plan",
    type: "pdf",
    category: "Conclave",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    size: "2.4 MB",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    roleAccess: [],
    status: "Active",
  });

  await Document.create({
    title: "Bilateral B2B Buyer-Seller Trade Escrow Protocol (2026 Edition)",
    type: "pdf",
    category: "Compliance",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    size: "1.1 MB",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    roleAccess: [],
    status: "Active",
  });

  await Document.create({
    title: "Chamber Code of Conduct & Ethical Networking Guidelines",
    type: "pdf",
    category: "Governance",
    fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    size: "850 KB",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    roleAccess: [],
    status: "Active",
  });

  // -------------------------------------------------------------------------
  // 25. EVENT MEDIA GALLERY
  // -------------------------------------------------------------------------
  console.log("[25/25] Seeding Event Media Gallery (Photos & Highlights)...");
  await EventMedia.create({
    event: summitEvent._id,
    type: "image",
    url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80",
    caption: "Inaugural ribbon cutting and keynote presentation at Jio World Convention Centre",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    state: "Maharashtra",
    visibilityScope: "global",
    eventDate: summitEvent.date,
  });

  await EventMedia.create({
    event: summitEvent._id,
    type: "image",
    url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1000&q=80",
    caption: "Executive B2B Buyer-Seller roundtables and bilateral trade consultations",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    state: "Maharashtra",
    visibilityScope: "global",
    eventDate: summitEvent.date,
  });

  await EventMedia.create({
    event: summitEvent._id,
    type: "image",
    url: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1000&q=80",
    caption: "RIFAH Annual Chamber Awards ceremony honoring top industrial exporters",
    uploadedBy: centralAdmin._id,
    chapter: "Mumbai Chapter",
    state: "Maharashtra",
    visibilityScope: "global",
    eventDate: summitEvent.date,
  });

  console.log("\n==========================================================");
  console.log("SUCCESS! Demo Database Seed Script Generated Successfully.");
  console.log("==========================================================");
  console.log("Standard Password for ALL Accounts: Nexcore1234\n");
  console.log("Central Admin:");
  console.log("  admin@gmail.com\n");
  console.log("Country Admins (Country Module):");
  console.log("  USA:   usa@gmail.com");
  console.log("  Japan: japan@gmail.com\n");
  console.log("State Admins:");
  console.log("  Maharashtra: maharashtra@gmail.com");
  console.log("  Delhi:       delhi@gmail.com\n");
  console.log("Chapter Admins:");
  console.log("  Mumbai:        mumbai@gmail.com");
  console.log("  Pune:          pune@gmail.com");
  console.log("  Central Delhi: centraldelhi@gmail.com");
  console.log("  South Delhi:   southdelhi@gmail.com");
  console.log("  New York:      nychapter@gmail.com");
  console.log("  Tokyo:         tokyochapter@gmail.com\n");
  console.log("Member Businesses (Personal Names & Emails):");
  console.log("  Mumbai 1:        amit@gmail.com     (Amit Sharma - Amit Precision Engineering - Verified)");
  console.log("  Mumbai 2:        rajesh@gmail.com   (Rajesh Patel - Patel Agro & Food Exports - Pending Approval)");
  console.log("  Central Delhi 1: rahul@gmail.com    (Rahul Verma - Rahul Cloud & IT Solutions - Verified)");
  console.log("  Central Delhi 2: suresh@gmail.com   (Suresh Gupta - Gupta Logistics & Supply Chain - Pending Approval)");
  console.log("  USA 1:           john@gmail.com     (John Miller - Miller Global Trade Horizons - Verified)");
  console.log("  USA 2:           sarah@gmail.com    (Sarah Jenkins - Jenkins BioTech Research - Pending Approval)");
  console.log("  Japan 1:         takashi@gmail.com  (Takashi Yamada - Yamada Robotics & Automation - Verified)");
  console.log("  Japan 2:         yuki@gmail.com     (Yuki Tanaka - Tanaka Artisan Fabrics - Pending Approval)");
  console.log("==========================================================");

  await mongoose.disconnect();
}

// Only auto-run if executed directly via node CLI
if (process.argv[1] && process.argv[1].endsWith("seed-demo-data.js")) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed execution failed:", err);
      process.exit(1);
    });
}

export { seed };
