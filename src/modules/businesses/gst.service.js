import { env } from "../../config/env.js";

const GST_STATE_CODES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "36": "Telangana",
  "37": "Andhra Pradesh",
};

const CONSTITUTION_CODES = {
  C: "Private Limited Company",
  P: "Proprietorship",
  H: "HUF (Hindu Undivided Family)",
  F: "Partnership Firm",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
};

/**
 * Call Live Appyflow Technologies GST Verification API
 * Spec: https://appyflow.in/api/verifyGST
 * Params: key_secret, gstNo
 */
async function fetchFromAppyflow(cleanGst, apiKey) {
  if (!apiKey) {
    throw new Error("GST API Key is not configured in backend environment.");
  }

  const response = await fetch("https://appyflow.in/api/verifyGST", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key_secret: apiKey,
      gstNo: cleanGst,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error("GST verification service returned an error. Please try again.");
  }

  if (data.error) {
    throw new Error(data.message || "Invalid or unregistered GST number.");
  }

  if (!data.taxpayerInfo) {
    throw new Error("No taxpayer information found for this GST number.");
  }

  const info = data.taxpayerInfo;
  const pradr = info.pradr?.addr || {};
  const fullAddress = [
    pradr.bno,
    pradr.bnm,
    pradr.st,
    pradr.loc,
    pradr.flno,
  ]
    .filter(Boolean)
    .join(", ");

  const stateCode = cleanGst.substring(0, 2);
  const stateName = pradr.stcd || GST_STATE_CODES[stateCode] || "";
  const constitutionChar = cleanGst.charAt(5);
  const businessType = info.ctb || CONSTITUTION_CODES[constitutionChar] || "";
  const resolvedName = info.tradeNam || info.lgnm || "";
  const foundedYear = info.rgdt ? info.rgdt.split("/").pop() : "";
  const city = pradr.dst || pradr.city || "";

  return {
    gstin: cleanGst,
    isValid: true,
    valid: true,
    businessName: resolvedName,
    tradeName: info.tradeNam || resolvedName,
    legalName: info.lgnm || resolvedName,
    businessType,
    founded: foundedYear,
    address: fullAddress,
    city,
    state: stateName,
    pincode: pradr.pncd || "",
    industry: info.pradr?.ntr || (Array.isArray(info.nba) ? info.nba[0] : ""),
    status: info.sts || "Active",
    taxpayerType: info.dty || "Regular",
    chapter: stateName ? `${stateName} Chapter` : "",
    source: "appyflow_live_api",
  };
}

export const gstService = {
  /**
   * Verify GSTIN and return original live corporate details from GST registry
   */
  async verifyGst(gstin) {
    if (!gstin || typeof gstin !== "string") {
      return {
        isValid: false,
        valid: false,
        message: "GSTIN is required and must be a string",
      };
    }

    const cleanGst = gstin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

    // GSTIN format: 2 digits state code + 10 chars PAN + 1 entity num + 1 'Z' + 1 check digit
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(cleanGst)) {
      return {
        isValid: false,
        valid: false,
        message: "Invalid GSTIN format. Must be 15 alphanumeric characters matching Indian GST format.",
      };
    }

    const apiKey = env.GST?.API_KEY || process.env.GST_API_KEY || "f0w9NwoJB6cq8Gx0cMN67zOX5fn2";

    try {
      const liveData = await fetchFromAppyflow(cleanGst, apiKey);
      return liveData;
    } catch (err) {
      return {
        isValid: false,
        valid: false,
        message: err.message || "Failed to fetch live GST details.",
      };
    }
  },

  async fetchDetails(gstin) {
    return this.verifyGst(gstin);
  },
};
