import crypto from "crypto";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";
import { BadRequestError } from "../../shared/errors/errors.js";

/**
 * URL-encode nested objects according to Stripe x-www-form-urlencoded conventions
 */
function toStripeFormData(obj, prefix = "") {
  const parts = [];
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (val === undefined || val === null) continue;

    const newPrefix = prefix ? `${prefix}[${key}]` : key;
    if (typeof val === "object" && !(val instanceof Date)) {
      parts.push(toStripeFormData(val, newPrefix));
    } else {
      parts.push(`${encodeURIComponent(newPrefix)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

class StripeClient {
  constructor() {
    this.secretKey = env.STRIPE.SECRET_KEY || "";
    this.publishableKey = env.STRIPE.PUBLISHABLE_KEY || "";
    this.webhookSecret = env.STRIPE.WEBHOOK_SECRET || "";
    this.defaultCurrency = (env.STRIPE.CURRENCY || "usd").toLowerCase();
  }

  isConfigured() {
    return Boolean(
      this.secretKey &&
      !this.secretKey.includes("MockStripeSecretKey") &&
      (this.secretKey.startsWith("sk_test_") || this.secretKey.startsWith("sk_live_"))
    );
  }

  /**
   * Internal helper for direct Stripe REST API calls
   */
  async request(endpoint, method = "GET", bodyData = null) {
    if (!this.secretKey) {
      throw new BadRequestError("Stripe Secret Key is not configured. Please set STRIPE_SECRET_KEY in rifah-backend/.env");
    }

    const isMock = !this.isConfigured();
    if (isMock) {
      logger.warn("[STRIPE] Notice: Mock or test placeholder key is currently in use in .env.");
    }

    const headers = {
      Authorization: `Bearer ${this.secretKey}`,
      "Stripe-Version": "2024-12-18.acacia",
    };

    let body = null;
    if (bodyData && (method === "POST" || method === "PUT" || method === "PATCH")) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = typeof bodyData === "string" ? bodyData : toStripeFormData(bodyData);
    }

    const url = `https://api.stripe.com/v1${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || `Stripe API error (${response.status})`;
      logger.error(`[STRIPE API ERROR] ${errMsg}`, data?.error);
      throw new BadRequestError(errMsg);
    }

    return data;
  }

  /**
   * Create a Hosted Stripe Checkout Session
   */
  async createCheckoutSession({
    amount,
    currency = "usd",
    name = "RIFAH International Payment",
    description = "",
    invoiceNumber,
    customerEmail,
    successUrl,
    cancelUrl,
    metadata = {},
  }) {
    const selectedCurrency = (currency || this.defaultCurrency).toLowerCase();
    const amountInCents = Math.round(Number(amount) * 100);

    if (amountInCents <= 0) {
      throw new BadRequestError("Amount must be greater than zero for Stripe Checkout");
    }

    const payload = {
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: selectedCurrency,
            unit_amount: amountInCents,
            product_data: {
              name,
              ...(description ? { description } : {}),
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(invoiceNumber ? { client_reference_id: invoiceNumber } : {}),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata: {
        ...metadata,
        invoiceNumber: invoiceNumber || "",
        currency: selectedCurrency.toUpperCase(),
      },
    };

    const session = await this.request("/checkout/sessions", "POST", payload);
    return session;
  }

  /**
   * Retrieve an existing Checkout Session with expanded payment_intent
   */
  async retrieveCheckoutSession(sessionId) {
    if (!sessionId) {
      throw new BadRequestError("Stripe Session ID is required");
    }
    const session = await this.request(`/checkout/sessions/${sessionId}?expand[]=payment_intent`);
    return session;
  }

  /**
   * Verify and parse Stripe webhook event
   */
  verifyWebhook(rawBody, signatureHeader) {
    if (!signatureHeader || !this.webhookSecret) {
      throw new BadRequestError("Missing webhook signature or STRIPE_WEBHOOK_SECRET");
    }

    const items = signatureHeader.split(",");
    let timestamp = null;
    const signatures = [];

    for (const item of items) {
      const [key, value] = item.trim().split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") signatures.push(value);
    }

    if (!timestamp || signatures.length === 0) {
      throw new BadRequestError("Invalid Stripe signature header format");
    }

    const rawStr = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : typeof rawBody === "string"
      ? rawBody
      : JSON.stringify(rawBody);

    const payloadToSign = `${timestamp}.${rawStr}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payloadToSign)
      .digest("hex");

    const isValid = signatures.some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSignature, "hex"));
      } catch {
        return false;
      }
    });

    if (!isValid) {
      throw new BadRequestError("Stripe webhook signature verification failed");
    }

    return typeof rawBody === "object" && !Buffer.isBuffer(rawBody) ? rawBody : JSON.parse(rawStr);
  }
}

export const stripeClient = new StripeClient();
export default stripeClient;
