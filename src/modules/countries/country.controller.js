import { countryService } from "./country.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const countryController = {
  listCountries: asyncHandler(async (req, res) => {
    const countries = await countryService.listCountries(req.query);
    return ApiResponse.success(res, countries, "Countries retrieved");
  }),

  getCountryById: asyncHandler(async (req, res) => {
    const country = await countryService.getCountryById(req.params.id);
    return ApiResponse.success(res, country, "Country retrieved");
  }),

  getCountryByName: asyncHandler(async (req, res) => {
    const country = await countryService.getCountryByName(
      req.params.countryName,
    );
    return ApiResponse.success(res, country, "Country retrieved");
  }),

  createCountry: asyncHandler(async (req, res) => {
    const created = await countryService.createCountry(req.body);
    return ApiResponse.created(res, created, "Country created successfully");
  }),

  assignCountryAdmin: asyncHandler(async (req, res) => {
    const assigned = await countryService.assignCountryAdmin(req.body);
    return ApiResponse.success(
      res,
      assigned,
      "Country admin assigned successfully",
    );
  }),

  removeCountryAdmin: asyncHandler(async (req, res) => {
    const removed = await countryService.removeCountryAdmin(
      req.params.countryName,
    );
    return ApiResponse.success(
      res,
      removed,
      "Country admin removed successfully",
    );
  }),

  updateCountry: asyncHandler(async (req, res) => {
    const updated = await countryService.updateCountry(
      req.params.id,
      req.body,
      req.user,
    );
    return ApiResponse.success(res, updated, "Country updated successfully");
  }),

  updateCountryByName: asyncHandler(async (req, res) => {
    const updated = await countryService.updateCountryByName(
      req.params.countryName,
      req.body,
      req.user,
    );
    return ApiResponse.success(res, updated, "Country updated successfully");
  }),

  deleteCountry: asyncHandler(async (req, res) => {
    const identifier = req.params.id || req.params.countryName;
    const result = await countryService.deleteCountry(identifier);
    return ApiResponse.success(res, result, "Country deleted successfully");
  }),

  deleteCountryByName: asyncHandler(async (req, res) => {
    const identifier = req.params.countryName || req.params.id;
    const result = await countryService.deleteCountry(identifier);
    return ApiResponse.success(res, result, "Country deleted successfully");
  }),
};
