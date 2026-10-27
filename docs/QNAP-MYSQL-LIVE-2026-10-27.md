# QNAP MySQL canlı geçiş kaydı — 2026-10-27

Bütçe uygulaması **https://butce.muratcalti.com** adresinde QNAP MySQL ile
çalışır. Aynı uygulamanın Vercel adresi de aynı yayına bağlıdır. Ön yüz ve
Google OAuth origin'i değişmemiştir.

## Doğrulanmış canlı yapı

- Uygulama kodu: `f387496c8e0a4a6b15b288ed35d12d56e5f0cc99`.
- Doğrulanan Production yayını: `dpl_Cor4xPgsMeHEUXUzRaBNXJC95swA`.
- Vercel → imzalı HTTPS → `https://butce-veritabani.muratcalti.com` → NAS
  üzerindeki API → özel Docker ağında CA/hostname doğrulamalı TLS MySQL 8.4.
- NAS API `/health` yanıtında `version:2`, `status:ok` gösterir. Sağlık yanıtı
  yönetim paneli veya SQL erişimi değildir; özel istekler HMAC gerektirir.
- MySQL portu NAS/modem üzerinde yayımlanmamıştır. Root uzak bağlantıya açık
  değildir. Vercel'in aktif veri yolu `BUDGET_BACKEND_URL` ile NAS'a yönelir.

## Veri yedeği ve doğrulama

Aiven üzerinde tek bir REPEATABLE READ tutarlı kopya alınmış, NAS'ta gzip ve
AES-256-GCM ile şifrelenmiş, yeniden okunarak doğrulanmış ve geri yüklenmiştir.
Son aktarım öncesinde canlı API'de yazma durdurması doğrulanmış, önceki
isteklerin tamamlanması için beklenmiştir. Hedefin 14 tablosu canlı geçiş
build'inde son kopyayla yeniden karşılaştırılmıştır.

- Son doğrulama: **14 tablo, 1981 SQL satırı**.
  Bu toplam finansal işlem sayısı değildir; döviz arşivi ve oturumlar da dahildir.
- Tablo başına satır sayıları ve SHA-256 özetleri eşleşmiştir. Kullanıcı UUID'leri,
  Google kimlik/oturum ilişkileri, finansal JSON belgeleri/revision'lar,
  döviz arşivi ve dekont metadata ilişkileri korunmuştur.
- NAS üzerindeki 1 mevcut dekontun boyutu ve içerik özeti doğrulanmıştır.
- İlk şifreli yedek: `08e2c4bf-1729-4e9b-8b65-96f232d56063.snapshot.enc`.
- Son şifreli yedek: `812204df-ae41-42e9-b595-e8256fa7cd5c.snapshot.enc`.
- Konum: QNAP `butce-veritabani/yedekler`. Her yedeğin yanında doğrulama
  metadata'sını içeren `.json` bulunur. Ayrıntılı tablo özetleri bu özel
  metadata'da saklanır; müşteri satırları GitHub'a konmamıştır.

Şifreli yedekleri açmak için `butce-veritabani/ayarlar/backend/backup-key.txt`
gereklidir. Özel `ayarlar` dizininin, dekont `uygulama` ayarlarının ve PDF
`dosyalar` dizininin yedekleri de korunmalıdır. Bu anahtar ve şifre dosyaları
GitHub'a, sohbete veya herkese açık bir klasöre yüklenmez. Mevcut şifreli
yedekler varken anahtar eksikse servis yeni anahtar üretip devam etmez.

Bu kayıt, aktarım anındaki şifreli yedekleri belgeler. Düzenli zamanlanmış
SQL yedekleme ve NAS dışına otomatik kopyalama bu geçiş sırasında kurulmamıştır.
GitHub sürümü uygulama kodunu korur; canlı SQL/PDF verilerinin yerine geçmez.

## Canlı kontroller

Her iki alan adının da yeni Production yayınına baktığı Vercel Alias API'sinden
doğrulanmıştır. Canlı Vercel adresinde Google giriş hazırlığı/nonce üretimi,
güvenli HttpOnly/SameSite oturum çerezi aktarımı, anonim bütçe/dekont erişiminin
reddi, yanlış Origin'in reddi, NAS proxy cron yetkisi ve TCMB arşiv okuması
başarılıdır. Gerçek kullanıcı adına Google hesabıyla oturum açılmamıştır;
kimlik verileri ve geçerli oturum hash'leri SQL karşılaştırmasına dahildir.

Geçici `BUDGET_WRITES_PAUSED`, `BUDGET_MIGRATION_OPERATION`,
`BUDGET_MIGRATION_FROZEN_SINCE` ve `BUDGET_EXPECTED_NAS_MANIFEST` ayarları
Production proje ayarlarından kaldırılmıştır. Yazma işlemleri açıktır.
`BUDGET_NAS_STANDBY_URL` hazırlık/denetim adresidir; canlı yönlendirmeyi
`BUDGET_BACKEND_URL` belirler.

## Kaynak sürümleri ve geri dönüş

- İlk kod yedeği: `v1.0.0-nas-stable`.
- QNAP SQL canlı geçişinden önce: `v1.0.1-before-qnap-mysql` ve
  `backup/pre-qnap-cutover-2026-10-27` dalı.
- Canlı QNAP kodu ve bu kurtarma kaydı: `v1.1.0-qnap-mysql`.

Aiven hizmeti ve eski bağlantı ayarları geri dönüş için korunmuştur. Uygulama
aktifken Aiven'e otomatik geri dönmez. **QNAP'a yeni kayıtlar alındıktan sonra
Aiven eski veriyi içerir.** Yalnızca adresi değiştirmek veya eski kaynak
etiketini yayımlamak güncel finansal verileri geri taşımaz. Önce yazılar
durdurulmalı, NAS'taki güncel veriler özel yedeklenip hedefe geri senkronize
edilmeli ve doğrulanmalıdır. Aiven doğrulanmış geri dönüş ve bağımsız veri
yedeği olmadan silinmemelidir.

Kurulum, özel aktarım işi ve korumalar için
[NAS-DATABASE-MIGRATION.md](NAS-DATABASE-MIGRATION.md) belgesine bakın.
