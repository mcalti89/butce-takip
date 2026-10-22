CREATE TABLE IF NOT EXISTS budget_cloud_google_identities (
  google_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  legacy_import_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_budget_google_identity_account FOREIGN KEY (account_id)
    REFERENCES budget_cloud_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_google_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at_ms BIGINT UNSIGNED NOT NULL,
  KEY idx_budget_google_session_expiry (expires_at_ms),
  CONSTRAINT fk_budget_google_session_account FOREIGN KEY (account_id)
    REFERENCES budget_cloud_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_google_challenges (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  nonce_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at_ms BIGINT UNSIGNED NOT NULL,
  KEY idx_budget_google_challenge_expiry (expires_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
