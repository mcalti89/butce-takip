CREATE TABLE IF NOT EXISTS budget_cloud_receipt_nas (
  receipt_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  verified_at_ms BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_receipt_nas_file FOREIGN KEY (receipt_id)
    REFERENCES budget_cloud_receipts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS budget_cloud_receipt_nas_deletions (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  receipt_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  delete_after_ms BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (account_id,receipt_id),
  KEY idx_nas_delete_due (delete_after_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
