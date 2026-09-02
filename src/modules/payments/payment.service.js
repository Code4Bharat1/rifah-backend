import crypto from "crypto";
import { Payment } from "./payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { env } from "../../config/env.js";
import { membershipService } from "../memberships/membership.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";

export const paymentService = {
  /**
   * Create Razorpay Order
   */
  createRazorpayOrder: async ({ amount, planId }, user) => {
    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    const numericAmount = Number(amount) || 4999;
    const amountInPaise = Math.round(numericAmount * 100);
    const authString = Buffer.from(`${env.RAZORPAY.KEY_ID}:${env.RAZORPAY.KEY_SECRET}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: invoiceNumber,
        notes: {
          payerId: user.id,
          planId: planId || "basic",
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
      keyId: env.RAZORPAY.KEY_ID,
      invoiceNumber,
    };
  },

  /**
   * Verify Razorpay Payment Signature and Upgrade Plan
   */
  verifyRazorpayPayment: async (payload, user) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, businessId, amount, itemType, description } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new BadRequestError("Missing required Razorpay payment fields");
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY.KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new BadRequestError("Invalid payment signature");
    }

    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    const payment = await Payment.create({
      invoiceNumber,
      payer: user.id,
      business: businessId || null,
      itemType: itemType || "Membership",
      description: description || `Payment for ${planId || "Membership"} tier`,
      amount: Number(amount) || 4999,
      currency: "INR",
      method: "UPI",
      status: "Paid",
      transactionId: razorpay_payment_id,
      paidAt: new Date(),
    });

    let updatedMembership = null;
    if (planId && businessId) {
      updatedMembership = await membershipService.upgradePlan(businessId, planId);
    }

    try {
      await notificationService.createNotification({
        recipientId: user.id,
        type: "Payment",
        title: "Payment Verified",
        body: `Payment of ₹${payment.amount} (Invoice #${payment.invoiceNumber}) was verified successfully.`,
        link: "/biz/payments",
      });

      const userDoc = await User.findById(user.id);
      const businessDoc = businessId ? await Business.findById(businessId) : null;
      const targetEmail = payload.billingEmail || userDoc?.email;
      if (targetEmail) {
        await emailService.sendMembershipInvoiceEmail({
          email: targetEmail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || payload.businessName || "Member Business",
          planName: (planId || "Membership").toUpperCase(),
          amount: payment.amount,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId || razorpay_payment_id,
          paymentMethod: "Razorpay Online Payment",
        });
      }
    } catch (err) {
      console.error("Payment notification / email error:", err);
    }

    return {
      verified: true,
      payment,
      membership: updatedMembership,
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

    const payment = await Payment.create({
      ...data,
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

      const userDoc = await User.findById(user.id);
      const businessDoc = data.business ? await Business.findById(data.business) : null;
      const targetEmail = data.billingEmail || userDoc?.email;
      if (targetEmail) {
        await emailService.sendMembershipInvoiceEmail({
          email: targetEmail,
          name: userDoc?.name || "Member",
          businessName: businessDoc?.name || data.businessName || "Member Business",
          planName: (data.itemType || "Membership").toUpperCase(),
          amount: payment.amount,
          invoiceNumber: payment.invoiceNumber,
          paidAt: payment.paidAt,
          transactionId: payment.transactionId,
          paymentMethod: data.method || "Online Transfer",
        });
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
};
