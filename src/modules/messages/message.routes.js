import { Router } from "express";
import { messageController } from "./message.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateSendMessage } from "./message.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

import { upload } from "../../middleware/upload.middleware.js";

const router = Router();

router.get("/conversations", authMiddleware, messageController.listConversations);
router.get("/conversation/:otherUserId", authMiddleware, validateObjectIdParam("otherUserId"), messageController.getConversation);
router.get("/user/:otherUserId", authMiddleware, validateObjectIdParam("otherUserId"), messageController.getConversation);
router.post("/upload", authMiddleware, upload.single("attachment"), messageController.uploadAttachment);
router.post("/", authMiddleware, validateRequest(validateSendMessage), messageController.sendMessage);

export { router as messageRoutes };
export default router;
