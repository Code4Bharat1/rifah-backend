import { Message } from "./message.model.js";
import { User } from "../users/user.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";

import { emitToUser } from "../../infrastructure/socket/socket.js";
import { notificationService } from "../notifications/notification.service.js";

export const messageService = {
  /**
   * Helper to derive deterministic conversationId between two user IDs
   */
  getConversationId: (user1Id, user2Id, enquiryId = "") => {
    const sorted = [String(user1Id), String(user2Id)].sort();
    return enquiryId ? `conv_${sorted[0]}_${sorted[1]}_${enquiryId}` : `conv_${sorted[0]}_${sorted[1]}`;
  },

  /**
   * Send a direct message
   */
  sendMessage: async ({ recipientId, text, body, enquiryId, attachments }, senderId) => {
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      throw new NotFoundError("Recipient user not found");
    }

    const messageContent = (text || body || "").trim();
    if (!messageContent && (!attachments || attachments.length === 0)) {
      throw new Error("Message text or file attachment is required");
    }

    const conversationId = messageService.getConversationId(senderId, recipientId, enquiryId);

    const message = await Message.create({
      conversationId,
      enquiry: enquiryId || null,
      sender: senderId,
      recipient: recipientId,
      text: messageContent || "",
      attachments: attachments || [],
    });

    const populated = await Message.findById(message._id)
      .populate("sender", "name email avatar role")
      .populate("recipient", "name email avatar role");

    // Real-time socket emission to recipient and sender
    emitToUser(recipientId, "receive_message", populated);
    emitToUser(recipientId, "update_conversations", populated);
    emitToUser(senderId, "update_conversations", populated);

    // Persistent in-app notification for recipient
    try {
      await notificationService.createNotification({
        recipientId: recipientId,
        type: "Message",
        title: "New Message",
        body: `You received a new message from ${populated.sender?.name || 'someone'}`,
        entityId: message._id,
        link: `/me/messages?userId=${senderId}`
      });
    } catch (err) {
      console.error("Failed to create message notification:", err);
    }

    return populated;
  },

  /**
   * List messages in a conversation
   */
  getConversationMessages: async (otherUserId, currentUserId, enquiryId = "") => {
    const conversationId = messageService.getConversationId(currentUserId, otherUserId, enquiryId);

    const messages = await Message.find({ conversationId })
      .populate("sender", "name avatar role")
      .populate("recipient", "name avatar role")
      .sort({ createdAt: 1 });

    // Mark received messages as read
    await Message.updateMany(
      { conversationId, recipient: currentUserId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return messages;
  },

  /**
   * List active conversations for current user
   */
  listUserConversations: async (currentUserId) => {
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
    })
      .populate("sender", "name email avatar")
      .populate("recipient", "name email avatar")
      .populate("enquiry", "referenceId title")
      .sort({ createdAt: -1 });

    const conversationMap = new Map();

    for (const msg of messages) {
      if (!conversationMap.has(msg.conversationId)) {
        const otherUser =
          String(msg.sender._id) === String(currentUserId) ? msg.recipient : msg.sender;
        conversationMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          lastMessage: { body: msg.text, text: msg.text },
          lastMessageAt: msg.createdAt,
          isRead: msg.isRead || String(msg.sender._id) === String(currentUserId),
          otherUser,
          enquiry: msg.enquiry,
        });
      }
    }

    return Array.from(conversationMap.values());
  },
};
