import { ticketService } from "./ticket.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const ticketController = {
  uploadPhoto: asyncHandler(async (req, res) => {
    const file =
      req.file ||
      (req.files &&
        (req.files.photo?.[0] || req.files.image?.[0] || req.files.file?.[0]));

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No photo file provided for upload.",
      });
    }

    const url = await storageService.uploadFile(file, "tickets");
    return res.status(200).json({
      success: true,
      message: "Photo uploaded successfully.",
      url,
      data: { url },
    });
  }),

  create: asyncHandler(async (req, res) => {
    const ticket = await ticketService.createTicket(req.user, req.body);
    res.status(201).json({
      success: true,
      message: `Support ticket ${ticket.ticketNumber} created successfully.`,
      data: ticket,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const result = await ticketService.getTickets(req.user, req.query);
    res.status(200).json({
      success: true,
      data: result.tickets,
      pagination: result.pagination,
      stats: result.stats,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const ticket = await ticketService.getTicketById(req.user, req.params.id);
    res.status(200).json({
      success: true,
      data: ticket,
    });
  }),

  addMessage: asyncHandler(async (req, res) => {
    const ticket = await ticketService.addMessage(req.user, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Message added to ticket conversation.",
      data: ticket,
    });
  }),

  escalate: asyncHandler(async (req, res) => {
    const ticket = await ticketService.escalateTicket(req.user, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: `Ticket successfully escalated to ${ticket.currentLevel} administration.`,
      data: ticket,
    });
  }),

  resolve: asyncHandler(async (req, res) => {
    const ticket = await ticketService.resolveTicket(req.user, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} marked as resolved.`,
      data: ticket,
    });
  }),

  close: asyncHandler(async (req, res) => {
    const ticket = await ticketService.closeTicket(req.user, req.params.id);
    res.status(200).json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} has been closed.`,
      data: ticket,
    });
  }),
};

export default ticketController;
