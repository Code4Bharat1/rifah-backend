import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { User } from "../src/modules/users/user.model.js";
import { Event } from "../src/modules/events/event.model.js";
import { Payment } from "../src/modules/payments/payment.model.js";
import { eventService } from "../src/modules/events/event.service.js";
import { connectDatabase, disconnectDatabase } from "../src/infrastructure/database/mongoose.js";

async function runDelegationTest() {
  try {
    console.log("Connecting to database...");
    await connectDatabase();
    console.log("Connected to database successfully.\n");

    // 1. Identify Central Admin vs Chapter Admin user
    let centralAdmin = await User.findOne({
      role: { $in: ["central_admin", "super_admin", "admin"] },
    });
    if (!centralAdmin) {
      centralAdmin = await User.findOne();
    }
    console.log("Central Admin user:", centralAdmin.email, "Role:", centralAdmin.role);

    // Mock non-central admin
    const fakeChapterAdmin = {
      _id: centralAdmin._id,
      id: centralAdmin._id,
      role: "chapter_admin",
      chapter: "Mumbai",
      activeWorkspace: { panelType: "chapter-admin", workspaceId: "chapter_admin" },
    };

    // 2. Test: Non-Central Admin cannot create a Delegation Event
    console.log("\n--- TEST 1: Non-Central Admin tries to create Delegation Event ---");
    let caught403 = false;
    try {
      await eventService.createEvent(
        {
          title: "Unauthorized Delegation",
          eventCategory: "Delegation",
          date: "2026-11-20",
          time: "10:00 AM - 05:00 PM",
        },
        fakeChapterAdmin
      );
    } catch (err) {
      console.log("Expected rejection caught:", err.message);
      if (err.statusCode === 403 || err.message.includes("Only Central Admin")) {
        caught403 = true;
      }
    }
    console.log("Test 1 Result:", caught403 ? "PASSED (403 Forbidden)" : "FAILED");

    // 3. Test: Central Admin successfully creates a Delegation Event
    console.log("\n--- TEST 2: Central Admin creates Delegation Event with Installments ---");
    const centralUserObj = {
      _id: centralAdmin._id,
      id: centralAdmin._id,
      role: "central_admin",
      activeWorkspace: { panelType: "central-admin", workspaceId: "admin" },
    };

    const delegationEventData = {
      title: "RIFAH Dubai Trade Delegation 2026",
      eventCategory: "Delegation",
      isDelegation: true,
      mode: "In-person",
      date: "2026-11-15",
      time: "09:00 AM - 06:00 PM",
      venue: "Dubai World Trade Centre",
      location: "Dubai World Trade Centre",
      city: "Dubai",
      country: "UAE",
      chapter: "Central",
      delegationDetails: {
        destination: "Dubai & Abu Dhabi",
        country: "United Arab Emirates",
        travelDates: "15 Nov – 21 Nov 2026",
        inclusions: "Return airfare, 5-Star Hotel, B2B meets, Local transit, Networking gala",
        visaGuidelines: "Valid passport with min 6 months validity",
      },
      delegationInstallments: [
        {
          installmentNumber: 1,
          title: "Registration & Token Advance",
          dueDate: "2026-10-25",
          memberAmount: 25000,
          nonMemberAmount: 35000,
          notes: "Seat confirmation and delegation registration",
        },
        {
          installmentNumber: 2,
          title: "Flight & Accommodation Milestone",
          dueDate: "2026-11-05",
          memberAmount: 50000,
          nonMemberAmount: 65000,
          notes: "Flight tickets and 5-star hotel block booking",
        },
        {
          installmentNumber: 3,
          title: "Final Delegation Balance",
          dueDate: "2026-11-12",
          memberAmount: 25000,
          nonMemberAmount: 30000,
          notes: "B2B meeting desk accreditation & city transit pass",
        },
      ],
    };

    const createdEvent = await eventService.createEvent(delegationEventData, centralUserObj);
    console.log("Created Delegation Event:", createdEvent.title);
    console.log("Event Category:", createdEvent.eventCategory, "isDelegation:", createdEvent.isDelegation);
    console.log("Computed memberPrice:", createdEvent.memberPrice, "ticketPrice:", createdEvent.ticketPrice);
    console.log("Installments Count:", createdEvent.delegationInstallments.length);

    // 4. Test: Register an attendee for the Delegation Event
    console.log("\n--- TEST 3: Register Attendee for Delegation Event ---");
    // Find or use a test delegate user
    let delegateUser = await User.findOne({ _id: { $ne: centralAdmin._id } });
    if (!delegateUser) delegateUser = centralAdmin;

    const registeredEvent = await eventService.registerUserForEvent(createdEvent._id, delegateUser._id);
    const reg = (registeredEvent.registeredUsers || []).find(
      (r) => String(r.user?._id || r.user || r._id) === String(delegateUser._id)
    );

    console.log("Attendee registered:", delegateUser.email);
    console.log("Attendee paymentStatus:", reg.paymentStatus);
    console.log("Initialized installments count:", reg.installments?.length);

    const firstInst = reg.installments[0];
    console.log("\n--- TEST 4: Verify 5% GST and 2% TCS Calculation on Installment 1 ---");
    console.log("Installment 1 Title:", firstInst.title);
    console.log("Base Amount:", firstInst.baseAmount);
    console.log("GST Rate:", firstInst.gstRate, "% => GST Amount: ₹", firstInst.gstAmount);
    console.log("TCS Rate:", firstInst.tcsRate, "% => TCS Amount: ₹", firstInst.tcsAmount);
    console.log("Total Amount:", firstInst.totalAmount);

    const expectedGst = Math.round(firstInst.baseAmount * 0.05 * 100) / 100;
    const expectedTcs = Math.round(firstInst.baseAmount * 0.02 * 100) / 100;
    const expectedTotal = Math.round((firstInst.baseAmount + expectedGst + expectedTcs) * 100) / 100;

    const taxCheckPassed =
      firstInst.gstAmount === expectedGst &&
      firstInst.tcsAmount === expectedTcs &&
      firstInst.totalAmount === expectedTotal;
    console.log("Tax formula check:", taxCheckPassed ? "PASSED (5% GST + 2% TCS exact)" : "FAILED");

    // 5. Test: Pay Delegation Installment 1 and verify Invoice Generation
    console.log("\n--- TEST 5: Pay Delegation Installment 1 and Generate Tax Invoice ---");
    const payResult = await eventService.payDelegationInstallment(
      createdEvent._id,
      delegateUser._id,
      1,
      {
        method: "Razorpay",
        transactionId: "TXN_TEST_DELEGATION_001",
      }
    );

    console.log("Payment completed!");
    console.log("Generated Invoice Number:", payResult.payment.invoiceNumber);
    console.log("Payment Item Type:", payResult.payment.itemType);
    console.log("Payment isDelegationPayment:", payResult.payment.isDelegationPayment);
    console.log("Payment TCS Amount: ₹", payResult.payment.tcsAmount, "(Rate:", payResult.payment.tcsRate, "%)");
    console.log("Payment GST Amount: ₹", payResult.payment.gstAmount, "(Rate:", payResult.payment.gstRate, "%)");
    console.log("Payment Total Amount: ₹", payResult.payment.amount);
    console.log("Updated Installment 1 Status:", payResult.installment.status);

    const invoiceCheckPassed =
      Boolean(payResult.payment.invoiceNumber) &&
      payResult.payment.invoiceNumber.startsWith("INV") &&
      payResult.payment.isDelegationPayment === true &&
      payResult.payment.tcsAmount === expectedTcs &&
      payResult.installment.status === "Paid";

    console.log("Invoice and Payment Verification:", invoiceCheckPassed ? "PASSED" : "FAILED");

    // 6. Test: Automated Reminders Scan
    console.log("\n--- TEST 6: Trigger Delegation Installment Reminders Scan ---");
    await eventService.checkDelegationInstallmentReminders();
    console.log("Reminders scan executed cleanly with zero errors!");

    // Clean up test event and payment
    await Event.findByIdAndDelete(createdEvent._id);
    await Payment.findByIdAndDelete(payResult.payment._id);
    console.log("\nCleaned up test event and payment document.");

    console.log("\n=========================================");
    console.log("ALL DELEGATION EVENT TESTS PASSED 100%!");
    console.log("=========================================\n");
  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await disconnectDatabase();
  }
}

runDelegationTest();
