import logger from "../utils/logger.js";
export const notFound = (req, res) =>
  res
    .status(404)
    .json({
      success: false,
      message: "Route not found",
      error: { code: "NOT_FOUND" },
    });
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed")
    error = Object.assign(new Error("Invalid JSON request body"), {
      status: 400,
      code: "INVALID_REQUEST",
    });
  const mapped = {
    23505: [409, "Record already exists", "CONFLICT"],
    "23P01": [409, "Selected slot is unavailable", "BOOKING_CONFLICT"],
    23503: [422, "Referenced record does not exist", "INVALID_REFERENCE"],
    23514: [422, "Record violates business constraints", "INVALID_STATE"],
    "40P01": [409, "Concurrent update; retry request", "RETRY_REQUIRED"],
    40001: [409, "Concurrent update; retry request", "RETRY_REQUIRED"],
  };
  const [status, message, code] = mapped[error.code] || [
    error.status || 500,
    error.message,
    error.code || "INTERNAL_ERROR",
  ];
  logger[status >= 500 ? "error" : "warn"](
    { request_id: req.id, code, status },
    "request failed",
  );
  res
    .status(status)
    .json({
      success: false,
      message: status >= 500 ? "Internal server error" : message,
      error: { code: status >= 500 ? "INTERNAL_ERROR" : code },
    });
}
