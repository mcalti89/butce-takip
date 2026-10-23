# Kategori yönetimi

İşlemler ekranında ve işlem editöründeki Kategorileri yönet düğmesi gelir/gider
kategorilerini listeleme, ekleme, adını/rengini düzenleme ve kaldırma sağlar.
Veriler & kategoriler ekranından da erişilir. Yeni kategori ekleme kısayolu
korunur. Kategoriler mevcut kullanıcıya özel SQL bütçe belgesindedir; yeni
şema veya kullanıcılar arasında paylaşılan kategori tablosu yoktur.

İşlem içinden yönetim açılınca tutar, para birimi, hesap, tarih, saat ve açıklama
taslağı korunur. Aynı türde yeni kategori seçime alınır; silinen seçili kategori
taşıma hedefine veya geçerli bir kategoriye geçer. Taslak işlem, kategori
kaydedildi diye kendiliğinden kaydedilmez.

Kategori adı en fazla 40 karakterdir; aynı türde Türkçe büyük/küçük harf ve
fazla boşluk farkıyla mükerrer ad kabul edilmez. Mevcut kategori türü sabittir;
gelir/gider türünü değiştirmek yerine yeni türde kategori oluşturulur. Ad ve
renk düzenlenirken ID, mevcut işlem tutarları ve plan dönemleri değişmez.

Kaldırma açık bir onay ekranındadır. Kullanılmayan kategori doğrudan kaldırılır.
İşlem, ödeme planı veya herhangi bir ayda limit (sıfır dahil) varsa aynı türde
başka bir kategori seçmek zorunludur. Tüm geçmiş/gelecek işlemler ve aktif/arşiv
planlar tek belge güncellemesinde taşınır. Tutar, hesap, işlem saati, kur, plan
ID'si ve dönem numarası aynen korunur. Ay bazında limitler hedef kategoriyle
toplanır; toplam aylık limit değişmez. Bu, raporlarda geçmiş kategori dağılımını
seçilen hedefte birleştirir. İşlem silinmez.

Her türde en az bir kategori kalır; son kategoriyi kaldırmadan önce yeni bir
kategori eklenir. Değişiklikler mevcut seri güncelleme/revision mekanizmasından
geçer. Aynı anda oluşan yeni referanslar güncel belge üzerinde yeniden kontrol
edilir. Başka cihazdaki değişiklikle çakışma varsa sessizce üzerine yazılmaz.
Kategori filtresi silinmiş bir ID'de kalırsa İşlemler görünümü Tümü'ne döner.
