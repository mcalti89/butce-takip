# İşlem ekle: Gider, Gelir, Transfer

Yeni işlem editöründe üç tür seçilir. Transfer, mevcut hesaplar arası aktarım
editörünü açar; ayrı gelir/gider kayıtları üretmez. Aynı para biriminde iki
farklı aktif hesap zorunludur. Kart borcu ödemesi de transferdir. OMR üç ondalık
hassasiyetini korur. Geçmiş gelir/gideri transfere dönüştürme ve planlı dönemin
türünü değiştirme bu akışta yapılmaz; yeni transfer kaydı oluşturulur.

Transferden Gelir/Gider'e dönülürse önceki gelir/gider taslağı korunur. Gelir/gider
taslağından aktarım açılırken uygun kaynak hesap, geçerli tutar, tarih, saat ve
not önerilir. Hiçbir kayıt kullanıcı Kaydet'e basmadan oluşturulmaz.

Transfer kaydında isteğe bağlı `time` alanı SS:DD biçimindedir. Yeni aktarımda
cihazın yerel saati önerilir. Eski saatsiz aktarım düzenlenirken saat uydurulmaz.
API geçersiz saatleri reddeder. Hesap bakiyeleri yine tarih üzerinden hesaplanır.
Mevcut özel SQL JSON belgesi ve tam JSON yedeği saati korur; migration yoktur.

İşlemler ve panodaki Son işlemler, mevcut `transactions` ve `accountTransfers`
kayıtlarını görüntüleme sırasında birleştirir.
Her transfer tek satırdır; iki hesap ayağı iki ayrı işlem olmaz. Kaynak/hedef,
not, para birimi ve saat gösterilir. Tarih, saat, ID azalan sıralanır; türler
arası aynı ID'ler ayrı React anahtarlarıyla korunur. Transfer satırına dokunmak
mevcut transfer düzenleyicisini açar. Hesaplar → Transferler sekmesi de korunur.

Tümü filtresi her iki kayıt türünü içerir. Gelir/Gider filtreleri transferleri
almaz; Transfer filtresi yalnızca transferleri getirir ve kategori seçimini
Tümü'ne döndürür. Bir kategori seçilirse transferler listelenmez. Arama, transfer
notu ve kaynak/hedef hesap adında da çalışır. Hareket sayısı tüm görünen satırları
sayar; üstteki gelir/gider metrikleri, bütçe uyarıları ve günlük/aylık raporlar
transferlerden etkilenmez. Transferleri görüntülemek kayıtları değiştirmez.

CSV, önceki gelir/gider işlem biçimini korur; transfer içermez. Ekrandaki açıklama
ve dışa aktarma mesajı bunu belirtir. Transferler için tam JSON yedeği kullanılır.
