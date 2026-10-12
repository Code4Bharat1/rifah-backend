import { Counter } from "../models/counter.model.js";
import { Payment } from "../../modules/payments/payment.model.js";
import { Business } from "../../modules/businesses/business.model.js";

/**
 * Known Chapter 3-Letter Code Directory
 */
const CHAPTER_CODE_MAP = {
  pune: "PUN",
  mumbai: "MUM",
  delhi: "DEL",
  surat: "SUR",
  nagpur: "NAG",
  gurugram: "GUR",
  gurgaon: "GUR",
  bengaluru: "BLR",
  bangalore: "BLR",
  hyderabad: "HYD",
  ahmedabad: "AHM",
  kolkata: "KOL",
  chennai: "MAA",
  jaipur: "JAI",
  lucknow: "LKO",
  kanpur: "KNP",
  patna: "PAT",
  indore: "IND",
  bhopal: "BHO",
  thane: "THA",
  nashik: "NSK",
  aurangabad: "AUR",
  sambhajinagar: "AUR",
  solapur: "SOL",
  kolhapur: "KLH",
  "navi mumbai": "NVM",
  nanded: "NAN",
  amravati: "AMR",
  jalgaon: "JAL",
  akola: "AKL",
  latur: "LAT",
  dhule: "DHU",
  ahmednagar: "AHG",
  raigad: "RAI",
  satara: "SAT",
  sangli: "SGL",
  ratnagiri: "RAT",
  sindhudurg: "SIN",
  bhiwandi: "BHI",
  malegaon: "MAL",
  panvel: "PAN",
  kalyan: "KYN",
  central: "CEN",
  national: "CEN",
  unassigned: "CEN",
};

/**
 * Calculates Indian Financial Year (1st April - 31st March)
 * Example:
 * 1st April 2025 – 31st March 2026 => "25-26"
 * 1st April 2026 – 31st March 2027 => "26-27"
 */
export function getFinancialYear(date = new Date()) {
  const d = new Date(date || Date.now());
  const month = d.getMonth(); // 0 = Jan, 2 = Mar, 3 = Apr, ..., 11 = Dec
  const year = d.getFullYear();

  // If month is April (3) or later, FY starts this year. If Jan-Mar (0-2), FY started last year.
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  const startYearStr = String(startYear).slice(-2);
  const endYearStr = String(endYear).slice(-2);

  return `${startYearStr}-${endYearStr}`;
}

/**
 * Normalizes a chapter string into a key for counter grouping
 */
export function getChapterKey(chapter = "") {
  if (!chapter || typeof chapter !== "string") return "central";
  const clean = chapter
    .toLowerCase()
    .replace(/\b(chapter|chamber|branch|zone)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return clean || "central";
}

/**
 * Resolves 3-letter uppercase Chapter Code (e.g. Pune -> PUN, Mumbai -> MUM)
 */
export function getChapterCode(chapter = "") {
  if (!chapter || typeof chapter !== "string") return "CEN";

  const key = getChapterKey(chapter);
  if (CHAPTER_CODE_MAP[key]) {
    return CHAPTER_CODE_MAP[key];
  }

  // Check partial matches from map keys
  for (const [mapKey, code] of Object.entries(CHAPTER_CODE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return code;
    }
  }

  // Fallback: extract alphabets and make 3 letters
  const alphaOnly = chapter.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (alphaOnly.length >= 3) {
    return alphaOnly.slice(0, 3);
  }
  return (alphaOnly + "CEN").slice(0, 3);
}

/**
 * Generates the next sequential invoice number in format:
 * RCCI/25-26/0001
 * Where:
 * - RCCI: RIFAH Chambers of Commerce & Industry
 * - 25-26: Financial year (dynamically calculated)
 * - 0001: Sequential 4-digit zero-padded number
 */
export async function getNextInvoiceNumber({ chapter = "", date = new Date() } = {}) {
  const fy = getFinancialYear(date);
  const counterKey = "invoice_seq";

  let invoiceNumber = "";
  let isUnique = false;

  while (!isUnique) {
    const counterDoc = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const seqNumber = String(counterDoc.seq).padStart(4, "0");
    invoiceNumber = `RCCI/${fy}/${seqNumber}`;

    // Verify uniqueness against existing database records
    const existing = await Payment.findOne({ invoiceNumber });
    if (!existing) {
      isUnique = true;
    }
  }

  return invoiceNumber;
}

/**
 * Generates the next sequential Membership ID in format:
 * RIFAH-{CHAPTER_CODE}-0001 (e.g. RIFAH-PUN-0001, RIFAH-MUM-0001)
 * Scoped per chapter. First business in chapter gets 0001, next 0002, etc.
 */
export async function getNextMembershipId({ chapter = "" } = {}) {
  const chapterCode = getChapterCode(chapter);
  const chapterKey = getChapterKey(chapter);
  const counterKey = `membership_seq_${chapterKey}`;

  let membershipId = "";
  let isUnique = false;

  while (!isUnique) {
    const counterDoc = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const seqNumber = String(counterDoc.seq).padStart(4, "0");
    membershipId = `RIFAH-${chapterCode}-${seqNumber}`;

    // Verify uniqueness against existing business documents
    const existing = await Business.findOne({ membershipId });
    if (!existing) {
      isUnique = true;
    }
  }

  return membershipId;
}
