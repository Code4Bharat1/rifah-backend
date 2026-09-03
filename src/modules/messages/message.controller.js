import { messageService } from "./message.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const messageController = {
  sendMessage: asyncHandler(async (req, res) => {
    const message = await messageService.sendMessage(req.body, req.user.id);
    return ApiResponse.created(res, message, "Message sent successfully");
  }),

  getConversation: asyncHandler(async (req, res) => {
    const { otherUserId } = req.params;
    const { enquiryId } = req.query;
    const messages = await messageService.getConversationMessages(
      otherUserId,
      req.user.id,
      enquiryId
    );
    return ApiResponse.success(res, messages, "Conversation messages retrieved");
  }),

  listConversations: asyncHandler(async (req, res) => {
    const conversations = await messageService.listUserConversations(req.user.id);
    return ApiResponse.success(res, conversations, "User conversations retrieved");
  }),

  uploadAttachment: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No attachment file uploaded", 400);
    }
    const fileUrl = `/uploads/attachments/${req.file.filename}`;
    return ApiResponse.success(
      res,
      {
        fileUrl,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      "Attachment uploaded successfully"
    );
  }),
};
