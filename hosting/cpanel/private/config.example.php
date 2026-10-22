<?php
declare(strict_types=1);

// Copy this file to /home/CPANELUSER/private/fx-config.php, outside public_html.
// Set credentials only in the private copy. Do not commit or upload that copy to the public web root.
return [
    'db_host' => 'localhost',
    'db_name' => 'CPANEL_PREFIX_butce',
    // Grant this account SELECT only on fx_daily_rates.
    'db_reader_user' => 'CPANEL_PREFIX_fxreader',
    'db_reader_password' => '',
    // Grant this account SELECT, INSERT, UPDATE only on fx_daily_rates.
    'db_writer_user' => 'CPANEL_PREFIX_fxwriter',
    'db_writer_password' => '',
    // Public read-only FX data; allow only the deployed PWA origin.
    'allowed_origins' => [
        'https://butcetakip-vercel-drop.vercel.app',
    ],
];
