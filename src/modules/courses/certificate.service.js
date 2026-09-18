import PDFDocument from "pdfkit";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { Course } from "./course.model.js";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export const generateCertificate = async (businessId, courseId) => {
  const business = await Business.findById(businessId);
  const course = await Course.findById(courseId);
  
  if (!business || !course) throw new Error("Invalid business or course for certificate");

  // Check if certificate already exists
  const existing = await Certificate.findOne({ businessId, courseId });
  if (existing) return existing;

  const certificateNumber = `CERT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const fileName = `${certificateNumber}.pdf`;
  const pdfPath = path.join(process.cwd(), 'public', 'uploads', 'certificates', fileName);
  
  // Ensure directory exists
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

  const doc = new PDFDocument({
    layout: 'landscape',
    size: 'A4',
  });

  doc.pipe(fs.createWriteStream(pdfPath));

  // PDF Design
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff');

  doc.fontSize(40).fillColor('#333').text('Certificate of Completion', { align: 'center', y: 150 });
  doc.moveDown(1);
  doc.fontSize(20).text('This is to certify that', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(30).fillColor('#0056b3').text(business.name, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(20).fillColor('#333').text('has successfully completed the course', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(25).text(course.title, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(15).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.fontSize(15).text(`Certificate Number: ${certificateNumber}`, { align: 'center' });

  doc.end();

  const pdfUrl = `/uploads/certificates/${fileName}`; 

  const certificate = new Certificate({
    businessId,
    courseId,
    pdfUrl,
    certificateNumber
  });

  return await certificate.save();
};

export const getBusinessCertificates = async (businessId) => {
  return await Certificate.find({ businessId }).populate('courseId', 'title scope');
};
