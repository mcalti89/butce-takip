# Günlük tablo ve hesap hareketleri

Tahmin & raporlar → Raporlar ve uyarılar bölümündeki günlük tablo, üstteki
ay seçimine bağlıdır. Ayın 28–31 gününün tamamı gösterilir. Geçmiş/bugün
kayıtsızsa sıfır, gelecek günler için çizgi kullanılır; gelecek tarihli gerçek
kayıtlar rapora katılmaz. Döviz işlemleri kaydedilmiş TRY karşılıklarıyla
toplanır. Açılış bakiyesi, transfer ve henüz işlenmemiş plan gelir/gider değildir.
Alt toplam seçili ayın gerçekleşmiş toplamıdır. Aynı güne kadar karşılaştırma
seçeneği günlük tabloyu daraltmaz. Rapor CSV'si günlük tabloyu da içerir.

Hesaplar & kartlar ekranındaki her kartın Aylık hareketler düğmesi, varsayılan
olarak mevcut ayı açar. Önceki aylara gidilebilir; gelecekteki aya geçilmez.
Görüntüleme salt okunurdur, işlem kaydetmez. Hesap arşivliyse geçmişi yine açılır.

Hesap listesi yalnızca o hesabın accountId'siyle kayıtlı işlemleri içerir;
hesapsız işlemleri veya başka hesapları geriye dönük atamaz. Gelir/Gider
filtreleri yalnızca hareket listesini süzer, aylık özetin anlamını değiştirmez.
Tutarlar hesabın özgün para birimindedir; OMR üç ondalıkla hesaplanır.

Ay başı bakiyesi önceki günün kapanışıdır. Hesap ayın ortasında açıldıysa açılış
bakiyesi ayrı ayarlama olarak gösterilir. Gelir − gider + gelen transfer −
giden transfer + bu açılış farkı, ay başı ile gösterilen kapanış arasındaki
farkı açıklar. Transfer/kart ödemeleri ayrıca listelenir ve gider sayılmaz.
Kartta negatif net bakiye borçtur; banka ekstresi gibi yorumlanmaz.

Günlük ve hesap tablosu mevcut kullanıcıya özel belgeden hesaplanır. Yeni SQL
şeması, dış servis veya veri göçü yoktur. Zamanı olan işlemler tarih/saat azalan
sıralanır; eski saatsiz kayıtlar aynı günün saatli işlemlerinin ardından gelir.
