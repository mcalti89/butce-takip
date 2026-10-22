# cPanel TCMB Kur API'si

Bu klasör, Vercel'de barındırılan Bütçe Takip PWA'sına TCMB kur verisi sağlayan PHP/MySQL yardımcı bileşenidir. Yalnız kamuya açık kur bültenini depolar; kişisel bütçe/işlem verisi depolamaz. Kaynak TCMB XML'deki `ForexBuying`/`ForexSelling` değerleridir; `BanknoteBuying`/`BanknoteSelling` alanları ayrı saklanır, uygulama varsayılan dönüşümde kullanılmaz.

## Yapılandırma

1. cPanel'de MySQL veritabanı, API için yalnızca `SELECT` yetkili bir kullanıcı ve cron için yalnızca `SELECT`, `INSERT`, `UPDATE` yetkili ayrı bir kullanıcı oluşturun; yetkileri sadece bu kur tablosuyla sınırlandırın. PHP 8.x, PDO MySQL ve SimpleXML eklentileri önerilir.
2. `schema.sql` içeriğini veritabanında bir kez çalıştırın.
3. Web kökü dışında `/home/CPANELUSER/private/` klasörü oluşturup `private/config.example.php` dosyasını `/home/CPANELUSER/private/fx-config.php` konumuna kopyalayın. Gerçek DB adını, kullanıcıları ve parolaları bu özel kopyaya yazın; dosya iznini mümkünse `600` yapın. `public_html` içine koymayın, repoya commit etmeyin ve sohbete göndermeyin.
4. `public/fx-api.php` dosyasını HTTPS ile erişilen API alan adının web köküne örneğin `public_html/fx-api.php` olarak yükleyin. Ön tanımlı izinli Origin `https://butcetakip-vercel-drop.vercel.app`'tir. PWA özel bir alan adına taşınırsa yalnız o tam HTTPS Origin'i yapılandırmaya ekleyin.
5. Cron dosyasını web kökü dışında tutun. cPanel Cron Jobs ekranında sunucunun saat dilimini kontrol edip her gün 16:15 veya sonrasında çalıştırın; PHP binary ve mutlak yolu panelin verdiği değerlerle kullanın. Örnek: `15 16 * * * /usr/local/bin/php /home/CPANELUSER/private/sync-tcmb.php >> /home/CPANELUSER/private/fx-sync.log 2>&1`. Cron, XML'in `<Tarih>` bülten gününe göre upsert eder; hafta sonu/resmî tatilde TCMB yeni bülten vermediyse son yayımlanmış tarihi yineler, yeni tarih/oran uydurmaz.

Yükleme yolu/URL panelle doğrulanmadan tahmin edilmemelidir. DB parolası URL, JS, PWA ZIP'i veya API cevabına dahil edilmez. API sadece GET ve CORS preflight kabul eder; rate yazma için HTTP endpoint yoktur, yalnız CLI cron MySQL'e yazar.

## API

- `GET https://API-ALAN-ADINIZ/fx-api.php?action=latest&codes=USD,EUR`: son TCMB bültenindeki seçilmiş kodlar.
- `GET https://API-ALAN-ADINIZ/fx-api.php?action=history&currency=USD&from=2026-10-01&to=2026-10-31`: kayıtlı günler; en çok 400 satır.
- `GET https://API-ALAN-ADINIZ/fx-api.php?action=rate&currency=USD&date=2026-10-22`: işlem gününde veya öncesinde yayımlanan en son snapshot ve kaynak bülten tarihi. İlk günlük toplama öncesi geçmiş kur mevcut olmayabilir.

Yanıt XML'de yayımlanan `unit` miktarına göre ham alış/satış fiyatlarını ve bülten tarihini taşır. Hesaplama tutarı `TRY = döviz_tutarı × TCMB_fiyatı ÷ unit` olarak normalize eder. Örneğin TCMB'nin 100 JPY için yayımladığı oran JPY başına 100'e bölünür. Gelirde döviz alış, giderde döviz satış seçimi bütçe dönüşüm varsayımıdır; TCMB gösterge oranı, banka/kartın gerçekleşmiş işlem fiyatı değildir.

## Doğrulama ve veri sınırı

API adresi, DB erişimi, hosting PHP eklentileri, CORS ve cron ancak gerçek cPanel'e yüklenip çalıştırıldığında doğrulanabilir. Şu an host adı/DB/cron erişimi bu projeye bağlanmış değildir. Kur günlüğü kamuya açık piyasa referansıdır; PWA'nın kişisel kayıtları mevcut tarayıcı localStorage alanında kalır. `fx_daily_rates` tablosuna kullanıcı işlem veya kategori verisi yazılmaz.
