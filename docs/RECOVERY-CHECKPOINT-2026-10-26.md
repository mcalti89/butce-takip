# MySQL taşınması öncesi kararlı sürüm

- Sürüm etiketi: `v1.0.0-nas-stable`
- Canlı kaynak commit'i: `28a0aa246514d23a2670b292390dd904fbada27f`
- Doğrulanmış Vercel yayını: `dpl_9aE5JC9EqAKcekoxim2bjQ2ZV5VP` (READY)
- Uygulama: `https://butce.muratcalti.com`
- NAS servisi: `https://dekont.muratcalti.com`
- Doğrulama: 481 otomatik test geçti, 1 mevcut test atlandı; tarayıcı kontrolleri,
  Production Google/NAS yükleme-okuma-silme testleri geçti.
- Bu noktada bütçe, Google kullanıcı kimlikleri ve dekont metadata'sı Aiven MySQL'de;
  PDF gövdeleri QNAP'tadır. NAS aktarımında 1 mevcut PDF doğrulandı ve taşındı.

## Bu yedeğin kapsamı

GitHub etiketi bütün izlenen kaynak kodunu, SQL şemalarını, bağımlılık kilit
  dosyasını, QNAP/Cloudflare Compose dosyalarını ve kurulum belgelerini sabitler.
Bu dal yalnızca kurtarma rehberini ekler; çalışan uygulamanın kodunu değiştirmez.

Canlı MySQL verileri, QNAP PDF'leri, özel anahtarlar ve Vercel ortam değişkeni
  **değerleri GitHub yedeğine dahil değildir**. Bu sürüm bir kaynak kodu geri dönüş
noktasıdır; verilerin aynı tarihe döndürülebileceği bir veritabanı snapshot'ı değildir.

## Kaynak kodunu geri alma

Mevcut çalışma alanındaki değişiklikleri silmeden ayrı bir klasöre klonlayın:

```sh
git clone --branch v1.0.0-nas-stable --single-branch https://github.com/mcalti89/butce-takip.git butce-kurtarma
cd butce-kurtarma
git switch -c recovery/nas-stable
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm build:pwa
```

Node.js/pnpm sürümleri ve server kurulum adımları repository belgelerinde yer alır.
Production'da `scripts/build-vercel.mjs` SQL şemasını, Google/NAS bağlantılarını ve
PWA derlemesini doğrular. Mevcut şema yükseltmeleri CREATE IF NOT EXISTS ile
uygulanır; tablo veya veri silme gerektirmez.

Vercel'de yalnızca uygulama kodunu geri almak için bu READY deployment seçilip
**Promote to Production / Instant Rollback** kullanılabilir. İşlem öncesi mevcut
veritabanı ve NAS ortam ayarları kontrol edilmelidir. Kod rollback'i bütçe
verilerini veya PDF'leri geçmiş tarihe döndürmez.

## Production ortam ayarları

Aşağıdaki adlar kayıtlıdır; değerleri Vercel'in özel ayarlarında korunmalıdır:

- `BUDGET_APP_ORIGIN`
- `BUDGET_DATABASE_URL`, `BUDGET_DATABASE_CA`
- `BUDGET_GOOGLE_CLIENT_ID`
- `BUDGET_NAS_URL`, `BUDGET_NAS_SECRET`, `BUDGET_RECEIPT_STORAGE`
- `BUDGET_RECEIPT_SYNC_SECRET`, `CRON_SECRET`
- Eski parola girişinden kalan `BUDGET_OWNER_EMAIL`, `BUDGET_OWNER_PASSWORD`

NAS özel dosyaları: `butce-dekont/uygulama/service-key.txt` ve
`butce-dekont/uygulama/cloudflare-token.txt`. Bunlar GitHub'a yüklenmez ve
sohbette paylaşılmaz. NAS anahtarının mevcut dosyalarla eşleşmesi gerekir.

## Verileri de geri yükleyebilmek için gerekli özel yedekler

MySQL taşınmasından önce birlikte alınmalıdır:

1. Aiven veritabanının bütün tablo ve satırları. Google identity/account UUID'leri,
   bütçe belgeleri ve revision'ları, dekont/NAS konumları, silme kuyruğu, ödeme
   planları ve TCMB arşiv tabloları korunur. BLOB alanları için `--hex-blob`, tutarlı
   InnoDB yedeği için `--single-transaction` kullanılabilir. Parolalar komut satırına
   yazılmadan özel client config veya güvenli ortamdan alınmalıdır.
2. QNAP `butce-dekont/dosyalar` klasörünün bağımsız kopyası/snapshot'ı. SQL dump,
   NAS'a taşınmış PDF baytlarını içermez.
3. Özel tutulan QNAP `butce-dekont/uygulama` ve Vercel yapılandırma yedeği.

Bu veri yedekleri NAS'ın özel yedek alanında veya ayrı bir yedek ortamında
saklanmalıdır. Kaynak kodu sürümü tek başına bu özel yedeklerin yerine geçmez.

## Sonraki MySQL taşınması ve geri dönüş

Hedefte kaynakla uyumlu MySQL 8 ve tüm şema kurulur. Veri önce ayrı veritabanına
aktarılır; tablo/satır sayıları, Google hesapları, para hassasiyeti, bütçe
revision'ları, NAS dekont erişimi ve TCMB arşivi doğrulanır. Yeni kullanıcı
UUID'leri üretmek mevcut NAS dosyalarının sahiplik eşleşmesini bozar.

Kısa yazma durdurmasıyla son senkronizasyon ve hedef doğrulaması tamamlandıktan
sonra Production bağlantısı değiştirilir. Aiven kopyası geçiş doğrulanana kadar
korunur. Yeni hedefe yazma başladıktan sonra eski Aiven'e yalnızca URL değiştirerek
  dönmek yeni işlemleri kaybettirir; geri dönüşte yeni kayıtlar da uzlaştırılmalıdır.

QNAP seçeneğinde MySQL portu internete açılmadan özel Docker ağında tutulur.
Vercel'in mevcut mysql2 bağlantısı doğrudan bir HTTPS tünel URL'sine yönlendirilemez;
NAS üzerinde yetkilendirilmiş bir HTTPS API/uygulama katmanı gerekir. TS-233'ün
2 GB belleği nedeniyle MySQL için sınırlı buffer pool/bağlantı ayarı ve gerçek
bellek takibi yapılmalıdır. Bu yedek aşaması veritabanı bağlantısını değiştirmez.
