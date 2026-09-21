import { Router } from "express";
import { galleryController } from "./gallery.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

const router = Router();

// Every chamber member can browse the galleries their chapter/state/central scope allows.
router.get("/folders", authMiddleware, galleryController.listFolders);

router.get(
  "/folders/:eventId",
  authMiddleware,
  validateObjectIdParam("eventId"),
  galleryController.getFolder
);

// Upload is gated inside the service: only the event's assigned media team or an admin.
router.post(
  "/folders/:eventId/media",
  authMiddleware,
  validateObjectIdParam("eventId"),
  upload.array("media", 12),
  galleryController.addMedia
);

router.delete(
  "/media/:mediaId",
  authMiddleware,
  validateObjectIdParam("mediaId"),
  galleryController.removeMedia
);

export { router as galleryRoutes };
export default router;
