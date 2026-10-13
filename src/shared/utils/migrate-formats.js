import { Business } from "../../modules/businesses/business.model.js";
import { Payment } from "../../modules/payments/payment.model.js";
import { User } from "../../modules/users/user.model.js";
import { Counter } from "../models/counter.model.js";
import { getStateCode, getFinancialYear } from "./sequence-generator.js";
import { logger } from "../../infrastructure/logger/logger.js";

/**
 * Automatically migrates existing database documents from legacy formats:
 * - Businesses: RIFAH-MEM-XXXXXX / RIFAH-{CHAPTER_CODE}-XXXX -> RCCI/{STATE_CODE}/0001, 0002...
 * - Invoices: INV-XXXX -> RCCI/{FY}/0001, 0002...
 * Also initializes atomic Counters to prevent sequence collision.
 */
export async function migrateExistingFormats() {
  try {
    logger.info("[MIGRATION] Checking businesses and payments format migration...");

    // 1. Migrate Businesses to RCCI/{STATE_CODE}/0001 format
    const businesses = await Business.find().sort({ createdAt: 1, _id: 1 });
    const stateCounters = {};

    for (const b of businesses) {
      const stateCode = getStateCode(b.state, b.chapter, b.city);

      stateCounters[stateCode] = (stateCounters[stateCode] || 0) + 1;
      const seqStr = String(stateCounters[stateCode]).padStart(4, "0");
      const targetId = `RCCI/${stateCode}/${seqStr}`;

      if (b.membershipId !== targetId) {
        await Business.updateOne(
          { _id: b._id },
          { $set: { membershipId: targetId } }
        );
        if (b.owner) {
          await User.updateOne(
            { _id: b.owner },
            { $set: { membershipId: targetId } }
          );
        }
      }
    }

    // Sync Counters for businesses in Counter collection per state
    for (const [stateCode, count] of Object.entries(stateCounters)) {
      await Counter.findOneAndUpdate(
        { key: `membership_seq_${stateCode.toLowerCase()}` },
        { $max: { seq: count } },
        { upsert: true }
      );
    }
    logger.info(`[MIGRATION] Migrated ${businesses.length} businesses to RCCI/{STATE}/0001 format across states.`);

    // 2. Migrate Payments / Invoices to RCCI/{FY}/0001 format
    const payments = await Payment.find().sort({ paidAt: 1, createdAt: 1, _id: 1 });
    let invoiceSeq = 0;

    for (const p of payments) {
      invoiceSeq += 1;
      const seqStr = String(invoiceSeq).padStart(4, "0");
      const fy = getFinancialYear(p.paidAt || p.createdAt);
      const targetInvoice = `RCCI/${fy}/${seqStr}`;

      if (p.invoiceNumber !== targetInvoice) {
        await Payment.updateOne(
          { _id: p._id },
          { $set: { invoiceNumber: targetInvoice } }
        );
      }
    }

    if (invoiceSeq > 0) {
      await Counter.findOneAndUpdate(
        { key: "invoice_seq" },
        { $max: { seq: invoiceSeq } },
        { upsert: true }
      );
    }
    logger.info(`[MIGRATION] Migrated ${payments.length} payments/invoices.`);
  } catch (err) {
    logger.error("[MIGRATION ERROR] Failed to migrate formats:", err);
  }
}
