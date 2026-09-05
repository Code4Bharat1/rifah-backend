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
    return `conv_${sorted[0]}_${sorted[1]}`;
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

    const conversationId = messageService.getConversationId(senderId, recipientId);

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
      .populate("recipient", "name email avatar role")
      .populate("enquiry", "referenceId title");

    // Real-time socket emission to recipient and sender
    emitToUser(recipientId, "receive_message", populated);
    emitToUser(recipientId, "update_conversations", populated);
    emitToUser(senderId, "update_conversations", populated);

    // Persistent in-app notification for recipient
    try {
      const isBiz = recipient.role === "business" || Boolean(await import("../businesses/business.model.js").then(m => m.Business.findOne({ owner: recipientId })));
      await notificationService.createNotification({
        recipientId: recipientId,
        type: "Message",
        title: "New Message",
        body: `You received a new message from ${populated.sender?.name || 'a member'}`,
        entityId: message._id,
        link: isBiz ? `/biz/messages?userId=${senderId}` : `/me/messages?userId=${senderId}`
      });
    } catch (err) {
      console.error("Failed to create message notification:", err);
    }

    return populated;
  },

  /**
   * List messages in a conversation
   * HIGH SECURITY: Strictly restricts retrieved messages to the two participants.
   */
  getConversationMessages: async (otherUserId, currentUserId, enquiryId = "") => {
    const sorted = [String(currentUserId), String(otherUserId)].sort();
    const baseConvId = `conv_${sorted[0]}_${sorted[1]}`;

    // Security check: only messages where currentUserId is sender or recipient with otherUserId
    const messages = await Message.find({
      $or: [
        { conversationId: baseConvId },
        { conversationId: new RegExp(`^${baseConvId}`) },
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId },
      ],
    })
      .populate("sender", "name avatar role")
      .populate("recipient", "name avatar role")
      .populate("enquiry", "referenceId title")
      .sort({ createdAt: 1 });

    // Mark received messages as read
    await Message.updateMany(
      { recipient: currentUserId, sender: otherUserId, isRead: false },
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
      const senderId = String(msg.sender?._id || msg.sender || "");
      const recipientId = String(msg.recipient?._id || msg.recipient || "");
      const isSentByMe = senderId === String(currentUserId);
      const otherUser = isSentByMe ? msg.recipient : msg.sender;
      if (!otherUser) continue;

      const otherUserId = String(otherUser._id || otherUser);
      const pairKey = [String(currentUserId), otherUserId].sort().join("_");

      if (!conversationMap.has(pairKey)) {
        conversationMap.set(pairKey, {
          conversationId: msg.conversationId,
          lastMessage: { body: msg.text, text: msg.text },
          lastMessageAt: msg.createdAt,
          isRead: msg.isRead || isSentByMe,
          unreadCount: 0,
          otherUser,
          enquiry: msg.enquiry,
        });
      }

      // If message was received by current user and is unread, increment unreadCount
      if (recipientId === String(currentUserId) && !msg.isRead) {
        const conv = conversationMap.get(pairKey);
        if (conv) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
          conv.isRead = false;
        }
      }
    }

    return Array.from(conversationMap.values());
  },
};
