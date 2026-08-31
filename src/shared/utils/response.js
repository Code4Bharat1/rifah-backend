export const ApiResponse = {
  success: (res, data = null, message = "Success", statusCode = 200, meta = null) => {
    const payload = {
      success: true,
      statusCode,
      message,
      data,
    };
    if (meta) {
      payload.meta = meta;
    }
    return res.status(statusCode).json(payload);
  },

  created: (res, data = null, message = "Resource created successfully") => {
    return ApiResponse.success(res, data, message, 201);
  },

  noContent: (res) => {
    return res.status(204).send();
  },

  error: (res, message = "An error occurred", statusCode = 500, code = "INTERNAL_SERVER_ERROR", details = null) => {
    const payload = {
      success: false,
      statusCode,
      error: {
        code,
        message,
      },
    };
    if (details) {
      payload.error.details = details;
    }
    return res.status(statusCode).json(payload);
  },
};
