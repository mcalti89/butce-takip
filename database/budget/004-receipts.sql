CREATE TABLE IF NOT EXISTS budget_cloud_receipts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entry_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entry_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filename VARCHAR(180) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content MEDIUMBLOB NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL,
  KEY idx_budget_receipt_owner_entry (account_id,entry_kind,entry_id),
  CONSTRAINT fk_budget_receipt_account FOREIGN KEY (account_id)
    REFERENCES budget_cloud_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
