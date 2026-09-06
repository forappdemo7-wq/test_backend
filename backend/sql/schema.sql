-- Run this in your Neon PostgreSQL database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS test_payloads (
    id SERIAL PRIMARY KEY,
    payload_type VARCHAR(50) NOT NULL,
    app_name VARCHAR(100),
    data TEXT NOT NULL,
    device_id VARCHAR(255),
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payloads_app ON test_payloads(app_name);
CREATE INDEX IF NOT EXISTS idx_payloads_type ON test_payloads(payload_type);
CREATE INDEX IF NOT EXISTS idx_payloads_deleted ON test_payloads(deleted);
CREATE INDEX IF NOT EXISTS idx_payloads_captured ON test_payloads(captured_at DESC);