import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { userRoutes } from "../modules/users/user.routes.js";
import { businessRoutes } from "../modules/businesses/business.routes.js";
import { categoryRoutes } from "../modules/categories/category.routes.js";
import { chapterRoutes } from "../modules/chapters/chapter.routes.js";
import { verificationRoutes } from "../modules/verification/verification.routes.js";
import { catalogueRoutes } from "../modules/catalogue/catalogue.routes.js";
import { enquiryRoutes } from "../modules/enquiries/enquiry.routes.js";
import { leadRoutes } from "../modules/leads/lead.routes.js";
import { membershipRoutes } from "../modules/memberships/membership.routes.js";
import { paymentRoutes } from "../modules/payments/payment.routes.js";
import { messageRoutes } from "../modules/messages/message.routes.js";
import { notificationRoutes } from "../modules/notifications/notification.routes.js";
import { eventRoutes } from "../modules/events/event.routes.js";
import { reviewRoutes } from "../modules/reviews/review.routes.js";
import { reportRoutes } from "../modules/reports/report.routes.js";
import { auditRoutes } from "../modules/audit/audit.routes.js";

const apiRouter = Router();

// Base health route
apiRouter.use("/health", healthRoutes);

// Modular Monolith Domain Routes
apiRouter.use("/auth", authRoutes);
apiRouter.use("/users", userRoutes);
apiRouter.use("/businesses", businessRoutes);
apiRouter.use("/categories", categoryRoutes);
apiRouter.use("/chapters", chapterRoutes);
apiRouter.use("/verification", verificationRoutes);
apiRouter.use("/catalogue", catalogueRoutes);
apiRouter.use("/enquiries", enquiryRoutes);
apiRouter.use("/leads", leadRoutes);
apiRouter.use("/memberships", membershipRoutes);
apiRouter.use("/payments", paymentRoutes);
apiRouter.use("/messages", messageRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/events", eventRoutes);
apiRouter.use("/reviews", reviewRoutes);
apiRouter.use("/reports", reportRoutes);
apiRouter.use("/audit", auditRoutes);

export { apiRouter };
export default apiRouter;
