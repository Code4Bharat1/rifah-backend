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
 * 2-Letter Indian State & UT Codes Directory (ISO 3166-2:IN / GST standard)
 */
export const STATE_CODE_MAP = {
  maharashtra: "MH",
  delhi: "DL",
  "new delhi": "DL",
  karnataka: "KA",
  telangana: "TS",
  "tamil nadu": "TN",
  tamilnadu: "TN",
  gujarat: "GJ",
  "uttar pradesh": "UP",
  uttarpradesh: "UP",
  "west bengal": "WB",
  westbengal: "WB",
  kerala: "KL",
  "andhra pradesh": "AP",
  andhrapradesh: "AP",
  rajasthan: "RJ",
  "madhya pradesh": "MP",
  madhyapradesh: "MP",
  bihar: "BR",
  punjab: "PB",
  haryana: "HR",
  goa: "GA",
  odisha: "OD",
  orissa: "OD",
  assam: "AS",
  jharkhand: "JH",
  chhattisgarh: "CG",
  chattisgarh: "CG",
  uttarakhand: "UK",
  uttaranchal: "UK",
  "himachal pradesh": "HP",
  himachalpradesh: "HP",
  "jammu and kashmir": "JK",
  "jammu & kashmir": "JK",
  chandigarh: "CH",
  puducherry: "PY",
  pondicherry: "PY",
  sikkim: "SK",
  tripura: "TR",
  meghalaya: "ML",
  manipur: "MN",
  nagaland: "NL",
  mizoram: "MZ",
  "arunachal pradesh": "AR",
  ladakh: "LA",
  
  // Chapter / City names mapped directly to State short code
  mumbai: "MH",
  pune: "MH",
  nagpur: "MH",
  thane: "MH",
  nashik: "MH",
  aurangabad: "MH",
  sambhajinagar: "MH",
  solapur: "MH",
  kolhapur: "MH",
  "navi mumbai": "MH",
  nanded: "MH",
  amravati: "MH",
  jalgaon: "MH",
  akola: "MH",
  latur: "MH",
  dhule: "MH",
  ahmednagar: "MH",
  raigad: "MH",
  satara: "MH",
  sangli: "MH",
  ratnagiri: "MH",
  sindhudurg: "MH",
  bhiwandi: "MH",
  malegaon: "MH",
  panvel: "MH",
  kalyan: "MH",
  
  surat: "GJ",
  ahmedabad: "GJ",
  vadodara: "GJ",
  rajkot: "GJ",
  
  bengaluru: "KA",
  bangalore: "KA",
  mysuru: "KA",
  mysore: "KA",
  mangalore: "KA",
  mangaluru: "KA",
  
  hyderabad: "TS",
  secunderabad: "TS",
  warangal: "TS",
  
  chennai: "TN",
  coimbatore: "TN",
  madurai: "TN",
  
  lucknow: "UP",
  kanpur: "UP",
  noida: "UP",
  ghaziabad: "UP",
  agra: "UP",
  varanasi: "UP",
  
  kolkata: "WB",
  howrah: "WB",
  
  jaipur: "RJ",
  jodhpur: "RJ",
  kota: "RJ",
  udaipur: "RJ",
  
  indore: "MP",
  bhopal: "MP",
  gwalior: "MP",
  
  patna: "BR",
  gaya: "BR",
  
  gurugram: "HR",
  gurgaon: "HR",
  faridabad: "HR",
  
  kochi: "KL",
  calicut: "KL",
  trivandrum: "KL",
  thiruvananthapuram: "KL",
  
  visakhapatnam: "AP",
  vijayawada: "AP",
  
  guwahati: "AS",
  ranchi: "JH",
  raipur: "CG",
  dehradun: "UK",
  shimla: "HP",
  srinagar: "JK",
  jammu: "JK",
  bhubaneswar: "OD",
};

/**
 * Resolves 2-letter uppercase State short code (e.g. Maharashtra -> MH, Delhi -> DL)
 */
export function getStateCode(state = "", chapter = "", city = "") {
  const normalize = (val) =>
    (val || "")
      .toString()
      .toLowerCase()
      .replace(/\b(state|chapter|chamber|branch|zone|city)\b/gi, "")
      .trim();

  // If already a valid 2-letter uppercase state code
  if (state && typeof state === "string") {
    const trimmed = state.trim().toUpperCase();
    if (trimmed.length === 2 && /^[A-Z]{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const cleanState = normalize(state);
  if (cleanState && STATE_CODE_MAP[cleanState]) {
    return STATE_CODE_MAP[cleanState];
  }

  // Check state partial matches
  for (const [mapKey, code] of Object.entries(STATE_CODE_MAP)) {
    if (cleanState && (cleanState.includes(mapKey) || mapKey.includes(cleanState))) {
      return code;
    }
  }

  // Try chapter
  const cleanChapter = normalize(chapter);
  if (cleanChapter && STATE_CODE_MAP[cleanChapter]) {
    return STATE_CODE_MAP[cleanChapter];
  }
  for (const [mapKey, code] of Object.entries(STATE_CODE_MAP)) {
    if (cleanChapter && (cleanChapter.includes(mapKey) || mapKey.includes(cleanChapter))) {
      return code;
    }
  }

  // Try city
  const cleanCity = normalize(city);
  if (cleanCity && STATE_CODE_MAP[cleanCity]) {
    return STATE_CODE_MAP[cleanCity];
  }

  // Default to Maharashtra ("MH") as headquarters of RIFAH
  return "MH";
}

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
 * RCCI/{STATE_CODE}/0001 (e.g. RCCI/MH/0001, RCCI/DL/0001)
 * Scoped per State. First business in state gets 0001, next 0002, etc.
 * Where:
 * - RCCI: RIFAH Chambers of Commerce & Industry
 * - {STATE_CODE}: 2-letter state short code (e.g. MH, DL, KA)
 * - 0001: Sequential 4-digit zero-padded ID
 */
export async function getNextMembershipId({ state = "", chapter = "", city = "" } = {}) {
  const stateCode = getStateCode(state, chapter, city);
  const counterKey = `membership_seq_${stateCode.toLowerCase()}`;

  let membershipId = "";
  let isUnique = false;

  while (!isUnique) {
    const counterDoc = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const seqNumber = String(counterDoc.seq).padStart(4, "0");
    membershipId = `RCCI/${stateCode}/${seqNumber}`;

    // Verify uniqueness against existing business documents
    const existing = await Business.findOne({ membershipId });
    if (!existing) {
      isUnique = true;
    }
  }

  return membershipId;
}

