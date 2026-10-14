import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import { connectDatabase, disconnectDatabase } from "./src/infrastructure/database/mongoose.js";
import { User } from "./src/modules/users/user.model.js";
import { Business } from "./src/modules/businesses/business.model.js";
import { Membership } from "./src/modules/memberships/membership.model.js";
import { Plan } from "./src/modules/memberships/plan.model.js";
import { membershipService } from "./src/modules/memberships/membership.service.js";
import { hashPassword } from "./src/infrastructure/auth/password.js";
import { signAccessToken } from "./src/infrastructure/auth/jwt.js";
import { ROLES } from "./src/shared/constants/roles.js";
import { generateSlug } from "./src/shared/utils/generate-id.js";

async function run() {
  console.log("\n=======================================================");
  console.log("       RIFAH TIER PLANS END-TO-END VERIFICATION       ");
  console.log("=======================================================\n");

  await connectDatabase();

  const testAccounts = [
    {
      tierKey: "tier_1",
      planName: "Tier I (Free)",
      expectedPriceUsd: 0,
      email: "test_tier1_free@rifah.test",
      name: "Tier1 Free Member",
      companyName: "Alpha Global Free Inc",
      phone: "+15550001111",
    },
    {
      tierKey: "tier_2",
      planName: "Tier II (Starter)",
      expectedPriceUsd: 1,
      email: "test_tier2_starter@rifah.test",
      name: "Tier2 Starter Member",
      companyName: "Beta Star Trading LLC",
      phone: "+15550002222",
    },
    {
      tierKey: "tier_3",
      planName: "Tier III (Growth)",
      expectedPriceUsd: 2,
      email: "test_tier3_growth@rifah.test",
      name: "Tier3 Growth Member",
      companyName: "Gamma Growth Ventures LLC",
      phone: "+15550003333",
    },
    {
      tierKey: "tier_4",
      planName: "Tier IV (Enterprise)",
      expectedPriceUsd: 3,
      email: "test_tier4_enterprise@rifah.test",
      name: "Tier4 Enterprise Member",
      companyName: "Delta Enterprise Global Corp",
      phone: "+15550004444",
    },
  ];

  const defaultPassword = "TestPassword@123";
  const hashedPassword = await hashPassword(defaultPassword);

  const seededData = [];

  console.log("▶ STEP 1: Seeding 4 International Test Users and Businesses...");

  for (const acc of testAccounts) {
    // 1. Clean up existing test documents with this email
    const existingUser = await User.findOne({ email: acc.email });
    if (existingUser) {
      await Business.deleteMany({ owner: existingUser._id });
      await Membership.deleteMany({ business: { $in: await Business.find({ owner: existingUser._id }).distinct("_id") } });
      await User.deleteOne({ _id: existingUser._id });
    }

    // 2. Create User
    const user = await User.create({
      name: acc.name,
      email: acc.email,
      phone: acc.phone,
      password: hashedPassword,
      role: ROLES.BUSINESS_OWNER,
      organization: acc.companyName,
      region: "international",
      currency: "USD",
      country: "United States",
      countryCode: "+1",
      city: "New York",
      status: "Active",
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    // 3. Create Business
    const slug = generateSlug(acc.companyName) + "-" + Math.floor(1000 + Math.random() * 9000);
    const business = await Business.create({
      name: acc.companyName,
      slug,
      owner: user._id,
      email: acc.email,
      phone: acc.phone,
      city: "New York",
      country: "United States",
      region: "international",
      currency: "USD",
      status: "Active",
      verificationStatus: "Unverified",
      verification: "unverified",
      membership: acc.planName,
      subscriberTier: acc.tierKey,
      isPaid: true,
      paymentStatus: "Paid",
      rating: 5,
    });

    // 4. Upgrade Membership through membershipService
    const membership = await membershipService.upgradePlan(business._id, acc.tierKey);

    seededData.push({
      ...acc,
      user,
      business,
      membership,
    });

    console.log(`  ✓ Seeded [${acc.tierKey.toUpperCase()}]: ${acc.email} -> ${acc.companyName} (${membership.planName}, $${membership.price} USD)`);
  }

  console.log("\n▶ STEP 2: Verifying Data Models & Synchronizations for All 4 Tiers...");

  let testsPassed = 0;
  let totalTests = 0;

  for (const item of seededData) {
    totalTests++;
    const freshBiz = await Business.findById(item.business._id);
    const freshUser = await User.findById(item.user._id);
    const freshMembership = await Membership.findOne({ business: item.business._id });

    const checks = [
      freshMembership.planId === item.tierKey,
      freshMembership.price === item.expectedPriceUsd,
      freshMembership.status === "Active",
      freshMembership.billingCycle.includes("Tier Plan"),
      freshBiz.subscriberTier === item.tierKey,
      freshBiz.region === "international",
      freshBiz.currency === "USD",
      freshUser.subscriberTier === item.tierKey,
      freshUser.membershipPlan === item.planName,
    ];

    if (checks.every(Boolean)) {
      testsPassed++;
      console.log(`  ✓ PASS: ${item.tierKey.toUpperCase()} synchronized across Membership, Business, and User models!`);
    } else {
      console.error(`  ✗ FAIL: Discrepancy detected in ${item.tierKey}`);
    }
  }

  console.log("\n▶ STEP 3: Testing Negative Enforcement (International cannot buy Chamber subscriptions)...");

  totalTests++;
  const testBiz = seededData[0].business;
  let blockedChamberPlan = false;
  try {
    await membershipService.upgradePlan(testBiz._id, "silver");
  } catch (err) {
    blockedChamberPlan = true;
    console.log(`  ✓ PASS: Successfully blocked Chamber 'silver' subscription for international business:`);
    console.log(`     Error message: "${err.message}"`);
  }
  if (blockedChamberPlan) testsPassed++;

  console.log("\n▶ STEP 4: Testing Dynamic Tier Upgrade Flow (Tier II -> Tier III)...");

  totalTests++;
  const tier2Item = seededData.find((d) => d.tierKey === "tier_2");
  const upgradedMembership = await membershipService.upgradePlan(tier2Item.business._id, "tier_3");
  const upgradedBiz = await Business.findById(tier2Item.business._id);
  const upgradedUser = await User.findById(tier2Item.user._id);

  if (
    upgradedMembership.planId === "tier_3" &&
    upgradedMembership.price === 2 &&
    upgradedBiz.subscriberTier === "tier_3" &&
    upgradedUser.subscriberTier === "tier_3"
  ) {
    testsPassed++;
    console.log("  ✓ PASS: Dynamic upgrade (tier_2 -> tier_3) succeeded!");
    console.log(`     New Plan: ${upgradedMembership.planName}, Price: $${upgradedMembership.price} USD`);
  } else {
    console.error("  ✗ FAIL: Dynamic upgrade verification failed");
  }

  console.log("\n=======================================================");
  console.log(`SUMMARY: ${testsPassed} of ${totalTests} verification checks passed.`);
  console.log("=======================================================\n");

  await disconnectDatabase();
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
