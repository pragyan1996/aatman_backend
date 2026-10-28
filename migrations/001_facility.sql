CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS facility;
CREATE TABLE facility.users (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('ADMIN','STAFF')), is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE facility.revoked_tokens (jti UUID PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE facility.sports (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE facility.resources (
 id BIGSERIAL PRIMARY KEY, sport_id BIGINT NOT NULL REFERENCES facility.sports, name TEXT NOT NULL UNIQUE,
 surface_type TEXT, capacity INTEGER NOT NULL CHECK(capacity>0), booking_type TEXT NOT NULL CHECK(booking_type IN ('EXCLUSIVE','SHARED')),
 pricing_model TEXT NOT NULL DEFAULT 'RESOURCE' CHECK(pricing_model IN ('RESOURCE','PARTICIPANT')),
 price_per_hour NUMERIC(12,2) NOT NULL CHECK(price_per_hour>=0), is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON facility.resources(sport_id);
CREATE TABLE facility.customers (
 id BIGSERIAL PRIMARY KEY, full_name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'), email TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON facility.customers(lower(full_name));
CREATE TABLE facility.bookings (
 id BIGSERIAL PRIMARY KEY, booking_code TEXT NOT NULL UNIQUE, customer_id BIGINT NOT NULL REFERENCES facility.customers,
 resource_id BIGINT NOT NULL REFERENCES facility.resources, start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL CHECK(end_at>start_at),
 participants INTEGER NOT NULL CHECK(participants>0), total_amount NUMERIC(12,2) NOT NULL CHECK(total_amount>=0),
 booking_source TEXT NOT NULL CHECK(booking_source IN ('ONLINE','DESK')),
 status TEXT NOT NULL CHECK(status IN ('HELD','CONFIRMED','CANCELLED','EXPIRED','COMPLETED')),
 payment_collection_type TEXT NOT NULL CHECK(payment_collection_type IN ('ONLINE','DESK')),
 hold_expires_at TIMESTAMPTZ, notes TEXT, created_by BIGINT REFERENCES facility.users,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 cancelled_at TIMESTAMPTZ, cancellation_reason TEXT, exclusive BOOLEAN NOT NULL,
 CHECK(status <> 'HELD' OR hold_expires_at IS NOT NULL),
 EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&)
 WHERE (exclusive AND status IN ('HELD','CONFIRMED'))
);
CREATE INDEX ON facility.bookings(start_at,end_at);
CREATE INDEX ON facility.bookings(customer_id);
CREATE INDEX ON facility.bookings(resource_id,status,start_at);
CREATE INDEX ON facility.bookings(status,hold_expires_at);
CREATE TABLE facility.payments (
 id BIGSERIAL PRIMARY KEY, booking_id BIGINT NOT NULL REFERENCES facility.bookings,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('CASH','UPI','CARD','ONLINE')),
 status TEXT NOT NULL CHECK(status IN ('PENDING','SUCCESS','FAILED','REFUNDED')), provider TEXT,
 transaction_reference TEXT UNIQUE, provider_order_id TEXT UNIQUE,
 refund_of BIGINT UNIQUE REFERENCES facility.payments, paid_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON facility.payments(booking_id,status);
CREATE TABLE facility.booking_events (
 id BIGSERIAL PRIMARY KEY, booking_id BIGINT NOT NULL REFERENCES facility.bookings, event_type TEXT NOT NULL,
 previous_data JSONB, new_data JSONB, performed_by BIGINT REFERENCES facility.users, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON facility.booking_events(booking_id,created_at);
CREATE TABLE facility.resource_operating_hours (
 id BIGSERIAL PRIMARY KEY, resource_id BIGINT NOT NULL REFERENCES facility.resources,
 day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), opening_time TIME NOT NULL, closing_time TIME NOT NULL,
 is_closed BOOLEAN NOT NULL DEFAULT false, UNIQUE(resource_id,day_of_week), CHECK(is_closed OR closing_time>opening_time)
);
CREATE TABLE facility.resource_unavailability (
 id BIGSERIAL PRIMARY KEY, resource_id BIGINT NOT NULL REFERENCES facility.resources,
 start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL CHECK(end_at>start_at), reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON facility.resource_unavailability(resource_id,start_at,end_at);
CREATE TABLE facility.idempotency_keys (
 scope TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(scope,key)
);
CREATE TABLE facility.webhook_events (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE VIEW facility.booking_details AS
 SELECT b.*, c.full_name AS customer_name,c.phone,c.email,r.name AS resource_name,r.sport_id,s.name AS sport_name,
 COALESCE(p.net_paid,0)::NUMERIC(12,2) AS paid_amount,
 (b.total_amount-COALESCE(p.net_paid,0))::NUMERIC(12,2) AS outstanding_amount,
 CASE WHEN COALESCE(p.net_paid,0)>=b.total_amount THEN 'PAID'
 WHEN COALESCE(p.net_paid,0)>0 THEN 'PARTIAL' ELSE 'UNPAID' END AS payment_status
 FROM facility.bookings b JOIN facility.customers c ON c.id=b.customer_id
 JOIN facility.resources r ON r.id=b.resource_id JOIN facility.sports s ON s.id=r.sport_id
 LEFT JOIN (SELECT booking_id,sum(CASE WHEN status='SUCCESS' THEN amount WHEN status='REFUNDED' THEN -amount ELSE 0 END) net_paid
 FROM facility.payments GROUP BY booking_id) p ON p.booking_id=b.id;
CREATE FUNCTION facility.booking_resource_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind TEXT;
BEGIN
 SELECT booking_type INTO kind FROM facility.resources WHERE id=NEW.resource_id FOR UPDATE;
 NEW.exclusive := kind='EXCLUSIVE'; RETURN NEW;
END $$;
CREATE TRIGGER booking_resource_guard BEFORE INSERT OR UPDATE OF resource_id,exclusive ON facility.bookings
 FOR EACH ROW EXECUTE FUNCTION facility.booking_resource_guard();
