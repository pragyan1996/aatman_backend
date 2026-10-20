-- Run against the aatman database using psql. All timestamps are UTC-aware.
BEGIN;

CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
    phone VARCHAR(16) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    name VARCHAR(150) NOT NULL CHECK (length(btrim(name)) > 0),
    password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    email_verified_at TIMESTAMPTZ,
    phone_verified_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (email),
    UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE CHECK (name ~ '^[a-z][a-z0-9_]*$'),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);

CREATE OR REPLACE FUNCTION set_admin_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_users_updated_at ON admin_users;
CREATE TRIGGER admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION set_admin_updated_at();

INSERT INTO roles (name, description) VALUES
    ('super_admin', 'Manages administrators, role assignments, and all application settings'),
    ('admin', 'Performs day-to-day administration'),
    ('viewer', 'Read-only administrative access')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_id_idx ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at);

COMMIT;
