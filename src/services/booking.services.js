// Compatibility entry point for the original project layout.
export * from "../modules/bookings/booking.service.js";
export {
  summary as getBookingSummary,
  list as listBookings,
} from "../modules/bookings/booking.queries.js";
