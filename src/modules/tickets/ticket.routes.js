import { Router } from "express";
import { ticketController } from "./ticket.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";

const router = Router();

// All ticket endpoints require authenticated sessions
router.use(authMiddleware);

// Photo upload route for tickets
router.post(
  "/upload",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  ticketController.uploadPhoto
);

// Core CRUD and messaging routes
router.post("/", ticketController.create);
router.get("/", ticketController.list);
router.get("/:id", ticketController.getById);
router.post("/:id/messages", ticketController.addMessage);

// Multi-tier lifecycle action routes
router.post("/:id/escalate", ticketController.escalate);
router.post("/:id/resolve", ticketController.resolve);
router.post("/:id/close", ticketController.close);

export { router as ticketRoutes };
export default router;
