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

  const foundedYear = record.date_of_registration
    ? record.date_of_registration.split(/[-/]/).pop()
    : record.rgdt
    ? record.rgdt.split(/[-/]/).pop()
    : "";

  const status = record.status || record.sts || "Active";

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
    city: city || (stateCode === "27" ? "Mumbai" : stateCode === "07" ? "Delhi" : ""),
    state: stateName,
    pincode,
    status,
    taxpayerType: record.taxpayer_type || record.dty || "Regular",
    chapter: stateName ? `${stateName} Chapter` : "",
    source: "sandbox_live_api",
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
  const foundedYear = info.rgdt ? info.rgdt.split("/").pop() : "";

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
    city: pradr.dst || pradr.city || "",
    state: stateName,
    pincode: pradr.pncd || "",
    status: info.sts || "Active",
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

    const sandboxKey = env.SANDBOX?.API_KEY || process.env.SANDBOX_API_KEY || "";
    const sandboxSecret = env.SANDBOX?.API_SECRET || process.env.SANDBOX_API_SECRET || "";

    // 1. Primary: Live Sandbox.co.in API (if keys configured)
    if (sandboxKey && sandboxSecret) {
      try {
        const sandboxData = await fetchFromSandbox(cleanGst, sandboxKey, sandboxSecret);
        if (sandboxData) {
          return sandboxData;
        }
      } catch (err) {
        logDebug(`Sandbox lookup failed: ${err.message}`);
        // If Sandbox gave a specific not found error, return it
        if (err.message?.includes("not found") || err.message?.includes("Invalid")) {
          return {
            isValid: false,
            valid: false,
            message: err.message,
          };
        }
      }
    }

    // 2. Secondary: Appyflow API
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

    // 3. Fallback: Format analysis
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
