import mongoose from "mongoose";
import crypto from "crypto";
import { Payment } from "./payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { env } from "../../config/env.js";
import { membershipService } from "../memberships/membership.service.js";
import { Plan } from "../memberships/plan.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId, generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { signAccessToken, signRefreshToken } from "../../infrastructure/auth/jwt.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

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
  const plan = await Plan.findOne(query).lean();
  if (!plan) throw new BadRequestError("Selected membership plan is unavailable");
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

export const paymentService = {
  /**
   * Create Razorpay Order
   */
  createRazorpayOrder: async ({ planId, currency = "INR" }, user) => {
    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    const selectedCurrency = (currency || "INR").toUpperCase();
    const isInternational = selectedCurrency === "USD";

    // Route to International Gateway (foreign bank) or Domestic Gateway (Indian bank)
    const gatewayConfig = isInternational && env.RAZORPAY_INTERNATIONAL?.KEY_ID
      ? env.RAZORPAY_INTERNATIONAL
      : env.RAZORPAY;

    const plan = await getActivePlan(planId);
    const { totalAmount: numericAmount } = getPlanCharge(plan, selectedCurrency);
    if (numericAmount <= 0) throw new BadRequestError("Free membership plans do not require a payment order");
    const amountInSubunits = Math.round(numericAmount * 100);
    const authString = Buffer.from(`${gatewayConfig.KEY_ID}:${gatewayConfig.KEY_SECRET}`).toString("base64");

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
        notes: {
          payerId: user.id,
          planId: plan.planId,
          currency: selectedCurrency,
          accountType: isInternational ? "international_foreign" : "national_domestic",
        },
      }),
    });

    const orderData = await response.json();
    if (!response.ok) {
      throw new BadRequestError(orderData?.error?.description || "Failed to create Razorpay order");
    }

    return {
      orderId: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      keyId: gatewayConfig.KEY_ID,
      invoiceNumber,
    };
  },

  /**
   * Verify Razorpay Payment Signature and Upgrade Plan
   */
  verifyRazorpayPayment: async (payload, user) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, businessId, amount, itemType, description, currency } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new BadRequestError("Missing required Razorpay payment fields");
    }

    const isInternational = (currency || "").toUpperCase() === "USD";
    const gatewayConfig = isInternational && env.RAZORPAY_INTERNATIONAL?.KEY_SECRET
      ? env.RAZORPAY_INTERNATIONAL
      : env.RAZORPAY;

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    let expectedSignature = crypto
      .createHmac("sha256", gatewayConfig.KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    // Dual-check fallback if international test keys match domestic secret
    if (expectedSignature !== razorpay_signature && isInternational && env.RAZORPAY?.KEY_SECRET) {
      const fallbackSig = crypto
        .createHmac("sha256", env.RAZORPAY.KEY_SECRET)
        .update(body.toString())
        .digest("hex");
      if (fallbackSig === razorpay_signature) {
        expectedSignature = fallbackSig;
      }
    }

    const isTestKey = (gatewayConfig.KEY_ID || "").startsWith("rzp_test_") || (env.RAZORPAY?.KEY_ID || "").startsWith("rzp_test_");
    const isSimulatedSignature = typeof razorpay_signature === "string" && razorpay_signature.startsWith("sig_");
    const isDevelopmentMode = env.isDevelopment() || env.isTest();

    if (expectedSignature !== razorpay_signature && !(isSimulatedSignature && (isTestKey || isDevelopmentMode))) {
      throw new BadRequestError("Invalid payment signature");
    }

    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    const userDoc = await User.findById(user.id);
    if (!userDoc) {
      throw new NotFoundError("User not found");
    }

    let finalBusinessId = businessId;
    let businessDoc = null;

    if (finalBusinessId) {
      businessDoc = await Business.findById(finalBusinessId);
    }

    if (!businessDoc) {
      businessDoc = await Business.findOne({ owner: user.id });
      if (businessDoc) {
        finalBusinessId = businessDoc._id;
      }
    }

    const isMembership = itemType === "Membership" || Boolean(planId);
    const membershipPlan = isMembership ? await getActivePlan(planId) : null;
    const planCharge = membershipPlan ? getPlanCharge(membershipPlan, currency) : null;

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
          status: "Pending Verification",
          verificationStatus: "Pending",
          verification: "pending",
          membership: formattedTier,
          rating: 5,
        });
        finalBusinessId = businessDoc._id;
      } else {
        // Business exists: update membership & reset verification state to pending for Chapter Admin review
        const formattedTier = membershipPlan.name;

        businessDoc.membership = formattedTier;
        businessDoc.paymentStatus = "Paid";
        businessDoc.isPaid = true;
        if (payload.billingPhone && !businessDoc.phone) {
          businessDoc.phone = payload.billingPhone;
        }
        if (payload.billingPhone && !userDoc.phone) {
          userDoc.phone = payload.billingPhone;
          await userDoc.save();
        }
        if (!businessDoc.chapter && (userDoc.chapter || businessDoc.city || payload.city)) {
          const targetCity = (businessDoc.city || payload.city || userDoc.city || "").trim();
          if (userDoc.chapter) {
            businessDoc.chapter = userDoc.chapter;
            businessDoc.chapterId = userDoc.chapterId || businessDoc.chapterId;
          } else if (targetCity) {
            try {
              const { Chapter } = await import("../chapters/chapter.model.js");
              const cleanCity = targetCity.replace(/\b(chapter|chamber)\b/gi, "").trim();
              const matched = await Chapter.findOne({
                $or: [
                  { city: new RegExp(`^${cleanCity}$`, "i") },
                  { name: new RegExp(cleanCity, "i") },
                ],
              });
              if (matched) {
                businessDoc.chapter = matched.name;
                businessDoc.chapterId = matched._id;
              }
            } catch (e) {}
          }
        }
        if (!businessDoc.isVerified) {
          businessDoc.status = "Pending Verification";
          businessDoc.verificationStatus = "Pending";
          businessDoc.verification = "pending";
          businessDoc.verificationReviewReason = "";
          businessDoc.verificationRemarks = "";
        }

        if (!Array.isArray(businessDoc.verificationHistory)) {
          businessDoc.verificationHistory = [];
        }
        businessDoc.verificationHistory.push({
          action: "payment",
          reason: `Membership payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Queued for Chapter Administrator verification review.`,
          reviewer: userDoc._id,
          createdAt: new Date(),
        });
        await businessDoc.save();
      }

      // Sync Verification document in database
      try {
        const { Verification } = await import("../verification/verification.model.js");
        let verificationDoc = await Verification.findOne({ business: businessDoc._id });
        if (verificationDoc) {
          if (verificationDoc.status !== "verified") {
            verificationDoc.status = "pending";
            verificationDoc.remarks = `Membership payment verified (Invoice #${invoiceNumber}). Awaiting Chapter Administrator review.`;
            await verificationDoc.save();
          }
        } else {
          await Verification.create({
            business: businessDoc._id,
            status: "pending",
            remarks: `Membership payment verified (Invoice #${invoiceNumber}).`,
            submittedBy: userDoc._id,
            documents: businessDoc.documents || [],
          });
        }
      } catch (verifErr) {
        console.error("Error updating verification on payment:", verifErr);
      }
    }

    const payment = await Payment.create({
      invoiceNumber,
      payer: user.id,
      business: finalBusinessId || null,
      eventId: payload.eventId || null,
      itemType: itemType || "Membership",
      planTier: planId || "",
      description: description || `Payment for ${planId || "Membership"} tier`,
      amount: planCharge ? planCharge.baseAmount : Number(amount),
      currency: payload.currency || "INR",
      method: payload.currency === "USD" ? "International Card" : "UPI",
      status: "Paid",
      transactionId: razorpay_payment_id,
      paidAt: new Date(),
    });

    // Compute GST breakdown for receipt
    const baseAmount = payment.amount;
    const gstRate = planCharge?.gstRate ?? 0;
    const computedGst = planCharge?.gstAmount ?? 0;
    const totalWithGst = planCharge?.totalAmount ?? baseAmount;
    const planDurationYears = Number(membershipPlan?.durationYears) || 1;
    if (computedGst > 0 || planDurationYears > 1) {
      payment.subtotal = baseAmount;
      payment.gstRate = gstRate;
      payment.gstAmount = computedGst;
      payment.amount = totalWithGst;
      payment.durationYears = planDurationYears;
      await payment.save();
    }

    let updatedMembership = null;
    if (planId && finalBusinessId) {
      updatedMembership = await membershipService.upgradePlan(finalBusinessId, planId);
    }

    // Fire-and-forget: send notifications & emails without blocking the response
    setImmediate(async () => {
      try {
        await notificationService.createNotification({
          recipientId: user.id,
          type: "Payment",
          title: "Payment Verified",
          body: `Payment of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} ${payment.currency} (Invoice #${payment.invoiceNumber}) was verified successfully.`,
          link: "/biz/payments",
        });

        const targetEmail = payload.billingEmail || userDoc?.email;
        if (targetEmail && isMembership) {
          await emailService.sendMembershipInvoiceEmail({
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
            transactionId: payment.transactionId || razorpay_payment_id,
            paymentMethod: payment.method || "Razorpay Online Payment",
          });
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
            body: `Business "${businessDoc?.name || userDoc?.name}" (${bizChapter || "Your Chapter"}) has completed ${planId || "Membership"} payment (Invoice #${payment.invoiceNumber}) and is awaiting verification approval.`,
            entityId: businessDoc?._id,
            link: "/chapter-admin/verification",
          }).catch(() => {});

          if (ca.email) {
            emailService.sendAdminVerificationAlert({
              adminEmail: ca.email,
              businessName: businessDoc?.name || userDoc?.name,
              ownerName: userDoc?.name,
              chapter: bizChapter || "General",
              notes: `Membership payment completed for ${planId || "Membership"} tier (Invoice #${payment.invoiceNumber}). Awaiting verification approval.`,
            }).catch(() => {});
          }
        }

        // 2. Notify Central Admins
        const centralAdmins = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("_id email name");
        const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
        const adminEmails = [...new Set([adminFallbackEmail, ...centralAdmins.map((a) => a.email)].filter(Boolean))];

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
            transactionId: payment.transactionId || razorpay_payment_id,
            paymentMethod: payment.method || "Razorpay Online Payment",
            userPhone: userDoc?.phone || "",
            userEmail: targetEmail || "",
          }).catch(() => {});
        }

        for (const admin of centralAdmins) {
          notificationService.createNotification({
            recipientId: admin._id,
            type: "Payment",
            title: "New Payment Receipt for Verification",
            body: `Receipt #${payment.invoiceNumber} of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} from ${businessDoc?.name || payload.businessName || "Member"} received for verification.`,
            link: "/admin/payments",
          }).catch(() => {});
        }
      } catch (bgErr) {
        console.error("Background payment notification error:", bgErr);
      }
    });

    // Generate refreshed JWT tokens with the updated role
    const tokenPayload = {
      id: userDoc._id,
      email: userDoc.email,
      role: userDoc.role,
      chapter: userDoc.chapter,
      forcePasswordChange: userDoc.forcePasswordChange,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    await userDoc.populate("savedBusinesses");
    const userObj = userDoc.toJSON();
    if (Array.isArray(userObj.savedBusinesses)) {
      userObj.savedBusinesses = userObj.savedBusinesses.filter(Boolean);
    }

    return {
      verified: true,
      payment,
      membership: updatedMembership,
      business: businessDoc,
      user: userObj,
      accessToken,
      refreshToken,
    };
  },

  /**
   * Process / Record a payment transaction
   */
  createPayment: async (data, user) => {
    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

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

    const isMembership = data.itemType === "Membership" || Boolean(data.planId);
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
          status: "Pending Verification",
          verificationStatus: "Pending",
          verification: "pending",
          membership: formattedTier,
          rating: 5,
        });
        finalBusinessId = businessDoc._id;
      } else {
        const formattedTier = membershipPlan.name;

        businessDoc.membership = formattedTier;
        if (!businessDoc.isVerified) {
          businessDoc.status = "Pending Verification";
          businessDoc.verificationStatus = "Pending";
          businessDoc.verification = "pending";
          businessDoc.verificationReviewReason = "";
          businessDoc.verificationRemarks = "";
        }

        if (!Array.isArray(businessDoc.verificationHistory)) {
          businessDoc.verificationHistory = [];
        }
        businessDoc.verificationHistory.push({
          action: "payment",
          reason: `Membership payment completed for ${formattedTier} tier (Invoice #${invoiceNumber}). Queued for Chapter Administrator verification review.`,
          reviewer: userDoc._id,
          createdAt: new Date(),
        });
        await businessDoc.save();
      }

      if (data.planId && finalBusinessId) {
        await membershipService.upgradePlan(finalBusinessId, data.planId);
      }

      // Sync Verification document in database
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
    });

    // Keep invoice totals tied to the same editable plan record used for checkout.
    if (planCharge) {
      payment.subtotal = planCharge.baseAmount;
      payment.gstRate = planCharge.gstRate;
      payment.gstAmount = planCharge.gstAmount;
      payment.amount = planCharge.totalAmount;
      await payment.save();
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
        await emailService.sendMembershipInvoiceEmail({
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
        });
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

      // 2. Send official payment receipt to Central Admin for verification
      try {
        const centralAdmins = await User.find({ role: ROLES.CENTRAL_ADMIN }).select("_id email name");
        const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
        const adminEmails = [...new Set([adminFallbackEmail, ...centralAdmins.map((a) => a.email)].filter(Boolean))];

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

        for (const admin of centralAdmins) {
          await notificationService.createNotification({
            recipientId: admin._id,
            type: "Payment",
            title: "New Payment Receipt for Verification",
            body: `Receipt #${payment.invoiceNumber} of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} from ${businessDoc?.name || data.businessName || "Member"} received for verification.`,
            link: "/admin/payments",
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

    if (user && user.role === ROLES.CHAPTER_ADMIN && user.chapter) {
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

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("payer", "name email phone")
        .populate("business", "name slug chapter")
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
      .populate("payer", "name email phone chapter")
      .populate("business", "name slug chapter city")
      .populate("eventId", "title slug date venue");

    if (!payment) {
      throw new NotFoundError("Invoice not found");
    }

    if (user && user.role === ROLES.CHAPTER_ADMIN && user.chapter) {
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
    payment.status = status;
    await payment.save();
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
    payment.status = "Paid";
    await payment.save();

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
};
