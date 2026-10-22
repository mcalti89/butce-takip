<?php
declare(strict_types=1);

date_default_timezone_set('Europe/Istanbul');
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$configPath = dirname(__DIR__) . '/private/fx-config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "FX private config is missing.\n");
    exit(2);
}
$config = require $configPath;
$url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 25,
        'header' => "User-Agent: ButceTakip-FX/1.0\r\nAccept: application/xml\r\n",
    ],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
]);
$xmlText = @file_get_contents($url, false, $context);
if ($xmlText === false || strlen($xmlText) > 2_000_000) {
    fwrite(STDERR, "TCMB XML request failed or was too large.\n");
    exit(3);
}
libxml_use_internal_errors(true);
$xml = simplexml_load_string($xmlText, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOBLANKS);
if (!$xml || empty($xml['Tarih']) || empty($xml['Bulten_No'])) {
    fwrite(STDERR, "TCMB bulletin metadata could not be validated.\n");
    exit(4);
}
$bulletinDate = DateTimeImmutable::createFromFormat('!d.m.Y', (string)$xml['Tarih'], new DateTimeZone('Europe/Istanbul'));
$bulletinNumber = (string)$xml['Bulten_No'];
if (!$bulletinDate || $bulletinDate->format('d.m.Y') !== (string)$xml['Tarih'] || !preg_match('/^\d{4}\/\d+$/D', $bulletinNumber)) {
    fwrite(STDERR, "TCMB bulletin date/number is invalid.\n");
    exit(5);
}
$rateDate = $bulletinDate->format('Y-m-d');
$pdo = new PDO(
    'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
    $config['db_writer_user'],
    $config['db_writer_password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
);
$sql = 'INSERT INTO fx_daily_rates (rate_date, currency_code, currency_name, unit, forex_buying, forex_selling, banknote_buying, banknote_selling, bulletin_no, source_url, fetched_at_utc) VALUES (:rate_date, :currency_code, :currency_name, :unit, :forex_buying, :forex_selling, :banknote_buying, :banknote_selling, :bulletin_no, :source_url, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE currency_name = VALUES(currency_name), unit = VALUES(unit), forex_buying = VALUES(forex_buying), forex_selling = VALUES(forex_selling), banknote_buying = VALUES(banknote_buying), banknote_selling = VALUES(banknote_selling), bulletin_no = VALUES(bulletin_no), source_url = VALUES(source_url), fetched_at_utc = UTC_TIMESTAMP()';
$stmt = $pdo->prepare($sql);
$count = 0;
foreach ($xml->Currency as $currency) {
    $code = strtoupper((string)$currency['CurrencyCode']);
    $unit = filter_var((string)$currency->Unit, FILTER_VALIDATE_INT);
    if (!preg_match('/^[A-Z]{3}$/D', $code) || $unit === false || $unit < 1 || $unit > 100000) {
        continue;
    }
    $number = static function ($raw): ?string {
        $value = trim((string)$raw);
        if ($value === '') return null;
        $value = str_replace(',', '.', $value);
        return preg_match('/^\d+(?:\.\d{1,8})?$/D', $value) && (float)$value > 0 ? $value : null;
    };
    $name = trim((string)$currency->CurrencyName);
    if ($name === '' || strlen($name) > 100) {
        $name = $code;
    }
    $stmt->execute([
        ':rate_date' => $rateDate,
        ':currency_code' => $code,
        ':currency_name' => $name,
        ':unit' => $unit,
        ':forex_buying' => $number($currency->ForexBuying),
        ':forex_selling' => $number($currency->ForexSelling),
        ':banknote_buying' => $number($currency->BanknoteBuying),
        ':banknote_selling' => $number($currency->BanknoteSelling),
        ':bulletin_no' => $bulletinNumber,
        ':source_url' => $url,
    ]);
    $count++;
}
if ($count === 0) {
    fwrite(STDERR, "TCMB XML contained no currency rows.\n");
    exit(6);
}
printf("TCMB bulletin %s (%s): %d currency rows upserted.\n", $rateDate, $bulletinNumber, $count);
