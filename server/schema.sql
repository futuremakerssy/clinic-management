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

-- 4. جدول العملاء والعيادات (customers)
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(128),
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    total_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 5. جدول باقات وخطط الاشتراك (subscription_plans)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    duration_days INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    is_active INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL
);

-- 6. جدول المدفوعات والفواتير (payments)
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    license_id VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64),
    plan_id VARCHAR(64),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    paid_at TIMESTAMP NOT NULL,
    note TEXT,
    admin_id VARCHAR(64),
    type VARCHAR(16) NOT NULL DEFAULT 'new', -- 'new', 'renewal'
    CONSTRAINT fk_payments_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_license ON payments(license_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- 7. جدول سجل تدقيق عمليات المشرف (audit_logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    license_id VARCHAR(64),
    customer_id VARCHAR(64),
    details TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    admin_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
