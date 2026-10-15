import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/infrastructure/database/mongoose.js";
import { User } from "../src/modules/users/user.model.js";
import { Business } from "../src/modules/businesses/business.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { Catalogue } from "../src/modules/catalogue/catalogue.model.js";
import { Post } from "../src/modules/posts/post.model.js";
import { Message } from "../src/modules/messages/message.model.js";
import { OneToOne } from "../src/modules/networking/one-to-one.model.js";
import { ThankYouNote } from "../src/modules/networking/thank-you-note.model.js";
import { Referral } from "../src/modules/networking/referral.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { Category } from "../src/modules/categories/category.model.js";
import { membershipService } from "../src/modules/memberships/membership.service.js";
import { userService } from "../src/modules/users/user.service.js";
import { catalogueService } from "../src/modules/catalogue/catalogue.service.js";
import { postService } from "../src/modules/posts/post.service.js";
import { messageService } from "../src/modules/messages/message.service.js";
import { oneToOneService } from "../src/modules/networking/one-to-one.service.js";
import { thankYouNoteService } from "../src/modules/networking/thank-you-note.service.js";
import { referralService } from "../src/modules/networking/referral.service.js";
import {
  resolveMemberPlanContext,
  checkFeatureAccess,
  SUBSCRIBER_TIER_CONFIG,
} from "../src/shared/utils/feature-access.js";

/**
 * Generates dynamic run identifier to ensure complete uniqueness.
 */
function createRunId() {
  const rand = Math.random().toString(36).substring(2, 7);
  return `${Date.now().toString(36)}-${rand}`;
}

async function runTests() {
  console.log("==================================================================");
  console.log("RIFAH CONNECT — DYNAMIC SUBSCRIPTION & FEATURE GATING SUITE");
  console.log("==================================================================\n");

  await connectDatabase();

  const runId = createRunId();

  // -----------------------------------------------------------------
  // 0. Optional: Target Existing Live User from Command Line
  //    Usage: node scratch/test-tier-upgrade-e2e.js <user_email_or_id>
  // -----------------------------------------------------------------
  const cliTarget = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
  if (cliTarget) {
    console.log(`🔍 [DYNAMIC INSPECT] Querying live database for target: "${cliTarget}"...`);
    const isObjectId = mongoose.isValidObjectId(cliTarget);
    const existingUser = await User.findOne({
      $or: [
        { email: cliTarget },
        ...(isObjectId ? [{ _id: cliTarget }] : []),
      ],
    });

    if (!existingUser) {
      console.error(`❌ User not found with email or ID: "${cliTarget}"`);
      await disconnectDatabase();
      process.exit(1);
    }

    const resolvedContext = await resolveMemberPlanContext(existingUser._id);
    const userBiz = await Business.findOne({ owner: existingUser._id });

    console.log("\n--- LIVE DYNAMIC USER STATUS ---");
    console.log("User ID:         ", existingUser._id.toString());
    console.log("Name:            ", existingUser.name);
    console.log("Email:           ", existingUser.email);
    console.log("Subscriber Tier: ", existingUser.subscriberTier || "(none)");
    console.log("Membership Plan: ", existingUser.membershipPlan || "(none)");
    console.log("Business:        ", userBiz ? `${userBiz.name} (Tier: ${userBiz.subscriberTier || "none"})` : "(No business)");
    console.log("Resolved Tier:   ", resolvedContext.tierKey, `(${resolvedContext.tierName})`);
    console.log("Resolved Rank:   ", resolvedContext.rank);
    console.log("Is Free Plan:    ", resolvedContext.isFree);

    console.log("\n--- FEATURE ACCESS & DYNAMIC QUOTAS ---");
    const testFeatures = [
      "product_listing",
      "service_listing",
      "feed_posting",
      "chat",
      "enquiry_posting",
      "lead_unlock",
      "meeting_request",
      "featured_business",
      "whatsapp_integration",
      "multiple_locations",
    ];

    for (const feat of testFeatures) {
      const access = await checkFeatureAccess(existingUser._id, feat);
      const limitStr = access.limit === Infinity ? "Unlimited" : access.limit;
      const statusIcon = access.isAllowed ? "✅ ALLOWED" : "⛔ BLOCKED";
      console.log(
        `  ${statusIcon} [${feat.padEnd(22)}] Used: ${String(access.currentUsage).padStart(2)} / Limit: ${String(limitStr).padStart(9)} ${
          !access.isAllowed && access.reason ? `(${access.reason})` : ""
        }`
      );
    }

    console.log("\n==================================================================");
    console.log("✓ Dynamic user inspection completed successfully.");
    console.log("==================================================================");
    await disconnectDatabase();
    return;
  }

  // -----------------------------------------------------------------
  // 1. Fetch Dynamic Context from Live Database (Chapters, Categories, Tiers)
  // -----------------------------------------------------------------
  console.log("1. Fetching live dynamic context from MongoDB...");

  // Query live Chapter from DB
  const liveChapter = (await Chapter.findOne({ status: "Active" })) || (await Chapter.findOne());
  const chapterId = liveChapter?._id || new mongoose.Types.ObjectId();
  const chapterName = liveChapter?.name || `Dynamic Chapter ${runId}`;
  const chapterCity = liveChapter?.city || "Dynamic City";
  const chapterState = liveChapter?.state || liveChapter?.city || "Dynamic State";

  console.log(`   ✓ Chapter:  "${chapterName}" in ${chapterCity}, ${chapterState} (ID: ${chapterId})`);

  // Query live Category from DB
  const liveCategory = (await Category.findOne({ status: "Active" })) || (await Category.findOne());
  const categoryName = liveCategory?.name || `Dynamic Sector ${runId}`;
  console.log(`   ✓ Category: "${categoryName}"`);

  // Dynamic Tier Limits from authoritative Matrix
  const tier1Config = SUBSCRIBER_TIER_CONFIG.tier_1;
  const tier2Config = SUBSCRIBER_TIER_CONFIG.tier_2;
  const tier3Config = SUBSCRIBER_TIER_CONFIG.tier_3;
  const tier4Config = SUBSCRIBER_TIER_CONFIG.tier_4;

  const t1ProductLimit = Number(tier1Config.product_listing);
  const t1ServiceLimit = Number(tier1Config.service_listing);

  const t2ProductLimit = Number(tier2Config.product_listing);
  const t2ServiceLimit = Number(tier2Config.service_listing);
  const t2FeedLimit = Number(tier2Config.feed_posting);
  const t2ChatLimit = Number(tier2Config.chat);
  const t2MeetingLimit = Number(tier2Config.meeting_request);

  console.log(`   ✓ Matrix Limits Loaded Dynamically:`);
  console.log(`     - Tier I : Products=${t1ProductLimit}, Services=${t1ServiceLimit}`);
  console.log(`     - Tier II: Products=${t2ProductLimit}, Services=${t2ServiceLimit}, Feeds=${t2FeedLimit}, Chats=${t2ChatLimit}, Meetings=${t2MeetingLimit}`);

  // Dynamic Entity Identifiers
  const testUserName = `Dynamic Member ${runId.toUpperCase()}`;
  const testEmail = `member-${runId}@rifah-dynamic.test`;
  const testBizName = `Enterprise ${runId.toUpperCase()} Solutions`;
  const testBizSlug = `biz-${runId}`;

  const partnerUserName = `Dynamic Partner ${runId.toUpperCase()}`;
  const partnerEmail = `partner-${runId}@rifah-dynamic.test`;
  const partnerBizName = `Partner Hub ${runId.toUpperCase()}`;
  const partnerBizSlug = `partner-${runId}`;

  let testUser = null;
  let partnerUser = null;
  let testBusiness = null;
  let partnerBusiness = null;
  const createdRecipients = [];

  // Helper generators for dynamic items
  function dynamicProductData(index, tierTag) {
    const randomPrice = Math.floor(Math.random() * 850) + 150;
    return {
      name: `${categoryName} Product ${runId}-${tierTag}-${index}`,
      type: "Product",
      businessId: testBusiness._id,
      price: String(randomPrice),
      category: categoryName,
      description: `Dynamic description for product #${index} generated at ${new Date().toISOString()}`,
    };
  }

  function dynamicServiceData(index, tierTag) {
    const randomPrice = Math.floor(Math.random() * 1200) + 300;
    return {
      name: `${categoryName} Service ${runId}-${tierTag}-${index}`,
      type: "Service",
      businessId: testBusiness._id,
      price: String(randomPrice),
      category: categoryName,
      description: `Dynamic description for service #${index} generated at ${new Date().toISOString()}`,
    };
  }

  try {
    // -------------------------------------------------------------
    // 2. Setup Dynamic Test Users and Businesses
    // -------------------------------------------------------------
    console.log("\n2. Creating dynamic test users and businesses linked to live chapter...");
    testUser = await User.create({
      name: testUserName,
      email: testEmail,
      role: "business_owner",
      subscriberTier: "tier_1",
      membershipPlan: tier1Config.name,
      accountType: "business",
    });

    partnerUser = await User.create({
      name: partnerUserName,
      email: partnerEmail,
      role: "business_owner",
      subscriberTier: "tier_4",
      membershipPlan: tier4Config.name,
      accountType: "business",
    });

    testBusiness = await Business.create({
      name: testBizName,
      slug: testBizSlug,
      owner: testUser._id,
      email: testEmail,
      subscriberTier: "tier_1",
      membership: "Free",
      status: "Active",
      state: chapterState,
      city: chapterCity,
      chapter: chapterName,
      chapterId: chapterId,
    });

    partnerBusiness = await Business.create({
      name: partnerBizName,
      slug: partnerBizSlug,
      owner: partnerUser._id,
      email: partnerEmail,
      subscriberTier: "tier_4",
      membership: tier4Config.name,
      status: "Active",
      state: chapterState,
      city: chapterCity,
      chapter: chapterName,
      chapterId: chapterId,
    });

    await Membership.create({
      business: testBusiness._id,
      planId: "tier_1",
      planName: tier1Config.name,
      subscriberTier: "tier_1",
      price: tier1Config.monthlyCost,
      status: "Active",
      startDate: new Date(),
    });

    console.log("   ✓ Dynamic Test User ID:     ", testUser._id.toString());
    console.log("   ✓ Dynamic Test Business ID: ", testBusiness._id.toString());
    console.log("   ✓ Linked to Live Chapter:   ", chapterName);

    // -------------------------------------------------------------
    // TEST 1: Tier I (Free) Restrictions
    // -------------------------------------------------------------
    console.log("\n3. [TEST] Validating Tier I (Free) Feature Limits Dynamically...");

    // 3.1 Context resolution
    const t1Context = await resolveMemberPlanContext(testUser._id);
    if (t1Context.tierKey !== "tier_1" || !t1Context.isFree) {
      throw new Error(`Expected tier_1 context, got: ${JSON.stringify(t1Context)}`);
    }
    console.log(`   ✓ Tier context resolved dynamically to "${t1Context.tierName}" (isFree: ${t1Context.isFree}).`);

    // 3.2 Dynamic Product Quota under Tier I
    console.log(`   Adding ${t1ProductLimit} product(s) allowed under Tier I dynamic quota...`);
    for (let i = 1; i <= t1ProductLimit; i++) {
      await catalogueService.createItem(dynamicProductData(i, "t1"), testUser);
    }
    console.log(`   ✓ Exactly ${t1ProductLimit} product created successfully under Tier I.`);

    let prodOverflowBlocked = false;
    try {
      await catalogueService.createItem(dynamicProductData(t1ProductLimit + 1, "t1_overflow"), testUser);
    } catch (err) {
      prodOverflowBlocked = true;
      console.log(`   ✓ Overflow Product #${t1ProductLimit + 1} correctly blocked: "${err.message}"`);
    }
    if (!prodOverflowBlocked) throw new Error("Tier I user was able to exceed dynamic product quota!");

    // 3.3 Dynamic Service Quota under Tier I
    console.log(`   Adding ${t1ServiceLimit} service(s) allowed under Tier I dynamic quota...`);
    for (let i = 1; i <= t1ServiceLimit; i++) {
      await catalogueService.createItem(dynamicServiceData(i, "t1"), testUser);
    }
    console.log(`   ✓ Exactly ${t1ServiceLimit} service created successfully under Tier I.`);

    let servOverflowBlocked = false;
    try {
      await catalogueService.createItem(dynamicServiceData(t1ServiceLimit + 1, "t1_overflow"), testUser);
    } catch (err) {
      servOverflowBlocked = true;
      console.log(`   ✓ Overflow Service #${t1ServiceLimit + 1} correctly blocked: "${err.message}"`);
    }
    if (!servOverflowBlocked) throw new Error("Tier I user was able to exceed dynamic service quota!");

    // 3.4 Feed posting blocked on Tier I (limit: 0)
    let feedBlocked = false;
    try {
      await postService.createPost(
        {
          caption: `Dynamic Tier I Post Attempt ${runId}`,
          image: `https://rifah-dynamic.test/posts/${runId}.jpg`,
        },
        testUser
      );
    } catch (err) {
      feedBlocked = true;
      console.log(`   ✓ Feed posting correctly blocked on Tier I: "${err.message}"`);
    }
    if (!feedBlocked) throw new Error("Tier I user was able to publish a feed!");

    // 3.5 Chat blocked on Tier I (limit: 0)
    let chatBlocked = false;
    try {
      await messageService.sendMessage(
        {
          recipientId: partnerUser._id,
          text: `Dynamic greeting from ${runId}`,
        },
        testUser._id
      );
    } catch (err) {
      chatBlocked = true;
      console.log(`   ✓ Direct chat correctly blocked on Tier I: "${err.message}"`);
    }
    if (!chatBlocked) throw new Error("Tier I user was able to start a direct chat!");

    // 3.6 Meeting request blocked on Tier I (limit: 0)
    let meetingBlocked = false;
    try {
      await oneToOneService.create(testUser._id, {
        memberBusinessId: partnerBusiness._id,
        meetingDate: new Date(Date.now() + 86400000).toISOString(),
        meetingTime: "10:30 AM",
        location: `${chapterCity} Trade Centre`,
        description: `Dynamic meeting invitation ${runId}`,
        initiatedBy: "self",
      });
    } catch (err) {
      meetingBlocked = true;
      console.log(`   ✓ Meeting request correctly blocked on Tier I: "${err.message}"`);
    }
    if (!meetingBlocked) throw new Error("Tier I user was able to create a meeting request!");

    // 3.7 Referral creation blocked on Tier I (networking_groups: 0)
    let referralBlocked = false;
    try {
      await referralService.create(testUser._id, {
        referredBusinessId: partnerBusiness._id,
        leadName: `Dynamic Referral Lead ${runId}`,
        description: `Dynamic referral requirement ${runId}`,
      });
    } catch (err) {
      referralBlocked = true;
      console.log(`   ✓ Referral creation correctly blocked on Tier I: "${err.message}"`);
    }
    if (!referralBlocked) throw new Error("Tier I user was able to create a referral!");

    // 3.8 Thank You Note IS ALLOWED on Tier I
    const t1Note = await thankYouNoteService.create(testUser._id, {
      counterpartBusinessId: partnerBusiness._id,
      amount: 2500,
      note: `Dynamic thank you note from Free User ${runId}`,
    });
    if (!t1Note || !t1Note._id) throw new Error("Tier I user failed to create a Thank You Note!");
    console.log(`   ✓ Thank You Note recorded successfully on Tier I (Free plan access verified)!`);

    // -------------------------------------------------------------
    // TEST 2: Upgrade to Tier II (Starter)
    // -------------------------------------------------------------
    console.log(`\n4. [TEST] Upgrading user to Tier II (${tier2Config.name})...`);
    await membershipService.upgradePlan(testBusiness._id, "tier_2");

    // Dynamic verification of upgraded records
    const freshUser = await User.findById(testUser._id);
    const freshBiz = await Business.findById(testBusiness._id);
    const freshMem = await Membership.findOne({ business: testBusiness._id });

    console.log("   Dynamic DB State after upgrade:");
    console.log("     - User subscriberTier:      ", freshUser.subscriberTier);
    console.log("     - User membershipPlan:      ", freshUser.membershipPlan);
    console.log("     - Business subscriberTier:  ", freshBiz.subscriberTier);
    console.log("     - Membership subscriberTier:", freshMem.subscriberTier);
    console.log("     - Membership status:        ", freshMem.status);
    console.log("     - Membership valid until:   ", freshMem.endDate);

    if (freshUser.subscriberTier !== "tier_2" || freshBiz.subscriberTier !== "tier_2" || freshMem.subscriberTier !== "tier_2") {
      throw new Error(`DB state mismatch on upgrade: user=${freshUser.subscriberTier}, biz=${freshBiz.subscriberTier}, mem=${freshMem.subscriberTier}`);
    }

    const t2Context = await resolveMemberPlanContext(testUser._id);
    if (t2Context.tierKey !== "tier_2" || t2Context.isFree) {
      throw new Error(`Resolved context must be tier_2 and paid, got: ${JSON.stringify(t2Context)}`);
    }
    console.log(`   ✓ User is dynamically recognized as Tier II (${tier2Config.name})!`);

    // -------------------------------------------------------------
    // TEST 3: Tier II Features & Dynamic Quotas
    // -------------------------------------------------------------
    console.log("\n5. [TEST] Validating Tier II Quota Enforcement from Matrix...");

    // 5.1 Products up to t2ProductLimit allowed (preserving previous product)
    const existingProductsCount = await Catalogue.countDocuments({ business: testBusiness._id, type: "Product" });
    console.log(`   Existing products preserved in DB: ${existingProductsCount}`);
    if (existingProductsCount !== t1ProductLimit) {
      throw new Error("Existing products were unexpectedly modified or deleted on upgrade!");
    }

    console.log(`   Dynamically filling products up to Tier II limit (${t2ProductLimit})...`);
    for (let i = existingProductsCount + 1; i <= t2ProductLimit; i++) {
      await catalogueService.createItem(dynamicProductData(i, "t2"), freshUser);
    }
    console.log(`   ✓ Successfully listed ${t2ProductLimit} products under Tier II!`);

    let t2ProdOverflowBlocked = false;
    try {
      await catalogueService.createItem(dynamicProductData(t2ProductLimit + 1, "t2_overflow"), freshUser);
    } catch (err) {
      t2ProdOverflowBlocked = true;
      console.log(`   ✓ Product #${t2ProductLimit + 1} blocked under Tier II quota: "${err.message}"`);
    }
    if (!t2ProdOverflowBlocked) throw new Error("Tier II user was able to exceed product quota!");

    // 5.2 Services up to t2ServiceLimit allowed
    const existingServicesCount = await Catalogue.countDocuments({ business: testBusiness._id, type: "Service" });
    console.log(`   Dynamically filling services up to Tier II limit (${t2ServiceLimit})...`);
    for (let i = existingServicesCount + 1; i <= t2ServiceLimit; i++) {
      await catalogueService.createItem(dynamicServiceData(i, "t2"), freshUser);
    }
    console.log(`   ✓ Successfully listed ${t2ServiceLimit} services under Tier II!`);

    let t2ServOverflowBlocked = false;
    try {
      await catalogueService.createItem(dynamicServiceData(t2ServiceLimit + 1, "t2_overflow"), freshUser);
    } catch (err) {
      t2ServOverflowBlocked = true;
      console.log(`   ✓ Service #${t2ServiceLimit + 1} blocked under Tier II quota: "${err.message}"`);
    }
    if (!t2ServOverflowBlocked) throw new Error("Tier II user was able to exceed service quota!");

    // 5.3 Feeds up to t2FeedLimit allowed
    console.log(`   Publishing ${t2FeedLimit} feed posts under Tier II quota...`);
    for (let i = 1; i <= t2FeedLimit; i++) {
      await postService.createPost(
        {
          caption: `Dynamic Tier II Post ${runId}-${i}`,
          image: `https://rifah-dynamic.test/feeds/${runId}-${i}.jpg`,
        },
        freshUser
      );
    }
    console.log(`   ✓ Successfully posted ${t2FeedLimit} feeds under Tier II!`);

    let t2FeedOverflowBlocked = false;
    try {
      await postService.createPost(
        {
          caption: `Dynamic Feed Overflow Attempt ${runId}`,
          image: `https://rifah-dynamic.test/feeds/overflow-${runId}.jpg`,
        },
        freshUser
      );
    } catch (err) {
      t2FeedOverflowBlocked = true;
      console.log(`   ✓ Feed #${t2FeedLimit + 1} blocked under Tier II monthly quota: "${err.message}"`);
    }
    if (!t2FeedOverflowBlocked) throw new Error("Tier II user was able to exceed feed quota!");

    // 5.4 Direct Chats up to t2ChatLimit allowed
    console.log(`   Starting ${t2ChatLimit} direct chat conversations under Tier II quota...`);
    for (let i = 1; i <= t2ChatLimit; i++) {
      const recUser = await User.create({
        name: `Dynamic Chat Peer ${runId}-${i}`,
        email: `peer-${runId}-${i}@rifah-test.com`,
        role: "business_owner",
      });
      createdRecipients.push(recUser);
      await messageService.sendMessage(
        {
          recipientId: recUser._id,
          text: `Dynamic conversation handshake ${runId}-${i}`,
        },
        testUser._id
      );
    }
    console.log(`   ✓ Successfully started ${t2ChatLimit} direct chat conversations!`);

    const overflowPeer = await User.create({
      name: `Dynamic Overflow Peer ${runId}`,
      email: `peer-overflow-${runId}@rifah-test.com`,
      role: "business_owner",
    });
    createdRecipients.push(overflowPeer);

    let t2ChatOverflowBlocked = false;
    try {
      await messageService.sendMessage(
        {
          recipientId: overflowPeer._id,
          text: `Overflow chat message from ${runId}`,
        },
        testUser._id
      );
    } catch (err) {
      t2ChatOverflowBlocked = true;
      console.log(`   ✓ Conversation #${t2ChatLimit + 1} blocked under Tier II quota: "${err.message}"`);
    }
    if (!t2ChatOverflowBlocked) throw new Error("Tier II user was able to exceed direct chat quota!");

    // 5.5 Meeting Requests up to t2MeetingLimit allowed
    console.log(`   Recording ${t2MeetingLimit} meeting requests under Tier II quota...`);
    for (let i = 1; i <= t2MeetingLimit; i++) {
      await OneToOne.create({
        initiatorUser: testUser._id,
        initiatorBusiness: testBusiness._id,
        initiatorChapterId: testBusiness.chapterId,
        initiatorState: chapterState,
        memberBusiness: partnerBusiness._id,
        memberUser: partnerUser._id,
        memberChapterId: partnerBusiness.chapterId,
        memberState: chapterState,
        meetingDate: new Date(Date.now() + i * 86400000),
        meetingTime: `${9 + (i % 8)}:00 AM`,
        location: `${chapterCity} Conference Suite ${i}`,
        description: `Dynamic meeting #${i} for ${runId}`,
        initiatedBy: "self",
      });
    }
    console.log(`   ✓ Successfully recorded ${t2MeetingLimit} meeting requests.`);

    let t2MeetingOverflowBlocked = false;
    try {
      await oneToOneService.create(testUser._id, {
        memberBusinessId: partnerBusiness._id,
        meetingDate: new Date(Date.now() + 864000000).toISOString(),
        meetingTime: "04:00 PM",
        location: `${chapterCity} Overflow Room`,
        description: `Dynamic overflow meeting ${runId}`,
        initiatedBy: "self",
      });
    } catch (err) {
      t2MeetingOverflowBlocked = true;
      console.log(`   ✓ Meeting #${t2MeetingLimit + 1} blocked under Tier II quota: "${err.message}"`);
    }
    if (!t2MeetingOverflowBlocked) throw new Error("Tier II user was able to exceed meeting quota!");

    // 5.6 Gated feature check: Featured Business must NOT be allowed on Tier II
    const featBizT2 = await checkFeatureAccess(testUser._id, "featured_business");
    if (featBizT2.isAllowed) {
      throw new Error("Featured business must not be allowed on Tier II!");
    }
    console.log(`   ✓ Featured Business correctly blocked on Tier II: "${featBizT2.reason}"`);

    // 5.7 Referrals allowed on Tier II
    const t2Referral = await referralService.create(testUser._id, {
      referredBusinessId: partnerBusiness._id,
      leadName: `Dynamic Upgraded Referral Lead ${runId}`,
      description: `Requirement for specialized equipment from ${runId}`,
    });
    if (!t2Referral || !t2Referral._id) throw new Error("Tier II user failed to create a referral!");
    console.log(`   ✓ Referral successfully created under Tier II plan!`);

    // -------------------------------------------------------------
    // TEST 4: Upgrade to Tier III (Growth)
    // -------------------------------------------------------------
    console.log(`\n6. [TEST] Upgrading user to Tier III (${tier3Config.name})...`);
    await membershipService.upgradePlan(testBusiness._id, "tier_3");
    const t3Context = await resolveMemberPlanContext(testUser._id);
    if (t3Context.tierKey !== "tier_3") {
      throw new Error(`Expected tier_3, got: ${t3Context.tierKey}`);
    }
    console.log(`   ✓ Context resolved dynamically to Tier III (${tier3Config.name}).`);

    // Featured Business is allowed on Tier III
    const featBizT3 = await checkFeatureAccess(testUser._id, "featured_business");
    if (!featBizT3.isAllowed) throw new Error("Featured business must be allowed on Tier III!");
    console.log("   ✓ Featured Business is accessible on Tier III!");

    // WhatsApp integration is allowed on Tier III
    const waT3 = await checkFeatureAccess(testUser._id, "whatsapp_integration");
    if (!waT3.isAllowed) throw new Error("WhatsApp integration must be allowed on Tier III!");
    console.log("   ✓ WhatsApp Integration is accessible on Tier III!");

    // Product listing allows dynamic t3ProductLimit (10 on Tier III)
    const prodQuotaT3 = await checkFeatureAccess(testUser._id, "product_listing", 1);
    if (!prodQuotaT3.isAllowed) throw new Error(`Product listing must allow up to ${tier3Config.product_listing} on Tier III!`);
    console.log(`   ✓ Product listing is expanded to ${tier3Config.product_listing} on Tier III!`);

    // -------------------------------------------------------------
    // TEST 5: Upgrade to Tier IV (Enterprise)
    // -------------------------------------------------------------
    console.log(`\n7. [TEST] Upgrading user to Tier IV (${tier4Config.name})...`);
    await membershipService.upgradePlan(testBusiness._id, "tier_4");
    const t4Context = await resolveMemberPlanContext(testUser._id);
    if (t4Context.tierKey !== "tier_4") {
      throw new Error(`Expected tier_4, got: ${t4Context.tierKey}`);
    }
    console.log(`   ✓ Context resolved dynamically to Tier IV (${tier4Config.name}).`);

    // Unlimited features check
    const prodQuotaT4 = await checkFeatureAccess(testUser._id, "product_listing", 100);
    const chatQuotaT4 = await checkFeatureAccess(testUser._id, "chat", 100);
    const leadQuotaT4 = await checkFeatureAccess(testUser._id, "lead_unlock", 100);
    const quoteQuotaT4 = await checkFeatureAccess(testUser._id, "quotation_chat", 100);

    if (!prodQuotaT4.isAllowed || prodQuotaT4.limit !== "Unlimited") {
      throw new Error("Tier IV must have unlimited products!");
    }
    if (!chatQuotaT4.isAllowed || chatQuotaT4.limit !== "Unlimited") {
      throw new Error("Tier IV must have unlimited chat!");
    }
    if (!leadQuotaT4.isAllowed || leadQuotaT4.limit !== "Unlimited") {
      throw new Error("Tier IV must have unlimited lead unlock!");
    }
    if (!quoteQuotaT4.isAllowed || quoteQuotaT4.limit !== "Unlimited") {
      throw new Error("Tier IV must have unlimited quotations!");
    }
    console.log("   ✓ Tier IV confirms unlimited catalogue products, chats, leads, and quotations!");

    // Multiple Locations listing is Available on Tier IV
    const locQuotaT4 = await checkFeatureAccess(testUser._id, "multiple_locations");
    if (!locQuotaT4.isAllowed) {
      throw new Error("Multiple locations must be available on Tier IV!");
    }
    console.log("   ✓ Multiple Locations is available on Tier IV!");

    // -------------------------------------------------------------
    // TEST 6: Security Tamper Protection
    // -------------------------------------------------------------
    console.log("\n8. [TEST] Validating Security & Dynamic Tier Tamper Protection...");
    await User.findByIdAndUpdate(testUser._id, {
      subscriberTier: "tier_1",
      membershipPlan: tier1Config.name,
    });
    await Business.findByIdAndUpdate(testBusiness._id, {
      subscriberTier: "tier_1",
      membership: "Free",
    });

    const resetUser = await User.findById(testUser._id);
    await userService.updateProfile(
      testUser._id,
      { subscriberTier: "tier_4", membershipPlan: tier4Config.name },
      resetUser
    );

    const tamperedUser = await User.findById(testUser._id);
    if (tamperedUser.subscriberTier === "tier_4") {
      throw new Error("SECURITY FAILURE: Non-admin user was able to escalate their tier via updateProfile!");
    }
    console.log("   ✓ Client-side tier tamper attempt successfully neutralized (subscriberTier remains tier_1).");

    console.log("\n==================================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! FULL SPECIFICATION VERIFIED.");
    console.log("==================================================================");
  } finally {
    // Dynamic Cleanup: remove all generated records
    console.log("\nCleaning up dynamic test records...");
    if (testUser) {
      const recipientIds = createdRecipients.map((r) => r._id);
      await User.deleteMany({ _id: { $in: [testUser._id, partnerUser?._id, ...recipientIds] } });
      await Business.deleteMany({ _id: { $in: [testBusiness?._id, partnerBusiness?._id] } });
      await Membership.deleteMany({ business: { $in: [testBusiness?._id, partnerBusiness?._id] } });
      await Catalogue.deleteMany({ business: testBusiness?._id });
      await Post.deleteMany({ createdById: testUser._id });
      await Message.deleteMany({ sender: testUser._id });
      await OneToOne.deleteMany({ initiatorUser: testUser._id });
      await ThankYouNote.deleteMany({ $or: [{ giverUser: testUser._id }, { receiverUser: testUser._id }] });
      await Referral.deleteMany({ $or: [{ referrerUser: testUser._id }, { referredUser: testUser._id }] });
    }
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
