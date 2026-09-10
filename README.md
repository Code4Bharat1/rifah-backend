# 🏢 RIFAH Backend API

Comprehensive REST API backend for the **RIFAH Chamber of Commerce & Industry** Enterprise B2B Platform.

---

## 📖 Complete Project Review & Architecture
For the complete, in-depth architectural breakdown, workflows, and module documentation, refer to:
👉 **[PROJECT_REVIEW.md](../PROJECT_REVIEW.md)**

---

## 🛠️ Tech Stack & Key Services
- **Runtime & Framework:** Node.js, Express.js (ES Modules)
- **Database:** MongoDB (Mongoose ODM) with indexing & sanitization
- **Media Storage:** Cloudinary CDN streaming with local fallback
- **Payments:** Razorpay & Razorpay International (Cards, UPI, Netbanking)
- **PDF Generation:** PDFKit (Instant dynamic quotation streaming)
- **Authentication:** JWT Access & Refresh Token Rotation
- **Security:** Helmet, CORS, Rate-limiting, Mongo-sanitize, Role-based Access Control (RBAC)

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.0.0
- MongoDB instance (local or MongoDB Atlas)

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file in `rifah-backend/`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/rifah_db
JWT_SECRET=your_jwt_access_secret_key_32char
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_32char
CORS_ORIGIN=http://localhost:3000

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
```

### Running Locally
```bash
npm run dev
```
Server will start on `http://localhost:5000/api/v1`.

---

## 📑 Core Modules
- `/api/v1/auth` - Authentication & OAuth
- `/api/v1/businesses` - Business profiles, directories, logo & cover uploads
- `/api/v1/verification` - Chamber KYC verification, approval/rejection moderation
- `/api/v1/memberships` - Multi-tier plans & dynamic upgrades
- `/api/v1/payments` - Razorpay order creation & webhook verification
- `/api/v1/catalogue` - Product & service catalogue management
- `/api/v1/enquiries` & `/api/v1/leads` - B2B RFQs & PDF Quotations
- `/api/v1/events` - Chamber networking events & ticketing
- `/api/v1/messages` - Direct business-to-business messaging
- `/api/v1/chapters` - National, state, and city chapter units
- `/api/v1/audit` - Secretariat audit logging
