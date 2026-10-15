import { generateBusinessesWorkbook } from "./businesses.generator.js";
import { generateUsersWorkbook } from "./users.generator.js";
import { generateRevenueSharingWorkbook } from "./revenue-sharing.generator.js";
import { generateEventAttendeesWorkbook } from "./event-attendees.generator.js";

export const generators = {
  businesses: generateBusinessesWorkbook,
  users: generateUsersWorkbook,
  revenue_sharing: generateRevenueSharingWorkbook,
  event_attendees: generateEventAttendeesWorkbook,
};

export {
  generateBusinessesWorkbook,
  generateUsersWorkbook,
  generateRevenueSharingWorkbook,
  generateEventAttendeesWorkbook,
};
