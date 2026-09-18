-- ==============================================================================
-- Clinic License & Subscription Server Database Schema (SQL)
-- Compatible with SQLite, PostgreSQL, and MySQL
-- ==============================================================================

-- 1. جدول التراخيص والاشتراكات (licenses)
CREATE TABLE IF NOT EXISTS licenses (
    id VARCHAR(64) PRIMARY KEY,
    license_key VARCHAR(64) UNIQUE NOT NULL,
    plan_type VARCHAR(32) NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly', 'trial'
    max_devices INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',    -- 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'TRIAL'
    created_at TIMESTAMP NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    notes TEXT
);

-- الفهارس لتسريع البحث
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- 2. جدول الأجهزة المربوطة بالترخيص (devices)
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    license_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128),
    activated_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    is_active INT NOT NULL DEFAULT 1,
    CONSTRAINT fk_device_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_license_id ON devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);

-- 3. جدول سجل عمليات التحقق والتفعيل (license_activations)
CREATE TABLE IF NOT EXISTS license_activations (
    id VARCHAR(64) PRIMARY KEY,
    license_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL, -- 'activate', 'validate', 'refresh', 'deactivate'
    timestamp TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    CONSTRAINT fk_activation_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activations_license ON license_activations(license_id);
