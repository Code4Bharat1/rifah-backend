import mongoose from "mongoose";
import { Country } from "./country.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { StateProfile } from "../states/state-profile.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES, isResponsibilityRole } from "../../shared/constants/roles.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
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
    const existingCount = await Country.countDocuments();
    if (existingCount === 0) {
      try {
        await Country.create({
          name: "India",
          code: "IND",
          slug: "india",
          status: "Active",
        });
      } catch {
        // ignore duplicate race condition
      }
    }

    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.search) {
      const search = escapeRegex(filters.search.trim());
      query.$or = [
        { name: new RegExp(search, "i") },
        { code: new RegExp(search, "i") },
      ];
    }

    const countries = await Country.find(query)
      .populate("assignedAdmin", "name email phone avatar role")
      .sort({ name: 1 })
      .lean();

    const results = await Promise.all(
      countries.map(async (c) => {
        const countryNameRegex = new RegExp(`^${escapeRegex(c.name)}$`, "i");
        const [statesCount, chaptersCount, businessesCount, membersCount] =
          await Promise.all([
            StateProfile.countDocuments({
              $or: [{ countryId: c._id }, { countryName: countryNameRegex }],
            }),
            Chapter.countDocuments({
              $or: [{ countryId: c._id }, { country: countryNameRegex }],
            }),
            Business.countDocuments({
              $or: [{ countryId: c._id }, { country: countryNameRegex }],
            }),
            User.countDocuments({
              $or: [{ countryId: c._id }, { country: countryNameRegex }],
            }),
          ]);

        let admin = c.assignedAdmin;
        if (!admin) {
          admin = await User.findOne({
            role: ROLES.COUNTRY_ADMIN,
            $or: [{ countryId: c._id }, { country: countryNameRegex }],
          })
            .select("name email phone avatar role")
            .lean();
        }

        return {
          ...c,
          assignedAdmin: admin || null,
          statesCount,
          chaptersCount,
          businessesCount,
          membersCount,
        };
      })
    );

    return results;
  },

  getCountryById: async (id) => {
    let country = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      country = await Country.findById(id);
    }
    if (!country) {
      country = await Country.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegex(id)}$`, "i") },
          { slug: slugify(id) },
          { code: new RegExp(`^${escapeRegex(id)}$`, "i") },
        ],
      });
    }
    if (!country) throw new NotFoundError("Country not found");
    return country;
  },

  getCountryByName: async (countryName) => {
    const cleanName = String(countryName || "").trim();
    if (!cleanName) throw new BadRequestError("Country name is required");

    let country = null;
    if (mongoose.Types.ObjectId.isValid(cleanName)) {
      country = await Country.findById(cleanName);
    }
    if (!country) {
      country = await Country.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
          { slug: slugify(cleanName) },
          { code: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
        ],
      });
    }

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
    nominee.country = country.name;
    nominee.countryId = country._id;
    await nominee.save();

    country.assignedAdmin = nominee._id;
    await country.save();

    return nominee;
  },

  removeCountryAdmin: async (countryName) => {
    const cleanName = String(countryName || "").trim();
    if (!cleanName) throw new BadRequestError("Country name is required");

    const country = await Country.findOne({
      name: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
    });

    const admin = await User.findOne({
      role: ROLES.COUNTRY_ADMIN,
      $or: [
        { country: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
        ...(country ? [{ countryId: country._id }] : []),
      ],
    });

    if (!admin)
      throw new NotFoundError(`No active Country Admin found for ${cleanName}`);

    admin.role = admin.previousRole || ROLES.CUSTOMER;
    admin.previousRole = "";
    admin.country = "";
    admin.countryId = null;
    await admin.save();

    if (country) {
      country.assignedAdmin = null;
      await country.save();
    }

    return admin;
  },

  updateCountry: async (id, data = {}, requester = null) => {
    const country = await Country.findById(id);
    if (!country) throw new NotFoundError("Country not found");

    if (requester && requester.role === ROLES.COUNTRY_ADMIN) {
      const userCountryName = (requester.country || "").trim().toLowerCase();
      const userCountryId = requester.countryId ? String(requester.countryId) : "";
      const matchesCountry =
        (userCountryId && userCountryId === String(country._id)) ||
        (userCountryName && userCountryName === country.name.toLowerCase());
      if (!matchesCountry) {
        throw new ForbiddenError(
          "Country Admins can only manage their own assigned country.",
        );
      }
      // Country Admin cannot rename the country or change the country code
      delete data.name;
      delete data.code;
    }

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

  updateCountryByName: async (countryName, data = {}, requester = null) => {
    const country = await countryService.getCountryByName(countryName);
    return countryService.updateCountry(country._id, data, requester);
  },

  deleteCountry: async (identifier) => {
    const cleanId = String(identifier || "").trim();
    if (!cleanId) throw new BadRequestError("Country identifier is required");

    let country = null;
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      country = await Country.findById(cleanId);
    }
    if (!country) {
      country = await Country.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegex(cleanId)}$`, "i") },
          { slug: slugify(cleanId) },
          { code: new RegExp(`^${escapeRegex(cleanId)}$`, "i") },
        ],
      });
    }
    if (!country) throw new NotFoundError("Country not found");

    const countryNameRegex = new RegExp(`^${escapeRegex(country.name)}$`, "i");
    const [chapterRefs, stateRefs] = await Promise.all([
      Chapter.countDocuments({
        $or: [{ countryId: country._id }, { country: countryNameRegex }],
      }),
      StateProfile.countDocuments({
        $or: [{ countryId: country._id }, { countryName: countryNameRegex }],
      }),
    ]);

    if (chapterRefs > 0 || stateRefs > 0) {
      throw new BadRequestError(
        "Cannot delete this country while states or chapters are still assigned to it. Please remove or reassign them first.",
      );
    }

    // Revoke any active Country Admin allocated to this country
    const admin = await User.findOne({
      role: ROLES.COUNTRY_ADMIN,
      $or: [
        { countryId: country._id },
        { country: countryNameRegex },
      ],
    });
    if (admin) {
      admin.role = admin.previousRole || ROLES.CUSTOMER;
      admin.previousRole = "";
      admin.country = "";
      admin.countryId = null;
      await admin.save();
    }

    await Promise.all([
      User.updateMany(
        {
          $or: [
            { countryId: country._id },
            { country: countryNameRegex },
          ],
        },
        { $set: { country: "", countryId: null } },
      ),
      Business.updateMany(
        {
          $or: [
            { countryId: country._id },
            { country: countryNameRegex },
          ],
        },
        { $set: { country: "", countryId: null } },
      ),
    ]);

    await Country.findByIdAndDelete(country._id);
    return { deletedCountry: country.name };
  },

  deleteCountryByName: async (countryName) => {
    return countryService.deleteCountry(countryName);
  },
};
