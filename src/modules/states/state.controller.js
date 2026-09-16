import { stateService } from "./state.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";

export const stateController = {
  listStates: asyncHandler(async (req, res) => {
    const states = await stateService.listStates(req.user);
    return ApiResponse.success(res, states, "States retrieved successfully");
  }),

  getStateByName: asyncHandler(async (req, res) => {
    const { stateName } = req.params;
    const stateData = await stateService.getStateByName(decodeURIComponent(stateName), req.user);
    return ApiResponse.success(res, stateData, "State details retrieved successfully");
  }),

  assignStateAdmin: asyncHandler(async (req, res) => {
    const admin = await stateService.assignStateAdmin(req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "User",
      targetId: admin._id,
      summary: `Allocated state ${req.body.state} to State Admin: ${admin.name} (${admin.email})`,
      ipAddress: req.ip,
    });
    return ApiResponse.created(res, admin, "State Admin allocated successfully. Email invitation sent.");
  }),

  removeStateAdmin: asyncHandler(async (req, res) => {
    const { stateName } = req.params;
    const decodedState = decodeURIComponent(stateName);
    const removedAdmin = await stateService.removeStateAdmin(decodedState);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "User",
      targetId: removedAdmin._id,
      summary: `Revoked State Admin access for state: ${decodedState}`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, removedAdmin, "State Admin revoked successfully");
  }),
};

export default stateController;
