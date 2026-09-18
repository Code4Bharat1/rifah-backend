import { powerNetworkingService } from "./power-networking.service.js";
import { Business } from "../businesses/business.model.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";
import { ForbiddenError } from "../../shared/errors/errors.js";

async function getAuthBusinessId(req) {
  if (req.user?.businessId) return req.user.businessId;
  const biz = await Business.findOne({ owner: req.user.id }).select("_id");
  if (!biz) {
    throw new ForbiddenError("Active business profile required to access Power Networking");
  }
  return biz._id;
}

export const powerNetworkingController = {
  getStats: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const stats = await powerNetworkingService.getDashboardStats(businessId);
    return ApiResponse.success(res, stats, "Power Networking dashboard statistics retrieved");
  }),

  createRequirement: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const requirement = await powerNetworkingService.createRequirement(req.body, req.user, businessId);

    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "PowerRequirement",
      targetId: requirement._id,
      summary: `Created Power Networking requirement: ${requirement.title}`,
      ipAddress: req.ip,
    });

    return ApiResponse.created(res, requirement, "Business requirement posted successfully");
  }),

  getRequirements: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.getRequirements(businessId, req.query);
    return ApiResponse.success(res, result.requirements, "Requirements retrieved", 200, result.pagination);
  }),

  getRequirementById: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const requirement = await powerNetworkingService.getRequirementById(req.params.id, businessId);
    return ApiResponse.success(res, requirement, "Requirement retrieved");
  }),

  getRequirementMatches: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const matches = await powerNetworkingService.findMatchesForRequirement(req.params.id, businessId, req.query);
    return ApiResponse.success(res, matches, "Matching businesses retrieved", 200, matches.pagination);
  }),

  discoverBusinesses: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.discoverBusinesses(businessId, req.query);
    return ApiResponse.success(res, result.businesses, "Discover businesses retrieved", 200, result.pagination);
  }),

  getMyNetwork: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.getMyPowerNetwork(businessId, req.query);
    return ApiResponse.success(res, result.businesses, "My Power Network retrieved", 200, result.pagination);
  }),

  removeFromNetwork: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const { id } = req.params;
    const result = await powerNetworkingService.removeFromPowerNetwork(id, businessId);

    await auditService.logAction({
      actor: req.user,
      action: "DELETE",
      targetModel: "PowerConnection",
      targetId: id,
      summary: "Removed business from Power Network",
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, result, "Business removed from Power Network successfully");
  }),

  requestQuote: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.requestQuoteFromPartner({
      requesterBusinessId: businessId,
      requesterUserId: req.user.id,
      targetBusinessId: req.body.targetBusinessId,
      productService: req.body.productService,
      quantity: req.body.quantity,
      requirementId: req.body.requirementId,
      note: req.body.note,
      budget: req.body.budget,
      requiredBy: req.body.requiredBy,
    });

    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "PowerConnection",
      summary: `Sent quote request to ${result.targetBusiness} for ${req.body.productService}`,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, result, "Quotation request sent successfully");
  }),

  sendConnectionRequest: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const connection = await powerNetworkingService.sendConnectionRequest({
      requesterBusinessId: businessId,
      requesterUserId: req.user.id,
      receiverBusinessId: req.body.receiverBusinessId,
      requirementId: req.body.requirementId,
      message: req.body.message,
    });

    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "PowerConnection",
      targetId: connection._id,
      summary: `Sent connection request to ${connection.receiverBusiness?.name || "a business"}`,
      ipAddress: req.ip,
    });

    return ApiResponse.created(res, connection, "Connection request sent successfully");
  }),

  respondToRequest: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const { id } = req.params;
    const { action } = req.body; // 'accept' | 'decline'

    const connection = await powerNetworkingService.respondToConnectionRequest(id, action, req.user.id, businessId);

    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "PowerConnection",
      targetId: connection._id,
      summary: `${action === "accept" ? "Accepted" : "Declined"} connection request from ${connection.requesterBusiness?.name || "a business"}`,
      ipAddress: req.ip,
    });

    return ApiResponse.success(
      res,
      connection,
      action === "accept" ? "Connection request accepted successfully" : "Connection request declined"
    );
  }),

  cancelRequest: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const { id } = req.params;
    const result = await powerNetworkingService.cancelConnectionRequest(id, req.user.id, businessId);
    return ApiResponse.success(res, result, "Connection request cancelled successfully");
  }),

  getConnections: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.getConnections(businessId, req.query);
    return ApiResponse.success(res, result.businesses || result.connections, "Connections retrieved", 200, result.pagination);
  }),

  getRequests: asyncHandler(async (req, res) => {
    const businessId = await getAuthBusinessId(req);
    const result = await powerNetworkingService.getRequests(businessId, req.query);
    return ApiResponse.success(res, { requests: result.requests, counts: result.counts }, "Requests retrieved", 200, result.pagination);
  }),
};
