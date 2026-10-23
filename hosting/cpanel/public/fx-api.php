<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function isIsoDate($value): bool
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
        return false;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Europe/Istanbul'));
    return $date !== false && $date->format('Y-m-d') === $value;
}

function omrFromUsd(array $usd): array
{
    $unit = (int)$usd['unit'];
    $usd['currency_code'] = 'OMR';
    $usd['currency_name'] = 'Umman riyali';
    $usd['rateSource'] = 'TCMB_USD_OMR_PEG';
    foreach (['forex_buying', 'forex_selling'] as $key) {
        $usd[$key] = $usd[$key] === null ? null : round((float)$usd[$key] / $unit / 0.3845, 8);
    }
    $usd['unit'] = 1;
    $usd['banknote_buying'] = null;
    $usd['banknote_selling'] = null;
    return $usd;
}

try {
    date_default_timezone_set('Europe/Istanbul');
    $configPath = dirname(__DIR__) . '/private/fx-config.php';
    if (!is_file($configPath)) {
        respond(503, ['error' => 'fx_service_not_configured']);
    }
    $config = require $configPath;
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = $config['allowed_origins'] ?? [];
    if ($origin !== '' && !in_array($origin, $allowedOrigins, true)) {
        respond(403, ['error' => 'origin_not_allowed']);
    }
    if ($origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        header('Allow: GET, OPTIONS');
        respond(405, ['error' => 'method_not_allowed']);
    }

    $pdo = new PDO(
        'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_reader_user'],
        $config['db_reader_password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $action = $_GET['action'] ?? 'latest';
    if (!is_string($action) || strlen($action) > 16) {
        respond(400, ['error' => 'invalid_action']);
    }
    $codesInput = $_GET['codes'] ?? '';
    if (!is_string($codesInput) || strlen($codesInput) > 91) {
        respond(400, ['error' => 'invalid_currency_codes']);
    }
    $codes = $codesInput === '' ? [] : explode(',', $codesInput);
    if (count($codes) > 23) {
        respond(400, ['error' => 'too_many_currency_codes']);
    }
    foreach ($codes as $code) {
        if (!preg_match('/^[A-Z]{3}$/D', $code)) {
            respond(400, ['error' => 'invalid_currency_code']);
        }
    }

    if ($action === 'latest') {
        $latestDate = $pdo->query('SELECT MAX(rate_date) FROM fx_daily_rates')->fetchColumn();
        if (!$latestDate) {
            respond(404, ['error' => 'no_rates_yet']);
        }
        $sql = 'SELECT rate_date, currency_code, currency_name, unit, forex_buying, forex_selling, banknote_buying, banknote_selling, bulletin_no, fetched_at_utc FROM fx_daily_rates WHERE rate_date = :rate_date';
        $params = [':rate_date' => $latestDate];
        $queryCodes = in_array('OMR', $codes, true) ? array_values(array_unique(array_merge(array_diff($codes, ['OMR']), ['USD']))) : $codes;
        if ($queryCodes) {
            $holders = [];
            foreach ($queryCodes as $i => $code) {
                $key = ':code' . $i;
                $holders[] = $key;
                $params[$key] = $code;
            }
            $sql .= ' AND currency_code IN (' . implode(',', $holders) . ')';
        }
        $sql .= ' ORDER BY currency_code';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            if ($row['currency_code'] === 'USD' && (!$codes || in_array('OMR', $codes, true))) {
                $rows[] = omrFromUsd($row);
                break;
            }
        }
        $rows = array_values(array_filter($rows, fn($row) => !$codes || in_array($row['currency_code'], $codes, true)));
        respond(200, ['date' => $latestDate, 'source' => 'TCMB', 'rates' => $rows]);
    }

    $code = $_GET['currency'] ?? '';
    if (!is_string($code) || !preg_match('/^[A-Z]{3}$/D', $code)) {
        respond(400, ['error' => 'invalid_currency_code']);
    }
    if ($action === 'history') {
        $from = $_GET['from'] ?? '';
        $to = $_GET['to'] ?? date('Y-m-d');
        foreach ([$from, $to] as $date) {
            if (!isIsoDate($date) || $date > date('Y-m-d')) {
                respond(400, ['error' => 'invalid_date']);
            }
        }
        if ($from > $to) {
            respond(400, ['error' => 'invalid_range']);
        }
        $stmt = $pdo->prepare('SELECT rate_date, currency_code, currency_name, unit, forex_buying, forex_selling, banknote_buying, banknote_selling, bulletin_no, fetched_at_utc FROM fx_daily_rates WHERE currency_code = :currency AND rate_date BETWEEN :from_date AND :to_date ORDER BY rate_date DESC LIMIT 400');
        $stmt->execute([':currency' => $code === 'OMR' ? 'USD' : $code, ':from_date' => $from, ':to_date' => $to]);
        respond(200, ['currency' => $code, 'source' => 'TCMB', 'rates' => array_map(fn($row) => $code === 'OMR' ? omrFromUsd($row) : $row, $stmt->fetchAll(PDO::FETCH_ASSOC))]);
    }
    if ($action === 'rate') {
        $date = $_GET['date'] ?? '';
        if (!isIsoDate($date) || $date > date('Y-m-d')) {
            respond(400, ['error' => 'invalid_date']);
        }
        $stmt = $pdo->prepare('SELECT rate_date, currency_code, currency_name, unit, forex_buying, forex_selling, bulletin_no FROM fx_daily_rates WHERE currency_code = :currency AND rate_date <= :rate_date ORDER BY rate_date DESC LIMIT 1');
        $stmt->execute([':currency' => $code === 'OMR' ? 'USD' : $code, ':rate_date' => $date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            respond(404, ['error' => 'no_rate_on_or_before_date']);
        }
        respond(200, ['source' => 'TCMB', 'rate' => $code === 'OMR' ? omrFromUsd($row) : $row]);
    }
    respond(400, ['error' => 'unknown_action']);
} catch (Throwable $error) {
    error_log('FX API failure: ' . get_class($error));
    respond(500, ['error' => 'fx_service_unavailable']);
}
