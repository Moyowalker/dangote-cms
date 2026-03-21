function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getPagination(query = {}) {
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(parsePositiveInt(query.limit, 20), 100);
  return { hasPagination, page, limit };
}

function paginateArray(items, page, limit) {
  const total = items.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages
    }
  };
}

module.exports = {
  getPagination,
  paginateArray
};