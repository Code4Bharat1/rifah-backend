import { Event } from "./event.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";

export const eventService = {
  /**
   * Browse public events
   */
  listEvents: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.chapter) filter.chapter = queryParams.chapter;
    if (queryParams.city) filter.city = queryParams.city;
    if (queryParams.mode) filter.mode = queryParams.mode;

    const [events, total] = await Promise.all([
      Event.find(filter).sort(sort).skip(skip).limit(limit),
      Event.countDocuments(filter),
    ]);

    return {
      events,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single event detail
   */
  getEventBySlugOrId: async (identifier) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { slug: identifier };

    const event = await Event.findOne(query);
    if (!event) {
      throw new NotFoundError("Event not found");
    }
    return event;
  },

  /**
   * Create new event (Admin / Secretariat)
   */
  createEvent: async (data) => {
    let slug = generateSlug(data.title);
    const existing = await Event.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    return Event.create({
      ...data,
      slug,
    });
  },

  /**
   * Register user for an event
   */
  registerUserForEvent: async (eventId, userId) => {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError("Event not found");
    }

    const isAlreadyRegistered = event.registeredUsers.some(
      (uId) => String(uId) === String(userId)
    );

    if (isAlreadyRegistered) {
      throw new BadRequestError("You are already registered for this event");
    }

    if (event.registeredCount >= event.seats) {
      throw new BadRequestError("Event capacity has been reached");
    }

    event.registeredUsers.push(userId);
    event.registeredCount += 1;
    await event.save();

    try {
      const user = await User.findById(userId);
      if (user?.email) {
        await emailService.sendEventRegistrationEmail({
          email: user.email,
          userName: user.name,
          eventTitle: event.title,
          eventDate: event.date || "Upcoming Chamber Event",
          location: event.location || "Chamber Main Hall",
          ticketType: "Member Pass",
        });
      }
    } catch (err) {}

    return event;
  },

  /**
   * Update event details
   */
  updateEvent: async (id, updateData) => {
    if (updateData.title) {
      updateData.slug = generateSlug(updateData.title);
    }
    const updated = await Event.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      throw new NotFoundError("Event not found");
    }
    return updated;
  },
};
