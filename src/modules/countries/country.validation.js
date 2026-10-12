export const validateCreateCountry = (data = {}) => {
  const errors = [];

  if (
    !data.name ||
    typeof data.name !== "string" ||
    data.name.trim().length < 2
  ) {
    errors.push({ field: "name", message: "Country name is required" });
  }

  if (
    !data.code ||
    typeof data.code !== "string" ||
    data.code.trim().length < 2
  ) {
    errors.push({ field: "code", message: "Country code is required" });
  }

  if (
    data.code &&
    typeof data.code === "string" &&
    !/^[A-Za-z]{2,3}$/.test(data.code.trim())
  ) {
    errors.push({
      field: "code",
      message: "Country code must be 2–3 letters, for example IN or UAE",
    });
  }

  return { valid: errors.length === 0, errors };
};

export const validateUpdateCountry = (data = {}) => {
  const errors = [];

  if (
    data.name !== undefined &&
    (typeof data.name !== "string" || data.name.trim().length < 2)
  ) {
    errors.push({
      field: "name",
      message: "Country name must be at least 2 characters",
    });
  }

  if (
    data.code !== undefined &&
    (typeof data.code !== "string" || data.code.trim().length < 2)
  ) {
    errors.push({
      field: "code",
      message: "Country code must be at least 2 characters",
    });
  }

  if (
    data.code &&
    typeof data.code === "string" &&
    !/^[A-Za-z]{2,3}$/.test(data.code.trim())
  ) {
    errors.push({ field: "code", message: "Country code must be 2–3 letters" });
  }

  return { valid: errors.length === 0, errors };
};

export const validateAssignCountryAdmin = (data = {}) => {
  const errors = [];

  if (
    !data.countryName ||
    typeof data.countryName !== "string" ||
    !data.countryName.trim()
  ) {
    errors.push({ field: "countryName", message: "Country is required" });
  }

  if (
    data.name !== undefined &&
    data.name !== null &&
    data.name !== "" &&
    !/^[A-Za-z\s.'-]{2,80}$/.test(String(data.name).trim())
  ) {
    errors.push({ field: "name", message: "Name must be valid" });
  }

  if (
    data.email !== undefined &&
    data.email !== null &&
    data.email !== "" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())
  ) {
    errors.push({ field: "email", message: "Email is invalid" });
  }

  return { valid: errors.length === 0, errors };
};
