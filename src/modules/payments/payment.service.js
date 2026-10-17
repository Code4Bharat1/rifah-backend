import mongoose from "mongoose";
import crypto from "crypto";
import { Payment } from "./payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { Event } from "../events/event.model.js";
import { env } from "../../config/env.js";
import { membershipService } from "../memberships/membership.service.js";
import { Plan } from "../memberships/plan.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { whatsappService } from "../../infrastructure/whatsapp/whatsapp.service.js";
import { generateReferenceId, generateSlug } from "../../shared/utils/generate-id.js";
import { getNextInvoiceNumber } from "../../shared/utils/sequence-generator.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { signAccessToken, signRefreshToken } from "../../infrastructure/auth/jwt.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";
import { revenueShareService } from "../revenue-sharing/revenueShare.service.js";
import { logger } from "../../infrastructure/logger/logger.js";
import { stripeClient } from "../../infrastructure/stripe/stripe.client.js";

const BUILTIN_MEMBERSHIP_PLANS = {
  free: { planId: "free", name: "Free Starter", price: 0, priceUsd: 0, durationYears: 0, gstRate: 0 },
  silver: { planId: "silver", name: "Silver", price: 3000, priceUsd: 60, durationYears: 1, gstRate: 18 },
  gold: { planId: "gold", name: "Gold", price: 5000, priceUsd: 100, durationYears: 2, gstRate: 18 },
  platinum: { planId: "platinum", name: "Platinum", price: 25000, priceUsd: 325, durationYears: 10, gstRate: 18 },
  diamond: { planId: "diamond", name: "Diamond", price: 50000, priceUsd: 650, durationYears: 25, gstRate: 18 },
  tier_1: { planId: "tier_1", name: "Tier I (Free)", price: 0, priceUsd: 0, durationYears: 1, gstRate: 0 },
  tier_2: { planId: "tier_2", name: "Tier II (Starter)", price: 50, priceUsd: 1, durationYears: 1, gstRate: 0 },
  tier_3: { planId: "tier_3", name: "Tier III (Growth)", price: 100, priceUsd: 2, durationYears: 1, gstRate: 0 },
  tier_4: { planId: "tier_4", name: "Tier IV (Enterprise)", price: 200, priceUsd: 3, durationYears: 1, gstRate: 0 },
};

async function getActivePlan(planId) {
  const cleanId = String(planId || "").trim();
  const query = {
    $and: [
      { isActive: { $ne: false } },
      {
        $or: [
          { planId: cleanId.toLowerCase() },
          { name: { $regex: new RegExp(`^${cleanId}$`, "i") } },
          ...(mongoose.Types.ObjectId.isValid(cleanId) ? [{ _id: cleanId }] : [])
        ]
      }
    ]
  };
  let plan = await Plan.findOne(query).lean();
  if (!plan) {
    const fallback = BUILTIN_MEMBERSHIP_PLANS[cleanId.toLowerCase()];
    if (fallback) {
      return fallback;
    }
    throw new BadRequestError("Selected membership plan is unavailable");
  }
  return plan;
}

function getPlanCharge(plan, currency) {
  const isInternational = String(currency || "INR").toUpperCase() === "USD";
  const baseAmount = isInternational
    ? Number(plan.priceUsd ?? (Number(plan.price) ? Math.round(Number(plan.price) / 80) : 0))
    : Number(plan.price || 0);
  const gstRate = Number(plan.gstRate ?? 0);
  const gstAmount = isInternational ? 0 : Math.round(baseAmount * gstRate / 100);
  return { baseAmount, gstRate, gstAmount, totalAmount: baseAmount + gstAmount };
}

/**
 * Common fulfillment helper for both Razorpay (Domestic INR) and Stripe (International USD)
 */
async function fulfillPaymentOrder({
  payload,
  user,
  transactionId,
  orderId = "",
  method = "Online Payment",
}) {
  const userDoc = await User.findById(user.id || user._id);
  if (!userDoc) {
    throw new NotFoundError("User not found");
  }

  // Idempotency: If this transaction was already processed (e.g. webhook fired first), return existing payment
  if (transactionId) {
    const existing = await Payment.findOne({ transactionId });
    if (existing) {
      let biz = existing.business ? await Business.findById(existing.business) : await Business.findOne({ owner: userDoc._id });
      const tokenPayload = {
        id: userDoc._id,
        email: userDoc.email,
        role: userDoc.role,
        chapter: userDoc.chapter,
        forcePasswordChange: userDoc.forcePasswordChange,
      };
      await userDoc.populate("savedBusinesses");
      const userObj = userDoc.toJSON();
      if (Array.isArray(userObj.savedBusinesses)) {
        userObj.savedBusinesses = userObj.savedBusinesses.filter(Boolean);
      }
      return {
        verified: true,
        payment: existing,
        business: biz,
        user: userObj,
        accessToken: signAccessToken(tokenPayload),
        refreshToken: signRefreshToken(tokenPayload),
      };
    }
  }

  const {
    planId,
    businessId,
    amount,
    itemType,
    description,
    currency = "INR",
    courseId,
    eventId,
  } = payload;

  let finalBusinessId = businessId;
  let businessDoc = null;

  if (finalBusinessId) {
    businessDoc = await Business.findById(finalBusinessId);
  }

  if (!businessDoc) {
    businessDoc = await Business.findOne({ owner: userDoc._id });
    if (businessDoc) {
      finalBusinessId = businessDoc._id;
    }
  }

  let invoiceNumber = (payload.invoiceNumber || "").trim().toUpperCase();
  if (!invoiceNumber || (await Payment.findOne({ invoiceNumber }))) {
    invoiceNumber = await getNextInvoiceNumber({
      chapter: businessDoc?.chapter || userDoc?.chapter,
    });
  }

  const isMembership = itemType === "Membership" || Boolean(planId);
  const isIntlPurchase = String(currency || "").toUpperCase() === "USD" || businessDoc?.region === "international" || businessDoc?.currency === "USD";
  const membershipPlan = isMembership ? await getActivePlan(planId) : null;
  const planCharge = membershipPlan ? getPlanCharge(membershipPlan, currency) : null;

  const isUserTier =
    String(planId || "").toLowerCase().startsWith("tier_") ||
    String(membershipPlan?.planId || "").toLowerCase().startsWith("tier_") ||
    String(planId || "").toLowerCase() === "free";

  if (isMembership && isIntlPurchase && !isUserTier) {
    throw new BadRequestError("International businesses must select a Tier Plan (Tier I, II, III, or IV), not a Chamber subscription.");
  }

  // If upgrading or purchasing a membership
  if (isMembership) {
    // 1. Upgrade user role in database permanently to business_owner
    if (userDoc.role === ROLES.CUSTOMER) {
      userDoc.role = ROLES.BUSINESS_OWNER;
    }
    if (payload.city && !userDoc.city) {
      userDoc.city = payload.city.trim();
    }
    if (payload.state && !userDoc.state) {
      userDoc.state = payload.state.trim();
    }
    await userDoc.save();

    // 2. If user doesn't have an existing Business profile, auto-create one
    if (!businessDoc) {
      const rawBizName =
        (payload.businessName && payload.businessName.trim()) ||
        userDoc.organization ||
        `${userDoc.name}'s Enterprise`;

      let slug = generateSlug(rawBizName);
      const slugConflict = await Business.findOne({ slug });
      if (slugConflict) {
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const formattedTier = membershipPlan.name;

      const bizCity = (payload.city && payload.city.trim()) || userDoc.city || "";
      const bizState = (payload.state && payload.state.trim()) || userDoc.state || "";
      let bizChapter = (userDoc.chapter || "").trim();
      let bizChapterId = userDoc.chapterId || null;
      if (!bizChapter && bizCity) {
        try {
          const { Chapter } = await import("../chapters/chapter.model.js");
          const cleanCity = bizCity.replace(/\b(chapter|chamber)\b/gi, "").trim();
          const matchedChapter = await Chapter.findOne({
            $or: [
              { city: new RegExp(`^${cleanCity}$`, "i") },
              { name: new RegExp(cleanCity, "i") },
            ],
          });
          if (matchedChapter) {
            bizChapter = matchedChapter.name;
            bizChapterId = matchedChapter._id;
          }
        } catch (e) {}
      }
      const bizIndustry = (payload.industry && payload.industry.trim()) || userDoc.sourcingInterest || "";

      businessDoc = await Business.create({
        name: rawBizName,
        slug,
        owner: userDoc._id,
        taxId: (payload.taxId && payload.taxId.trim()) || "",
        address: (payload.billingAddress && payload.billingAddress.trim()) || "",
        city: bizCity,
        pincode: (payload.postalCode && payload.postalCode.trim()) || "",
        state: bizState,
        phone: payload.billingPhone || payload.phone || userDoc.phone || "",
        email: payload.billingEmail || userDoc.email || "",
        chapter: bizChapter,
        chapterId: bizChapterId,
        industry: bizIndustry,
        categories: bizIndustry ? [bizIndustry] : [],
        status: isUserTier ? "Active" : "Pending Verification",
        verificationStatus: isUserTier ? "Unverified" : "Pending",
        verification: "unverified",
        membership: isUserTier ? "Free" : formattedTier,
        subscriberTier: isUserTier ? (planId || "tier_1") : "tier_1",
        region: isIntlPurchase ? "international" : (userDoc.region || "national"),
        currency: isIntlPurchase ? "USD" : "INR",
        rating: 5,
      });
      finalBusinessId = businessDoc._id;
    } else {
      const formattedTier = membershipPlan.name;

      businessDoc.paymentStatus = "Paid";
      businessDoc.isPaid = true;
      if (isIntlPurchase) {
        businessDoc.region = "international";
        businessDoc.currency = "USD";
      }
      if (isUserTier) {
        businessDoc.subscriberTier = planId || "tier_1";
        if (!businessDoc.membership) {
          businessDoc.membership = "Free";
        }
      } else {
        businessDoc.membership = formattedTier;
        if (!businessDoc.subscriberTier) {
          businessDoc.subscriberTier = "tier_1";
        }
        if (!businessDoc.isVerified) {
          businessDoc.status = "Pending Verification";
          businessDoc.verificationStatus = "Pending";
          businessDoc.verification = "pending";
          businessDoc.verificationReviewReason = "";
          businessDoc.verificationRemarks = "";
        }
      }

      if (payload.taxId && !businessDoc.taxId) businessDoc.taxId = payload.taxId.trim();
      if (payload.billingAddress && !businessDoc.address) businessDoc.address = payload.billingAddress.trim();
      if (payload.city && !businessDoc.city) businessDoc.city = payload.city.trim();
      if (payload.state && !businessDoc.state) businessDoc.state = payload.state.trim();
      if (payload.postalCode && !businessDoc.pincode) businessDoc.pincode = payload.postalCode.trim();

      if (!Array.isArray(businessDoc.verificationHistory)) {
        businessDoc.verificationHistory = [];
      }
      businessDoc.verificationHistory.push({
        action: "payment",
        reason: isUserTier
          ? `Subscriber plan payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Account activated.`
          : `Membership payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Queued for Chapter Administrator verification review.`,
        reviewer: userDoc._id,
        createdAt: new Date(),
      });
      await businessDoc.save();
    }

    // Sync Verification document in database ONLY for chamber tiers
    if (!isUserTier) {
      try {
        const { Verification } = await import("../verification/verification.model.js");
        let verificationDoc = await Verification.findOne({ business: businessDoc._id });
        if (verificationDoc) {
          if (verificationDoc.status !== "verified") {
            verificationDoc.status = "pending";
            verificationDoc.remarks = `Membership payment completed (Invoice #${invoiceNumber}). Awaiting Chapter Administrator review.`;
            await verificationDoc.save();
          }
        } else {
          await Verification.create({
            business: businessDoc._id,
            status: "pending",
            remarks: `Membership payment completed for ${membershipPlan.name} tier. Verification initiated automatically.`,
            history: [
              {
                status: "pending",
                remarks: "Payment confirmed, queued for chapter admin review",
                updatedBy: userDoc._id,
                date: new Date(),
              },
            ],
          });
        }
      } catch (verifErr) {
        console.error("Error updating verification on payment:", verifErr);
      }
    }
  }

  const payment = await Payment.create({
    invoiceNumber,
    payer: userDoc._id,
    business: finalBusinessId || null,
    eventId: eventId || payload.eventId || null,
    courseId: courseId || payload.courseId || null,
    itemType: itemType || (courseId || payload.courseId ? "Course" : "Membership"),
    planTier: planId || "",
    description: description || (courseId || payload.courseId ? "Course Enrollment" : `Payment for ${planId || "Membership"} tier`),
    amount: planCharge ? planCharge.baseAmount : Number(amount || 0),
    currency: (currency || "INR").toUpperCase(),
    method: method || (currency === "USD" ? "Stripe International" : "UPI / Razorpay"),
    status: "Paid",
    transactionId: transactionId || orderId || `TXN-${Date.now()}`,
    paidAt: new Date(),
    verificationToken: crypto.randomBytes(24).toString("hex"),
  });

  // Compute GST breakdown for receipt
  const baseAmount = payment.amount;
  const isEventItem = Boolean(eventId || payload.eventId || itemType === "Event Pass");
  const gstRate = planCharge?.gstRate ?? (isEventItem ? 18 : 0);
  const computedGst = planCharge?.gstAmount ?? (
    isEventItem
      ? (payload.gstAmount ? Number(payload.gstAmount) : Math.round(Number(amount) - (payload.baseAmount ? Number(payload.baseAmount) : Math.round(Number(amount) / 1.18))))
      : 0
  );
  const totalWithGst = planCharge?.totalAmount ?? (
    isEventItem
      ? Number(amount)
      : baseAmount
  );
  const planDurationYears = Number(membershipPlan?.durationYears) || 1;
  if (computedGst > 0 || planDurationYears > 1 || isEventItem) {
    payment.subtotal = payload.baseAmount ? Number(payload.baseAmount) : (totalWithGst - computedGst);
    payment.gstRate = gstRate;
    payment.gstAmount = computedGst;
    payment.amount = totalWithGst;
    payment.durationYears = planDurationYears;
    await payment.save();
  }

  // Revenue Sharing ledger entries
  try {
    await revenueShareService.createLedgerEntriesForPayment(payment, { actor: userDoc });
  } catch (revShareErr) {
    logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${payment._id}:`, revShareErr);
  }

  let updatedMembership = null;
  if (planId && finalBusinessId) {
    updatedMembership = await membershipService.upgradePlan(finalBusinessId, planId);
  }

  // Auto-enroll user and business in Course if paid course
  const resolvedCourseId = courseId || payload.courseId || (itemType === "Course" ? payload.notes?.courseId : null);
  if (resolvedCourseId) {
    try {
      const { Course } = await import("../courses/course.model.js");
      const courseDoc = await Course.findById(resolvedCourseId);
      if (courseDoc) {
        const alreadyEnrolled = courseDoc.enrollments?.some(
          (e) => String(e.userId) === String(userDoc._id) || (finalBusinessId && String(e.businessId) === String(finalBusinessId))
        );
        if (!alreadyEnrolled) {
          courseDoc.enrollments = courseDoc.enrollments || [];
          courseDoc.enrollments.push({
            businessId: finalBusinessId || null,
            userId: userDoc._id,
            paymentId: payment._id,
            enrolledAt: new Date(),
          });
          await courseDoc.save();
        }
      }
    } catch (cErr) {
      console.error("[PAYMENT] Failed to enroll user in course:", cErr);
    }
  }

  // Fire-and-forget background notifications & email receipt
  setImmediate(async () => {
    try {
      await notificationService.createNotification({
        recipientId: userDoc._id,
        type: "Payment",
        title: "Payment Verified",
        body: `Payment of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} ${payment.currency} (Invoice #${payment.invoiceNumber}) was verified successfully.`,
        link: "/biz/payments",
      });

      const targetEmail = payload.billingEmail || userDoc?.email;
      if (targetEmail && isMembership) {
        emailService.sendMembershipInvoiceEmail({
          email: targetEmail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || payload.businessName || "Member Business",
          planName: membershipPlan?.name || "Membership",
          amount: payment.amount,
          subtotal: payment.subtotal || payment.amount,
          gstAmount: payment.gstAmount || 0,
          gstRate: payment.gstRate || 18,
          currency: payment.currency,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId || transactionId,
          paymentMethod: payment.method || method,
        }).catch((mailErr) => logger.warn("[PAYMENT] Async invoice email failed:", mailErr?.message || mailErr));
      }

      const targetPhone = userDoc?.phone || businessDoc?.phone || payment?.payerPhone;
      if (targetPhone) {
        whatsappService.sendPaymentReceipt({
          phone: targetPhone,
          userName: userDoc?.name || payment?.payerName || "Member",
          amount: payment.amount,
          purpose: membershipPlan?.name || payment.notes || "RIFAH Chamber Service",
          receiptNumber: payment.invoiceNumber,
        }).catch((waErr) => logger.warn("[PAYMENT] Async WhatsApp invoice alert failed:", waErr?.message || waErr));
      }

      // Notify chapter and country admins
      if (!isUserTier) {
        const bizChapter = (businessDoc?.chapter || userDoc?.chapter || "").trim();
        const bizChapterId = businessDoc?.chapterId || userDoc?.chapterId || null;
        let chapterAdmins = [];
        if (bizChapter || bizChapterId) {
          const cleanChapter = bizChapter.replace(/\b(chapter|chamber)\b/gi, "").trim();
          chapterAdmins = await User.find({
            role: ROLES.CHAPTER_ADMIN,
            $or: [
              ...(bizChapterId ? [{ chapterId: bizChapterId }] : []),
              ...(cleanChapter ? [{ chapter: new RegExp(cleanChapter, "i") }] : []),
              ...(bizChapter ? [{ chapter: new RegExp(`^${bizChapter}$`, "i") }] : []),
            ],
          }).select("_id email name chapter");
        }

        for (const ca of chapterAdmins) {
          notificationService.createNotification({
            recipientId: ca._id,
            type: "Verification",
            title: "New Membership Payment & Verification Request",
            body: `Business "${businessDoc?.name || userDoc?.name}" (${bizChapter || "Your Chapter"}) has completed ${planId || "Membership"} payment (Invoice #${payment.invoiceNumber}) and is awaiting verification approval.`,
            entityId: businessDoc?._id,
            link: "/chapter-admin/verification",
          }).catch(() => {});
        }
      }

      const bizCountry = (businessDoc?.country || payload.country || userDoc?.country || "").trim();
      const bizCountryId = businessDoc?.countryId || userDoc?.countryId;
      const isNonIndia = bizCountry && bizCountry.toLowerCase() !== "india";

      let targetAdmins = [];
      // ==========================================
      // [COUNTRY_MODULE_DISABLED] Country Admin Payment Alert
      // if (isNonIndia) {
      //   const cAdminQuery = [];
      //   if (bizCountryId) cAdminQuery.push({ countryId: bizCountryId });
      //   cAdminQuery.push({ country: new RegExp(`^${bizCountry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      //   targetAdmins = await User.find({
      //     role: ROLES.COUNTRY_ADMIN,
      //     status: "Active",
      //     $or: cAdminQuery,
      //   }).select("_id email name");
      // }
      // ==========================================
      if (targetAdmins.length === 0) {
        targetAdmins = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("_id email name");
      }

      const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
      const adminEmails = [...new Set([adminFallbackEmail, ...targetAdmins.map((a) => a.email)].filter(Boolean))];

      for (const adminMail of adminEmails) {
        emailService.sendAdminPaymentReceiptAlert({
          adminEmail: adminMail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || payload.businessName || "Member Business",
          planName: isMembership ? membershipPlan?.name : "EVENT PASS",
          amount: payment.amount,
          currency: payment.currency,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId || transactionId,
          paymentMethod: payment.method || method,
          userPhone: userDoc?.phone || "",
          userEmail: targetEmail || "",
        }).catch(() => {});
      }

      const currSymbol = payment.currency === "USD" ? "$" : (payment.currency === "JPY" ? "¥" : "₹");
      for (const admin of targetAdmins) {
        notificationService.createNotification({
          recipientId: admin._id,
          type: "Payment",
          title: "New Payment Receipt for Verification",
          body: `Receipt #${payment.invoiceNumber} of ${currSymbol}${payment.amount} from ${businessDoc?.name || payload.businessName || "Member"} received for verification.`,
          link: isNonIndia ? "/admin/verification" : "/admin/payments",
        }).catch(() => {});
      }
    } catch (bgErr) {
      console.error("Background payment notification error:", bgErr);
    }
  });

  // Re-fetch fresh user and business documents from DB so the response reflects newly updated tier fields
  const freshUser = await User.findById(userDoc._id).populate("savedBusinesses");
  const freshBusiness = finalBusinessId ? await Business.findById(finalBusinessId) : businessDoc;

  // Generate refreshed JWT tokens
  const tokenPayload = {
    id: freshUser._id,
    email: freshUser.email,
    role: freshUser.role,
    chapter: freshUser.chapter,
    forcePasswordChange: freshUser.forcePasswordChange,
  };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  const userObj = freshUser.toJSON();
  if (Array.isArray(userObj.savedBusinesses)) {
    userObj.savedBusinesses = userObj.savedBusinesses.filter(Boolean);
  }

  return {
    verified: true,
    payment,
    membership: updatedMembership,
    business: freshBusiness,
    user: userObj,
    accessToken,
    refreshToken,
  };
}

export const paymentService = {
  /**
   * Get Gateway Public Config
   */
  getGatewayConfig: () => {
    return {
      razorpayKeyId: env.RAZORPAY.KEY_ID,
      stripePublishableKey: env.STRIPE.PUBLISHABLE_KEY,
      stripeCurrency: (env.STRIPE.CURRENCY || "usd").toLowerCase(),
    };
  },

  /**
   * Create Razorpay Order (Domestic INR) or route to Stripe if USD
   */
  createRazorpayOrder: async (payload, user) => {
    const selectedCurrency = (payload?.currency || "INR").toUpperCase();
    const isInternational = selectedCurrency === "USD" || payload?.provider === "stripe";

    // International (USD) payments route to Stripe Hosted Checkout
    if (isInternational) {
      return paymentService.createStripeCheckoutSession(payload, user);
    }

    const { planId, amount, eventId, courseId, itemType } = payload;
    let invoiceNumber = await getNextInvoiceNumber({ chapter: user?.chapter });
    const gatewayConfig = env.RAZORPAY;

    let numericAmount = 0;
    let actualPlanId = null;

    if (courseId) {
      const { Course } = await import("../courses/course.model.js");
      const courseDoc = await Course.findById(courseId);
      if (!courseDoc) throw new NotFoundError("Course not found");
      if (!courseDoc.isPaid || !courseDoc.price) {
        throw new BadRequestError("This course is free and does not require payment");
      }
      numericAmount = Number(courseDoc.price);
    } else if (planId) {
      const plan = await getActivePlan(planId);
      const charge = getPlanCharge(plan, selectedCurrency);
      numericAmount = charge.totalAmount;
      actualPlanId = plan.planId;
    } else if (amount) {
      numericAmount = Number(amount);
    }

    if (numericAmount <= 0) throw new BadRequestError("Amount must be greater than zero to create a payment order");
    const amountInSubunits = Math.round(numericAmount * 100);
    const authString = Buffer.from(`${gatewayConfig.KEY_ID}:${gatewayConfig.KEY_SECRET}`).toString("base64");

    const notes = {
      payerId: user.id,
      currency: selectedCurrency,
      accountType: "national_domestic",
    };
    if (actualPlanId) notes.planId = actualPlanId;
    if (eventId) notes.eventId = String(eventId);
    if (courseId) notes.courseId = String(courseId);
    if (itemType) notes.itemType = String(itemType);

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify({
        amount: amountInSubunits,
        currency: selectedCurrency,
        receipt: invoiceNumber,
        notes,
      }),
    });

    const orderData = await response.json();
    if (!response.ok) {
      throw new BadRequestError(orderData?.error?.description || "Failed to create Razorpay order");
    }

    return {
      provider: "razorpay",
      orderId: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      keyId: gatewayConfig.KEY_ID,
      invoiceNumber,
    };
  },

  /**
   * Create Stripe Hosted Checkout Session (International USD)
   */
  createStripeCheckoutSession: async (payload, user) => {
    let invoiceNumber = await getNextInvoiceNumber({ chapter: user?.chapter });
    const selectedCurrency = (payload?.currency || "USD").toUpperCase();

    let numericAmount = 0;
    let actualPlanId = null;
    let title = payload.description || "RIFAH International Payment";

    if (payload.courseId) {
      const { Course } = await import("../courses/course.model.js");
      const courseDoc = await Course.findById(payload.courseId);
      if (!courseDoc) throw new NotFoundError("Course not found");
      if (!courseDoc.isPaid || !courseDoc.price) {
        throw new BadRequestError("This course is free and does not require payment");
      }
      numericAmount = Number(courseDoc.priceUsd || Math.round(Number(courseDoc.price) / 80) || 1);
      title = `Course: ${courseDoc.title}`;
    } else if (payload.planId) {
      const plan = await getActivePlan(payload.planId);
      const charge = getPlanCharge(plan, selectedCurrency);
      numericAmount = charge.totalAmount;
      actualPlanId = plan.planId;
      title = `RIFAH ${plan.name} Membership`;
    } else if (payload.amount) {
      numericAmount = Number(payload.amount);
    }

    if (numericAmount <= 0) {
      throw new BadRequestError("Amount must be greater than zero to create a Stripe session");
    }

    const origin = payload.origin || env.FRONTEND_URL || "https://rifah.nexcorealliance.com";
    let successUrl = payload.successUrl;
    let cancelUrl = payload.cancelUrl;

    if (!successUrl) {
      if (payload.courseId) {
        successUrl = `${origin}/biz/courses/${payload.courseId}?stripe_session_id={CHECKOUT_SESSION_ID}&success=true`;
        cancelUrl = `${origin}/biz/courses/${payload.courseId}?canceled=true`;
      } else if (payload.eventId) {
        successUrl = `${origin}/events/${payload.eventId}?stripe_session_id={CHECKOUT_SESSION_ID}&success=true`;
        cancelUrl = `${origin}/events/${payload.eventId}?canceled=true`;
      } else {
        successUrl = `${origin}/membership/checkout?stripe_session_id={CHECKOUT_SESSION_ID}&plan=${actualPlanId || payload.planId || ""}&currency=USD&success=true`;
        cancelUrl = `${origin}/membership/checkout?plan=${actualPlanId || payload.planId || ""}&currency=USD&canceled=true`;
      }
    }

    const session = await stripeClient.createCheckoutSession({
      amount: numericAmount,
      currency: selectedCurrency.toLowerCase(),
      name: title,
      description: payload.description || `${title} (${selectedCurrency})`,
      invoiceNumber,
      customerEmail: payload.billingEmail || user?.email || undefined,
      successUrl,
      cancelUrl,
      metadata: {
        userId: user?.id || "",
        planId: actualPlanId || payload.planId || "",
        businessId: payload.businessId || "",
        eventId: payload.eventId || "",
        courseId: payload.courseId || "",
        itemType: payload.itemType || (payload.courseId ? "Course" : "Membership"),
        description: title,
        billingEmail: payload.billingEmail || user?.email || "",
        billingPhone: payload.billingPhone || "",
        businessName: payload.businessName || "",
        taxId: payload.taxId || "",
        billingAddress: payload.billingAddress || "",
        city: payload.city || "",
        state: payload.state || "",
        postalCode: payload.postalCode || "",
      },
    });

    return {
      provider: "stripe",
      sessionId: session.id,
      url: session.url,
      orderId: session.id,
      amount: numericAmount,
      currency: selectedCurrency,
      keyId: env.STRIPE.PUBLISHABLE_KEY,
      publishableKey: env.STRIPE.PUBLISHABLE_KEY,
      invoiceNumber,
    };
  },

  /**
   * Verify Razorpay Payment Signature and Upgrade Plan
   */
  verifyRazorpayPayment: async (payload, user) => {
    // If Stripe session, route to Stripe verification
    if (payload.stripe_session_id || payload.sessionId || payload.provider === "stripe") {
      return paymentService.verifyStripeSession(payload, user);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new BadRequestError("Missing required Razorpay payment fields");
    }

    const gatewayConfig = env.RAZORPAY;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", gatewayConfig.KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new BadRequestError("Invalid payment signature");
    }

    return fulfillPaymentOrder({
      payload,
      user,
      transactionId: razorpay_payment_id,
      orderId: razorpay_order_id,
      method: "Razorpay (UPI / Cards)",
    });
  },

  /**
   * Verify Stripe Checkout Session (International USD)
   */
  verifyStripeSession: async (payload, user) => {
    const sessionId = payload.sessionId || payload.stripe_session_id;
    if (!sessionId) {
      throw new BadRequestError("Missing Stripe Session ID");
    }

    const session = await stripeClient.retrieveCheckoutSession(sessionId);
    if (!session) {
      throw new NotFoundError("Stripe checkout session not found");
    }

    if (session.payment_status !== "paid") {
      throw new BadRequestError(`Payment has not been completed. Status: ${session.payment_status}`);
    }

    const transactionId = session.payment_intent?.id || session.id;
    const metadata = session.metadata || {};

    const fulfillmentResult = await fulfillPaymentOrder({
      payload: {
        ...metadata,
        ...payload,
        currency: (session.currency || "usd").toUpperCase(),
        amount: (session.amount_total || 0) / 100,
        invoiceNumber: session.client_reference_id || metadata.invoiceNumber || payload.invoiceNumber,
      },
      user: user || { id: metadata.userId },
      transactionId,
      orderId: session.id,
      method: "Stripe International (Card / Apple Pay)",
    });

    return fulfillmentResult;
  },

  /**
   * Handle Stripe Webhook Events
   */
  handleStripeWebhook: async (rawBody, signature) => {
    const event = stripeClient.verifyWebhook(rawBody, signature);
    logger.info(`[STRIPE WEBHOOK] Received event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const metadata = session.metadata || {};
        if (metadata.userId) {
          const transactionId = session.payment_intent || session.id;
          await fulfillPaymentOrder({
            payload: {
              ...metadata,
              currency: (session.currency || "usd").toUpperCase(),
              amount: (session.amount_total || 0) / 100,
              invoiceNumber: session.client_reference_id || metadata.invoiceNumber,
            },
            user: { id: metadata.userId },
            transactionId,
            orderId: session.id,
            method: "Stripe International (Card / Apple Pay)",
          });
        }
      }
    }

    return { received: true };
  },

  createOrder: async (payload, user) => paymentService.createRazorpayOrder(payload, user),
  verifyPayment: async (payload, user) => paymentService.verifyRazorpayPayment(payload, user),

  /**
   * Process / Record a payment transaction
   */
  createPayment: async (data, user) => {
    const userDoc = await User.findById(user.id);
    let finalBusinessId = data.business;
    let businessDoc = null;

    if (finalBusinessId) {
      businessDoc = await Business.findById(finalBusinessId);
    }
    if (!businessDoc) {
      businessDoc = await Business.findOne({ owner: user.id });
      if (businessDoc) finalBusinessId = businessDoc._id;
    }

    let invoiceNumber = (data.invoiceNumber || "").trim().toUpperCase();
    if (!invoiceNumber || (await Payment.findOne({ invoiceNumber }))) {
      invoiceNumber = await getNextInvoiceNumber({
        chapter: data.chapter || data.collectingChapter || businessDoc?.chapter || userDoc?.chapter,
      });
    }

    const isMembership = data.itemType === "Membership" || Boolean(data.planId);
    const isIntlPurchase = String(data.currency || "").toUpperCase() === "USD" || businessDoc?.region === "international" || businessDoc?.currency === "USD";
    const isUserTier = String(data.planId || "").toLowerCase().startsWith("tier_") || 
                       String(data.planId || "").toLowerCase() === "free";

    if (isMembership && isIntlPurchase && !isUserTier) {
      throw new BadRequestError("International businesses must select a Tier Plan (Tier I, II, III, or IV), not a Chamber subscription.");
    }

    const membershipPlan = isMembership ? await getActivePlan(data.planId) : null;
    const planCharge = membershipPlan ? getPlanCharge(membershipPlan, data.currency) : null;
    if (isMembership && userDoc) {
      if (userDoc.role === ROLES.CUSTOMER) {
        userDoc.role = ROLES.BUSINESS_OWNER;
        await userDoc.save();
      }
      if (!businessDoc) {
        const rawBizName =
          (data.businessName && data.businessName.trim()) ||
          userDoc.organization ||
          `${userDoc.name}'s Enterprise`;

        let slug = generateSlug(rawBizName);
        const slugConflict = await Business.findOne({ slug });
        if (slugConflict) {
          slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        const formattedTier = membershipPlan.name;

        const bizCity = (data.city && data.city.trim()) || userDoc.city || "";
        const bizState = (data.state && data.state.trim()) || userDoc.state || "";
        const bizChapter = userDoc.chapter || "";
        const bizIndustry = (data.industry && data.industry.trim()) || userDoc.sourcingInterest || "";

        const isUserTier = String(data.planId || "").toLowerCase().startsWith("tier_") || 
                           String(membershipPlan?.planId || "").toLowerCase().startsWith("tier_") ||
                           String(data.planId || "").toLowerCase() === "free";

        businessDoc = await Business.create({
          name: rawBizName,
          slug,
          owner: userDoc._id,
          taxId: (data.taxId && data.taxId.trim()) || "",
          address: (data.billingAddress && data.billingAddress.trim()) || "",
          city: bizCity,
          state: bizState,
          phone: userDoc.phone || "",
          email: data.billingEmail || userDoc.email || "",
          chapter: bizChapter,
          industry: bizIndustry,
          categories: bizIndustry ? [bizIndustry] : [],
          status: isUserTier ? "Active" : "Pending Verification",
          verificationStatus: isUserTier ? "Unverified" : "Pending",
          verification: "unverified",
          membership: isUserTier ? "Free" : formattedTier,
          subscriberTier: isUserTier ? (data.planId || "tier_1") : "tier_1",
          region: isIntlPurchase ? "international" : (userDoc.region || "national"),
          currency: isIntlPurchase ? "USD" : "INR",
          rating: 5,
        });
        finalBusinessId = businessDoc._id;
      } else {
        const formattedTier = membershipPlan.name;
        const isUserTier = String(data.planId || "").toLowerCase().startsWith("tier_") || 
                           String(membershipPlan?.planId || "").toLowerCase().startsWith("tier_") ||
                           String(data.planId || "").toLowerCase() === "free";

        if (isIntlPurchase) {
          businessDoc.region = "international";
          businessDoc.currency = "USD";
        }
        if (isUserTier) {
          businessDoc.subscriberTier = data.planId || "tier_1";
          if (!businessDoc.membership) {
            businessDoc.membership = "Free";
          }
        } else {
          businessDoc.membership = formattedTier;
          if (!businessDoc.subscriberTier) {
            businessDoc.subscriberTier = "tier_1";
          }
          if (!businessDoc.isVerified) {
            businessDoc.status = "Pending Verification";
            businessDoc.verificationStatus = "Pending";
            businessDoc.verification = "pending";
            businessDoc.verificationReviewReason = "";
            businessDoc.verificationRemarks = "";
          }
        }

        if (!Array.isArray(businessDoc.verificationHistory)) {
          businessDoc.verificationHistory = [];
        }
        businessDoc.verificationHistory.push({
          action: "payment",
          reason: isUserTier
            ? `Subscriber plan payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Account activated.`
            : `Membership payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Queued for Chapter Administrator verification review.`,
          reviewer: userDoc._id,
          createdAt: new Date(),
        });
        await businessDoc.save();
      }

      if (data.planId && finalBusinessId) {
        await membershipService.upgradePlan(finalBusinessId, data.planId);
      }

      // Sync Verification document in database ONLY for chamber tiers
      const isUserTier = String(data.planId || "").toLowerCase().startsWith("tier_") || 
                         String(membershipPlan?.planId || "").toLowerCase().startsWith("tier_") ||
                         String(data.planId || "").toLowerCase() === "free";
      if (!isUserTier) {
        try {
          const { Verification } = await import("../verification/verification.model.js");
          let verificationDoc = await Verification.findOne({ business: businessDoc._id });
          if (verificationDoc) {
            if (verificationDoc.status !== "verified") {
              verificationDoc.status = "pending";
              verificationDoc.remarks = `Membership payment completed (Invoice #${invoiceNumber}). Awaiting Chapter Administrator review.`;
              await verificationDoc.save();
            }
          } else {
            await Verification.create({
              business: businessDoc._id,
              status: "pending",
              remarks: `Membership payment completed (Invoice #${invoiceNumber}).`,
              submittedBy: userDoc._id,
              documents: businessDoc.documents || [],
            });
          }
        } catch (verifErr) {
          console.error("Error updating verification on createPayment:", verifErr);
        }
      }
    }

    const payment = await Payment.create({
      ...data,
      business: finalBusinessId || null,
      invoiceNumber,
      planTier: data.planId || "",
      amount: planCharge ? planCharge.baseAmount : data.amount,
      payer: user.id,
      transactionId: `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: "Paid",
      paidAt: new Date(),
      verificationToken: crypto.randomBytes(24).toString("hex"),
    });

    // Keep invoice totals tied to the same editable plan record used for checkout.
    if (planCharge) {
      payment.subtotal = planCharge.baseAmount;
      payment.gstRate = planCharge.gstRate;
      payment.gstAmount = planCharge.gstAmount;
      payment.amount = planCharge.totalAmount;
      await payment.save();
    }

    // Revenue Sharing: see verifyRazorpayPayment above for why this is non-fatal here.
    try {
      await revenueShareService.createLedgerEntriesForPayment(payment, { actor: user });
    } catch (revShareErr) {
      logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${payment._id}:`, revShareErr);
    }

    try {
      await notificationService.createNotification({
        recipientId: user.id,
        type: "Payment",
        title: "Invoice Issued",
        body: `Invoice #${payment.invoiceNumber} for ₹${payment.amount} has been issued.`,
        link: "/biz/payments",
      });

      const targetEmail = data.billingEmail || userDoc?.email;
      if (targetEmail) {
        emailService.sendMembershipInvoiceEmail({
          email: targetEmail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || data.businessName || "Member Business",
          planName: (data.itemType || "Membership").toUpperCase(),
          amount: payment.amount,
          currency: payment.currency,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId,
          paymentMethod: data.method || "Online Transfer",
        }).catch((mailErr) => logger.warn("[PAYMENT] Async invoice email failed:", mailErr?.message || mailErr));
      }

      const targetPhoneManual = userDoc?.phone || businessDoc?.phone;
      if (targetPhoneManual) {
        whatsappService.sendPaymentReceipt({
          phone: targetPhoneManual,
          userName: userDoc?.name || "Member",
          amount: payment.amount,
          purpose: (data.itemType || "Membership").toUpperCase(),
          receiptNumber: payment.invoiceNumber,
        }).catch((waErr) => logger.warn("[PAYMENT] Async WhatsApp invoice alert failed:", waErr?.message || waErr));
      }

      // 1. Notify Chapter Admin of the specific Chapter only
      const bizChapter = (businessDoc?.chapter || userDoc?.chapter || "").trim();
      const bizChapterId = businessDoc?.chapterId || userDoc?.chapterId || null;
      let chapterAdmins = [];
      if (bizChapter || bizChapterId) {
        const cleanChapter = bizChapter.replace(/\b(chapter|chamber)\b/gi, "").trim();
        chapterAdmins = await User.find({
          role: ROLES.CHAPTER_ADMIN,
          $or: [
            ...(bizChapterId ? [{ chapterId: bizChapterId }] : []),
            ...(cleanChapter ? [{ chapter: new RegExp(cleanChapter, "i") }] : []),
            ...(bizChapter ? [{ chapter: new RegExp(`^${bizChapter}$`, "i") }] : []),
          ],
        }).select("_id email name chapter");
      }

      for (const ca of chapterAdmins) {
        notificationService.createNotification({
          recipientId: ca._id,
          type: "Verification",
          title: "New Membership Payment & Verification Request",
          body: `Business "${businessDoc?.name || userDoc?.name}" (${bizChapter || "Your Chapter"}) has completed ${data.planId || data.itemType || "Membership"} payment (Invoice #${payment.invoiceNumber}) and is awaiting verification approval.`,
          entityId: businessDoc?._id,
          link: "/chapter-admin/verification",
        }).catch(() => {});

        if (ca.email) {
          emailService.sendAdminVerificationAlert({
            adminEmail: ca.email,
            businessName: businessDoc?.name || userDoc?.name,
            ownerName: userDoc?.name,
            chapter: bizChapter || "General",
            notes: `Membership payment completed (Invoice #${payment.invoiceNumber}). Awaiting verification approval.`,
          }).catch(() => {});
        }
      }

      // 2. Send official payment receipt to Country Admin (for Japan/USA/non-India) or Central Admin (India/fallback)
      try {
        const bizCountry = (businessDoc?.country || data.country || userDoc?.country || "").trim();
        const bizCountryId = businessDoc?.countryId || userDoc?.countryId;
        const isNonIndia = bizCountry && bizCountry.toLowerCase() !== "india";

        let targetAdmins = [];
        // ==========================================
        // [COUNTRY_MODULE_DISABLED] Country Admin Payment Alert
        // if (isNonIndia) {
        //   const cAdminQuery = [];
        //   if (bizCountryId) cAdminQuery.push({ countryId: bizCountryId });
        //   cAdminQuery.push({ country: new RegExp(`^${bizCountry.replace(/[.*+?^${}()|[]\]/g, "\\$&")}$`, "i") });
        //   targetAdmins = await User.find({
        //     role: ROLES.COUNTRY_ADMIN,
        //     status: "Active",
        //     $or: cAdminQuery,
        //   }).select("_id email name");
        // }
        // ==========================================

        if (targetAdmins.length === 0) {
          targetAdmins = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("_id email name");
        }

        const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
        const adminEmails = [...new Set([adminFallbackEmail, ...targetAdmins.map((a) => a.email)].filter(Boolean))];

        for (const adminMail of adminEmails) {
          await emailService.sendAdminPaymentReceiptAlert({
            adminEmail: adminMail,
            name: userDoc?.name || "Member",
            businessName: businessDoc?.name || data.businessName || "Member Business",
            planName: (data.itemType || "Membership").toUpperCase(),
            amount: payment.amount,
            currency: payment.currency,
            invoiceNumber: payment.invoiceNumber,
            paidAt: payment.paidAt,
            transactionId: payment.transactionId,
            paymentMethod: data.method || "Online Transfer",
            userPhone: userDoc?.phone || "",
            userEmail: targetEmail || "",
          });
        }

        const currSymbol = payment.currency === "USD" ? "$" : (payment.currency === "JPY" ? "¥" : "₹");
        for (const admin of targetAdmins) {
          await notificationService.createNotification({
            recipientId: admin._id,
            type: "Payment",
            title: "New Payment Receipt for Verification",
            body: `Receipt #${payment.invoiceNumber} of ${currSymbol}${payment.amount} from ${businessDoc?.name || data.businessName || "Member"} received for verification.`,
            link: isNonIndia ? "/admin/verification" : "/admin/payments",
          });
        }
      } catch (adminErr) {
        console.error("Admin receipt notification error:", adminErr);
      }
    } catch (err) {
      console.error("Payment notification / email error:", err);
    }

    return payment;
  },

  /**
   * List payments for a user or business
   */
  listUserPayments: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { payer: userId };

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    const [payments, total, pendingCount] = await Promise.all([
      Payment.find(filter).sort(sort).skip(skip).limit(limit),
      Payment.countDocuments(filter),
      Payment.countDocuments({ payer: userId, status: { $in: ["Pending", "pending"] } }),
    ]);

    const paidInvoices = payments.filter((p) => p.status === "Paid" || p.status === "completed");
    const paidThisYear = paidInvoices.filter((p) => new Date(p.paidAt || p.createdAt) >= startOfYear);

    const latest = payments[0];
    let nextRenewal = "14 Nov 2026";
    if (latest) {
      const renewalDate = new Date(latest.paidAt || latest.createdAt || Date.now());
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      nextRenewal = renewalDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    const summary = {
      paidThisYearCount: paidThisYear.length || paidInvoices.length,
      paidThisYearAmount: paidThisYear.reduce((acc, p) => acc + (p.amount || 0), 0),
      pendingCount: pendingCount || 0,
      nextRenewal,
      latestPaymentMethod: latest?.method || (latest?.transactionId?.startsWith("pay_") ? "UPI / Razorpay" : "Card ····4242"),
    };

    return {
      payments,
      summary,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all transactions (Admin Secretariat console)
   */
  listAllPayments: async (queryParams = {}, user) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (user && user.role === ROLES.COUNTRY_ADMIN) {
      const countryScope = await getChapterFilter(user, "business_ref");
      const countryUsersFilter = await getChapterFilter(user, "direct_id");
      const usersInCountry = await User.find(countryUsersFilter).select("_id");
      const userIds = usersInCountry.map(u => u._id);

      const orConditions = [];
      if (countryScope.business) orConditions.push(countryScope);
      if (userIds.length > 0) orConditions.push({ payer: { $in: userIds } });

      filter.$or = orConditions.length > 0 ? orConditions : [{ _id: null }];
    } else if (user && user.role === ROLES.CHAPTER_ADMIN && user.chapter) {
      const chapterRegex = new RegExp(`^${user.chapter.trim()}$`, "i");
      const usersInChapter = await User.find({ chapter: chapterRegex }).select("_id");
      const businessesInChapter = await Business.find({ chapter: chapterRegex }).select("_id");
      
      const userIds = usersInChapter.map(u => u._id);
      const businessIds = businessesInChapter.map(b => b._id);
      
      filter.$or = [
        { payer: { $in: userIds } },
        { business: { $in: businessIds } }
      ];
    }

    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.itemType) filter.itemType = queryParams.itemType;
    if (queryParams.business) filter.business = queryParams.business;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("payer", "name email phone chapter state")
        .populate("business", "name slug chapter state city membership")
        .populate("eventId", "title slug")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    return {
      payments,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get invoice details
   */
  getInvoice: async (identifier, user) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { invoiceNumber: identifier };

    const payment = await Payment.findOne(query)
      .populate("payer", "name email phone chapter state")
      .populate("business", "name slug chapter state city membership")
      .populate("eventId", "title slug date venue");

    if (!payment) {
      throw new NotFoundError("Invoice not found");
    }

    if (!payment.verificationToken) {
      payment.verificationToken = crypto.randomBytes(24).toString("hex");
      await payment.save();
    }

    if (user && user.role === ROLES.COUNTRY_ADMIN) {
      const userCountry = (user.country || "").trim().toLowerCase();
      let payerCountry = payment.payer?.country;
      let bizCountry = payment.business?.country;
      if (!payerCountry && payment.payer) {
        const u = await User.findById(payment.payer._id || payment.payer).select("country").lean();
        payerCountry = u?.country;
      }
      if (!bizCountry && payment.business) {
        const b = await Business.findById(payment.business._id || payment.business).select("country").lean();
        bizCountry = b?.country;
      }
      const matchesPayer = payerCountry && payerCountry.toLowerCase() === userCountry;
      const matchesBiz = bizCountry && bizCountry.toLowerCase() === userCountry;
      if (!matchesPayer && !matchesBiz) {
        throw new ForbiddenError("Access denied: Payment does not belong to your country");
      }
    } else if (user && user.role === ROLES.CHAPTER_ADMIN && user.chapter) {
      const chapterRegex = new RegExp(`^${user.chapter.trim()}$`, "i");
      const payerChapter = payment.payer?.chapter;
      const businessChapter = payment.business?.chapter;
      
      const isPayerInChapter = payerChapter && chapterRegex.test(payerChapter);
      const isBusinessInChapter = businessChapter && chapterRegex.test(businessChapter);
      
      if (!isPayerInChapter && !isBusinessInChapter) {
        throw new ForbiddenError("Access denied: Payment does not belong to your chapter");
      }
    }
    return payment;
  },

  updatePaymentStatus: async (id, status, adminUserId) => {
    const payment = await Payment.findById(id);
    if (!payment) {
      throw new NotFoundError("Payment not found");
    }
    const previousStatus = payment.status;
    payment.status = status;
    await payment.save();

    // Revenue Sharing: this function is also how refunds are processed
    // (payment.controller.js processRefund calls updatePaymentStatus(id, "Refunded", ...)),
    // so both directions are handled here. Non-fatal — logged, never blocks the status
    // change the admin is actively performing.
    try {
      if (status === "Paid" && previousStatus !== "Paid") {
        await revenueShareService.createLedgerEntriesForPayment(payment, { actor: { id: adminUserId } });
      } else if (status === "Refunded" && previousStatus !== "Refunded") {
        await revenueShareService.reverseLedgerEntriesForPayment(payment, "Payment refunded by admin", {
          id: adminUserId,
        });
      }
    } catch (revShareErr) {
      logger.error(`[REVENUE SHARE] Failed to process ledger update for payment ${payment._id}:`, revShareErr);
    }

    return payment;
  },

  /**
   * Officially verify and approve a payment transaction by Admin
   */
  verifyPaymentByAdmin: async (id, adminUserId) => {
    const payment = await Payment.findById(id).populate("payer", "name email");
    if (!payment) {
      throw new NotFoundError("Payment not found");
    }
    const wasAlreadyPaid = payment.status === "Paid";
    payment.status = "Paid";
    await payment.save();

    // Revenue Sharing: see updatePaymentStatus above.
    if (!wasAlreadyPaid) {
      try {
        await revenueShareService.createLedgerEntriesForPayment(payment, { actor: { id: adminUserId } });
      } catch (revShareErr) {
        logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${payment._id}:`, revShareErr);
      }
    }

    if (payment.business) {
      const businessDoc = await Business.findById(payment.business);
      if (businessDoc) {
        businessDoc.status = "Active";
        await businessDoc.save();
      }
    }

    if (payment.payer) {
      await notificationService.createNotification({
        recipientId: payment.payer._id || payment.payer,
        type: "Payment",
        title: "Payment Officially Verified by Central Admin",
        body: `Your payment receipt #${payment.invoiceNumber} (${payment.currency === "USD" ? "$" : "₹"}${payment.amount}) has been officially verified and approved.`,
        link: "/biz/payments",
      });
    }

    return payment;
  },

  /**
   * Create a custom invoice issued by Central Admin
   */
  createAdminInvoice: async (data, adminUser) => {
    // 1. Identify / resolve payer & business
    let payerId = null;
    let businessId = null;
    let payerDoc = null;
    let businessDoc = null;

    if (data.businessId && mongoose.Types.ObjectId.isValid(data.businessId)) {
      businessDoc = await Business.findById(data.businessId).populate("owner");
      if (businessDoc) {
        businessId = businessDoc._id;
        payerId = businessDoc.owner?._id || businessDoc.owner;
        if (payerId) {
          payerDoc = await User.findById(payerId);
        }
      }
    }

    if (!payerId && data.payerId && mongoose.Types.ObjectId.isValid(data.payerId)) {
      payerDoc = await User.findById(data.payerId);
      if (payerDoc) {
        payerId = payerDoc._id;
        if (!businessId) {
          businessDoc = await Business.findOne({ owner: payerDoc._id });
          if (businessDoc) businessId = businessDoc._id;
        }
      }
    }

    // Search by email if provided
    if (!payerId && data.payerEmail) {
      payerDoc = await User.findOne({ email: data.payerEmail.toLowerCase().trim() });
      if (payerDoc) {
        payerId = payerDoc._id;
        if (!businessId) {
          businessDoc = await Business.findOne({ owner: payerDoc._id });
          if (businessDoc) businessId = businessDoc._id;
        }
      }
    }

    if (!payerId) {
      // Default to creating admin user to fulfill schema required check
      payerId = adminUser.id || adminUser._id;
    }

    // 2. Generate or validate invoiceNumber
    let invoiceNumber = (data.invoiceNumber || "").trim().toUpperCase();
    if (!invoiceNumber) {
      invoiceNumber = await getNextInvoiceNumber({
        chapter: data.chapter || businessDoc?.chapter || payerDoc?.chapter,
      });
    } else {
      const existing = await Payment.findOne({ invoiceNumber });
      if (existing) {
        throw new BadRequestError(`Invoice number #${invoiceNumber} is already taken`);
      }
    }

    // 3. Amounts & Tax Calculations
    const gstRate = data.gstRate !== undefined ? Number(data.gstRate) : 18;
    let subtotal = data.subtotal !== undefined ? Number(data.subtotal) : 0;
    let gstAmount = data.gstAmount !== undefined ? Number(data.gstAmount) : 0;
    let amount = Number(data.amount) || 0;

    if (!amount && subtotal) {
      if (gstRate > 0) {
        gstAmount = Math.round((subtotal * (gstRate / 100)) * 100) / 100;
        amount = Math.round((subtotal + gstAmount) * 100) / 100;
      } else {
        amount = subtotal;
        gstAmount = 0;
      }
    } else if (amount && !subtotal) {
      if (gstRate > 0) {
        subtotal = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
        gstAmount = Math.round((amount - subtotal) * 100) / 100;
      } else {
        subtotal = amount;
        gstAmount = 0;
      }
    } else if (amount && subtotal && !gstAmount && gstRate > 0) {
      gstAmount = Math.round((amount - subtotal) * 100) / 100;
    }

    const payerName = (data.payerName || payerDoc?.name || businessDoc?.contactPerson || businessDoc?.name || "Direct Client").trim();
    const payerEmail = (data.payerEmail || payerDoc?.email || businessDoc?.email || "").trim();
    const payerPhone = (data.payerPhone || payerDoc?.phone || businessDoc?.phone || "").trim();
    const businessName = (data.businessName || businessDoc?.name || "").trim();
    const chapter = data.chapter || businessDoc?.chapter || payerDoc?.chapter || "Central";
    const state = data.state || businessDoc?.state || payerDoc?.state || "";

    const payment = await Payment.create({
      invoiceNumber,
      payer: payerId,
      business: businessId || undefined,
      itemType: data.itemType || "Custom Invoice",
      description: data.description || data.purpose || "Chamber Service Invoice",
      subtotal,
      gstRate,
      gstAmount,
      amount,
      currency: data.currency || "INR",
      method: data.method || "Bank Transfer",
      status: data.status || "Paid",
      transactionId: data.transactionId || `TXN-${invoiceNumber}`,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      chapter,
      state,
      collectingChapter: chapter,
      collectingState: state,
      payerName,
      payerEmail,
      payerPhone,
      businessName,
      gstin: data.gstin || businessDoc?.gstin || "",
      sacCode: data.sacCode || "9983",
      quantity: Number(data.quantity) || 1,
      notes: data.notes || "",
      isCustomInvoice: true,
      createdBy: adminUser.id || adminUser._id,
    });

    // Revenue Sharing: only takes effect when this admin invoice is itself tagged
    // itemType "Membership" and created as status "Paid" — createLedgerEntriesForPayment
    // already no-ops otherwise (e.g. the default "Custom Invoice" itemType, or a
    // non-Paid status), so this is safe to call unconditionally.
    try {
      await revenueShareService.createLedgerEntriesForPayment(payment, { actor: adminUser });
    } catch (revShareErr) {
      logger.error(`[REVENUE SHARE] Failed to create ledger entries for payment ${payment._id}:`, revShareErr);
    }

    const populatedPayment = await Payment.findById(payment._id)
      .populate("payer", "name email phone chapter state")
      .populate("business", "name slug chapter state city membership");

    return populatedPayment;
  },
};