import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Category } from "../src/modules/categories/category.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { Review } from "../src/modules/reviews/review.model.js";
import { hashPassword } from "../src/infrastructure/auth/password.js";
import { ROLES } from "../src/shared/constants/roles.js";
import { generateSlug } from "../src/shared/utils/generate-id.js";
import { addDays } from "../src/shared/utils/date.js";

const seedData = async () => {
  try {
    console.log("🌱 Connecting to MongoDB for comprehensive seeding...");
    await mongoose.connect(env.DATABASE.URI);

    // 1. Clear previous seed collections
    console.log("Clearing existing data...");
    await Promise.all([
      User.deleteMany({ email: { $ne: "secretariat@rifah.org" } }),
      Business.deleteMany({}),
      Category.deleteMany({}),
      Chapter.deleteMany({}),
      Catalogue.deleteMany({}),
      Event.deleteMany({}),
      Membership.deleteMany({}),
      Review.deleteMany({}),
    ]);

    // 2. Seed Categories
    console.log("Seeding Categories...");
    const categoryNames = [
      { name: "IT & Software Services", parent: "Technology", icon: "laptop" },
      { name: "Industrial Machinery & Tools", parent: "Manufacturing", icon: "cog" },
      { name: "Halal Food & Spices Export", parent: "Trading & Export", icon: "utensils" },
      { name: "Solar & Clean Energy", parent: "Green Tech", icon: "sun" },
      { name: "Islamic Fintech & Advisory", parent: "Financial Services", icon: "briefcase" },
      { name: "Textiles & Apparel", parent: "Manufacturing", icon: "tshirt" },
      { name: "Healthcare & Pharmaceuticals", parent: "Healthcare", icon: "heart" },
      { name: "Logistics & Supply Chain", parent: "Logistics", icon: "truck" },
    ];

    const seededCategories = await Category.insertMany(
      categoryNames.map((c) => ({
        name: c.name,
        slug: generateSlug(c.name),
        parent: c.parent,
        icon: c.icon,
        businessCount: 1,
        status: "Active",
      }))
    );
    console.log(`✅ Seeded ${seededCategories.length} Categories`);

    // 3. Seed Chapters & Units
    console.log("Seeding Chapters...");
    const chapterData = [
      {
        name: "Mumbai Chapter",
        city: "Mumbai",
        state: "Maharashtra",
        lead: "Tariq Farooqi",
        businessesCount: 42,
        membersCount: 180,
        eventsCount: 14,
        units: [
          { name: "Trade Facilitation Unit", focus: "Cross-border trade & customs guidance", membersCount: 18, status: "Active" },
          { name: "MSME Support Desk", focus: "Subsidies, documentation & credit facilitation", membersCount: 24, status: "Active" },
          { name: "Digital Adoption Cell", focus: "Cloud onboarding, ERP & digital payments", membersCount: 12, status: "Active" },
          { name: "Women in Business Unit", focus: "Mentorship & leadership circles", membersCount: 15, status: "Active" },
        ],
      },
      {
        name: "Hyderabad Chapter",
        city: "Hyderabad",
        state: "Telangana",
        lead: "Ayesha Siddiqui",
        businessesCount: 28,
        membersCount: 120,
        eventsCount: 9,
        units: [
          { name: "IT & Startup Accelerator", focus: "Tech scaling and angel connects", membersCount: 14, status: "Active" },
          { name: "Pharma & Biotech Wing", focus: "Clinical supplies and regulatory support", membersCount: 9, status: "Active" },
        ],
      },
      {
        name: "Delhi NCR Chapter",
        city: "New Delhi",
        state: "Delhi",
        lead: "Rashid Kamal",
        businessesCount: 35,
        membersCount: 150,
        eventsCount: 11,
        units: [
          { name: "Policy Advocacy & Liaison", focus: "Chamber representation with ministries", membersCount: 8, status: "Active" },
          { name: "Logistics Corridor Cell", focus: "Freight efficiency & warehouse networking", membersCount: 16, status: "Active" },
        ],
      },
    ];

    const seededChapters = await Chapter.insertMany(
      chapterData.map((c) => ({
        ...c,
        slug: generateSlug(c.name),
        status: "Active",
      }))
    );
    console.log(`✅ Seeded ${seededChapters.length} Chapters`);

    // 4. Seed Demo Users (Business Owners & Buyers)
    console.log("Seeding Demo Users...");
    const defaultPasswordHash = await hashPassword("User@123456");

    const usersData = [
      {
        name: "Zameer Qureshi",
        email: "zameer@alameenmachinery.com",
        passwordHash: defaultPasswordHash,
        phone: "+91 98201 44521",
        role: ROLES.BUSINESS_OWNER,
        chapter: "Mumbai Chapter",
        status: "Active",
      },
      {
        name: "Irfan Merchant",
        email: "irfan@barakahfoods.in",
        passwordHash: defaultPasswordHash,
        phone: "+91 97654 32100",
        role: ROLES.BUSINESS_OWNER,
        chapter: "Mumbai Chapter",
        status: "Active",
      },
      {
        name: "Farhan Ansari",
        email: "farhan@crescenttech.io",
        passwordHash: defaultPasswordHash,
        phone: "+91 98900 11223",
        role: ROLES.BUSINESS_OWNER,
        chapter: "Hyderabad Chapter",
        status: "Active",
      },
      {
        name: "Bilal Sheikh",
        email: "bilal.buyer@globalprocure.com",
        passwordHash: defaultPasswordHash,
        phone: "+91 98200 99887",
        role: ROLES.CUSTOMER,
        chapter: "Mumbai Chapter",
        status: "Active",
      },
    ];

    const seededUsers = await User.insertMany(usersData);
    console.log(`✅ Seeded ${seededUsers.length} Users`);

    // 5. Seed Demo Businesses
    console.log("Seeding Demo Businesses...");
    const businessesData = [
      {
        name: "Al-Ameen Industrial Machinery Ltd.",
        slug: "al-ameen-industrial-machinery-ltd",
        tagline: "Precision CNC machinery & industrial automation components",
        about: "Leading manufacturer and exporter of heavy-duty industrial cutting machines, precision lathes, and automated packaging equipment certified for Middle East and EU markets.",
        industry: "Manufacturing",
        categories: ["Industrial Machinery & Tools"],
        businessType: "Private Limited",
        city: "Mumbai",
        state: "Maharashtra",
        chapter: "Mumbai Chapter",
        membership: "Enterprise",
        verification: "verified",
        rating: 4.9,
        reviewsCount: 18,
        employees: "50–250",
        founded: "2008",
        website: "https://alameenmachinery.com",
        phone: "+91 22 2876 5432",
        email: "contact@alameenmachinery.com",
        featured: true,
        accent: "from-blue-600 to-indigo-800",
        owner: seededUsers[0]._id,
      },
      {
        name: "Barakah Agro & Spices Export",
        slug: "barakah-agro-spices-export",
        tagline: "Farm-direct organic spices, grain & premium dry fruits",
        about: "APEDA & FSSAI certified agro-trading house providing batch-tested whole spices, basmati rice, and organic cold-pressed culinary oils with end-to-end trace certificates.",
        industry: "Trading & Export",
        categories: ["Halal Food & Spices Export"],
        businessType: "Partnership",
        city: "Mumbai",
        state: "Maharashtra",
        chapter: "Mumbai Chapter",
        membership: "Premium",
        verification: "verified",
        rating: 4.8,
        reviewsCount: 24,
        employees: "20–50",
        founded: "2014",
        website: "https://barakahfoods.in",
        phone: "+91 22 2341 8899",
        email: "export@barakahfoods.in",
        featured: true,
        accent: "from-emerald-600 to-teal-800",
        owner: seededUsers[1]._id,
      },
      {
        name: "Crescent Enterprise Solutions",
        slug: "crescent-enterprise-solutions",
        tagline: "Scalable SaaS, Custom ERP & Cloud Infrastructure",
        about: "Full-stack enterprise IT consultancy specializing in high-throughput database design, B2B procurement portals, and microservices architecture.",
        industry: "Technology",
        categories: ["IT & Software Services"],
        businessType: "Private Limited",
        city: "Hyderabad",
        state: "Telangana",
        chapter: "Hyderabad Chapter",
        membership: "Basic",
        verification: "verified",
        rating: 4.7,
        reviewsCount: 12,
        employees: "10–50",
        founded: "2019",
        website: "https://crescenttech.io",
        phone: "+91 40 4567 8901",
        email: "hello@crescenttech.io",
        featured: false,
        accent: "from-purple-600 to-indigo-900",
        owner: seededUsers[2]._id,
      },
    ];

    const seededBusinesses = await Business.insertMany(businessesData);
    console.log(`✅ Seeded ${seededBusinesses.length} Businesses`);

    // 6. Seed Catalogue Items
    console.log("Seeding Catalogue Items...");
    const catalogueData = [
      {
        name: "Al-Ameen 5-Axis Heavy CNC Milling Center",
        slug: "al-ameen-5-axis-heavy-cnc-milling-center",
        business: seededBusinesses[0]._id,
        type: "Product",
        category: "Industrial Machinery & Tools",
        description: "High-torque multi-spindle milling workstation with Siemens 840D controller for aerospace and automotive mold tooling.",
        city: "Mumbai",
        moq: "1 unit",
        price: "₹ 18,50,000 / unit",
        status: "Active",
      },
      {
        name: "Single-Origin Tellicherry Black Pepper (50kg Jute Sacks)",
        slug: "single-origin-tellicherry-black-pepper",
        business: seededBusinesses[1]._id,
        type: "Product",
        category: "Halal Food & Spices Export",
        description: "Bold 4.5mm sun-dried black peppercorns with moisture content under 11%, fumigated and phytosanitary certified for international shipping.",
        city: "Mumbai",
        moq: "500 kg",
        price: "₹ 580 / kg",
        status: "Active",
      },
      {
        name: "Custom B2B Commerce Portal & ERP Integration",
        slug: "custom-b2b-commerce-portal-erp-integration",
        business: seededBusinesses[2]._id,
        type: "Service",
        category: "IT & Software Services",
        description: "Turnkey multi-vendor supplier directory with integrated GST invoice engine, RFQ dispatch, and payment gateway connect.",
        city: "Hyderabad",
        moq: "1 project",
        price: "₹ 1,50,000 / deployment",
        status: "Active",
      },
    ];

    const seededCatalogue = await Catalogue.insertMany(catalogueData);
    console.log(`✅ Seeded ${seededCatalogue.length} Catalogue Items`);

    // 7. Seed Events
    console.log("Seeding Events...");
    const eventsData = [
      {
        title: "RIFAH Global Business Summit 2026",
        slug: "rifah-global-business-summit-2026",
        summary: "Annual international trade congregation bringing together 500+ MSME delegates, bilateral export delegations, and investment catalysts.",
        date: "2026-10-15",
        time: "09:30 AM - 05:30 PM",
        venue: "Jio World Convention Centre, BKC",
        city: "Mumbai",
        chapter: "Mumbai Chapter",
        mode: "In-person",
        organizer: "RIFAH Central Secretariat",
        fee: "Complimentary for Members / ₹ 1,500 Guests",
        seats: 400,
        registeredCount: 142,
        status: "Upcoming",
        agenda: [
          { time: "09:30 AM", title: "Keynote: India-GCC Export Corridors & Free Trade Pacts", speaker: "Dr. Aslam Merchant" },
          { time: "11:30 AM", title: "Panel: Raising Ethical VC & Non-Dilutive MSME Debt", speaker: "Fintech Advisory Board" },
          { time: "02:30 PM", title: "B2B Matchmaking & 1-on-1 Buyer Meetings", speaker: "Chamber Trade Officers" },
        ],
      },
      {
        title: "MSME Digital Export Masterclass & ONDC Onboarding",
        slug: "msme-digital-export-masterclass-ondc-onboarding",
        summary: "Hands-on workshop for manufacturing and food export businesses to list on government-backed export corridors and ONDC protocols.",
        date: "2026-09-22",
        time: "03:00 PM - 06:00 PM",
        venue: "Virtual Chamber Webcast Room A",
        city: "Mumbai",
        chapter: "Mumbai Chapter",
        mode: "Online",
        organizer: "Digital Adoption Cell",
        fee: "Free",
        seats: 250,
        registeredCount: 98,
        status: "Upcoming",
        agenda: [
          { time: "03:00 PM", title: "Fulfilling International Compliance & Barcode Standards" },
          { time: "04:30 PM", title: "Live Demo: API Integration with Global Marketplaces" },
        ],
      },
    ];

    const seededEvents = await Event.insertMany(eventsData);
    console.log(`✅ Seeded ${seededEvents.length} Events`);

    // 8. Seed Memberships for Businesses
    console.log("Seeding Memberships...");
    const memberships = [
      {
        business: seededBusinesses[0]._id,
        planId: "enterprise",
        planName: "Enterprise",
        price: 29999,
        startDate: new Date(),
        endDate: addDays(365),
        status: "Active",
        features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"],
      },
      {
        business: seededBusinesses[1]._id,
        planId: "premium",
        planName: "Premium",
        price: 12999,
        startDate: new Date(),
        endDate: addDays(365),
        status: "Active",
        features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"],
      },
      {
        business: seededBusinesses[2]._id,
        planId: "basic",
        planName: "Basic",
        price: 4999,
        startDate: new Date(),
        endDate: addDays(365),
        status: "Active",
        features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"],
      },
    ];

    await Membership.insertMany(memberships);
    console.log(`✅ Seeded Memberships for demo businesses`);

    // 9. Seed Reviews
    console.log("Seeding Reviews...");
    const reviewsData = [
      {
        business: seededBusinesses[0]._id,
        author: seededUsers[3]._id,
        authorName: seededUsers[3].name,
        rating: 5,
        title: "Outstanding precision and timely dispatch",
        body: "Procured custom milling components for our factory line. Machine tolerances were spot-on with CE certifications provided upfront.",
        status: "approved",
      },
      {
        business: seededBusinesses[1]._id,
        author: seededUsers[3]._id,
        authorName: seededUsers[3].name,
        rating: 5,
        title: "Top-tier pepper quality for overseas export",
        body: "Clean moisture testing and well-packaged jute sacks. Our overseas consignee cleared customs in UAE without any hurdles.",
        status: "approved",
      },
    ];

    await Review.insertMany(reviewsData);
    console.log(`✅ Seeded ${reviewsData.length} Reviews`);

    console.log("\n🎉 ALL SEEDING COMPLETED SUCCESSFULLY!");
    console.log("--------------------------------------------------");
    console.log(`👤 Admin: secretariat@rifah.org / Admin@123456`);
    console.log(`🏢 Business Owner: zameer@alameenmachinery.com / User@123456`);
    console.log(`🛒 Buyer Account: bilal.buyer@globalprocure.com / User@123456`);
    console.log("--------------------------------------------------\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedData();
