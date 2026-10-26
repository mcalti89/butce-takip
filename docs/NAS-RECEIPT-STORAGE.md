# QNAP üzerinde özel PDF dekont depolaması

QNAP servisi `deploy/qnap` kurulumuyla çalışır. Production hedefi
`https://dekont.muratcalti.com` olup dosya servisi Cloudflare Tunnel üzerinden
sunulur. Google oturumları, bütçe belgeleri, dekont sahipliği ve metadata MySQL'de
kalır. Bu değişiklik MySQL hizmetini Aiven'den taşımaz.

## Sunucu ayarları

- `BUDGET_RECEIPT_STORAGE=nas`: yeni dosyaların NAS'a aktarılmasını etkinleştirir.
- `BUDGET_NAS_URL=https://dekont.muratcalti.com`: HTTPS origin; yol/query/credentials
  kabul edilmez. TLS doğrulaması açık, HTTP yönlendirmesi kapalıdır.
- `BUDGET_NAS_SECRET`: QNAP `uygulama/service-key.txt` içindeki 64 karakter hex
  değer. Cloudflare tünel token'ı değildir. Yalnızca Production sunucu sırrıdır;
  EXPO_PUBLIC öneki verilmez ve sohbette paylaşılmaz.
- `BUDGET_RECEIPT_SYNC_SECRET`: yetkili bakım çağrıları için bağımsız sunucu sırrı.
- `CRON_SECRET`: Vercel'in zamanlanmış bakım çağrılarında kullandığı mevcut sır.

`service-key.txt` Linux 0600 izinleriyle oluşturulur. Windows SMB oturumu dosyayı
okuyamıyorsa QNAP Container Station → `dekont-api` → Execute → `/bin/sh` içinde
`cat /config/service-key.txt` çalıştırılıp sonuç doğrudan Vercel ayarına konabilir.
Dosya izinlerini herkese açmak gerekmez. Ekran görüntüsünde anahtar paylaşılmaz.

## Yazma ve okuma güvenceleri

PDF yüklemesi önce MySQL'e ve sahibinin işlemine güvenle kaydedilir. NAS'a PUT
isteği gönderilir, ardından GET ile gerçek baytlar geri okunur. Dosya boyutu ve
SHA-256, ilk yüklenen içerikle aynı olmadan NAS konumu işaretlenmez ve SQL gövdesi
boşaltılmaz. Başarılı yeni yüklemede SQL'de yalnızca metadata, NAS'ta PDF kalır.

NAS'a erişim kesilirse mevcut SQL kaydı korunur, API yüklemeyi çevrimiçi kayıt
olarak döndürür ve UI **NAS aktarımı bekliyor; çevrimiçi kaydedildi** gösterir.
Aynı dosya UUID'siyle tekrar deneme hem SQL hem NAS için idempotenttir. Sonraki
bakım işinde bekleyen dosyalar tekrar aktarılır. NAS'taki dosya metadata'da
kayıtlı boyut/hash ile uyuşmazsa indirilmiş içerik kullanıcıya gönderilmez.

Geçiş sırasında eski SQL dosyaları NAS'a kopyalanıp doğrulanabilir ve SQL yedeği
korunabilir. NAS kopyası işaretlenmiş bir kayıtta NAS geçici olarak erişilemiyorsa
geçerli SQL yedeği kullanılabilir. SQL yedeği doğrulanıp boşaltılmış bir NAS
kaydında, NAS erişilemezse boş/başarılı PDF yerine açık bir 503 hatası döner.

HMAC protokolü QNAP rehberinde açıklanmıştır. İstekler kullanıcı UUID'si, dosya
UUID'si, yöntem, zaman ve içerik özetiyle imzalanır. Tarayıcı NAS anahtarını almaz;
bütün dosya istekleri mevcut Google oturumu ve MySQL sahiplik kontrolünden geçer.

## Şema ve silme

`005-receipt-nas.sql` iki idempotent tablo ekler:

- `budget_cloud_receipt_nas`: doğrulanmış NAS konumu. Dosya metadata'sı silinince
  foreign key ile konum kaydı da silinir.
- `budget_cloud_receipt_nas_deletions`: fiziksel silme için kalıcı iş kuyruğu.
  Metadata veya hesap kaldırılmasından bağımsız yaşayabilir.

Dekont/işlem silinmesinde NAS silme işi metadata silinmesiyle aynı SQL transaction
  içinde yazılır. Başarısız veya revision çatışmalı bütçe yazması silme işi üretmez.
Google kullanıcılarına dosya erişimi metadata silindiğinde hemen kapanır. NAS
fiziksel temizliği kısa bir denemeyle başlar; kesinti durumunda iş kuyrukta kalır.
Belirsiz bir önceki NAS yazmasının tamamlanmasına fırsat vermek için henüz NAS
konumu doğrulanmamış kayıtların silinmesi en az 60 saniye ertelenir. Kuyruk
bekleyen aynı UUID'yle yeni dosya açılmaz; yeniden seçim yeni bir UUID üretir.

Uygulama yazmaları ve NAS aktarımı aynı kullanıcı satırını kilitleyerek işlem
silme/aktarma yarışında dosyaları korur. Bir dosyanın fiziksel temizliği sırasında
aynı ID ile aktif metadata varsa NAS dosyası silinmez. NAS DELETE idempotenttir.

## Aktarım ve bakım

`/api/receipts-sync` yalnızca `Authorization: Bearer ...` ile çalışır. Kabul edilen
sır `BUDGET_RECEIPT_SYNC_SECRET` veya mevcut `CRON_SECRET`'tir. Endpoint kullanıcı
kimliği/dosya adı/anahtar döndürmez; yalnızca sayısal ilerleme bilgileri verir.

- Yetkili POST `{ "prune": false }`: en fazla 5 eski/bekleyen dosyayı kopyalar,
  geri okuyup doğrular ve SQL kopyalarını korur.
- Yetkili POST `{ "prune": true }`: NAS kopyasını tekrar doğrulayarak SQL PDF
  gövdelerini boşaltır; metadata ve sahiplik kalır.
- Vercel Cron GET: her gün 03:30 UTC'de bekleyen aktarım/silmeleri tekrar dener ve
  doğrulanmış NAS kopyaları için SQL PDF gövdelerini boşaltır.

Her çağrı sınırlı bir parti işler. `pending` ve `backups` sıfıra ulaşana kadar
POST çağrıları sürdürülebilir. Bakım çağrısındaki başarısızlık mevcut SQL
kopyalarını ve silme kuyruğunu korur. Cloudflare/NAS servis URL'si, anahtar veya
özel dosyalar loglanmaz.

Production build, yeni yayın aktif olmadan önce yalnızca rastgele sentetik
kullanıcı/dosya UUID'leriyle NAS PUT/GET/SHA-256/DELETE testi yapar. Google oturumlu
API smoke testi de gerçek NAS yolunu doğrular. Bu kontroller başarısızsa build
durur, mevcut Production yayını çalışmaya devam eder. Gerçek dosyaların toplu
aktarımı yeni sürüm aktif olduktan sonra yetkili bakım endpoint'iyle yapılır.

## Tam yedek ve taşıma

CSV/JSON bütçe yedekleri PDF içermez. NAS'a geçişten sonra tam yedek üç parçayı
birlikte kapsamalıdır: MySQL metadata/bütçe tabloları, QNAP `dosyalar` klasörü ve
özel tutulan QNAP `uygulama` yapılandırması. MySQL dump tek başına NAS'taki PDF
baytlarını içermez. Dosya başına 3 MiB, kullanıcı başına 3 GiB ve 5000 dosya
sınırları korunur. Büyük NAS diski bu uygulama kotasını otomatik artırmaz.
