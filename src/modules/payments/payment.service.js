import crypto from "crypto";
import { Payment } from "./payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { env } from "../../config/env.js";
import { membershipService } from "../memberships/membership.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId, generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { signAccessToken, signRefreshToken } from "../../infrastructure/auth/jwt.js";

export const paymentService = {
  /**
   * Create Razorpay Order
   */
  createRazorpayOrder: async ({ amount, planId, currency = "INR" }, user) => {
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

    const numericAmount = Number(amount) || (isInternational ? 59 : 4999);
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
          planId: planId || "basic",
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

    if (expectedSignature !== razorpay_signature) {
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

    // If upgrading or purchasing a membership
    if (isMembership) {
      // 1. Upgrade user role in database permanently to business_owner
      if (userDoc.role === ROLES.CUSTOMER) {
        userDoc.role = ROLES.BUSINESS_OWNER;
      }
      if (payload.city && !userDoc.city) {
        userDoc.city = payload.city.trim();
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

        const validTiers = ["Free", "Basic", "Premium", "Enterprise"];
        const formattedTier =
          validTiers.find((t) => t.toLowerCase() === (planId || "basic").toLowerCase()) || "Basic";

        businessDoc = await Business.create({
          name: rawBizName,
          slug,
          owner: userDoc._id,
          taxId: (payload.taxId && payload.taxId.trim()) || "",
          address: (payload.billingAddress && payload.billingAddress.trim()) || "",
          city: (payload.city && payload.city.trim()) || userDoc.city || "Mumbai",
          pincode: (payload.postalCode && payload.postalCode.trim()) || "",
          phone: userDoc.phone || "",
          email: payload.billingEmail || userDoc.email || "",
          chapter: userDoc.chapter || "Mumbai Chapter",
          industry: "General Commerce",
          status: "Pending Verification",
          verificationStatus: "Pending",
          verification: "unverified",
          membership: formattedTier,
          rating: 5,
        });
        finalBusinessId = businessDoc._id;
      }
    }

    const payment = await Payment.create({
      invoiceNumber,
      payer: user.id,
      business: finalBusinessId || null,
      itemType: itemType || "Membership",
      description: description || `Payment for ${planId || "Membership"} tier`,
      amount: Number(amount) || (payload.currency === "USD" ? 59 : 4999),
      currency: payload.currency || "INR",
      method: payload.currency === "USD" ? "International Card" : "UPI",
      status: "Paid",
      transactionId: razorpay_payment_id,
      paidAt: new Date(),
    });

    let updatedMembership = null;
    if (planId && finalBusinessId) {
      updatedMembership = await membershipService.upgradePlan(finalBusinessId, planId);
    }

    try {
      await notificationService.createNotification({
        recipientId: user.id,
        type: "Payment",
        title: "Payment Verified",
        body: `Payment of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} ${payment.currency} (Invoice #${payment.invoiceNumber}) was verified successfully.`,
        link: "/biz/payments",
      });

      const targetEmail = payload.billingEmail || userDoc?.email;
      if (targetEmail) {
        await emailService.sendMembershipInvoiceEmail({
          email: targetEmail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || payload.businessName || "Member Business",
          planName: (planId || "Membership").toUpperCase(),
          amount: payment.amount,
          currency: payment.currency,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId || razorpay_payment_id,
          paymentMethod: payment.method || "Razorpay Online Payment",
        });
      }

      // Send official payment receipt to Secretariat Admin for verification
      try {
        const superAdmins = await User.find({ role: ROLES.SUPER_ADMIN }).select("_id email name");
        const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
        const adminEmails = [...new Set([adminFallbackEmail, ...superAdmins.map((a) => a.email)].filter(Boolean))];

        for (const adminMail of adminEmails) {
          await emailService.sendAdminPaymentReceiptAlert({
            adminEmail: adminMail,
            name: userDoc?.name || "Member",
            businessName: businessDoc?.name || payload.businessName || "Member Business",
            planName: (planId || "Membership").toUpperCase(),
            amount: payment.amount,
            currency: payment.currency,
            invoiceNumber: payment.invoiceNumber,
            paidAt: payment.paidAt,
            transactionId: payment.transactionId || razorpay_payment_id,
            paymentMethod: payment.method || "Razorpay Online Payment",
            userPhone: userDoc?.phone || "",
            userEmail: targetEmail || "",
          });
        }

        for (const admin of superAdmins) {
          await notificationService.createNotification({
            recipientId: admin._id,
            type: "Payment",
            title: "New Payment Receipt for Verification",
            body: `Receipt #${payment.invoiceNumber} of ${payment.currency === "USD" ? "$" : "₹"}${payment.amount} from ${businessDoc?.name || payload.businessName || "Member"} received for verification.`,
            link: "/admin/payments",
          });
        }
      } catch (adminErr) {
        console.error("Admin receipt notification error:", adminErr);
      }
    } catch (err) {
      console.error("Payment notification / email error:", err);
    }

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

        const validTiers = ["Free", "Basic", "Premium", "Enterprise"];
        const formattedTier =
          validTiers.find((t) => t.toLowerCase() === (data.planId || "basic").toLowerCase()) || "Basic";

        businessDoc = await Business.create({
          name: rawBizName,
          slug,
          owner: userDoc._id,
          taxId: (data.taxId && data.taxId.trim()) || "",
          address: (data.billingAddress && data.billingAddress.trim()) || "",
          city: (data.city && data.city.trim()) || userDoc.city || "Mumbai",
          state: (data.state && data.state.trim()) || userDoc.state || "Maharashtra",
          phone: userDoc.phone || "",
          email: data.billingEmail || userDoc.email || "",
          chapter: userDoc.chapter || "Mumbai Chapter",
          industry: "General Commerce",
          status: "Pending Verification",
          verificationStatus: "Pending",
          verification: "unverified",
          membership: formattedTier,
          rating: 5,
        });
        finalBusinessId = businessDoc._id;
      }

      if (data.planId && finalBusinessId) {
        await membershipService.upgradePlan(finalBusinessId, data.planId);
      }
    }

    const payment = await Payment.create({
      ...data,
      business: finalBusinessId || null,
      invoiceNumber,
      payer: user.id,
      transactionId: `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: "Paid",
      paidAt: new Date(),
    });

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

      // Send official payment receipt to Secretariat Admin for verification
      try {
        const superAdmins = await User.find({ role: ROLES.SUPER_ADMIN }).select("_id email name");
        const adminFallbackEmail = env.EMAIL?.USER || "rs9940806@gmail.com";
        const adminEmails = [...new Set([adminFallbackEmail, ...superAdmins.map((a) => a.email)].filter(Boolean))];

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

        for (const admin of superAdmins) {
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
  listAllPayments: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.itemType) filter.itemType = queryParams.itemType;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("payer", "name email phone")
        .populate("business", "name slug chapter")
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
  getInvoice: async (identifier) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { invoiceNumber: identifier };

    const payment = await Payment.findOne(query)
      .populate("payer", "name email phone")
      .populate("business", "name slug chapter city");

    if (!payment) {
      throw new NotFoundError("Invoice not found");
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
        title: "Payment Officially Verified by Secretariat",
        body: `Your payment receipt #${payment.invoiceNumber} (${payment.currency === "USD" ? "$" : "₹"}${payment.amount}) has been officially verified and approved.`,
        link: "/biz/payments",
      });
    }

    return payment;
  },
};
