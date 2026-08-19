-- Fourth Layer A tool (get_upcoming_bookings) needs read access to
-- backend-api's booking schema — same least-privilege, table-by-table
-- GRANT discipline as 0001/0002/0003. Same ordering dependency:
-- backend-api's 0009_booking_resource_schema.sql must have already run.

GRANT USAGE ON SCHEMA booking TO solodesk_agent;
GRANT SELECT ON booking.bookings TO solodesk_agent;
GRANT SELECT ON booking.resources TO solodesk_agent;
