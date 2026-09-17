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
        link: `/biz/messages?userId=${senderId}`
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
      .populate("sender", "name email phone avatar role whatsapp")
      .populate("recipient", "name email phone avatar role whatsapp")
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

    const conversations = Array.from(conversationMap.values());
    const otherUserIds = conversations.map((c) => String(c.otherUser?._id || c.otherUser)).filter(Boolean);

    if (otherUserIds.length > 0) {
      try {
        const { Business } = await import("../businesses/business.model.js");
        const businesses = await Business.find({ owner: { $in: otherUserIds } })
          .select("name phone email whatsapp whatsappNumber owner")
          .lean();
        const bizMap = new Map(businesses.map((b) => [String(b.owner), b]));

        conversations.forEach((c) => {
          const uid = String(c.otherUser?._id || c.otherUser);
          const biz = bizMap.get(uid);
          const userObj = c.otherUser && typeof c.otherUser.toObject === "function"
            ? c.otherUser.toObject()
            : (c.otherUser || {});

          c.otherUser = {
            ...userObj,
            businessName: biz?.name || userObj.name || "",
            phone: biz?.phone || userObj.phone || "",
            email: userObj.email || biz?.email || "",
            whatsapp: biz?.whatsapp || biz?.whatsappNumber || userObj.whatsapp || userObj.phone || biz?.phone || "",
          };
        });
      } catch (bizErr) {
        console.warn("Failed to enrich conversations with business contact info:", bizErr);
      }
    }

    return conversations;
  },

  /**
   * Get direct contact info (Email, Phone, WhatsApp) for a specific user and their business
   */
  getUserContact: async (userId) => {
    const { User } = await import("../users/user.model.js");
    const { Business } = await import("../businesses/business.model.js");

    const [user, business] = await Promise.all([
      User.findById(userId).select("name email phone whatsapp avatar role").lean(),
      Business.findOne({ owner: userId }).select("name phone email whatsapp whatsappNumber").lean(),
    ]);

    const resolvedEmail = user?.email || business?.email || "";
    const resolvedPhone = business?.phone || user?.phone || "";
    const resolvedWhatsapp = business?.whatsapp || business?.whatsappNumber || user?.whatsapp || business?.phone || user?.phone || "";

    return {
      _id: userId,
      name: user?.name || business?.name || "Member",
      businessName: business?.name || "",
      email: resolvedEmail,
      phone: resolvedPhone,
      whatsapp: resolvedWhatsapp,
      role: user?.role || "member",
    };
  },
};
