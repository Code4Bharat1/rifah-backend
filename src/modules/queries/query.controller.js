import { queryService } from "./query.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const queryController = {
  create: asyncHandler(async (req, res) => {
    const query = await queryService.create(req.body);
    res.status(201).json({
      success: true,
      data: query,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const result = await queryService.list(req.query, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  }),

  reply: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { replyMessage } = req.body;
    
    if (!replyMessage) {
      return res.status(400).json({ success: false, message: "replyMessage is required" });
    }

    const query = await queryService.reply(id, replyMessage, req.user);
    res.status(200).json({
      success: true,
      data: query,
    });
  }),
};
