CREATE TABLE IF NOT EXISTS fx_daily_rates (
  rate_date DATE NOT NULL,
  currency_code CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency_name VARCHAR(100) NOT NULL,
  unit INT UNSIGNED NOT NULL DEFAULT 1,
  forex_buying DECIMAL(20, 8) NULL,
  forex_selling DECIMAL(20, 8) NULL,
  banknote_buying DECIMAL(20, 8) NULL,
  banknote_selling DECIMAL(20, 8) NULL,
  bulletin_no VARCHAR(20) NOT NULL,
  source_url VARCHAR(255) NOT NULL,
  fetched_at_utc DATETIME NOT NULL,
  PRIMARY KEY (rate_date, currency_code),
  KEY idx_fx_currency_date (currency_code, rate_date),
  CONSTRAINT chk_fx_unit CHECK (unit > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
