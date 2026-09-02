/**
 * Pure Node.js PDF Generator for RIFAH Official Invoices matching Image 2 Format
 */

export function generateInvoicePdfBuffer({
  invoiceNumber,
  paidAt,
  name,
  businessName,
  planName,
  amount,
  transactionId,
  paymentMethod,
}) {
  const formattedDate = new Date(paidAt || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const rawAmountNum = Number(amount || 0);
  const formattedAmount = `Rs. ${rawAmountNum.toLocaleString("en-IN")}`;
  const cleanPlan = (planName || "Membership Subscription").replace(/subscription/i, "").trim().toUpperCase();
  const title = `${cleanPlan} Membership Subscription`;

  // Standard PDF 1.4 Vector PDF Output matching Image 2
  const pdfString = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 595 842]
  /Resources <<
    /Font <<
      /F1 4 0 R
      /F2 5 0 R
    >>
  >>
  /Contents 6 0 R
>>
endobj
4 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
>>
endobj
5 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
>>
endobj
6 0 obj
<<
  /Length 3200
>>
stream
q
% Top Decorative Gradient Bar (Red & Blue)
0.86 0.15 0.15 rg 30 822 268 4 re f
0.14 0.38 0.85 rg 298 822 267 4 re f

% Official RIFAH Logo Icon Graphic (Red & Blue Vector Mark)
% Blue R Arc
0.14 0.38 0.85 rg
35 770 m 65 770 l 85 770 95 780 95 792 c 95 805 85 812 65 812 c 35 812 l 35 770 l f
1 1 1 rg
45 780 m 62 780 l 75 780 82 786 82 792 c 82 798 75 802 62 802 c 45 802 l 45 780 l f

% Red A Leg
0.86 0.15 0.15 rg
35 750 m 50 782 l 65 750 l 55 750 l 50 762 l 45 750 l 35 750 l f

% RIFAH Text Brand Header
0.06 0.12 0.22 rg
BT /F2 15 Tf 105 795 Td (RIFAH) Tj ET
0.86 0.15 0.15 rg
BT /F2 15 Tf 158 795 Td (Chamber) Tj ET
0.06 0.12 0.22 rg
BT /F1 10 Tf 105 780 Td (Of Commerce And Industry) Tj ET
0.40 0.45 0.50 rg
BT /F1 8 Tf 105 766 Td (Chamber of Commerce & Business Network) Tj ET

% Right Invoice Title & Metadata
0.06 0.12 0.22 rg
BT /F2 18 Tf 395 795 Td (OFFICIAL INVOICE) Tj ET
0.01 0.52 0.80 rg
BT /F2 13 Tf 440 778 Td (# ${invoiceNumber}) Tj ET
0.40 0.45 0.50 rg
BT /F1 10 Tf 430 762 Td (Issued: ${formattedDate}) Tj ET

% Horizontal Divider Line
0.88 0.90 0.94 rg 30 742 535 1 re f

% BILLED TO Box (Left)
0.97 0.98 0.99 rg 30 635 255 90 re f
0.88 0.90 0.94 RG 1 w 30 635 255 90 re S
0.01 0.52 0.80 rg BT /F2 9 Tf 45 704 Td (BILLED TO) Tj ET
0.06 0.09 0.16 rg BT /F2 13 Tf 45 678 Td (${(name || "Member User").slice(0, 28)}) Tj ET
0.40 0.45 0.50 rg BT /F1 10 Tf 45 658 Td (${(businessName || "Member Business").slice(0, 32)}) Tj ET

% PAYMENT DETAILS Box (Right)
0.97 0.98 0.99 rg 310 635 255 90 re f
0.88 0.90 0.94 RG 1 w 310 635 255 90 re S
0.01 0.52 0.80 rg BT /F2 9 Tf 325 704 Td (PAYMENT DETAILS) Tj ET
0.40 0.45 0.50 rg BT /F1 10 Tf 325 682 Td (Status:) Tj ET
0.09 0.60 0.35 rg BT /F2 10 Tf 365 682 Td ([ PAID & VERIFIED ]) Tj ET
0.40 0.45 0.50 rg BT /F1 9 Tf 325 662 Td (Transaction ID: ${(transactionId || "pay_ONLINE").slice(0, 24)}) Tj ET
0.40 0.45 0.50 rg BT /F1 9 Tf 325 646 Td (Payment Method: ${paymentMethod || "Razorpay Online Payment"}) Tj ET

% DESCRIPTION / PURPOSE Items Table Header Box
0.06 0.12 0.22 rg 30 580 535 32 re f
1 1 1 rg BT /F2 9 Tf 45 592 Td (DESCRIPTION / PURPOSE) Tj ET
1 1 1 rg BT /F2 9 Tf 430 592 Td (QTY) Tj ET
1 1 1 rg BT /F2 9 Tf 490 592 Td (AMOUNT) Tj ET

% Items Table Body Row
0.98 0.99 1.00 rg 30 518 535 58 re f
0.88 0.90 0.94 RG 1 w 30 518 535 58 re S
0.06 0.09 0.16 rg BT /F2 11 Tf 45 552 Td (${title.slice(0, 42)}) Tj ET
0.40 0.45 0.50 rg BT /F1 9 Tf 45 534 Td (RIFAH Connect Member Services & Tier Access) Tj ET
0.06 0.09 0.16 rg BT /F1 11 Tf 438 548 Td (1) Tj ET
0.06 0.09 0.16 rg BT /F2 11 Tf 485 548 Td (${formattedAmount}) Tj ET

% Green Verified Stamp Box (Bottom Left)
0.09 0.60 0.35 RG [3 3] 0 setdash 1.5 w 40 432 185 50 re S [] 0 setdash
0.09 0.60 0.35 rg BT /F2 11 Tf 55 458 Td (PAID & VERIFIED) Tj ET
0.09 0.60 0.35 rg BT /F1 8 Tf 50 442 Td (RIFAH CONNECT TREASURY) Tj ET

% Summary Card (Bottom Right)
0.97 0.98 0.99 rg 325 412 240 86 re f
0.88 0.90 0.94 RG 1 w 325 412 240 86 re S
0.40 0.45 0.50 rg BT /F1 10 Tf 340 472 Td (Subtotal:) Tj ET
0.06 0.09 0.16 rg BT /F1 10 Tf 475 472 Td (${formattedAmount}) Tj ET
0.40 0.45 0.50 rg BT /F1 10 Tf 340 452 Td (Taxes / Fees:) Tj ET
0.40 0.45 0.50 rg BT /F1 10 Tf 475 452 Td (Included) Tj ET
0.88 0.90 0.94 rg 340 442 210 1 re f
0.06 0.09 0.16 rg BT /F2 13 Tf 340 424 Td (Total Paid:) Tj ET
0.01 0.52 0.80 rg BT /F2 13 Tf 465 424 Td (${formattedAmount}) Tj ET

% Horizontal Divider
0.88 0.90 0.94 rg 30 375 535 1 re f

% Footer Note
0.06 0.09 0.16 rg BT /F2 10 Tf 135 348 Td (Thank you for being a valued member of RIFAH Connect) Tj ET
0.50 0.55 0.60 rg BT /F1 8 Tf 120 332 Td (This is a computer-generated tax receipt and requires no physical signature.) Tj ET
0.01 0.52 0.80 rg BT /F1 9 Tf 190 314 Td (www.rifah.org - Chamber Desk Invoicing) Tj ET

Q
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000264 00000 n 
0000000335 00000 n 
0000000411 00000 n 
trailer
<<
  /Size 7
  /Root 1 0 R
>>
startxref
3680
%%EOF`;

  return Buffer.from(pdfString, "utf-8");
}
