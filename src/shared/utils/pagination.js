/**
 * Parses query parameters for pagination and sorting
 * @param {Object} query - Express req.query
 * @param {Object} [defaults] - Default pagination options
 * @returns {Object} Parsed pagination: { page, limit, skip, sort }
 */
export const parsePagination = (query = {}, defaults = {}) => {
  const page = Math.max(1, parseInt(query.page || defaults.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(query.limit || defaults.limit || "20", 10))
  );
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || defaults.sortBy || "createdAt";
  const order = (query.order || defaults.order || "desc").toLowerCase() === "asc" ? 1 : -1;
  const sort = { [sortBy]: order };

  return { page, limit, skip, sort };
};

/**
 * Builds standardized paginated response metadata
 * @param {number} total - Total records count
 * @param {number} page - Current page
 * @param {number} limit - Records per page
 * @returns {Object} Pagination metadata
 */
export const buildPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};
