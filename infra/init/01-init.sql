-- DataMind AI - Postgres bootstrap
-- Runs automatically on first container start (docker-entrypoint-initdb.d).
-- The application manages its own schema (SQLAlchemy). This file only ensures
-- useful extensions are present.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
