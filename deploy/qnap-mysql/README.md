# QNAP TS-233 için özel MySQL hazırlığı

Bu ilk adım, Aiven'den bağımsız ve başlangıçta boş bir MySQL 8.4 LTS sunucusu
kurar. Mevcut Vercel uygulamasının `BUDGET_DATABASE_URL` ayarı değiştirilmez;
uygulama bu aşamada Aiven ile çalışır. Kaynak geri dönüş sürümü:
`v1.0.0-nas-stable` / `28a0aa246514d23a2670b292390dd904fbada27f`.

## QNAP üzerinde kurulum

1. Kontrol Paneli → Paylaşılan Klasörler içinde yalnızca yöneticilerin
   erişebileceği `butce-veritabani` paylaşımını oluşturun.
2. İçine `ayarlar`, `veri` ve `yedekler` klasörlerini oluşturun.
3. Container Station → Applications → Create Application: `butce-veritabani`.
4. `compose.yaml` dosyasını yapıştırın. Advanced Settings → Resources içinde
   bellek sınırı **512 MB**, CPU Unlimited; Default Web URL Port kapalı.
   YAML'de kaynak sınırı tanımları QNAP uyumluluğu için kullanılmaz.
5. Validate → Create ile başlatın. İlk image indirme/başlatma birkaç dakika
   sürebilir. `mysql-init` için **Exited (0)** normaldir; hazırlık işi tamamlanır.
   `mysql` için **Running / Healthy** beklenir.

Root ve uygulama parolaları NAS'ta `ayarlar/mysql` altında rastgele üretilir.
CA özel anahtarı `ayarlar/private` altında kalır ve MySQL kapsayıcısına bağlanmaz. Parolalar veya özel TLS
anahtarları GitHub'a, Compose içine, loglara veya sohbete konmaz. `ayarlar`
klasörünün yedeği özel tutulmalıdır. Mevcut ayar dosyalarını silmek/parola
  dosyalarını elle değiştirmek çalışan MySQL hesabının parolasını değiştirmez.

MySQL, 128 MiB InnoDB buffer pool, sınırlı bağlantı/sıralama tamponları ve kapalı
performance_schema ile hazırlanır. NAS'ın 2 GB belleğinde diğer uygulamalarla
birlikte gerçek kullanım izlenmelidir. Bellek yetmezse veri aktarımı yapılmadan
önce kaynak tüketimi veya alternatif hosting hedefi değerlendirilir.

## Erişim ve TLS

Hiçbir host portu yayımlanmaz. Özellikle 3306 için modem port yönlendirmesi,
Cloudflare DNS-only IP kaydı veya QNAP dışa açık SQL portu oluşturulmaz.
MySQL yalnızca bu uygulamanın özel Docker ağında dinler. Uygulama hesabı
`butce_app`, veritabanı `butce` olur. Root uzak bağlantıya açılmaz.

MySQL özel CA ve `mysql` servis adını içeren sunucu sertifikasıyla TLS zorunlu
olarak çalışır. Sonraki NAS API katmanı, bu CA'ya güvenerek hostname doğrulaması
  ile MySQL'e bağlanabilir. Sertifikalar 10 yıl için üretilir; mevcut sertifika
  dosyaları yeniden oluşturulmaz. İlk hazırlık işi, var olan veritabanının
  özel ayarları eksikse yeni anahtar üretip devam etmek yerine durur.

`mysqladmin ping` sağlık kontrolü MySQL sürecinin ayakta olduğunu gösterir;
uygulama kullanıcısı, TLS, şema ve veri doğrulaması sonraki aşamada ayrıca yapılır.

## Tam aktarım için sonraki zorunlu aşamalar

- Aiven'in bütün tabloları ve QNAP PDF/config klasörlerinin özel yedeği alınır.
- NAS'ta yalnızca yetkili Vercel isteklerini kabul eden HTTPS API katmanı kurulur.
  Vercel mysql2 TCP bağlantısı, bir Cloudflare HTTPS tünel URL'sine doğrudan
  yönlendirilemez. Cloudflare Tunnel bu API'ye bağlanacaktır; SQL portuna değil.
- Bütçe/Google kimlik UUID'leri, revision'lar, finansal hesaplar, TCMB arşivi,
  dekont metadata'sı ve NAS dosya ilişkileri ayrı hedefte korunarak aktarılır.
- Test girişleri, işlem/transfer, OMR hassasiyeti, eşzamanlı yazma koruması,
  TCMB güncellemesi, NAS dekontları ve geri yükleme doğrulanır.
- Kısa yazma durdurmasıyla son senkronizasyon tamamlanınca Production değiştirilir.
  Aiven, geçiş doğrulaması tamamlanana kadar korunur.

Bu kurulum tamamlandığında tek başına veri taşınmış olmaz. Ham `veri` klasörü
çalışan sunucudan kopyalanarak tutarlı SQL yedeği alınmış sayılmaz; tutarlı dump
veya uygun snapshot yöntemi gereklidir. Sonraki adımda otomatik özel yedekleme
ve geri yükleme testi de hazırlanacaktır.

## Hazırlık doğrulaması

Resmi imajların ARM64 manifestleri doğrulandı. Aynı yapılandırma yerel amd64
kapsayıcısında 512 MiB bellek sınırıyla başlatılarak şu kontroller yapıldı:
MySQL Healthy/OOM yok, uygulama hesabıyla TLS VERIFY_IDENTITY bağlantısı,
şifresiz bağlantı reddi, root yalnızca localhost, host portu yayımlanmaması,
yeniden hazırlıkta mevcut kimlik bilgilerinin korunması ve eksik özel ayarlarda
başlatmanın durması. QNAP donanımındaki gerçek başlatma ve bellek durumu ayrıca
kurulumdan sonra kontrol edilir.

## API katmanı (ikinci aşama)

MySQL uygulama hesabı ve VERIFY_IDENTITY testi başarılı olduktan sonra
`compose-with-api.yaml` mevcut uygulamaya ek özel API servisini kurar.
Ayrıntılı kurulum, veri yedeği/aktarım şartları ve geri dönüş kısıtları:
[docs/NAS-DATABASE-MIGRATION.md](../../docs/NAS-DATABASE-MIGRATION.md).
Bu paket canlı verileri otomatik taşımaz veya Production'ı değiştirmez.

API paketinin güncel sürümü `/health` yanıtında `version:2` gösterir. Özel
şifreli yedekleme/geri yükleme desteği için `yedekler` klasörü API'ye bağlanır.
Mevcut API bağlantı anahtarı korunur; Vercel'e yeniden anahtar eklemek gerekmez.
Şifreleme anahtarı ayrıca `ayarlar/backend/backup-key.txt` içinde oluşur ve
özel ayar yedeğine dahil edilmelidir. Hiçbir veri otomatik olarak canlıya alınmaz.
