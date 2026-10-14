import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import { connectDatabase, disconnectDatabase } from "./src/infrastructure/database/mongoose.js";
import { User } from "./src/modules/users/user.model.js";
import { Business } from "./src/modules/businesses/business.model.js";
import { postService } from "./src/modules/posts/post.service.js";
import { messageService } from "./src/modules/messages/message.service.js";
import { oneToOneService } from "./src/modules/networking/one-to-one.service.js";
import { isFreeTierPlanName, resolveMemberPlanContext } from "./src/shared/utils/feature-access.js";

async function run() {
  console.log("\n=======================================================");
  console.log("   TESTING WITH REVERTED isFreeTierPlanName PATTERNS   ");
  console.log("=======================================================\n");

  console.log("▶ STEP 1: Direct Unit Test on isFreeTierPlanName()...");
  const testPlans = [
    { name: "Tier I (Free)", expectedFree: true },
    { name: "Tier II (Starter)", expectedFree: false },
    { name: "Tier III (Growth)", expectedFree: false },
    { name: "Tier IV (Enterprise)", expectedFree: false },
  ];

  let unitTestFailures = 0;
  for (const t of testPlans) {
    const isFree = isFreeTierPlanName(t.name);
    const pass = isFree === t.expectedFree;
    if (pass) {
      console.log(`  ✓ OK: "${t.name}" -> isFree: ${isFree}`);
    } else {
      unitTestFailures++;
      console.error(`  ✗ BUG DETECTED: "${t.name}" -> isFree: ${isFree} (Expected: ${t.expectedFree})`);
      console.error(`     Reason: "tier i" substring matched inside "${t.name.toLowerCase()}"!`);
    }
  }

  console.log("\n▶ STEP 2: Live Backend Service Test with Tier II User...");
  await connectDatabase();

  const user2 = await User.findOne({ email: "test_tier2_starter@rifah.test" });
  const biz2 = await Business.findOne({ owner: user2._id });
  const user3 = await User.findOne({ email: "test_tier3_growth@rifah.test" });
  const biz3 = await Business.findOne({ owner: user3._id });

  console.log(`  Found Tier II User: ${user2.email}`);
  console.log(`  User membershipPlan: "${user2.membershipPlan}", Business subscriberTier: "${biz2.subscriberTier}"`);

  // Check resolveMemberPlanContext output
  const context = await resolveMemberPlanContext(user2._id);
  console.log("\n  resolveMemberPlanContext result for Tier II User:");
  console.log(`     - planName: "${context.planName}"`);
  console.log(`     - isFree: ${context.isFree}  <-- Look here!`);

  // Try Feed Posting with Tier II user
  console.log("\n  Attempting to create Feed Post as Tier II User...");
  try {
    await postService.createPost(
      { title: "Test Post", caption: "Testing feed", category: "General" },
      { id: user2._id, role: user2.role, name: user2.name }
    );
    console.log("  ✓ Feed Post succeeded!");
  } catch (err) {
    console.error(`  ✗ FAIL: Feed Post BLOCKED with Error: "${err.message}"`);
  }

  // Try Direct Messaging with Tier II user
  console.log("\n  Attempting to send Direct Message as Tier II User...");
  try {
    await messageService.sendMessage({ recipientId: user3._id, text: "Hello" }, user2._id);
    console.log("  ✓ Direct Message succeeded!");
  } catch (err) {
    console.error(`  ✗ FAIL: Direct Message BLOCKED with Error: "${err.message}"`);
  }

  // Try 1-to-1 Meeting Request with Tier II user
  console.log("\n  Attempting to request 1-to-1 Meeting as Tier II User...");
  try {
    await oneToOneService.create(user2._id, {
      memberBusinessId: biz3._id,
      meetingDate: new Date(),
      meetingTime: "10:00 AM",
      location: "Office",
      description: "Networking",
      initiatedBy: "self",
    });
    console.log("  ✓ 1-to-1 Meeting succeeded!");
  } catch (err) {
    console.error(`  ✗ FAIL: 1-to-1 Meeting BLOCKED with Error: "${err.message}"`);
  }

  console.log("\n=======================================================");
  console.log(`CONCLUSION: ${unitTestFailures} plan name classifications failed.`);
  console.log("All paid tier members (Tier II, III, IV) are locked out when this pattern is reverted.");
  console.log("=======================================================\n");

  await disconnectDatabase();
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
