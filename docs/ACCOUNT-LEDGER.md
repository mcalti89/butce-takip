# Birleşik aylık hesap hareketleri

Hesaplar & Kartlar → hesabın Aylık hareketleri ekranı gelir, gider ve transferleri
tek listede gösterir. Her tutarın altında işlem sonu bakiyesi bulunur. Gelen ve
giden transferler, kart ödemeleri ve döviz al/sat bu listeye dahildir; üstteki
gelir/gider toplamlarına eklenmez. Tümü, Gelir, Gider ve Transferler filtreleri
aynı listenin görünümünü değiştirir; ayrı bir transfer listesi yoktur.

`accountMonthActivity.rows`, hesaba bağlı gerçekleşmiş ay hareketlerini tarih,
saat ve ID sırasıyla birleştirir. Önce ay başı bakiyesi ve bu ayki hesap açılış
bakiyesi alınır; hareketler eskiden yeniye işlenir ve her hareketin sonrasındaki
bakiye hesaplanır. Görünüm en yeni hareket üstte olacak şekilde ters çevrilir.
Bakiyeler tüm kayıtlar üzerinden hesaplandıktan sonra görünüm filtrelenir. Gider
filtresinde gizlenen gelir ve transferler gerçek bakiyeyi etkilemeye devam eder.

Saatsiz kayıtlar aynı günün başında kabul edilir; aynı saatli kayıtlar sabit ID
sırasını izler. İki tür arasında aynı tarih/saat/ID çakışırsa mevcut ortak liste
sıralaması korunur ve satır anahtarları türü de içerir. Böyle durumlarda sıra
varsayımı ekranda belirtilir. Saat girildiğinde bakiye bu sıraya göre yeniden
hesaplanır; gerçek zaman damgası olmayan kayda saat uydurulmaz.

Bütün hesaplar kendi para birimleriyle, kuruş/baisa tam sayıları üzerinden
hesaplanır. Döviz dönüşümünün kaynak hesabına `amount`, hedef hesabına
`exchange.toAmount` uygulanır. Kartta negatif bakiye borcu temsil eder. Ay başı
bakiyesi önceki aylardaki bütün hareketleri içerir. Gelecek günler ve henüz
ödenmemiş planlar gerçekleşen listeye alınmaz. Geçmiş kayıt düzenlenir veya
silinirse sonraki bakiyeler yeniden türetilir; SQL'e yeni bakiye alanı yazılmaz.
