import { stateService } from "./state.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const stateController = {
  uploadImage: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.badRequest(res, "No image file provided");
    }
    const url = await storageService.uploadFile(req.file, "states");
    return ApiResponse.success(res, { url }, "Image uploaded successfully");
  }),

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
      summary: `Allocated state ${admin.state} to State Admin: ${admin.name} (${admin.email})`,
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

  updateState: asyncHandler(async (req, res) => {
    const { stateName } = req.params;
    const { newStateName } = req.body;
    const decodedState = decodeURIComponent(stateName);
    const result = await stateService.updateState(decodedState, newStateName);
    
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "State",
      targetId: null,
      summary: `Renamed state ${decodedState} to ${newStateName}`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, result, "State renamed successfully across all records");
  }),

  deleteState: asyncHandler(async (req, res) => {
    const { stateName } = req.params;
    const decodedState = decodeURIComponent(stateName);
    const result = await stateService.deleteState(decodedState);
    
    await auditService.logAction({
      actor: req.user,
      action: "DELETE",
      targetModel: "State",
      targetId: null,
      summary: `Deleted state ${decodedState} (Detached all related records to Unassigned)`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, result, "State deleted and detached from all related records");
  }),

  updateStateProfile: asyncHandler(async (req, res) => {
    const { stateName } = req.params;
    const decodedState = decodeURIComponent(stateName);
    const result = await stateService.updateStateProfile(decodedState, req.body);
    
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "StateProfile",
      targetId: result._id,
      summary: `Updated state profile for ${decodedState}`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, result, "State profile updated successfully");
  }),
};

export default stateController;
