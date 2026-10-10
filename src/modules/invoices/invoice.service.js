import { Payment } from "../payments/payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import crypto from "crypto";
import { generateInvoicePdfBuffer } from "../../shared/utils/pdf-generator.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { revenueShareService } from "../revenue-sharing/revenueShare.service.js";
import { logger } from "../../infrastructure/logger/logger.js";

export const invoiceService = {
  /**
   * Public Secure Verification for an Official RIFAH Payment Invoice
   * Never exposes internal database IDs, passwords, API keys or sensitive billing info.
   */
  verifyInvoice: async (invoiceNumber, token = null) => {
    if (!invoiceNumber || typeof invoiceNumber !== "string") {
      return {
        verified: false,
        error: "INVALID_REQUEST",
        message: "Invoice number is required.",
      };
    }

    const cleanInvoiceNumber = invoiceNumber.trim();
    const payment = await Payment.findOne({
      invoiceNumber: { $regex: new RegExp(`^${cleanInvoiceNumber}$`, "i") },
    })
      .populate("payer", "name email phone chapter state membershipId subscriberTier businessName")
      .populate("business", "name slug chapter state city membershipId email contactPerson");

    if (!payment) {
      return {
        verified: false,
        error: "INVOICE_NOT_FOUND",
        message: "We could not find a valid RIFAH invoice matching this verification request.",
      };
    }

    // Ensure legacy payment has a verificationToken
    if (!payment.verificationToken) {
      payment.verificationToken = crypto.randomBytes(24).toString("hex");
      await payment.save();
    }

    // Check Revocation Status
    if (payment.isRevoked) {
      return {
        verified: false,
        isRevoked: true,
        status: "REVOKED",
        invoiceNumber: payment.invoiceNumber,
        revokedAt: payment.revokedAt,
        revokedReason: payment.revokedReason || "Revoked by Chamber Administration",
        message: "This invoice is no longer considered a valid RIFAH payment document.",
      };
    }

    // Validate verification token if passed
    if (token && token.trim()) {
      if (payment.verificationToken !== token.trim()) {
        return {
          verified: false,
          error: "INVALID_TOKEN",
          message: "The verification token is invalid or does not match this invoice record.",
        };
      }
    }

    // Verify payment completion
    const isPaid =
      payment.status === "Paid" ||
      payment.status === "PAID" ||
      payment.status === "completed" ||
      payment.status === "Completed";

    if (!isPaid) {
      return {
        verified: false,
        error: "PAYMENT_NOT_COMPLETED",
        invoiceNumber: payment.invoiceNumber,
        paymentStatus: payment.status || "Pending",
        message: "Payment for this invoice has not been recorded as completed.",
      };
    }

    // Determine Customer Name & Membership ID safely
    const customerName =
      payment.business?.name ||
      payment.payer?.businessName ||
      payment.business?.contactPerson ||
      payment.payer?.name ||
      "RIFAH Member";

    const membershipId =
      payment.business?.membershipId ||
      payment.payer?.membershipId ||
      `RIFAH-MBR-${String(payment.payer?._id || payment._id).slice(-4).toUpperCase()}`;

    // Calculate Validity Window
    const paymentDateObj = new Date(payment.paidAt || payment.createdAt || Date.now());
    const validUntilObj = new Date(paymentDateObj);
    const duration = payment.durationYears || 1;
    validUntilObj.setFullYear(validUntilObj.getFullYear() + duration);

    const formattedPaymentDate = paymentDateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const formattedValidUntil = validUntilObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const membershipPlan =
      payment.planTier ||
      payment.payer?.subscriberTier ||
      payment.description ||
      (payment.itemType ? `${payment.itemType} Subscription` : "Annual Membership");

    return {
      verified: true,
      invoiceNumber: payment.invoiceNumber,
      membershipId,
      customerName,
      membershipPlan,
      amountPaid: payment.amount,
      subtotal: payment.subtotal || Math.round(payment.amount / 1.18),
      gstRate: payment.gstRate || 18,
      gstAmount: payment.gstAmount || Math.round(payment.amount - (payment.subtotal || Math.round(payment.amount / 1.18))),
      currency: payment.currency || "INR",
      paymentStatus: "PAID",
      paymentMethod: payment.method || "Razorpay (UPI)",
      paymentDate: formattedPaymentDate,
      validFrom: formattedPaymentDate,
      validUntil: formattedValidUntil,
      status: "ACTIVE",
      isRevoked: false,
      issuedBy: "RIFAH Chamber of Commerce & Industry",
      chapter: payment.chapter || payment.business?.chapter || payment.payer?.chapter || "Chamber Main Desk",
      transactionId: payment.transactionId ? `${payment.transactionId.slice(0, 10)}...` : undefined,
    };
  },

  /**
   * Secure PDF Buffer Retrieval for Verified Invoices
   */
  getInvoicePdf: async (invoiceNumber, token = null) => {
    const cleanInvoiceNumber = invoiceNumber.trim();
    const payment = await Payment.findOne({
      invoiceNumber: { $regex: new RegExp(`^${cleanInvoiceNumber}$`, "i") },
    })
      .populate("payer", "name email phone chapter state membershipId subscriberTier businessName")
      .populate("business", "name slug chapter state city membershipId email contactPerson");

    if (!payment) {
      throw new NotFoundError("Invoice record not found");
    }

    if (token && payment.verificationToken && token.trim() !== payment.verificationToken) {
      throw new BadRequestError("Invalid verification token for this invoice document.");
    }

    if (payment.isRevoked) {
      throw new BadRequestError("This invoice has been revoked and cannot be exported.");
    }

    const pdfBuffer = generateInvoicePdfBuffer({
      invoiceNumber: payment.invoiceNumber,
      paidAt: payment.paidAt || payment.createdAt,
      name: payment.payer?.name || "Member User",
      businessName: payment.business?.name || payment.payer?.businessName || "Member Business",
      planName: payment.planTier || payment.description || "Membership Subscription",
      amount: payment.amount,
      currency: payment.currency || "INR",
      transactionId: payment.transactionId,
      paymentMethod: payment.method || "Online Razorpay",
    });

    return {
      buffer: pdfBuffer,
      filename: `RIFAH_Invoice_${payment.invoiceNumber}.pdf`,
    };
  },

  /**
   * Admin Revocation of an Invoice
   */
  revokeInvoice: async (invoiceNumber, reason, revokedByUserId) => {
    const payment = await Payment.findOne({
      invoiceNumber: { $regex: new RegExp(`^${invoiceNumber.trim()}$`, "i") },
    });

    if (!payment) {
      throw new NotFoundError("Invoice record not found");
    }

    const wasAlreadyRevoked = payment.isRevoked;
    payment.isRevoked = true;
    payment.revokedAt = new Date();
    payment.revokedReason = reason || "Revoked by RIFAH Chamber Central Administration";
    payment.revokedBy = revokedByUserId;
    await payment.save();

    // Revenue Sharing: a revoked invoice reverses its allocations the same way a refund
    // does — non-fatal, logged, never blocks the revoke the admin is performing.
    if (!wasAlreadyRevoked) {
      try {
        await revenueShareService.reverseLedgerEntriesForPayment(
          payment,
          payment.revokedReason,
          { id: revokedByUserId }
        );
      } catch (revShareErr) {
        logger.error(`[REVENUE SHARE] Failed to reverse ledger entries for payment ${payment._id}:`, revShareErr);
      }
    }

    return {
      success: true,
      invoiceNumber: payment.invoiceNumber,
      isRevoked: true,
      revokedAt: payment.revokedAt,
      revokedReason: payment.revokedReason,
    };
  },
};

export default invoiceService;
