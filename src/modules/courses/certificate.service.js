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

  // Double Border with Corner Accents (Matching official RIFAH certificate)
  const outerMargin = 28;
  doc.rect(outerMargin, outerMargin, width - outerMargin * 2, height - outerMargin * 2)
     .lineWidth(3.5)
     .stroke(accentColor);

  const innerMargin = 35;
  doc.rect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2)
     .lineWidth(1)
     .stroke(accentColor);

  // 4 Corner Brackets
  const cornerSize = 22;
  const drawCorner = (x, y, dx, dy) => {
    doc.moveTo(x + dx, y)
       .lineTo(x, y)
       .lineTo(x, y + dy)
       .lineWidth(2.5)
       .stroke(accentColor);
  };
  drawCorner(innerMargin - 4, innerMargin - 4, cornerSize, cornerSize); // Top-Left
  drawCorner(width - innerMargin + 4, innerMargin - 4, -cornerSize, cornerSize); // Top-Right
  drawCorner(innerMargin - 4, height - innerMargin + 4, cornerSize, -cornerSize); // Bottom-Left
  drawCorner(width - innerMargin + 4, height - innerMargin + 4, -cornerSize, -cornerSize); // Bottom-Right

  // Logo
  let logoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
  if (!fs.existsSync(logoPath)) {
    logoPath = path.resolve(process.cwd(), "public", "rifah-logo.png");
  }
  if (fs.existsSync(logoPath)) {
    const logoWidth = 145;
    doc.image(logoPath, (width - logoWidth) / 2, 50, { width: logoWidth });
  }

  // Heading: CERTIFICATE
  doc.fontSize(40)
     .fillColor(accentColor)
     .font("Times-Bold")
     .text("CERTIFICATE", 0, 138, { align: "center", characterSpacing: 6 });

  // Subtitle: OF COMPLETION
  doc.fontSize(13)
     .fillColor("#475569")
     .font("Helvetica")
     .text("OF COMPLETION", 0, 186, { align: "center", characterSpacing: 4 });

  // Italic: This is proudly presented to
  doc.fontSize(13.5)
     .fillColor("#64748B")
     .font("Times-Italic")
     .text("This is proudly presented to", 0, 222, { align: "center" });

  // Recipient Name
  const recipientName = business.owner?.name || business.contactPerson || business.name || "Member";
  doc.fontSize(38)
     .fillColor("#0F172A")
     .font("Times-Bold")
     .text(recipientName, 0, 248, { align: "center" });

  // Underline Accent Rule
  const ruleWidth = 320;
  doc.moveTo((width - ruleWidth) / 2, 298)
     .lineTo((width + ruleWidth) / 2, 298)
     .lineWidth(1)
     .stroke("#CBD5E1");

  // Achievement Reason
  doc.fontSize(13)
     .fillColor("#475569")
     .font("Helvetica")
     .text("For successfully completing all modules, practical curriculum, and requirements of", 0, 314, { align: "center" });

  // Format Course Title in Clean Title Case
  const formatTitle = (str) => {
    if (!str) return "Executive Training Course";
    return str
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  const formattedCourseTitle = formatTitle(course.title);
  doc.fontSize(20)
     .fillColor("#0F172A")
     .font("Helvetica-Bold")
     .text(formattedCourseTitle, 0, 334, { align: "center" });

  // Course Track, Scope & Modules Information
  let scopeLabel = "Central Chamber National Leadership Program";
  if (course.scope === "state") {
    scopeLabel = course.state ? `${course.state} State Executive Curriculum` : "State Executive Curriculum";
  } else if (course.scope === "chapter") {
    scopeLabel = business.chapter ? `${business.chapter} Chapter Leadership Training` : "Chapter Administration & Executive Development Program";
  } else if (course.scope === "centre") {
    scopeLabel = "Central Chamber National Leadership Program";
  }

  const moduleCount = course.chapters?.length || 1;
  const courseInfoText = `Curriculum Track: ${scopeLabel} • ${moduleCount} Module${moduleCount > 1 ? "s" : ""} Completed`;

  doc.fontSize(11)
     .fillColor(accentColor)
     .font("Helvetica-Bold")
     .text(courseInfoText, 0, 360, { align: "center" });

  // Business Name Attribution
  if (business.name && business.name.toLowerCase() !== recipientName.toLowerCase()) {
    doc.fontSize(12.5)
       .fillColor("#475569")
       .font("Helvetica")
       .text(`Representing Enterprise: ${business.name}`, 0, 380, { align: "center" });
  }

  // Realistic cursive handwritten signatures
  const leftSigIdx = Math.floor(Math.random() * SIGNATURE_PRESETS.length);
  const rightSigIdx = (leftSigIdx + 1 + Math.floor(Math.random() * (SIGNATURE_PRESETS.length - 1))) % SIGNATURE_PRESETS.length;
  const leftSig = SIGNATURE_PRESETS[leftSigIdx];
  const rightSig = SIGNATURE_PRESETS[rightSigIdx];

  // Signatures
  const sigY = 460;
  const sigLineWidth = 180;

  // Left Signatory (Chapter President / Chapter Authority)
  const leftX = 140;

  // Render Left Handwritten Signature above line
  doc.save();
  doc.translate(leftX - 8, sigY - 48);
  doc.scale(0.92);
  doc.path(leftSig.path)
     .lineWidth(1.9)
     .strokeColor(leftSig.color || "#0f2942")
     .stroke();
  doc.restore();

  doc.moveTo(leftX, sigY)
     .lineTo(leftX + sigLineWidth, sigY)
     .lineWidth(1)
     .stroke("#94A3B8");

  doc.fontSize(11)
     .fillColor("#0F172A")
     .font("Helvetica-Bold")
     .text(business.chapter ? `${business.chapter} Chapter` : "RIFAH Chamber", leftX, sigY + 8, { width: sigLineWidth, align: "center" });

  doc.fontSize(9.5)
     .fillColor("#64748B")
     .font("Helvetica")
     .text("CHAPTER PRESIDENT", leftX, sigY + 22, { width: sigLineWidth, align: "center", characterSpacing: 1 });

  // Right Signatory (Director / Central Secretariat)
  const rightX = width - 140 - sigLineWidth;

  // Render Right Handwritten Signature above line
  doc.save();
  doc.translate(rightX - 8, sigY - 48);
  doc.scale(0.92);
  doc.path(rightSig.path)
     .lineWidth(1.9)
     .strokeColor(rightSig.color || "#1e3a8a")
     .stroke();
  doc.restore();

  doc.moveTo(rightX, sigY)
     .lineTo(rightX + sigLineWidth, sigY)
     .lineWidth(1)
     .stroke("#94A3B8");

  doc.fontSize(11)
     .fillColor("#0F172A")
     .font("Helvetica-Bold")
     .text("RIFAH Central HQ", rightX, sigY + 8, { width: sigLineWidth, align: "center" });

  doc.fontSize(9.5)
     .fillColor("#64748B")
     .font("Helvetica")
     .text("DIRECTOR GENERAL", rightX, sigY + 22, { width: sigLineWidth, align: "center", characterSpacing: 1 });

  // Footer
  const footerY = 530;
  doc.fontSize(9)
     .fillColor("#94A3B8")
     .font("Helvetica")
     .text(`ID: ${certificateNumber}`, innerMargin + 15, footerY);

  doc.fontSize(9.5)
     .fillColor("#94A3B8")
     .font("Helvetica")
     .text("RIFAH Chamber of Commerce and Industry", 0, footerY, { align: "center" });

  const formattedDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  doc.fontSize(9)
     .fillColor("#94A3B8")
     .font("Helvetica")
     .text(`Issued: ${formattedDate}`, width - innerMargin - 125, footerY, { width: 110, align: "right" });

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
