import { Country } from "./country.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES, isResponsibilityRole } from "../../shared/constants/roles.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/errors.js";

const escapeRegex = (value = "") =>
  String(value)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const countryService = {
  listCountries: async (filters = {}) => {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.search) {
      const search = escapeRegex(filters.search.trim());
      query.$or = [
        { name: new RegExp(search, "i") },
        { code: new RegExp(search, "i") },
      ];
    }

    return Country.find(query).sort({ name: 1 });
  },

  getCountryById: async (id) => {
    const country = await Country.findById(id);
    if (!country) throw new NotFoundError("Country not found");
    return country;
  },

  getCountryByName: async (countryName) => {
    const cleanName = String(countryName || "").trim();
    if (!cleanName) throw new BadRequestError("Country name is required");

    const country = await Country.findOne({
      name: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
    });

    if (!country) throw new NotFoundError("Country not found");
    return country;
  },

  createCountry: async (data = {}) => {
    const name = String(data.name || "").trim();
    const code = String(data.code || "")
      .trim()
      .toUpperCase();

    if (!name) throw new BadRequestError("Country name is required");
    if (!code || code.length < 2)
      throw new BadRequestError("Country code is required");

    const slug = slugify(name);
    const duplicate = await Country.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(name)}$`, "i") },
        { code: new RegExp(`^${escapeRegex(code)}$`, "i") },
        { slug },
      ],
    });

    if (duplicate) {
      throw new ConflictError(
        "Country already exists with the same name or code",
      );
    }

    return Country.create({
      name,
      code,
      slug,
      status: data.status || "Active",
    });
  },

  assignCountryAdmin: async (data = {}) => {
    const countryName = String(data.countryName || data.name || "").trim();
    if (!countryName) throw new BadRequestError("Country name is required");

    const country = await Country.findOne({
      name: new RegExp(`^${escapeRegex(countryName)}$`, "i"),
    });
    if (!country) throw new NotFoundError(`Country ${countryName} not found`);

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const phone = String(data.phone || "").trim();
    const businessId =
      data.businessId || data.business || data.business_id || null;

    let nominee = null;

    if (businessId) {
      const business = await Business.findById(businessId).populate("owner");
      if (!business) throw new NotFoundError("Business not found");
      nominee = business.owner || null;
    }

    if (!nominee && email) {
      nominee = await User.findOne({ email: email.toLowerCase() });
    }

    if (!nominee && name && email) {
      nominee = await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        role: ROLES.CUSTOMER,
        country: countryName,
      });
    }

    if (!nominee) {
      throw new BadRequestError(
        "Please select a business owner or provide a valid name and email to allocate a country admin.",
      );
    }

    if (
      isResponsibilityRole(nominee.role) &&
      nominee.role !== ROLES.COUNTRY_ADMIN
    ) {
      throw new ConflictError(
        "This member already holds another responsibility role. A second non-business responsibility role is not allowed.",
      );
    }

    const currentAdmin = await User.findOne({
      role: ROLES.COUNTRY_ADMIN,
      country: new RegExp(`^${escapeRegex(countryName)}$`, "i"),
    });

    if (currentAdmin && String(currentAdmin._id) !== String(nominee._id)) {
      currentAdmin.role = currentAdmin.previousRole || ROLES.CUSTOMER;
      currentAdmin.previousRole = "";
      currentAdmin.country = "";
      await currentAdmin.save();
    }

    if (nominee.role !== ROLES.COUNTRY_ADMIN) {
      nominee.previousRole = nominee.role;
    }

    nominee.role = ROLES.COUNTRY_ADMIN;
    nominee.country = countryName;
    await nominee.save();

    return nominee;
  },

  removeCountryAdmin: async (countryName) => {
    const cleanName = String(countryName || "").trim();
    if (!cleanName) throw new BadRequestError("Country name is required");

    const admin = await User.findOne({
      role: ROLES.COUNTRY_ADMIN,
      country: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
    });

    if (!admin)
      throw new NotFoundError(`No active Country Admin found for ${cleanName}`);

    admin.role = admin.previousRole || ROLES.CUSTOMER;
    admin.previousRole = "";
    admin.country = "";
    await admin.save();

    return admin;
  },

  updateCountry: async (id, data = {}) => {
    const country = await Country.findById(id);
    if (!country) throw new NotFoundError("Country not found");

    const nextName =
      data.name !== undefined ? String(data.name).trim() : country.name;
    const nextCode =
      data.code !== undefined
        ? String(data.code).trim().toUpperCase()
        : country.code;

    if (!nextName) throw new BadRequestError("Country name is required");
    if (!nextCode || nextCode.length < 2)
      throw new BadRequestError("Country code is required");

    const existing = await Country.findOne({
      _id: { $ne: country._id },
      $or: [
        { name: new RegExp(`^${escapeRegex(nextName)}$`, "i") },
        { code: new RegExp(`^${escapeRegex(nextCode)}$`, "i") },
      ],
    });

    if (existing) {
      throw new ConflictError(
        "Another country already exists with that name or code",
      );
    }

    const update = {
      name: nextName,
      code: nextCode,
      slug: slugify(nextName),
      status: data.status !== undefined ? data.status : country.status,
    };

    const updated = await Country.findByIdAndUpdate(id, update, { new: true });
    return updated;
  },

  updateCountryByName: async (countryName, data = {}) => {
    const country = await countryService.getCountryByName(countryName);
    return countryService.updateCountry(country._id, data);
  },

  deleteCountry: async (id) => {
    const country = await Country.findById(id);
    if (!country) throw new NotFoundError("Country not found");

    const chapterRefs = await Chapter.countDocuments({
      country: new RegExp(`^${escapeRegex(country.name)}$`, "i"),
    });
    if (chapterRefs > 0) {
      throw new BadRequestError(
        "Cannot delete this country while chapters are still assigned to it",
      );
    }

    await Promise.all([
      User.updateMany(
        { country: new RegExp(`^${escapeRegex(country.name)}$`, "i") },
        { $set: { country: "" } },
      ),
      Business.updateMany(
        { country: new RegExp(`^${escapeRegex(country.name)}$`, "i") },
        { $set: { country: "" } },
      ),
    ]);

    await Country.findByIdAndDelete(id);
    return { deletedCountry: country.name };
  },

  deleteCountryByName: async (countryName) => {
    const country = await countryService.getCountryByName(countryName);
    return countryService.deleteCountry(country._id);
  },
};
