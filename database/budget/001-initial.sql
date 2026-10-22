CREATE TABLE IF NOT EXISTS budget_cloud_accounts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at_ms BIGINT UNSIGNED NOT NULL,
  KEY idx_budget_session_expiry (expires_at_ms),
  CONSTRAINT fk_budget_session_account FOREIGN KEY (account_id)
    REFERENCES budget_cloud_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_documents (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL,
  document JSON NOT NULL,
  updated_at_ms BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_budget_document_account FOREIGN KEY (account_id)
    REFERENCES budget_cloud_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_login_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  window_start_ms BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
