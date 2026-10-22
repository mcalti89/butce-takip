CREATE TABLE IF NOT EXISTS fx_bulletins (
  rate_date CHAR(10) CHARACTER SET ascii PRIMARY KEY,
  bulletin_no VARCHAR(32) NOT NULL,
  source_url VARCHAR(180) NOT NULL,
  xml_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  raw_xml MEDIUMTEXT NOT NULL,
  fetched_at_ms BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fx_daily_rates (
  rate_date CHAR(10) CHARACTER SET ascii NOT NULL,
  currency_code CHAR(3) CHARACTER SET ascii NOT NULL,
  currency_name VARCHAR(120) NOT NULL,
  unit INT UNSIGNED NOT NULL,
  forex_buying DECIMAL(20,8) NULL,
  forex_selling DECIMAL(20,8) NULL,
  banknote_buying DECIMAL(20,8) NULL,
  banknote_selling DECIMAL(20,8) NULL,
  PRIMARY KEY (rate_date, currency_code),
  INDEX fx_currency_history (currency_code, rate_date),
  CONSTRAINT fx_rate_bulletin FOREIGN KEY (rate_date) REFERENCES fx_bulletins(rate_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fx_unpublished_days (
  rate_date CHAR(10) CHARACTER SET ascii PRIMARY KEY,
  checked_at_ms BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fx_sync_state (
  name VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  archive_from_date CHAR(10) CHARACTER SET ascii NOT NULL,
  lease_token CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
  lease_until_ms BIGINT NOT NULL DEFAULT 0,
  next_attempt_ms BIGINT NOT NULL DEFAULT 0,
  last_attempt_ms BIGINT NOT NULL DEFAULT 0,
  last_success_ms BIGINT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(40) CHARACTER SET ascii NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
