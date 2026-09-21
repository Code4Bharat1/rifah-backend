import PDFDocument from "pdfkit";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { Course } from "./course.model.js";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export const SIGNATURE_PRESETS = [
  {
    name: "Classic Flourish",
    path: "M 12 36 C 18 12, 32 6, 44 16 C 52 24, 46 44, 34 50 C 22 56, 18 42, 36 30 C 52 18, 68 36, 80 40 C 90 44, 98 26, 108 36 C 118 44, 126 24, 136 34 C 146 42, 154 28, 164 36 C 174 42, 182 32, 192 38 M 22 54 Q 100 44, 178 48 Q 194 49, 204 42 M 194 38 L 202 46",
    color: "#0f2942",
  },
  {
    name: "Executive Swift",
    path: "M 16 42 C 24 10, 42 8, 46 26 C 48 38, 38 52, 26 46 C 16 40, 28 20, 52 24 C 74 28, 64 52, 84 40 C 96 30, 108 14, 122 26 C 134 36, 128 48, 142 42 C 154 36, 164 22, 174 30 C 184 38, 180 50, 194 44 M 18 50 Q 106 60, 192 48 Q 204 46, 212 40",
    color: "#1e3a8a",
  },
  {
    name: "Authoritative Ascender",
    path: "M 20 48 C 30 14, 46 8, 50 30 C 52 46, 38 56, 28 50 C 18 44, 32 22, 60 26 C 86 30, 72 56, 92 44 C 108 34, 118 16, 134 30 C 148 42, 140 54, 156 46 C 170 38, 180 24, 192 34 C 202 42, 198 56, 212 48 M 24 56 Q 112 64, 198 52 Q 212 50, 220 42",
    color: "#172554",
  },
  {
    name: "Calligraphic Ribbon",
    path: "M 14 38 C 22 16, 36 10, 48 22 C 56 30, 50 48, 38 52 C 26 56, 22 42, 40 32 C 58 20, 74 38, 86 42 C 96 46, 104 28, 114 38 C 124 46, 132 26, 142 36 C 152 44, 160 30, 170 38 C 180 44, 188 34, 198 40 M 26 54 Q 104 46, 184 50 Q 200 51, 210 44 M 198 40 L 208 48",
    color: "#0e3a5a",
  },
];

export const generateCertificate = async (businessId, courseId, options = {}) => {
  const business = await Business.findById(businessId).populate("owner");
  const course = await Course.findById(courseId);
  
  if (!business || !course) throw new Error("Invalid business or course for certificate");

  let certificate = await Certificate.findOne({ businessId, courseId });
  let certificateNumber;
  let fileName;
  let pdfPath;

  if (certificate) {
    certificateNumber = certificate.certificateNumber;
    fileName = `${certificateNumber}.pdf`;
  } else {
    certificateNumber = `CERT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    fileName = `${certificateNumber}.pdf`;
  }

  const mainDir = path.resolve(process.cwd(), "uploads", "certificates");
  const fallbackDir = path.resolve(process.cwd(), "public", "uploads", "certificates");
  fs.mkdirSync(mainDir, { recursive: true });
  fs.mkdirSync(fallbackDir, { recursive: true });

  const mainPath = path.join(mainDir, fileName);
  const fallbackPath = path.join(fallbackDir, fileName);

  if (certificate && !options.force) {
    const mainValid = fs.existsSync(mainPath) && fs.statSync(mainPath).size > 10000;
    const fallbackValid = fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).size > 10000;
    if (mainValid && fallbackValid) {
      return certificate;
    }
  }

  pdfPath = mainPath;

  const doc = new PDFDocument({
    layout: "landscape",
    size: "A4",
    margin: 0,
  });

  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  // A4 Landscape dimensions (842 x 595)
  const width = 842;
  const height = 595;
  const accentColor = "#00875A"; // RIFAH Emerald Green

  // Background
  doc.rect(0, 0, width, height).fill("#ffffff");

  // Dark Navy Outer Border (14pt solid #0B1F33)
  const outerBorder = 14;
  doc.rect(outerBorder / 2, outerBorder / 2, width - outerBorder, height - outerBorder)
     .lineWidth(outerBorder)
     .stroke("#0B1F33");

  // Inner Gold Outline (at offset from navy border)
  const outlineMargin = 18;
  doc.rect(outlineMargin, outlineMargin, width - outlineMargin * 2, height - outlineMargin * 2)
     .lineWidth(1.5)
     .stroke("#D97706");

  // 4 Golden Corner Ornaments: #D97706
  const cornerInset = 24;
  const cornerLen = 30;
  const cornerWidth = 3;

  // Top-Left
  doc.moveTo(cornerInset + cornerLen, cornerInset)
     .lineTo(cornerInset, cornerInset)
     .lineTo(cornerInset, cornerInset + cornerLen)
     .lineWidth(cornerWidth)
     .stroke("#D97706");

  // Top-Right
  doc.moveTo(width - cornerInset - cornerLen, cornerInset)
     .lineTo(width - cornerInset, cornerInset)
     .lineTo(width - cornerInset, cornerInset + cornerLen)
     .lineWidth(cornerWidth)
     .stroke("#D97706");

  // Bottom-Left
  doc.moveTo(cornerInset + cornerLen, height - cornerInset)
     .lineTo(cornerInset, height - cornerInset)
     .lineTo(cornerInset, height - cornerInset - cornerLen)
     .lineWidth(cornerWidth)
     .stroke("#D97706");

  // Bottom-Right
  doc.moveTo(width - cornerInset - cornerLen, height - cornerInset)
     .lineTo(width - cornerInset, height - cornerInset)
     .lineTo(width - cornerInset, height - cornerInset - cornerLen)
     .lineWidth(cornerWidth)
     .stroke("#D97706");

  // Logo
  let logoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
  if (!fs.existsSync(logoPath)) {
    logoPath = path.resolve(process.cwd(), "public", "rifah-logo.png");
  }
  if (fs.existsSync(logoPath)) {
    const logoWidth = 140;
    doc.image(logoPath, (width - logoWidth) / 2, 40, { width: logoWidth });
  }

  // Header: CHAMBER OF COMMERCE & BUSINESS NETWORK
  doc.fontSize(10)
     .fillColor("#64748B")
     .font("Helvetica-Bold")
     .text("CHAMBER OF COMMERCE & BUSINESS NETWORK", 0, 106, { align: "center", characterSpacing: 2.5 });

  // Title: CERTIFICATE OF COMPLETION
  doc.fontSize(30)
     .fillColor("#0B1F33")
     .font("Times-Bold")
     .text("CERTIFICATE OF COMPLETION", 0, 126, { align: "center", characterSpacing: 3 });

  // Subtitle: OFFICIAL CHAMBER CREDENTIALS
  doc.fontSize(12)
     .fillColor("#0088D1")
     .font("Helvetica-Bold")
     .text("OFFICIAL CHAMBER CREDENTIALS", 0, 168, { align: "center", characterSpacing: 2 });

  // Presentation line
  doc.fontSize(13.5)
     .fillColor("#475569")
     .font("Helvetica")
     .text("This is proudly presented to certify that", 0, 208, { align: "center" });

  // Recipient / Business Name
  const recipientName = business.owner?.name || business.contactPerson || business.name || "Member";
  doc.fontSize(28)
     .fillColor("#0B1F33")
     .font("Times-Bold")
     .text(recipientName, 0, 234, { align: "center" });

  // Underline Accent Rule
  const ruleWidth = Math.min(Math.max(recipientName.length * 15, 200), 380);
  doc.moveTo((width - ruleWidth) / 2, 272)
     .lineTo((width + ruleWidth) / 2, 272)
     .lineWidth(1.5)
     .stroke("#E2E8F0");

  // Golden Pill Badge
  const badgeText = "COURSE COMPLETION";
  const badgeWidth = 160;
  const badgeHeight = 22;
  const badgeX = (width - badgeWidth) / 2;
  const badgeY = 286;
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 11)
     .fillAndStroke("#FEF3C7", "#FCD34D");
  doc.fontSize(9.5)
     .fillColor("#92400E")
     .font("Helvetica-Bold")
     .text(badgeText, badgeX, badgeY + 6, { width: badgeWidth, align: "center", characterSpacing: 1 });

  // Accreditation Text
  const formatTitle = (str) => {
    if (!str) return "Executive Training Course";
    return str
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };
  const formattedCourseTitle = formatTitle(course.title);
  const chapterLabel = business.chapter ? (business.chapter.includes("Chapter") ? business.chapter : `${business.chapter} Chapter`) : "Mumbai Chapter";

  doc.fontSize(12.5)
     .fillColor("#475569")
     .font("Helvetica")
     .text("is an officially verified and accredited graduate having successfully completed the curriculum of", 0, 326, { align: "center" });

  doc.fontSize(17)
     .fillColor("#0B1F33")
     .font("Helvetica-Bold")
     .text(formattedCourseTitle, 0, 348, { align: "center" });

  doc.fontSize(12.5)
     .fillColor("#475569")
     .font("Helvetica")
     .text(`with the RIFAH Chamber of Commerce, ${chapterLabel}.`, 0, 374, { align: "center" });

  // Horizontal Separator Rule above Footer
  doc.moveTo(60, 465)
     .lineTo(width - 60, 465)
     .lineWidth(1)
     .stroke("#E2E8F0");

  // 3-Column Footer
  let scopeLabel = "Central Chamber National Leadership Program";
  if (course.scope === "state") {
    scopeLabel = course.state ? `${course.state} State Executive Curriculum` : "State Executive Curriculum";
  } else if (course.scope === "chapter") {
    scopeLabel = `${chapterLabel} Leadership Training`;
  } else if (course.scope === "centre") {
    scopeLabel = "Central Chamber Leadership Program";
  }
  const formattedDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // Left Column (Credentials)
  const leftX = 65;
  const leftY = 484;
  doc.fontSize(9.5)
     .fillColor("#0B1F33")
     .font("Helvetica-Bold")
     .text(`Certificate ID: ${certificateNumber}`, leftX, leftY);

  doc.fontSize(9)
     .fillColor("#475569")
     .font("Helvetica")
     .text(`Issue Date: ${formattedDate}`, leftX, leftY + 14);

  doc.fontSize(9)
     .fillColor("#475569")
     .font("Helvetica")
     .text(`Curriculum: ${scopeLabel}`, leftX, leftY + 28);

  // Center Column (Official Seal Badge)
  const sealX = width / 2;
  const sealY = 505;
  const sealRadius = 26;

  doc.circle(sealX, sealY, sealRadius)
     .fillAndStroke("#D97706", "#B45309");

  doc.circle(sealX, sealY, sealRadius - 3)
     .lineWidth(1)
     .dash(2, { space: 2 })
     .stroke("#FEF3C7");
  doc.undash();

  doc.fillColor("#FFFFFF")
     .fontSize(8.5)
     .font("Helvetica-Bold")
     .text("RIFAH", sealX - 25, sealY - 14, { width: 50, align: "center" });

  doc.fontSize(6)
     .font("Helvetica-Bold")
     .text("OFFICIAL", sealX - 25, sealY - 3, { width: 50, align: "center" });

  doc.fontSize(8.5)
     .font("Helvetica-Bold")
     .text("SEAL", sealX - 25, sealY + 5, { width: 50, align: "center" });

  // Right Column (Signature Block)
  const rightX = width - 65 - 150;
  const sigLineY = 512;
  const sigLineWidth = 150;

  const randSig = SIGNATURE_PRESETS[Math.floor(Math.random() * SIGNATURE_PRESETS.length)];
  doc.save();
  doc.translate(rightX - 8, sigLineY - 44);
  doc.scale(0.85);
  doc.path(randSig.path)
     .lineWidth(1.8)
     .strokeColor(randSig.color || "#0F2942")
     .stroke();
  doc.restore();

  doc.moveTo(rightX, sigLineY)
     .lineTo(rightX + sigLineWidth, sigLineY)
     .lineWidth(1)
     .stroke("#0B1F33");

  doc.fontSize(10)
     .fillColor("#0B1F33")
     .font("Helvetica-Bold")
     .text("President / Secretary", rightX, sigLineY + 6, { width: sigLineWidth, align: "center" });

  doc.fontSize(9)
     .fillColor("#64748B")
     .font("Helvetica")
     .text("RIFAH Chamber Central Desk", rightX, sigLineY + 18, { width: sigLineWidth, align: "center" });

  doc.end();

  await new Promise((res, rej) => {
    writeStream.on("finish", res);
    writeStream.on("error", rej);
  });

  try {
    fs.copyFileSync(mainPath, fallbackPath);
  } catch (copyErr) {
    // Continue if copy fails
  }

  const pdfUrl = `/uploads/certificates/${fileName}`;

  if (certificate) {
    certificate.pdfUrl = pdfUrl;
    return await certificate.save();
  }

  certificate = new Certificate({
    businessId,
    courseId,
    pdfUrl,
    certificateNumber,
  });

  return await certificate.save();
};

export const getBusinessCertificates = async (businessId) => {
  return await Certificate.find({ businessId }).populate("courseId", "title scope");
};

export const regenerateAllCertificates = async () => {
  const certificates = await Certificate.find();
  const results = [];
  for (const cert of certificates) {
    try {
      const updated = await generateCertificate(cert.businessId, cert.courseId, { force: true });
      results.push({ id: cert._id, number: cert.certificateNumber, status: "success" });
    } catch (err) {
      results.push({ id: cert._id, number: cert.certificateNumber, status: "error", error: err.message });
    }
  }
  return results;
};
