CREATE TABLE IF NOT EXISTS gallery_images (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name VARCHAR(100) NOT NULL UNIQUE,
    original_name VARCHAR(255),
    size_bytes INTEGER NOT NULL,
    uploaded_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS gallery_images_created_at_idx ON gallery_images(created_at DESC);
