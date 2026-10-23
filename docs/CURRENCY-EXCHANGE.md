# Döviz al / sat

Hesaplar & Kartlar → Döviz al / sat sekmesi farklı para birimlerindeki iki aktif
nakit/banka hesabı arasında döviz dönüşümü kaydeder. Gerçek banka emri göndermez.
Kaynak tutar, tarih, isteğe bağlı saat ve hedef hesap seçildikten sonra “Kuru getir
ve hesapla” ile hedef tutar ve bülten tarihleri gösterilir. Kaydet iki hesabın
bakiyesini tek SQL JSON güncellemesinde değiştirir; gelir/gider kaydı oluşturmaz.

USD → TRY, kaynak USD'nin TCMB forexBuying (döviz alış) kurunu kullanır.
TRY → USD, hedef USD'nin forexSelling (döviz satış) kuruna böler. Dövizler arası
çapraz dönüşümde kaynak alış / hedef satış kullanılır. Kurun `unit` alanı uygulanır;
örneğin 100 JPY fiyatı bir JPY fiyatı olarak yorumlanmaz. Ara TL tutarı yuvarlanmaz;
yalnızca hedef para biriminin tutarı yuvarlanır. OMR için üç, diğer mevcut para
birimleri için iki ondalık korunur. OMR kaynağı TCMB USD / 0,3845 paritesi olarak
açıkça gösterilir. Banka/büro kuru farklı olabilir; ilk sürüm TCMB referans kurunu
kullanır, komisyon veya manuel kur içermez.

Kur servisi her para biriminde işlem günü veya öncesindeki son arşivlenmiş bülteni
getirir; sonraki günün kuru asla kullanılmaz. Hafta sonu, tatil veya henüz günlük
bültenin yayımlanmadığı günlerde gerçek bülten tarihi önizlemede ve geçmişte görünür.
Kur eksik, boş, sıfır veya gelecekteyse kayıt yapılmaz. Hesap/tarih/tutar değiştirilirse
eski önizleme kaydedilemez; yeniden hesaplanır. Not ve saat düzeltmek mevcut kur
snapshot'ını korur.

Yeni kayıt dizisi yerine mevcut `accountTransfers` içindeki tek kayda isteğe bağlı
`exchange` eklenir: kaynak tutar/para birimi mevcut alanlarda; hedef tutar/para birimi,
çapraz oran, her döviz ayağının alış/satış kuru, birimi, gerçek bülten tarihi ve OMR
kaynak işareti snapshot içinde saklanır. Normal aynı para birimli transferlerin
formatı değişmez; çapraz transfer exchange olmadan kabul edilmez. API kur-tutar
uyumunu, hesap para birimlerini, tarihleri ve hassasiyeti doğrular. SQL şema migration'ı
veya yeni ortam değişkeni gerekmez. Tam JSON yedeği bütün alanları taşır; CSV hâlâ
yalnızca gelir/gider kayıtlarını taşır.

`accountBalance` hedefe `exchange.toAmount`, kaynağa eski `amount` tutarını uygular.
Hesap aylık hareketleri aynı yöntemi izler; her hesap kendi para birimiyle uzlaşır.
İşlemler ve pano tek döviz hareketi gösterir; iki tutar görünür. Transfer filtresi
ve araması döviz işlemlerini de kapsar. Hesaplardaki Transferler sekmesi aynı para
birimli hareketleri, Döviz al / sat sekmesi dönüşümleri gösterir. İşlemler listesinden
doğru editör açılır; düzenleme ve silme iki bakiyeyi birlikte yeniden hesaplar.
Bütçeler, aylık/günlük gelir-gider ve kategori raporları bu dönüşümü harcama saymaz.
