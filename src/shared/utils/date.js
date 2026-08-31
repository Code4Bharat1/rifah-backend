export const formatDate = (date = new Date()) => {
  return new Date(date).toISOString();
};

export const addDays = (days, from = new Date()) => {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
};

export const isExpired = (date) => {
  return new Date(date) < new Date();
};
