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

## Cloudflare Tunnel kapsayıcısını ekleme

Cloudflare'de `butce-nas` adlı uzaktan yönetilen Cloudflared tüneli oluşturulur.
Docker kurulum ekranındaki komutun `--token` parametresinin değeri gizlidir;
komutun tamamı veya ekran görüntüsü sohbette paylaşılmamalıdır.

1. Komutu kendi bilgisayarınızda bir metin düzenleyiciye kopyalayın. Yalnızca
   `--token` sonrasındaki uzun değeri, çevreleyen tırnaklar olmadan ayırın.
   Komutun `docker run ... --token` kısmını silin.
2. Token'ı tek satır, UTF-8 (BOM olmadan) olarak `cloudflare-token.txt` adıyla
   kaydedin. File Station ile `butce-dekont/uygulama` klasörüne yükleyin.
   Dosya adının `.txt.txt` olmadığını kontrol edin. Klasör özel kalmalıdır.
   Mevcut `service-key.txt` dosyasını değiştirmeyin; iki anahtar farklıdır.
3. Container Station → Applications → `butce-dekont` → Edit/Recreate YAML
   ekranını açın. `compose-with-tunnel.yaml` içeriğiyle yapılandırmayı değiştirin.
   Aynı uygulama adı ve aynı iki NAS dizini korunur. Uygulamayı silmek veya
   depolama klasörlerini temizlemek gerekmez.
4. Advanced Settings → Resources içinde bellek sınırını kapsayıcı başına
   256 MB tutun; CPU Unlimited kalabilir. Default Web URL Port kapalı kalsın.
   Validate ve Apply/Update/Create ile uygulayın.
5. İki kapsayıcı (`dekont-api`, `cloudflared`) Running olmalı. Tünel sağlığı
   bağlantı kurulduktan sonra Healthy olur. Cloudflare'de Connection Status
   Connected/Healthy görünür. Token hatası varsa yalnızca hata metnini paylaşın;
   token veya tam kurulum komutunu paylaşmayın.

Tünel imajının ARM64 manifesti sabit SHA-256 digest ile seçilmiştir. `--token-file`
ve `tunnel ready` komutları resmi imajın CLI'sında doğrulanmıştır. Token yalnızca
cloudflared kapsayıcısına salt okunur dosya olarak bağlanır; Compose dosyasında,
komut satırında, web paketinde veya GitHub'da yer almaz. Kapsayıcı, QNAP'ın
paylaşım izinleriyle uyum için UID/GID 0 kullanır; Linux yetenekleri kapalıdır.
Token dosyası NAS paylaşım izinleri ve dosya izinleriyle kapsayıcıdan okunabilir
olmalıdır. Token mount'u dosya olmalıdır; dosya yüklenmeden uygulama başlatılırsa
Docker o isimde dizin oluşturabilir. Böyle bir durumda o **boş dizin** kaldırılır,
gerçek token dosyası yüklenir ve uygulama yeniden başlatılır.

Yayımlanan NAS portu yoktur. Dış bağlantı HTTP/2 ile outbound TCP 7844 kullanır;
bu bir modem port yönlendirmesi değildir. Sağlık kontrolü localhost:2000 üzerinden
çalışır; metrics portu dışarıya açılmaz. Hiçbir `network_mode: host`, `privileged`
veya Docker socket mount'u kullanılmaz. Tünel API ile aynı Compose ağına katılır.

### Kalıcı hostname rotası

Cloudflare tünelinin Published application routes / Public hostnames bölümünde:

| Alan | Değer |
|---|---|
| Subdomain | `dekont` |
| Domain | `muratcalti.com` |
| Path | Boş |
| Service Type | HTTP |
| Service URL | `dekont-api:8787` |

Bu URL tünelin Docker ağı içinde eriştiği origin adresidir. Public adres
`https://dekont.muratcalti.com` olur. QNAP IP'si, QTS yönetim portu veya metrics
portu origin olarak girilmez. İmzasız dosya istekleri NAS servisi tarafından
401 ile reddedilmeye devam eder; `/health` yalnızca sağlık durumunu döndürür.

Tünel ve hostname hazır olduğunda HTTPS `/health` ve anonim dosya erişim engeli
kontrol edilir. Vercel NAS adapter'ı ve doğrulanmış aktarım ayrıca tamamlanmadan
bütçe uygulamasının SQL depolaması değiştirilmez.

Uygulamanın NAS adapter ayarları, doğrulanmış aktarım ve yedekleme için
[QNAP dekont depolama](../../docs/NAS-RECEIPT-STORAGE.md) belgesine bakın.
