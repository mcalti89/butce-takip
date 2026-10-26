# QNAP TS-233 özel dekont servisi — ilk kurulum

Hedef cihaz QNAP TS-233, ARM64 Cortex-A55, 2 GB RAM ve QTS 5.2.6.3195.
Node.js resmi ARM64 Alpine imajı kullanılır. Bu klasör ilk NAS servisini kurar;
Vercel uygulamasının mevcut MySQL dekont depolamasını değiştirmez.

## QNAP hazırlığı

QNAP Kontrol Paneli → İzinler → Paylaşılan Klasörler içinde `butce-dekont`
paylaşımını oluşturun. Misafir erişimini kapatın. File Station içinde şunları
hazırlayın:

- `/share/butce-dekont/uygulama`: kalıcı servis yapılandırması ve bağlantı anahtarı.
- `/share/butce-dekont/dosyalar`: kullanıcı UUID klasörleri içindeki PDF dosyaları.

Container Station → Applications → Create Application:

1. Adı `butce-dekont` yapın.
2. `compose.yaml` dosyasının içeriğini YAML alanına yapıştırın veya Upload → Local
   Computer ile yükleyin.
3. Advanced Settings → Resources bölümünde bellek sınırını 256 MB yapın. CPU
   sınırı ilk kurulumda Unlimited kalabilir. Default Web URL Port kapalı kalmalıdır.
   Container Station kaynak sınırlamalarını kendi arayüzünden yönetir; YAML
   içinde `mem_limit`, `cpus`, `pids_limit` veya `deploy.resources` eklemeyin.
   Aksi halde “Incompatible Docker Compose YAML File — Resources” uyarısı çıkar.
   Validate ile doğrulayın ve Create seçin. İlk açılışta imaj ve servis indirilir.
4. `dekont-api` servisi Running ve ardından Healthy olmalı. Logs içinde
   `Butce NAS receipt service ready` yazısı görünür.
5. File Station'da `uygulama/service-key.txt` oluşur. **Bu dosyanın içeriğini
   ekran görüntüsünde, GitHub'da veya sohbette paylaşmayın.** Sonraki bağlantı
   adımında yalnızca Vercel'in sunucu ortam değişkeni olarak kullanılacaktır.

Servis kaynak kodu sabit Git commit'inden indirilir, SHA-256 ile doğrulanır ve
`uygulama/receipt-server.mjs` içinde saklanır. Yeniden başlatma, doğrulanmış
önbelleği kullanır ve bağlantı anahtarını korur. Kaynak indirme HTTPS sertifika
kontrolüyle yapılır. İndirme veya doğrulama başarısızsa bilinmeyen kod çalışmaz.
`uygulama` klasörünün yedeği gizli bağlantı anahtarını da içerir; özel tutulmalıdır.

İlk kurulumda internet erişimi gerekir. Modem portu, FTP, SSH, UPnP veya NAS
uzaktan yönetim ekranı açılmaz. Compose dosyasında yayımlanan host portu yoktur.
Sağlık kontrolü kapsayıcı içindeki localhost üzerinden çalışır. Konteynerin
256 MB bellek sınırı QNAP Resources arayüzünden ayarlanır. Node.js heap sınırı
YAML içinde 128 MiB olarak kalır; tüm Linux yetenekleri kapalıdır.
Ana dosya sistemi salt okunur, yalnızca `/config`, `/data` ve geçici `/tmp`
yazılabilir. QNAP'ın başka paylaşımı, Docker socket'i veya host ağı bağlanmaz.

## Sonraki bağlantı aşaması

Bu aşama **henüz canlı uygulamanın PDF'lerini QNAP'a taşımaz**. Sonrasında:

1. Güvenli dış HTTPS erişimi hazırlanır. Tercih, ayrı bir kapsayıcıdan başlatılan
   outbound tüneldir. Bir Cloudflare Tunnel aynı Compose ağına eklendiğinde origin
   adresi `http://dekont-api:8787` olur. DNS/alan adı uygunluğu ayrıca kontrol
   edilmelidir; mevcut web ve e-posta kayıtları değiştirilmeden önce incelenir.
2. Vercel'de NAS adresi ve `service-key.txt` değeri yalnızca sunucu ayarı olur.
3. Uygulama Google oturumunu ve dekont sahibini MySQL metadata üzerinden kontrol
   ettikten sonra NAS'a imzalı istek gönderir. Bağlantı anahtarı tarayıcıya verilmez.
4. Mevcut PDF'ler kopyalanır ve SHA-256 ile doğrulanır. Aktarım tamamlanmadan
   MySQL kopyaları silinmez veya aktif depolama değiştirilmez.

Tünel henüz kurulmadığı için NAS IP'si veya myQNAPcloud URL'siyle bu dosya servisine
uzaktan erişim beklenmemelidir. Dosya sahibi ve işlem ilişkisi MySQL'de kalacaktır;
NAS yalnızca PDF baytlarını saklar. Mevcut uygulama kotası ve 3 MiB dosya sınırı
bu ilk kurulumla değişmez.

## İstek protokolü

`GET /health` yalnızca servis sağlık durumunu verir; anahtar, dosya veya kişi
bilgisi dönmez. Dosya endpoint'i:

`/v1/receipts/<kullanıcı-UUID>/<dekont-UUID>`

Yöntemler `PUT`, `GET`, `HEAD`, `DELETE`. Her dosya isteğinde şu başlıklar gerekir:

- `X-Budget-Timestamp`: Unix milisaniye, en fazla ±60 saniye.
- `X-Budget-Content-Sha256`: gövdenin SHA-256 özeti; PUT dışındakilerde boş gövde.
- `X-Budget-Signature`: HMAC-SHA256 (anahtar, `service-key.txt` içindeki hex değerin
  **hex olarak çözülmüş 32 baytı**). İmzalanan UTF-8 metin, son satır sonu olmadan:

```
METHOD\n/path\ntimestamp\ncontent-sha256
```

Yöntem, hesap UUID'si, dosya UUID'si, tarih ve içerik imzaya dahildir. PUT yalnızca
`application/pdf` ve en fazla 3 MiB kabul eder. PDF işaretleri ve içerik özeti
kontrol edilir. Dosyalar geçici dosyaya yazılıp fsync ve atomik hard link ile
saklanır; aynı içerikle tekrar güvenlidir, farklı içerikle üzerine yazılmaz.
GET PDF'yi `attachment`, `nosniff`, `no-store`, sandbox ve içerik hash'i ile döner.
DELETE idempotenttir. Diskte en az 256 MiB boş alan bırakılır ve aynı anda en
fazla 4 dosya isteği işlenir. Saatin NTP ile doğru olması gereklidir.

NAS yöneticisi fiziksel dosyaları okuyabilir. Servis yolu yalnızca imzalı Vercel
isteklerine açılır; tünel kimlik doğrulamanın yerine geçmez. NAS/UPS arızasına
karşı özel klasörlerin bağımsız yedeği ayrıca tutulmalıdır.

Testler: `pnpm run test tests/nas-receipts.test.mjs --maxWorkers=1 --minWorkers=1`.
ARM64 imajının platform desteği registry manifestinden kontrol edilmiştir;
QNAP donanımı üzerinde fiili başlatma kullanıcı tarafından yapılacaktır.
