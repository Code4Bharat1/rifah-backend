import mongoose from "mongoose";
import crypto from "crypto";
import { VisaReferral } from "./visa-referral.model.js";
import { Payment } from "../payments/payment.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { logger } from "../../infrastructure/logger/logger.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";

/**
 * Generate a unique readable reference number: e.g. RIFAH-VR-2026-89241
 */
function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(10000 + Math.random() * 90000);
  return `RIFAH-VR-${year}-${randomPart}`;
}

export const visaReferralService = {
  /**
   * Submit a new Visa Referral Application (Open to everyone: public, members, users)
   * Enforces 4 mandatory documents (Aadhar, PAN, Passport, Address Proof)
   * Enforces 4 core fields (Name, Country of Visit, Purpose of Visit, Detailed Description)
   * Generates a ₹500 Tax Invoice credited to the Central Account
   */
  create: async (data, user = null) => {
    // 1. Extract and normalize core fields
    const fullName = (data.fullName || data.name || user?.name || "").trim();
    const destinationCountry = (data.destinationCountry || data.countryOfVisit || "").trim();
    const purposeOfVisit = (data.purposeOfVisit || "").trim();
    const detailedDescriptionOfVisit = (
      data.detailedDescriptionOfVisit ||
      data.descriptionOfVisit ||
      data.detailedDescription ||
      ""
    ).trim();

    if (!fullName) {
      throw new BadRequestError("Applicant Name is required.");
    }
    if (!destinationCountry) {
      throw new BadRequestError("Country of Visit is required.");
    }
    if (!purposeOfVisit) {
      throw new BadRequestError("Purpose of Visit is required.");
    }
    if (!detailedDescriptionOfVisit) {
      throw new BadRequestError("Detailed Description of Visit is required.");
    }

    // 2. Extract and validate 4 mandatory documents
    const aadharCardUrl = (data.aadharCardUrl || data.aadharCard || "").trim();
    const panCardUrl = (data.panCardUrl || data.panCard || "").trim();
    const passportDocUrl = (
      data.passportDocUrl ||
      data.passport ||
      data.passportFrontUrl ||
      ""
    ).trim();
    const addressProofUrl = (data.addressProofUrl || data.addressProof || "").trim();

    if (!aadharCardUrl) {
      throw new BadRequestError("Aadhar Card document upload is required.");
    }
    if (!panCardUrl) {
      throw new BadRequestError("PAN Card document upload is required.");
    }
    if (!passportDocUrl) {
      throw new BadRequestError("Passport document upload is required.");
    }
    if (!addressProofUrl) {
      throw new BadRequestError("Address Proof document upload is required.");
    }

    // 3. Generate unique application reference number
    let referenceNumber = generateReferenceNumber();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      const existing = await VisaReferral.findOne({ referenceNumber }).lean();
      if (!existing) {
        isUnique = true;
      } else {
        referenceNumber = generateReferenceNumber();
        attempts++;
      }
    }

    // 4. Generate Official Chamber Tax Invoice & Payment Record for ₹500 + 18% GST = ₹590 (Central Account)
    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    const verificationToken = crypto.randomBytes(24).toString("hex");
    const payerId = user?._id || new mongoose.Types.ObjectId();
    const payerEmail = (data.email || user?.email || "").toLowerCase().trim();
    const payerPhone = (data.phone || user?.phone || "").trim();

    let paymentRecord = null;
    try {
      paymentRecord = await Payment.create({
        invoiceNumber,
        payer: payerId,
        itemType: "Visa Referral",
        description: `Visa Referral Application Fee (₹500 + 18% GST) - Central Account [Country: ${destinationCountry}]`,
        subtotal: 500,
        gstRate: 18,
        gstAmount: 90,
        amount: 590,
        currency: "INR",
        method: data.paymentMethod || "Razorpay / Online",
        status: "Paid",
        paidAt: new Date(),
        payerName: fullName,
        payerEmail: payerEmail || undefined,
        payerPhone: payerPhone || undefined,
        collectingChapter: "Central Secretariat",
        collectingState: "Central",
        verificationToken,
        notes: `Application Fee of ₹500 + 18% GST (₹90) = ₹590 credited to Central Account for Visa Referral Application (Ref: ${referenceNumber}). Official referral recommendation physically delivered by post upon approval.`,
      });
    } catch (payErr) {
      logger.error("[VISA_REFERRAL] Payment record creation failed:", payErr);
      // Fallback: Continue with generated invoiceNumber
    }

    // 5. Postal delivery address for hard copy letter dispatch by post
    const postalAddress = {
      recipientName: data.postalAddress?.recipientName || data.postalRecipientName || fullName,
      addressLine1: data.postalAddress?.addressLine1 || data.postalAddressLine1 || data.residentialAddress || "",
      addressLine2: data.postalAddress?.addressLine2 || data.postalAddressLine2 || "",
      city: data.postalAddress?.city || data.postalCity || data.city || "",
      state: data.postalAddress?.state || data.postalState || data.state || "",
      pincode: data.postalAddress?.pincode || data.postalPincode || data.pincode || "",
      landmark: data.postalAddress?.landmark || data.postalLandmark || "",
      contactPhone: data.postalAddress?.contactPhone || data.postalPhone || payerPhone,
    };

    const applicationData = {
      ...data,
      fullName,
      email: payerEmail,
      phone: payerPhone,
      destinationCountry,
      purposeOfVisit,
      detailedDescriptionOfVisit,
      aadharCardUrl,
      panCardUrl,
      passportDocUrl,
      addressProofUrl,
      postalAddress,
      referenceNumber,
      // Fee: ₹500 Base + 18% GST (₹90) = ₹590 in Central Account
      fee: 500,
      gstRate: 18,
      gstAmount: 90,
      totalAmount: 590,
      feeCurrency: "INR",
      beneficiaryAccount: "Central Account",
      invoiceNumber,
      invoicePaymentId: paymentRecord?._id || null,
      paymentStatus: "Paid",
      paidAt: new Date(),
      status: "Pending",
      timeline: [
        {
          status: "Pending",
          timestamp: new Date(),
          note: `Visa referral application submitted with ₹500 fee + 18% GST (₹90) = ₹590 credited to Central Account (Invoice #${invoiceNumber}). Awaiting Central Secretariat verification.`,
          changedBy: user?.name || fullName || "Applicant",
        },
      ],
    };

    if (user) {
      applicationData.applicant = user._id;
      applicationData.applicantType = user.accountType === "user" ? "User" : "Member";
      if (!applicationData.isRifahMember && (user.membershipId || user.role === "business_owner")) {
        applicationData.isRifahMember = true;
        applicationData.membershipId = user.membershipId || applicationData.membershipId || "";
      }
    }

    const application = new VisaReferral(applicationData);
    await application.save();

    // 6. Send Instant Confirmation Email to Applicant with Invoice Details
    try {
      const appRef = application.referenceNumber;
      const recipientAddress = [
        postalAddress.recipientName,
        postalAddress.addressLine1,
        postalAddress.addressLine2,
        `${postalAddress.city}, ${postalAddress.state} - ${postalAddress.pincode}`,
        postalAddress.landmark ? `Landmark: ${postalAddress.landmark}` : "",
        `Contact Phone: ${postalAddress.contactPhone}`,
      ]
        .filter(Boolean)
        .join("<br/>");

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">RIFAH CHAMBER OF COMMERCE & INDUSTRY</h2>
            <p style="color: #64748b; margin: 4px 0 0; font-size: 13px;">Apex International Trade & Visa Referral Services Desk</p>
          </div>

          <div style="background: #f8fafc; border-left: 4px solid #00a6f4; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #334155;">Application Reference Number:</p>
            <p style="margin: 4px 0 0; font-size: 20px; font-weight: bold; color: #0f172a; letter-spacing: 1px;">${appRef}</p>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.6;">Dear <strong>${application.fullName}</strong>,</p>
          
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">
            We have received your application for an official <strong>Chamber Visa Referral Recommendation Letter</strong> for travel to <strong>${destinationCountry}</strong>.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Country of Visit:</td>
              <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${destinationCountry}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Purpose of Visit:</td>
              <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${purposeOfVisit}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Official Tax Invoice:</td>
              <td style="padding: 8px 0; font-weight: 700; color: #0284c7;"># ${invoiceNumber} (₹500 + 18% GST = ₹590 Paid - Central Account)</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Postal Delivery Address:</td>
              <td style="padding: 8px 0; font-weight: 600; color: #0f172a; line-height: 1.4;">${recipientAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Current Status:</td>
              <td style="padding: 8px 0; font-weight: 600; color: #d97706;">Pending Secretariat Verification</td>
            </tr>
          </table>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
              <strong>Physical Delivery by Post / Courier:</strong><br/>
              Only the RIFAH Central Administration reviews and approves visa referral applications. Once approved, the official hard copy recommendation letter will be printed on Chamber letterhead with official seal & signature, and <strong>physically delivered by registered post / courier</strong> to your designated address above.
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            RIFAH Chamber of Commerce & Industry · Central Secretariat<br/>
            This is an automated advisory. Please preserve your reference number for all records.
          </p>
        </div>
      `;

      if (application.email) {
        await emailService.sendEmail({
          to: application.email,
          subject: `[RIFAH Chamber] Visa Referral Application Received - Ref: ${appRef} (Invoice #${invoiceNumber})`,
          html,
          text: `Dear ${application.fullName},\n\nYour Visa Referral Application (Ref: ${appRef}) for ${destinationCountry} has been received and is pending Central Admin review.\nInvoice: #${invoiceNumber} (₹500 Paid)\nDelivery Address: ${postalAddress.addressLine1}, ${postalAddress.city}, ${postalAddress.pincode}`,
        });
      }
    } catch (err) {
      logger.error("Failed to send applicant confirmation email for visa referral:", err);
    }

    // 7. Notify Central Admin
    try {
      const { User } = await import("../users/user.model.js");
      const { notificationService } = await import("../notifications/notification.service.js");

      const centralAdmins = await User.find({
        role: "central_admin",
        status: "Active",
      }).select("_id");

      for (const admin of centralAdmins) {
        await notificationService.createNotification({
          recipientId: admin._id,
          type: "System",
          title: "New Visa Referral Application",
          body: `New Visa Referral request from ${application.fullName} for ${destinationCountry} [Ref: ${application.referenceNumber}, Invoice #${invoiceNumber}]`,
          entityId: String(application._id),
          link: `/admin/visa-referrals?id=${application._id}`,
        });
      }
    } catch (err) {
      logger.error("Failed to notify Central Admin about visa referral:", err);
    }

    return application;
  },

  /**
   * List applications for the currently authenticated user
   */
  listUserApplications: async (user) => {
    if (!user) return [];
    return VisaReferral.find({
      $or: [{ applicant: user._id }, { email: (user.email || "").toLowerCase() }],
    })
      .sort({ createdAt: -1 })
      .lean();
  },

  /**
   * Central Admin Only: Paginated list with search and filters
   */
  listAdmin: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status && queryParams.status !== "All") {
      filter.status = queryParams.status;
    }

    if (queryParams.destinationCountry && queryParams.destinationCountry !== "All") {
      filter.destinationCountry = queryParams.destinationCountry;
    }

    if (queryParams.search) {
      const s = queryParams.search.trim();
      filter.$or = [
        { referenceNumber: { $regex: s, $options: "i" } },
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
        { invoiceNumber: { $regex: s, $options: "i" } },
        { destinationCountry: { $regex: s, $options: "i" } },
        { "postalAddress.recipientName": { $regex: s, $options: "i" } },
        { "postalAddress.city": { $regex: s, $options: "i" } },
        { "postalDispatch.consignmentNumber": { $regex: s, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      VisaReferral.find(filter)
        .populate("applicant", "name email phone membershipId subscriberTier role")
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VisaReferral.countDocuments(filter),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Central Admin Only: High-level overview statistics
   */
  getStats: async () => {
    const [total, pending, inProgress, approved, delivered, rejected] = await Promise.all([
      VisaReferral.countDocuments(),
      VisaReferral.countDocuments({ status: "Pending" }),
      VisaReferral.countDocuments({ status: "In Progress" }),
      VisaReferral.countDocuments({ status: "Approved" }),
      VisaReferral.countDocuments({ status: "Delivered" }),
      VisaReferral.countDocuments({ status: "Rejected" }),
    ]);

    return {
      total,
      pending,
      inProgress,
      approved,
      delivered,
      rejected,
    };
  },

  /**
   * Central Admin Only: Get detailed single application
   */
  getById: async (id) => {
    const application = await VisaReferral.findById(id)
      .populate("applicant", "name email phone membershipId subscriberTier role city state")
      .populate("deliveredBy", "name email role")
      .lean();

    if (!application) {
      throw new NotFoundError("Visa referral application not found");
    }

    return application;
  },

  /**
   * Central Admin Only: Set status (Pending, In Progress, Approved, Rejected)
   */
  updateStatus: async (id, { status, adminNotes = "", rejectionReason = "" }, adminUser) => {
    const validStatuses = ["Pending", "In Progress", "Approved", "Delivered", "Rejected"];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    const application = await VisaReferral.findById(id);
    if (!application) {
      throw new NotFoundError("Visa referral application not found");
    }

    const prevStatus = application.status;
    application.status = status;
    if (adminNotes !== undefined) application.adminNotes = adminNotes;
    if (rejectionReason !== undefined) application.rejectionReason = rejectionReason;

    application.timeline.push({
      status,
      timestamp: new Date(),
      note: adminNotes || `Status updated from ${prevStatus} to ${status} by Central Secretariat.`,
      changedBy: adminUser?.name || "Central Admin",
    });

    await application.save();

    // Send email update to applicant
    if (application.email) {
      try {
        const subject = `[RIFAH Chamber] Visa Referral Status Update: ${status} [${application.referenceNumber}]`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #0f172a; margin-top: 0;">RIFAH Chamber of Commerce & Industry</h2>
            <p style="color: #64748b; font-size: 13px;">Visa Referral Status Update</p>

            <p>Dear <strong>${application.fullName}</strong>,</p>
            <p>The status of your Visa Referral Application (Ref: <strong>${application.referenceNumber}</strong>) for <strong>${application.destinationCountry}</strong> has been updated to:</p>
            
            <div style="background: #f8fafc; border-left: 4px solid #0f172a; padding: 14px; margin: 16px 0;">
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #0f172a;">${status}</p>
              ${rejectionReason ? `<p style="margin: 6px 0 0; color: #dc2626; font-size: 13px;">Reason: ${rejectionReason}</p>` : ""}
              ${adminNotes ? `<p style="margin: 6px 0 0; color: #475569; font-size: 13px;">Secretariat Note: ${adminNotes}</p>` : ""}
            </div>

            <p style="font-size: 13px; color: #64748b;">For assistance, contact the Central Secretariat via your portal desk.</p>
          </div>
        `;

        await emailService.sendEmail({
          to: application.email,
          subject,
          html,
          text: `Dear ${application.fullName},\n\nYour Visa Referral application (${application.referenceNumber}) status has been updated to: ${status}.\n\nNote: ${adminNotes || "N/A"}\nReason: ${rejectionReason || "N/A"}`,
        });
      } catch (err) {
        logger.error("Failed to send status update email:", err);
      }
    }

    return application;
  },

  /**
   * Central Admin Only: Physically Deliver Referral Letter by Post / Courier
   * Records postal dispatch details (courier provider, consignment tracking number, dispatch date)
   */
  deliverLetter: async (
    id,
    {
      letterNumber = "",
      courierProvider = "India Post (Speed Post)",
      consignmentNumber = "",
      dispatchedDate = new Date(),
      postalNotes = "",
      signerName = "Central Secretariat",
      signerTitle = "Authorized Signatory, RIFAH Chamber of Commerce",
    },
    adminUser
  ) => {
    const application = await VisaReferral.findById(id);
    if (!application) {
      throw new NotFoundError("Visa referral application not found");
    }

    const countryCode = (application.destinationCountry || "GEN").substring(0, 3).toUpperCase();
    const generatedLetterNum =
      letterNumber || `RIFAH/VISA/${countryCode}/${Date.now().toString().slice(-6)}`;

    application.referralLetter = {
      letterNumber: generatedLetterNum,
      issuedDate: new Date(),
      signerName,
      signerTitle,
    };

    application.postalDispatch = {
      courierProvider: courierProvider || "India Post (Speed Post)",
      consignmentNumber: consignmentNumber || "",
      dispatchedDate: dispatchedDate ? new Date(dispatchedDate) : new Date(),
      postalNotes: postalNotes || "",
    };

    application.status = "Delivered";
    application.deliveredAt = new Date();
    application.deliveredBy = adminUser?._id;

    const dispatchNote = consignmentNumber
      ? `Official Visa Referral Letter (${generatedLetterNum}) physically dispatched via ${application.postalDispatch.courierProvider} (Consignment No: ${consignmentNumber}) to postal address.`
      : `Official Visa Referral Letter (${generatedLetterNum}) physically dispatched via ${application.postalDispatch.courierProvider} to postal address.`;

    application.timeline.push({
      status: "Delivered",
      timestamp: new Date(),
      note: dispatchNote,
      changedBy: adminUser?.name || "Central Secretariat",
    });

    await application.save();

    // Send Postal Dispatch Notification Email to Applicant
    const postAddr = application.postalAddress || {};
    const formattedAddress = [
      postAddr.recipientName || application.fullName,
      postAddr.addressLine1,
      postAddr.addressLine2,
      `${postAddr.city || ""}, ${postAddr.state || ""} - ${postAddr.pincode || ""}`.trim().replace(/^,\s*/, ""),
      postAddr.landmark ? `Landmark: ${postAddr.landmark}` : "",
      postAddr.contactPhone ? `Phone: ${postAddr.contactPhone}` : "",
    ]
      .filter(Boolean)
      .join("<br/>");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 28px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800;">RIFAH CHAMBER OF COMMERCE & INDUSTRY</h2>
          <p style="color: #64748b; margin: 6px 0 0; font-size: 13px; font-weight: 500;">Central Secretariat · International Trade & Visa Referral Division</p>
        </div>

        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-bottom: 22px;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #065f46;">
            Official Visa Referral Letter Dispatched by Post
          </p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #047857;">
            Dispatch Letter Ref: <strong>${generatedLetterNum}</strong> | Application: <strong>${application.referenceNumber}</strong>
          </p>
        </div>

        <p style="font-size: 14px; color: #1e293b; line-height: 1.6;">Dear <strong>${application.fullName}</strong>,</p>

        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          We are pleased to inform you that the <strong>RIFAH Chamber of Commerce & Industry</strong> has formally issued your <strong>Official Visa Recommendation / Referral Letter</strong> addressed to the relevant Embassy / Consulate authorities for your business travel to <strong>${application.destinationCountry}</strong>.
        </p>

        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          The original physical document, printed on official Chamber Letterhead with official seal and physical signature, has been <strong>dispatched by post / courier</strong> to your designated address.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 13px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Postal Dispatch Details</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 40%;">Postal / Courier Provider:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">${application.postalDispatch.courierProvider}</td>
            </tr>
            ${
              consignmentNumber
                ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Consignment / Tracking Number:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-family: monospace;">${consignmentNumber}</td>
            </tr>
            `
                : ""
            }
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Date of Dispatch:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${new Date(application.postalDispatch.dispatchedDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Delivery Destination:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a; line-height: 1.4;">${formattedAddress}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Authorized Signatory:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${signerName} (${signerTitle})</td>
            </tr>
          </table>
        </div>

        ${
          postalNotes
            ? `
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px; margin: 18px 0; font-size: 13px; color: #92400e;">
            <strong>Secretariat Postal Remarks:</strong><br/>
            ${postalNotes}
          </div>
        `
            : ""
        }

        <div style="background: #f1f5f9; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #334155; line-height: 1.6;">
          <strong>Important Instructions for Visa Submission:</strong><br/>
          1. The physical letter sent via post is an original Chamber instrument. Please keep it safe.<br/>
          2. Submit this original Chamber Referral Letter along with your Passport, Host Invitation Letter, and Chamber Membership Certificate at your scheduled Embassy / VFS / Consulate interview.<br/>
          3. Ensure your travel dates match the duration specified in the Chamber recommendation.
        </div>

        <p style="font-size: 14px; color: #1e293b; margin-top: 24px;">
          We wish you a successful business delegation and travel.<br/>
          <strong>RIFAH Chamber Central Secretariat</strong>
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 14px; text-align: center; font-size: 11px; color: #94a3b8;">
          RIFAH Chamber of Commerce & Industry · Registered Apex National Trade Chamber<br/>
          Delivered by Post · Dispatched on ${new Date().toLocaleDateString()}
        </div>
      </div>
    `;

    if (application.email) {
      try {
        await emailService.sendEmail({
          to: application.email,
          subject: `[RIFAH Chamber] Visa Referral Letter Dispatched by Post: ${application.destinationCountry} [${application.referenceNumber}]`,
          html,
          text: `Dear ${application.fullName},\n\nYour Official Visa Referral Letter (${generatedLetterNum}) for ${application.destinationCountry} has been physically dispatched by post.\n\nCourier: ${application.postalDispatch.courierProvider}\nConsignment No: ${consignmentNumber || "N/A"}\nDelivered To: ${postAddr.addressLine1}, ${postAddr.city}, ${postAddr.pincode}`,
        });
        logger.info(`Visa referral postal dispatch notification emailed to ${application.email} [${application.referenceNumber}]`);
      } catch (err) {
        logger.error("Failed to send postal dispatch notification email:", err);
      }
    }

    return application;
  },
};

export default visaReferralService;
