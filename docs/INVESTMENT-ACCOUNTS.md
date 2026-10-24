# Yatırım hesapları ve hesap türü değişimi

Nakit, Banka, Kredi kartı ve Yatırım olmak üzere dört tür vardır. Yatırım
hesabının bakiyesi kendi kartında ve aylık hareketlerinde gösterilir; genel
hesap toplamı, net varlık, kullanılabilir bakiye, tahmin, gelir/gider, günlük ve
aylık rapor, kategori eğilimi, bütçe uyarısı ve tasarruf hedefi hesaplarına alınmaz.
Yatırım tutarları farklı para birimlerine ait genel toplam satırı da oluşturmaz.

Yatırıma para aktarmak veya parayı geri almak için aynı para birimli normal
transfer kullanılır. Kaynak hesabın bakiyesi düşer, hedefinki yükselir; transfer
gelir/gider oluşturmaz. Bu nedenle yatırıma ayrılan para kullanılabilir işletim
bakiyesinde kalmaz. Yatırım hesabı yeni gelir/gider, ödeme planı ve döviz al/sat
seçeneklerinde yer almaz. Döviz dönüşümü önce normal hesaplar arasında yapılır,
ardından yatırım hesabına normal transferle aktarılabilir.

## Tür değişimi ve geçmiş

Hesabı düzenle ekranındaki tür düğmeleri, hareketi olan hesaplarda da açıktır.
Hesap kimliği, geçmiş hareketler ve açılış bakiyesinin işareti korunur; kartın
borç giriş biçimine geçilirken alanın görünen işareti otomatik uyarlanır.
Kart limiti ve tarih ayarları diğer türdeyken kullanılmaz, tekrar kart yapılırsa
korunan ayarlar doldurulur. Hareketi bağlı hesabın para birimi değiştirilemez.
Taksit geçmişi olan hesap Kredi kartı veya Yatırım türünde kalmalıdır; eski döviz
geçmişi olan hesap Kredi kartına çevrilemez. Bu durumlarda açıklayıcı hata verilir.

Mevcut hesap Yatırım yapılırsa geçmiş gelir/gider, plan ve döviz kayıtları
silinmez. Hesabın kendi bakiyesinde geçmiş kayıtlar hesaba katılır; genel bütçe
ve raporlardan çıkarılır. Yatırım türündeyken bağlı planlar/taksitler takvim ve
tahminde çalışmaz. Hesap eski türüne döndürülürse geçmiş ve bağlı planlar yeniden
normal kapsama girer. Yatırımın kendi aylık ekranı genel gelir/gider metrikleri
yerine yalnızca hesabın özel geçmişi ve bakiyesini açıklar.

## Veri bütünlüğü

`kind: "investment"` mevcut kullanıcıya özel SQL JSON belgesinde saklanır;
şema göçü gerekmez. `budgetTransactions` yatırım hesabına bağlı geçmiş gelir ve
giderleri bütçe kapsamından çıkarır. `paymentOccurrences` yatırımın planlarını
atlayarak takvim ve tahminin aynı kurala uymasını sağlar. Hesap toplamları ve
tahmin ayrıca yatırım bakiyelerini dışlar. Normal transferler izlenebilir kalır.

API mevcut belgeyle karşılaştırarak yatırım hesabına yeni doğrudan gelir/gider,
yeni/değişmiş mali plan veya yeni döviz dönüşümü eklenmesini engeller. Tür
sınıflandırması sırasında mevcut geçmiş aynen korunabilir; not, saat ve kategori
gibi mali tutarı değiştirmeyen düzeltmeler mümkündür. Normal transfer serbesttir.
Sürüm kontrolü eşzamanlı güncellemeleri korur. Boş bütçeye tam JSON yedeği geri
yüklenirken geçmişi yatırım olarak sınıflandırılmış kayıtlar da geri alınabilir.
Tam JSON/ham işlem CSV yedekleri saklanan geçmişi korur; rapor CSV'si yatırım
hesaplarının gelir/giderini içermez. Yatırım özellikleri yeni hesaplara örnek
hesap veya örnek hareket eklemez.

Yatırım menüsündeki portföy kayıtları ve gerçekleşmiş getiriler için
[INVESTMENT-PORTFOLIO.md](INVESTMENT-PORTFOLIO.md). Portföy kaydı bağlı hesap
yatırım türünde kalır; böylece yatırım nakit/getirileri normal bütçeye taşınmaz.
