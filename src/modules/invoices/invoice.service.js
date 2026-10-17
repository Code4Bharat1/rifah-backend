import { Payment } from "../payments/payment.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import crypto from "crypto";
import { generateInvoicePdfBuffer } from "../../shared/utils/pdf-generator.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { revenueShareService } from "../revenue-sharing/revenueShare.service.js";
import { logger } from "../../infrastructure/logger/logger.js";
import { getChapterCode, getStateCode } from "../../shared/utils/sequence-generator.js";

function normalizeInvoiceNumber(input) {
  if (!input || typeof input !== "string") return "";
  let clean = input.trim();
  try {
    clean = decodeURIComponent(clean).trim();
  } catch (_) {}

  // Strip URL prefix if full URL was passed
  if (clean.includes("/verify/invoice/")) {
    const parts = clean.split("/verify/invoice/");
    if (parts.length > 1) {
      clean = parts[1].trim();
    }
  }

  // Strip query string if any (?token=...)
  if (clean.includes("?")) {
    clean = clean.split("?")[0].trim();
  }

  // Strip leading hash if present (#RCCI/...)
  clean = clean.replace(/^#+/, "").trim();
  // Strip leading/trailing slashes
  clean = clean.replace(/^\/+|\/+$/g, "").trim();
  return clean;
}

export const invoiceService = {
  /**
   * Public Secure Verification for an Official RIFAH Payment Invoice
   * Never exposes internal database IDs, passwords, API keys or sensitive billing info.
   */
  verifyInvoice: async (invoiceNumber, token = null) => {
    const cleanInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
    if (!cleanInvoiceNumber) {
      return {
        verified: false,
        error: "INVALID_REQUEST",
        message: "Invoice number is required.",
      };
    }

    const escaped = cleanInvoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const payment = await Payment.findOne({
      $or: [
        { invoiceNumber: cleanInvoiceNumber },
        { invoiceNumber: `#${cleanInvoiceNumber}` },
        { invoiceNumber: { $regex: new RegExp(`^#?${escaped}$`, "i") } },
      ],
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
    let isNewlyGeneratedToken = false;
    if (!payment.verificationToken) {
      payment.verificationToken = crypto.randomBytes(24).toString("hex");
      isNewlyGeneratedToken = true;
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

    // Require valid verification token to inspect invoice and prevent unauthenticated ID enumeration
    if (!isNewlyGeneratedToken && payment.verificationToken) {
      if (!token || payment.verificationToken.trim() !== token.trim()) {
        return {
          verified: false,
          error: "INVALID_TOKEN",
          message: "A valid verification token is required to inspect this invoice record.",
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

    const chapterName = payment.chapter || payment.business?.chapter || payment.payer?.chapter || "Chamber";
    const stateName = payment.business?.state || payment.payer?.state || "";
    const stateCode = getStateCode(stateName, chapterName);
    const rawMem = payment.business?.membershipId || payment.payer?.membershipId;
    const membershipId =
      rawMem && rawMem.startsWith("RCCI/")
        ? rawMem
        : `RCCI/${stateCode}/${String(payment.payer?._id || payment._id).slice(-4).toUpperCase()}`;

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
    const cleanInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
    const escaped = cleanInvoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const payment = await Payment.findOne({
      $or: [
        { invoiceNumber: cleanInvoiceNumber },
        { invoiceNumber: `#${cleanInvoiceNumber}` },
        { invoiceNumber: { $regex: new RegExp(`^#?${escaped}$`, "i") } },
      ],
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

    const safeFilenameNum = (payment.invoiceNumber || "document").replace(/[\/\\?%*:|"<>]/g, "_");
    return {
      buffer: pdfBuffer,
      filename: `RIFAH_Invoice_${safeFilenameNum}.pdf`,
    };
  },

  /**
   * Admin Revocation of an Invoice
   */
  revokeInvoice: async (invoiceNumber, reason, revokedByUserId) => {
    const cleanInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
    const escaped = cleanInvoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const payment = await Payment.findOne({
      $or: [
        { invoiceNumber: cleanInvoiceNumber },
        { invoiceNumber: `#${cleanInvoiceNumber}` },
        { invoiceNumber: { $regex: new RegExp(`^#?${escaped}$`, "i") } },
      ],
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
