# Aiven → QNAP MySQL geçişi: hazırlık ve işletim

## Şimdiki aşama

Kaynak geri dönüş sürümü `v1.0.0-nas-stable` (28a0aa2) korunur. Yeni MySQL
ve API ayrı bir hazırlık ortamıdır. Production, `BUDGET_BACKEND_URL` eklenip
ilgili kod main'e alınana kadar Aiven kullanır. Bu belge veya paket tek başına
canlı veri aktarımı yapmaz; Aiven kapatılmaz ve verileri silinmez.

## Bağlantı

Tarayıcı aynı domain üzerindeki `/api/cloud` uç noktasını kullanmaya devam eder.
Vercel, yalnızca açıkça etkinleştirildiğinde dört mevcut API yolunu NAS'a iletir.
Cloudflare HTTPS → `veritabani-api:8790` → loopback uygulama → TLS MySQL.
MySQL ve API için NAS/modem üzerinde port açılmaz. API, mevcut
`butce-dekont_default` tünel ağına ve kendi özel MySQL ağına bağlanır;
MySQL yalnızca kendi özel ağında kalır.

İletim, 32 baytlık ayrı bir API anahtarıyla HMAC-SHA256 imzalanır. İmza,
özgün yöntem/yol, izin verilen başlıklar ve gövdeyi içeren zarfı kapsar;
60 saniyelik süre ve tek kullanımlık nonce uygulanır. Yanıt da imzalanır.
Yönlendirmeler izlenmez, otomatik yazma tekrarı ve Aiven'e hata halinde otomatik
geçiş yoktur. Google doğrulaması, oturum çerezleri, Origin kontrolü, kullanıcı
sahipliği, revision kontrolü ve dekont yetkilendirmesi NAS'taki mevcut uygulama
koduyla çalışır. İnternete açık ham SQL veya komut çalıştırma uç noktası yoktur.

NAS yalnızca kendi özel CA'sını doğrulayarak MySQL'e bağlanır. API kapsayıcısına
uygulama parolası ve genel CA sertifikası kopyalanır; root parolası ve CA imzalama
anahtarı bağlanmaz. Dekont anahtarı mevcut NAS dosyasından salt okunur bağlanır.
Tünel token'ı değiştirilmez veya API'ye verilmez.

## QNAP kurulumu

1. Mevcut `butce-veritabani` uygulamasını **Edit** ile düzenleyin; silmeyin.
2. `deploy/qnap-mysql/compose-with-api.yaml` içeriğini kullanın. Aynı veri/ayar
   dizinleri ve MySQL imajı korunur. İlk hazırlık işi mevcut parolaları ve TLS
   anahtarlarını korur, yalnızca API için gereken özel dosyaları kopyalar.
3. QNAP Advanced Settings → Resources: bellek 512 MB, CPU Unlimited;
   Default Web URL Port kapalı. YAML kaynak sınırı içermez; QNAP GUI ister.
4. `mysql-init` Exited (0), `mysql` Healthy ve `veritabani-api` Running/Healthy
   beklenir. API logu: `Butce NAS database API ready; private container port 8790.`
5. `network butce-dekont_default not found` görülürse klasör/veri silmeyin.
   Mevcut dekont uygulamasının Inspect/Networks alanından gerçek ağ adı
   doğrulanıp yalnızca `networks.dekont-tunnel.name` düzeltilir.
6. Cloudflare Networking → Tunnels → `butce-nas` → Routes → Add route →
   Published application: hostname `veritabani.muratcalti.com`, service
   `http://veritabani-api:8790`, path boş. DNS kaydı Cloudflare'da oluşur;
   Turkticaret hostinginde subdomain oluşturmak gerekmez.
7. `https://veritabani.muratcalti.com/health` yalnızca hizmet durumunu gösterir.
   Gerçek SQL/oturum denetimi imzalı özel isteklerle ayrıca yapılır.

API anahtarı: `butce-veritabani-veritabani-api-1` → Execute → `/bin/sh` →
`cat /config/api-key.txt`. Değeri yalnızca Vercel Production sunucu değişkeni
`BUDGET_BACKEND_SECRET` olarak saklayın. Sohbete, ekran görüntüsüne, GitHub'a
veya `EXPO_PUBLIC_*` ayarına koymayın. Bu anahtar Cloudflare token'ından ve
BUDGET_NAS_SECRET'tan farklıdır. **Canlı veriler taşınana kadar**
`BUDGET_BACKEND_URL` eklenmez. Böylece anahtarı hazırlamak trafiği değiştirmez.

## Veri aktarımı öncesi zorunlu kontroller

- Aiven'den tüm 14 uygulama/arşiv tablosunun tutarlı, özel SQL yedeği alınır;
  geri yükleme ayrı hedefte sınanır. Ham çalışan MySQL veri dizini kopyası
  mantıksal tutarlı yedeğin yerine geçmez.
- NAS `butce-dekont/dosyalar`, özel `uygulama` ayarları ve yeni
  `butce-veritabani/ayarlar` yedeklenir. NAS disk arızasına karşı ikinci bir
  cihazda veya ayrı depoda da kopya tutulur. SQL/PDF/anahtar yedekleri public
  GitHub'a veya bu depoya konmaz.
- Kullanıcı UUID'leri, Google kimlikleri, oturumlar/challenge'lar, document
  JSON ve revision'lar, dekont metadata/marker/silme kuyruğu ve TCMB arşivi
  korunur. Finansal belge veya kullanıcı eşlemesi yeniden üretilmez.
- Bu sürüm henüz otomatik dışa/içe aktarma uç noktası içermez. Veri taşıma
  aracı ve doğrulaması tamamlanmadan canlı URL değiştirilmez.
- Son aktarım sırasında kısa yazma durdurması uygulanır, son tutarlı kopya
  yüklenir, tablo sayıları/hash/revision ve PDF ilişkileri karşılaştırılır.
- Gerçek hesapla giriş, boş yeni kullanıcı, OMR, transfer, yatırım, hesap
  bakiyeleri, kart/taksitler, PDF yükleme/okuma/silme ve TCMB cron sınanır.

## Canlı geçiş ve geri dönüş

Doğrulanan aktarım sonrasında Vercel Production'da
`BUDGET_BACKEND_URL=https://veritabani.muratcalti.com` ve özel
`BUDGET_BACKEND_SECRET` etkinleştirilir. Yeni build, imzalı ulaşımı, Google
ayarını, anonim erişim engelini, SQL şemasını ve ayrı NAS dekont servisini sınar;
Aiven'e şema/smoke verisi yazmaz. Eski Aiven bağlantı ayarları başlangıçta
silinmez. Yeni rota etkin olduğunda bağlantı hatası 503 üretir, başka bir
veritabanına yazılmaz.

Hedefe yazı başlamadan önce eski sürüme dönmek yeterlidir. NAS'a yeni kayıtlar
alındıktan sonra sadece eski URL/tag'e dönmek Aiven'deki eski veriyi açar.
Bu durumda önce yazıları durdurup NAS'taki yeni kayıtları özel yedekleyerek
Aiven'e geri senkronize etmek ve doğrulamak gerekir. Kaynak etiketi veri
versiyonunu geri almaz. Aiven doğrulanmış geçiş ve veri geri dönüş planı olmadan
kapatılmaz.

## Doğrulama kanıtı

2026-10-27: 491 test geçti, önceden atlanan bir test atlandı. Köprü testleri,
çerez/Origin/yöntem/gövde koruması, çoklu Set-Cookie, PDF baytları, 3 MiB PDF
isteği, yetkisiz istekler, replay/değiştirme/süre aşımı, yönlendirme engeli,
cron yetkisi ve hata halinde Aiven'e geçmeme davranışını kapsar.

Aynı paket yerel amd64 Docker'da gerçek MySQL 8.4, 512 MiB SQL ve 256 MiB API
sınırıyla denendi: TLS sunucu doğrulaması, bütün tabloların oluşması, gerçek
SQL okuma/yazma, Google oturum tanıma, challenge çerezi, yanlış Origin/hesap
reddi ve revision çakışması doğrulandı. Sakin durumda SQL yaklaşık 142 MiB,
API yaklaşık 22 MiB kullandı; bunlar TS-233 üzerinde ölçülmüş değerler değildir.
ARM64 imajları sabittir; QNAP üzerinde gerçek başlatma ayrıca doğrulanır.

Runtime, `node scripts/build-nas-backend.mjs` ile bağımlılıklar ve SQL şeması
birlikte üretilir. Bootstrap Git commit'ine sabitlenmiş dosyayı SHA-256 kontrolüyle
indirir. Doğru önbellek varsa yeniden başlatmada indirme gerekmez. Güncelleme
ayrı runtime commit'i ve ona sabitlenen Compose hash/URL değişikliğiyle yapılır.
