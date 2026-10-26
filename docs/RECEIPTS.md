# İşlemlere PDF banka dekontu ekleme

NAS depolaması etkinleştirilen Production kurulumu için güncel yazma/okuma,
aktarım ve tam yedekleme davranışı [QNAP dekont depolama](NAS-RECEIPT-STORAGE.md)
belgesinde açıklanır. Aşağıdaki MEDIUMBLOB saklama, SQL varsayılanı ve geçici
NAS aktarım kuyruğunun temelidir.

İşlem ekle/düzenle ekranındaki **PDF dekont ekle** düğmesi gelir, gider,
transfer ve döviz al/sat işlemlerine PDF iliştirir. Dosya seçimi tarayıcı
belleğinde bekler. **Kaydet** önce bütçeyi kaydeder, ardından dekontları yükler.
Formu kaydetmeden kapatmak seçilen dosyaları yüklemez. Ekli dosyalar işlem
listesinde dekont sayısıyla gösterilir. İşlemi açarak **PDF’yi indir / aç**
düğmesinden erişilir. Dosya adları ve içerikleri diğer cihazlarda aynı Google
hesabıyla giriş yapıldığında erişilebilirdir.

Her PDF en fazla **3 MiB**, bir işlem en fazla **10 PDF**, her kullanıcı toplam
**3 GiB / 5000 dosya** depolayabilir. 3 MiB sınırı base64 JSON aktarımının Vercel Function
4.5 MB istek/yanıt sınırından küçük kalmasını sağlar. PDF imzası, sonlandırıcısı,
base64 biçimi ve gerçek bayt boyutu sunucuda kontrol edilir. Dosya uzantısını
değiştirmek yeterli değildir. Bu temel biçim kontrolü bir zararlı yazılım taraması
değildir; PDF'ler `attachment`, `nosniff` ve `sandbox` başlıklarıyla indirilir.

## Saklama ve yetkilendirme

`004-receipts.sql` mevcut Aiven MySQL içinde ayrı `budget_cloud_receipts`
tablosu oluşturur. PDF'ler MEDIUMBLOB olarak saklanır; bütçe JSON belgesine,
localStorage'a, uygulama paketine veya herkese açık statik dosyalara konmaz.
Yeni bir depolama hesabı, token veya ücretli servis gerektirmez. Dosya kapasitesi
mevcut MySQL hizmetinin disk alanını kullanır.

26 Ekim 2026 kontrolünde Aiven `developer-1` MySQL hizmetinin toplam diski
8192 MiB, disk kullanım metriği yaklaşık %3,5 idi. İlk sürümün 100 MiB
uygulama kotası 3 GiB'a yükseltildi; Aiven planı veya ücretlendirmesi değiştirilmedi.
3 GiB kullanıcı başına uygulama kotasıdır; fiziksel 8 GiB disk bütün kullanıcılar,
bütçe kayıtları ve MySQL sistem dosyaları arasında paylaşılır. Büyüyen kullanımda
disk kapasitesi artırılabilir veya PDF'ler özel erişimli nesne depolamasına
taşınabilir. Dosya sayısının 5000 ile sınırlandırılması metadata liste yanıtının
Vercel yanıt sınırını aşmasını önler.

`/api/cloud` eylemleri:

- `GET receipts&accountId=...`: yalnızca bu oturumun dosya metadata listesi.
- `POST receipt-upload`: `accountId`, istemcide üretilen UUID `id`,
  `kind` (`transaction` / `transfer`), `entryId`, `name`, `base64`.
- `GET receipt-download&accountId=...&id=...`: oturum doğrulamalı PDF yanıtı.
- `POST receipt-delete`: `accountId`, `id`; sahibine ait dosyayı siler.

Bütün eylemler mevcut HttpOnly Google oturumu ve beklenen hesap kimliğini
doğrular. POST eylemleri mevcut same-origin/JSON denetiminden geçer. Her SQL
sorgusu oturumun hesap kimliğine göre sınırlandırılır. UUID bir erişim anahtarı
değildir. Dosyalar ve metadata `no-store` yanıtlarıyla sunulur; service worker
API yanıtlarını önbelleğe almaz. Yalnızca kaydedilmiş, o kullanıcıya ait işlem
veya transfere dosya yüklenebilir. Dosya eklemek bütçe sürümünü değiştirmez;
iki cihazın bağımsız dosya yüklemeleri birbirini ezmez.

Yükleme ve bütçe belgesi yazma aynı hesap satırını SQL transaction içinde kilitler.
Böylece eşzamanlı yüklemeler kotayı aşamaz, işlem silme/yükleme yarışı sahipsiz
dosya bırakmaz. İşlem silme, toplu temizleme veya içe aktarma sonucu kaybolan
işlemlerin dekontları bütçe değişikliğiyle aynı transaction'da silinir. Başarısız
veya revision çatışmalı yazma dosyaları silmez. Hesap silme foreign key cascade
ile dosyaları siler.

## Hata ve yedekleme davranışı

İşlem kaydedilip dosya yüklemesi kesilirse form açık kalır ve açıkça işlem
kaydının başarılı, dekontun eksik olduğunu bildirir. Kaydet'e tekrar basmak aynı
işlem kimliğini kullanır. Her yükleme kendine ait sabit UUID ve SHA-256 içerik
hashi taşır; yanıt kaybolduktan sonra aynı yüklemenin tekrarı ikinci dosya
oluşturmaz. Dosya kaldırma seçimi de Kaydet'e basılana kadar uygulanmaz.

Uygulama CSV/JSON dışa aktarımları PDF baytlarını **içermez**. PDF'ler ayrı ayrı
indirilebilir. Tam sunucu taşıması/yedeklemesi `budget_cloud_receipts` tablosunu
da, hesaplar ve belgelerle birlikte, MySQL dump içinde (binary içerik için
`--hex-blob`) kapsamalıdır. Silinen işlemlerin dekontları JSON yedeğini geri
yükleyerek kurtarılamaz. Yeni şema idempotent `pnpm db:budget` ve Vercel build
tarafından kurulur; mevcut bütçeler değiştirilmez.
