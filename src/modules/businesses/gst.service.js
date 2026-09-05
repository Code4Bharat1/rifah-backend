import { env } from "../../config/env.js";
import fs from "fs";

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

function logDebug(message) {
  try {
    fs.appendFileSync("gst_debug.log", `\n[${new Date().toISOString()}] ${message}\n`);
  } catch (e) {}
}

function extractFoundedYear(dateStr) {
  if (!dateStr) return "";
  const match = String(dateStr).match(/\b(19\d\d|20\d\d)\b/);
  if (match) return match[1];
  if (String(dateStr).includes("-")) return String(dateStr).split("-")[0];
  if (String(dateStr).includes("/")) return String(dateStr).split("/").pop();
  return "";
}

function cleanCityName(cityName, stateCode = "") {
  if (cityName && typeof cityName === "string") {
    return cityName
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  if (stateCode === "27") return "Mumbai";
  if (stateCode === "07") return "Delhi";
  if (stateCode === "23") return "Bhopal";
  if (stateCode === "21") return "Bhubaneswar";
  if (stateCode === "24") return "Ahmedabad";
  if (stateCode === "29") return "Bangalore";
  return "";
}

function extractPincode(pincodeCandidate, addressStr = "", rawObj = null) {
  if (pincodeCandidate) {
    const pin = String(pincodeCandidate).trim().replace(/\D/g, "");
    if (pin.length === 6) return pin;
  }
  if (addressStr) {
    const match = String(addressStr).match(/\b([1-9][0-9]{5})\b/);
    if (match) return match[1];
  }
  if (rawObj) {
    const rawMatch = JSON.stringify(rawObj).match(/"(?:pincode|pncd|postal_code)":\s*"?([1-9][0-9]{5})"?/i);
    if (rawMatch) return rawMatch[1];
  }
  return "";
}

let cachedSandboxToken = null;
let sandboxTokenExpiry = 0;

/**
 * Get cached or fresh access token from Sandbox.co.in
 */
async function getSandboxAccessToken(apiKey, apiSecret) {
  const now = Date.now();
  if (cachedSandboxToken && sandboxTokenExpiry > now) {
    return cachedSandboxToken;
  }

  logDebug(`Authenticating with Sandbox.co.in (key: ${apiKey ? apiKey.substring(0, 6) + "..." : "empty"})`);

  const authResponse = await fetch("https://api.sandbox.co.in/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-api-secret": apiSecret,
      "x-api-version": "1.0",
    },
  });

  const authData = await authResponse.json().catch(() => null);

  if (!authResponse.ok || !authData) {
    logDebug(`Sandbox Auth Failed (Status ${authResponse.status}): ${JSON.stringify(authData)}`);
    throw new Error(authData?.message || "Failed to authenticate with Sandbox.co.in. Check your API Key and Secret.");
  }

  const token = authData.data?.access_token || authData.access_token;
  if (!token) {
    logDebug(`Sandbox Auth returned no token: ${JSON.stringify(authData)}`);
    throw new Error("Sandbox.co.in did not return an access token.");
  }

  cachedSandboxToken = token;
  // Cache for 23 hours (tokens expire in 24h)
  sandboxTokenExpiry = now + 23 * 60 * 60 * 1000;
  logDebug("Sandbox authentication successful! Token cached.");
  return token;
}

/**
 * Fetch live GST data from Sandbox.co.in Government GSTIN endpoint
 */
async function fetchFromSandbox(cleanGst, apiKey, apiSecret) {
  if (!apiKey || !apiSecret) return null;

  const token = await getSandboxAccessToken(apiKey, apiSecret);

  logDebug(`Querying Sandbox GST endpoint for: ${cleanGst}`);

  const endpoints = [
    {
      url: "https://api.sandbox.co.in/gst/compliance/public/gstin/search",
      method: "POST",
      body: JSON.stringify({ gstin: cleanGst }),
    },
    {
      url: "https://api.sandbox.co.in/gst/compliance/public/gstin/verify",
      method: "POST",
      body: JSON.stringify({ gstin: cleanGst }),
    },
    {
      url: `https://api.sandbox.co.in/gsp/public/gstin?gstin=${cleanGst}`,
      method: "GET",
    },
    {
      url: "https://api.sandbox.co.in/kyc/gstin/verify",
      method: "POST",
      body: JSON.stringify({ gstin: cleanGst }),
    },
  ];

  let data = null;
  let lastStatus = 0;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          Authorization: token,
          "x-api-key": apiKey,
          "x-api-version": "1.0.0",
          ...(ep.body ? { "Content-Type": "application/json" } : {}),
        },
        body: ep.body,
      });
      lastStatus = res.status;
      const resJson = await res.json().catch(() => null);
      logDebug(`Sandbox ${ep.method} ${ep.url} -> Status ${res.status}: ${JSON.stringify(resJson)?.substring(0, 300)}`);
      if (res.ok && resJson && (resJson.data || resJson.trade_name || resJson.legal_name || resJson.lgnm)) {
        data = resJson;
        break;
      }
    } catch (err) {
      logDebug(`Sandbox endpoint error on ${ep.url}: ${err.message}`);
    }
  }

  if (!data) {
    throw new Error(`Sandbox GST verification did not find records (Status ${lastStatus})`);
  }

  const record = data.data || data;

  // Handle both snake_case (Sandbox) and short GSTN property names
  const resolvedName =
    record.trade_name ||
    record.tradeNam ||
    record.legal_name ||
    record.lgnm ||
    record.business_name ||
    "";

  const legalName = record.legal_name || record.lgnm || resolvedName;
  const tradeName = record.trade_name || record.tradeNam || resolvedName;

  // Address parsing
  const pradr = record.principal_place_of_business || record.pradr || {};
  let fullAddress = "";
  let city = "";
  let state = "";
  let pincode = "";

  if (typeof pradr === "string") {
    fullAddress = pradr;
  } else if (pradr.addr) {
    const addr = pradr.addr;
    fullAddress = [addr.bno, addr.bnm, addr.st, addr.loc, addr.flno].filter(Boolean).join(", ");
    city = addr.dst || addr.city || "";
    state = addr.stcd || "";
    pincode = addr.pncd || "";
  } else {
    fullAddress = [
      pradr.building_number || pradr.bno,
      pradr.building_name || pradr.bnm,
      pradr.street || pradr.st,
      pradr.locality || pradr.loc,
    ]
      .filter(Boolean)
      .join(", ");
    city = pradr.city || pradr.dst || pradr.district || "";
    state = pradr.state || pradr.stcd || "";
    pincode = pradr.pincode || pradr.pncd || "";
  }

  const stateCode = cleanGst.substring(0, 2);
  const stateName = state || GST_STATE_CODES[stateCode] || "";
  const constitutionChar = cleanGst.charAt(5);
  const businessType =
    record.constitution_of_business ||
    record.ctb ||
    CONSTITUTION_CODES[constitutionChar] ||
    "";

  const foundedYear = extractFoundedYear(record.date_of_registration || record.rgdt);
  const cleanCity = cleanCityName(city, stateCode);
  const cleanPin = extractPincode(pincode, fullAddress, data);

  const status = record.status || record.sts || "Active";
  const contactPerson =
    record.authorized_signatory ||
    record.contact_person ||
    (Array.isArray(record.promoters) && record.promoters[0]?.name) ||
    (Array.isArray(record.mbr) && record.mbr[0]?.name) ||
    (constitutionChar === "P" && legalName !== tradeName ? legalName : "");

  return {
    gstin: cleanGst,
    isValid: true,
    valid: true,
    businessName: resolvedName,
    tradeName,
    legalName,
    businessType,
    founded: foundedYear,
    address: fullAddress,
    city: cleanCity,
    state: stateName,
    pincode: cleanPin,
    status,
    contactPerson: contactPerson || "",
    phone: record.mobile || record.phone || pradr.mob || "",
    email: record.email || pradr.email || "",
    taxpayerType: record.taxpayer_type || record.dty || "Regular",
    chapter: stateName ? `${stateName} Chapter` : "",
    source: "sandbox_live_api",
  };
}

/**
 * Primary: Call GSTIN Portal (gstinapi.in)
 * GET https://www.gstinapi.in/v1/gstin/{gstin}
 * Header: x-api-key: YOUR_KEY_HERE
 */
async function fetchFromGstinApi(cleanGst, apiKey) {
  if (!apiKey) return null;

  logDebug(`[GSTIN Portal] Querying https://www.gstinapi.in/v1/gstin/${cleanGst} with key ${apiKey.substring(0, 8)}...`);

  const response = await fetch(`https://www.gstinapi.in/v1/gstin/${cleanGst}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  const rawData = await response.json().catch(() => null);
  logDebug(`[GSTIN Portal] Response (Status ${response.status}): ${JSON.stringify(rawData)?.substring(0, 500)}`);

  if (!response.ok || !rawData) {
    throw new Error(rawData?.message || rawData?.error || `GSTIN Portal returned status ${response.status}`);
  }

  // Handle nested wrappers ({ data: ... }, { result: ... }, { taxpayerInfo: ... }) or flat payload
  const record = rawData.data || rawData.result || rawData.taxpayerInfo || rawData.taxpayer || rawData;

  const resolvedName =
    record.trade_name ||
    record.tradeName ||
    record.tradeNam ||
    record.business_name ||
    record.businessName ||
    record.legal_name ||
    record.legalName ||
    record.lgnm ||
    "";

  const legalName = record.legal_name || record.legalName || record.lgnm || resolvedName;
  const tradeName = record.trade_name || record.tradeName || record.tradeNam || resolvedName;

  // Address & Location parsing
  const addrDetails = record.address_details || {};
  const pradr = record.principal_place_of_business || record.principal_address || record.pradr || {};

  let fullAddress = typeof record.address === "string" ? record.address : "";
  let cityCandidate = record.city || addrDetails.city || addrDetails.district || addrDetails.dst || "";
  let stateCandidate = addrDetails.state || addrDetails.stcd || "";
  let pincodeCandidate = addrDetails.pincode || addrDetails.pncd || record.pincode || "";

  if (typeof pradr === "string") {
    if (!fullAddress) fullAddress = pradr;
  } else if (pradr && pradr.addr) {
    const addr = pradr.addr;
    if (!fullAddress) {
      fullAddress = [addr.bno, addr.bnm, addr.st, addr.loc, addr.flno].filter(Boolean).join(", ");
    }
    cityCandidate = cityCandidate || addr.dst || addr.city || "";
    stateCandidate = stateCandidate || addr.stcd || addr.state || "";
    pincodeCandidate = pincodeCandidate || addr.pncd || addr.pincode || "";
  } else if (pradr && typeof pradr === "object") {
    if (!fullAddress) {
      fullAddress = [
        pradr.building_number || pradr.bno,
        pradr.building_name || pradr.bnm,
        pradr.street || pradr.st,
        pradr.locality || pradr.loc,
      ]
        .filter(Boolean)
        .join(", ");
    }
    cityCandidate = cityCandidate || pradr.city || pradr.dst || pradr.district || "";
    stateCandidate = stateCandidate || pradr.state || pradr.stcd || "";
    pincodeCandidate = pincodeCandidate || pradr.pincode || pradr.pncd || "";
  }

  const stateCode = cleanGst.substring(0, 2);
  const stateName = stateCandidate || GST_STATE_CODES[stateCode] || "";
  const city = cleanCityName(cityCandidate, stateCode);
  const pincode = extractPincode(pincodeCandidate, fullAddress, rawData);

  const constitutionChar = cleanGst.charAt(5);
  const rawConstitution =
    record.constitution_of_business ||
    record.constitution ||
    record.ctb ||
    CONSTITUTION_CODES[constitutionChar] ||
    "";

  let businessType = "Private Limited";
  const constLower = String(rawConstitution).toLowerCase();
  if (constLower.includes("proprietor")) businessType = "Proprietorship";
  else if (constLower.includes("llp") || constLower.includes("limited liability partnership")) businessType = "LLP";
  else if (constLower.includes("partner")) businessType = "Partnership";
  else if (constLower.includes("public")) businessType = "Public Limited";
  else if (constLower.includes("private") || constLower.includes("pvt")) businessType = "Private Limited";
  else if (CONSTITUTION_CODES[constitutionChar]) {
    const codeVal = CONSTITUTION_CODES[constitutionChar];
    if (codeVal.includes("Proprietorship")) businessType = "Proprietorship";
    else if (codeVal.includes("Partnership")) businessType = "Partnership";
    else businessType = "Private Limited";
  }

  const regDate = record.registration_date || record.date_of_registration || record.rgdt || "";
  const foundedYear = extractFoundedYear(regDate);

  // Contact details & Promoter extraction
  const contactPerson =
    record.contact_person ||
    record.contactPerson ||
    record.contact?.name ||
    record.authorized_signatory ||
    record.authorizedSignatory ||
    record.proprietor_name ||
    (Array.isArray(record.promoters) && record.promoters[0]?.name) ||
    (Array.isArray(record.mbr) && record.mbr[0]?.name) ||
    (constitutionChar === "P" && legalName ? legalName : "");

  let phone =
    record.mobile ||
    record.phone ||
    record.contact_number ||
    record.contact_mobile ||
    record.contact?.mobile ||
    record.contact?.phone ||
    addrDetails.mobile ||
    addrDetails.phone ||
    (Array.isArray(record.promoters) && (record.promoters[0]?.mobile || record.promoters[0]?.phone)) ||
    (Array.isArray(record.mbr) && (record.mbr[0]?.mobile || record.mbr[0]?.phone)) ||
    pradr.mob ||
    pradr.mobile ||
    "";

  if (!phone) {
    const rawMatch = JSON.stringify(rawData).match(/"(?:mobile|phone|contact|mob)":\s*"?([6-9][0-9]{9})"?/i);
    if (rawMatch) phone = rawMatch[1];
  }

  const email =
    record.email ||
    record.contact?.email ||
    record.contact_email ||
    pradr.email ||
    "";

  const status = record.status || record.sts || record.taxpayer_status || "Active";

  return {
    gstin: cleanGst,
    isValid: String(status).toLowerCase().includes("act"),
    valid: true,
    businessName: tradeName || legalName || resolvedName,
    tradeName,
    legalName,
    businessType,
    founded: foundedYear,
    address: fullAddress || "",
    city: city || "",
    state: stateName,
    pincode: pincode || "",
    status,
    contactPerson: contactPerson || "",
    phone: phone || "",
    email: email || "",
    taxpayerType: record.taxpayer_type || record.dty || "Regular",
    chapter: stateName ? `${stateName} Chapter` : "",
    source: "gstinapi_live_api",
  };
}

/**
 * Fallback: Call Appyflow Technologies GST Verification API
 */
async function fetchFromAppyflow(cleanGst, apiKey) {
  if (!apiKey) return null;

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
  logDebug(`Appyflow response for ${cleanGst}: ${JSON.stringify(data)}`);

  if (!response.ok || !data || data.error || !data.taxpayerInfo) {
    return null;
  }

  const info = data.taxpayerInfo;
  const pradr = info.pradr?.addr || {};
  const fullAddress = [pradr.bno, pradr.bnm, pradr.st, pradr.loc, pradr.flno]
    .filter(Boolean)
    .join(", ");

  const stateCode = cleanGst.substring(0, 2);
  const stateName = pradr.stcd || GST_STATE_CODES[stateCode] || "";
  const constitutionChar = cleanGst.charAt(5);
  const businessType = info.ctb || CONSTITUTION_CODES[constitutionChar] || "";
  const resolvedName = info.tradeNam || info.lgnm || "";
  const foundedYear = extractFoundedYear(info.rgdt);
  const cleanCity = cleanCityName(pradr.dst || pradr.city, stateCode);
  const cleanPin = extractPincode(pradr.pncd, fullAddress, data);

  const contactPerson =
    info.auth_signatory ||
    (Array.isArray(info.mbr) && info.mbr[0]?.name) ||
    (constitutionChar === "P" && info.lgnm !== info.tradeNam ? info.lgnm : "");

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
    city: cleanCity,
    state: stateName,
    pincode: cleanPin,
    status: info.sts || "Active",
    contactPerson: contactPerson || "",
    phone: info.mob || pradr.mob || "",
    email: info.email || pradr.email || "",
    taxpayerType: info.dty || "Regular",
    chapter: stateName ? `${stateName} Chapter` : "",
    source: "appyflow_live_api",
  };
}

export const gstService = {
  /**
   * Verify GSTIN and return live corporate details
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

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(cleanGst)) {
      return {
        isValid: false,
        valid: false,
        message: "Invalid GSTIN format. Must be 15 alphanumeric characters matching Indian GST format.",
      };
    }

    // 1. Primary: Live GSTIN Portal API (gstinapi.in)
    const gstinApiKey =
      process.env.GSTIN_API_KEY ||
      process.env.GSTINAPI_KEY ||
      env.GSTINAPI?.API_KEY ||
      "gak_a52df8c209d848c18c8b50ac2d26efac";

    if (gstinApiKey) {
      try {
        const gstinData = await fetchFromGstinApi(cleanGst, gstinApiKey);
        if (gstinData) {
          return gstinData;
        }
      } catch (err) {
        logDebug(`GSTIN Portal lookup failed: ${err.message}`);
        if (err.message?.toLowerCase().includes("not found") || err.message?.toLowerCase().includes("invalid")) {
          return {
            isValid: false,
            valid: false,
            message: err.message,
          };
        }
      }
    }

    // 2. Secondary: Sandbox.co.in API
    const sandboxKey = env.SANDBOX?.API_KEY || process.env.SANDBOX_API_KEY || "";
    const sandboxSecret = env.SANDBOX?.API_SECRET || process.env.SANDBOX_API_SECRET || "";

    if (sandboxKey && sandboxSecret) {
      try {
        const sandboxData = await fetchFromSandbox(cleanGst, sandboxKey, sandboxSecret);
        if (sandboxData) {
          return sandboxData;
        }
      } catch (err) {
        logDebug(`Sandbox lookup failed: ${err.message}`);
        if (err.message?.includes("not found") || err.message?.includes("Invalid")) {
          return {
            isValid: false,
            valid: false,
            message: err.message,
          };
        }
      }
    }

    // 3. Tertiary: Appyflow API
    const appyflowKey = env.GST?.API_KEY || process.env.GST_API_KEY || "";
    if (appyflowKey) {
      try {
        const appyflowData = await fetchFromAppyflow(cleanGst, appyflowKey);
        if (appyflowData) {
          return appyflowData;
        }
      } catch (err) {
        logDebug(`Appyflow lookup error: ${err.message}`);
      }
    }

    // 4. Fallback: Format analysis
    const stateCode = cleanGst.substring(0, 2);
    const stateName = GST_STATE_CODES[stateCode] || "";
    const constitutionChar = cleanGst.charAt(5);
    const constitutionType = CONSTITUTION_CODES[constitutionChar] || "Private Limited Company";

    return {
      gstin: cleanGst,
      isValid: true,
      valid: true,
      businessName: "",
      tradeName: "",
      legalName: "",
      businessType: constitutionType,
      state: stateName,
      city: stateCode === "27" ? "Mumbai" : stateCode === "07" ? "Delhi" : "",
      contactPerson: "",
      phone: "",
      email: "",
      status: "Active",
      taxpayerType: "Regular",
      chapter: stateName ? `${stateName} Chapter` : "",
      source: "structural_verification",
    };
  },

  async fetchDetails(gstin) {
    return this.verifyGst(gstin);
  },
};
