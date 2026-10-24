# Yatırım menüsü: anapara, gerçekleşen gelir ve manuel değerleme

Menüdeki Yatırım alanı, `kind: investment` hesaplarını ve bu hesaplarda açılan
Mevduat, Borsa, Fon, Altın veya Diğer yatırımlarını gösterir. Normal hesaplar
bu listede yer almaz. Yatırım hesabı açmak için mevcut hesap editörü yatırım
türü seçili açılır; normal transfer ile hesaba para aktarılır. Hesap başına
kullanılabilir nakit, ayrılmış anapara ve nakit + güncel yatırım değeri gösterilir.
Farklı para birimleri toplanmaz. Son altı ay gerçekleşen gelir/zarar tablosu ve
yatırım türlerine göre dağılım bulunur. Bakiye ve piyasa değerleri bugüne, aylık
gelir ve hareketler seçili aya aittir.

## Hareket türleri

- Anapara yatırma: hesaptaki nakitten yatırım maliyetine ayrılır. Hesabın toplam
  kayıtlı bakiyesini, genel geliri veya gideri değiştirmez.
- Anapara çekme: yatırımdan geri dönen maliyet/anaparadır; nakde döner ve aylık
  gelir sayılmaz. Kısmi çekimde son piyasa değerinin orantılı payı kaldırılır.
- Gerçekleşen getiri: gerçekten tahsil edilmiş net faiz, temettü veya satış kârı.
  Yatırım hesabındaki nakdi artırır ve ilgili ayın gelirinde görünür.
- Zarar / masraf: gerçekleşen zarar veya kesintidir; yatırım nakdini azaltır.
- Güncel değer: yatırımın tamamının elle girilmiş piyasa değeridir. Önceki değeri
  değiştirir; nakde veya gerçekleşmiş aylık gelire yazılmaz. Değerleme yoksa
  yatırılan anapara değer olarak kullanılır. Sonraki anapara eklemeleri maliyeti
  kadar eklenir; çekimde değer orantılı azalır. Son değerleme tarihi gösterilir.

Satışta önce maliyet/anapara çekimi, sonra gerçekleşen kâr veya zarar ayrıca
kaydedilir. Örneğin maliyeti 1000, son değeri 900 olan yatırımın satışı: 1000
anapara çekme ve 100 zarar. Sonuç nakit 900, kalan anapara/değer sıfır, gerçekleşmiş
zarar 100 olur. Değer düşüşü iki kez düşülmez. Menkul kıymet miktarı, canlı fiyat,
banka bağlantısı veya gerçek alım/satım emri bu sürümde yoktur; tutar takibi yapılır.

## Mevduat

İsteğe bağlı vade sonu, yıllık brüt faiz ve stopaj girilir. Tahmini net faiz,
mevcut anaparanın bütün vade boyunca sabit kaldığı varsayımıyla
`anapara × yıllık oran × gün/365 × (1 − stopaj)` üzerinden hesaplanır. Bileşik faiz
veya bankanın özel gün hesabı uygulanmaz. Tahmin kendiliğinden hesaba kaydedilmez.
Gerçekten tahsil edilen tutar Gerçekleşen getiri olarak ayrıca girilir; net gelir
zaten kesinti sonrası girildiyse aynı stopaj tekrar masraf olarak eklenmez.

## Bakiye ve kapsam

`accountBalance`, normal açılış/geçmiş/transfer bakiyesine yatırım hareketlerinden
yalnızca gerçekleşmiş gelir eksi zarar/masrafı ekler. Anapara tahsisi ve değerleme
bu kayıtlı toplamı değiştirmez. Kullanılabilir nakit = kayıtlı bakiye − ayrılmış
anapara; portföy güncel değeri = nakit + yatırımların güncel piyasa değeri.
Gerçekleşmemiş fark = piyasa değeri − ayrılmış anapara. Bu yatırım hesaplarının
hiçbiri genel bütçe, gelir/gider, kategori, tasarruf veya tahmin toplamına girmez.

Hesabın Aylık hareketleri ekranı, gerçekleşen yatırım getirisi/masrafını ayrı
etiketlerle kendi birleşik hesap defterinde gösterir ve işlem sonu bakiyeleri
kapanışla uzlaşır. Dahili anapara ve değerleme hareketleri Yatırım ekranında kalır.

## Doğrulama, düzenleme ve saklama

`investmentPositions` ve `investmentEntries`, mevcut kullanıcıya özel SQL JSON
belgesine isteğe bağlı diziler olarak eklenir. Yeni kullanıcıda ikisi de boştur;
örnek yatırım veya tutar eklenmez. Tam JSON yedeği bütün yatırım bilgilerini taşır;
normal işlem CSV'si bu yeni kayıtların yedeği değildir. Şema göçü veya yeni ortam
anahtarı gerekmez. Eski belgeler diziler olmadan okunur; eski istemci dolu yatırım
alanlarını eksik gönderirse APP_UPDATE_REQUIRED/409 ile kayıt durdurulur.

API hesap türünü, para birimini, tarihleri, tutar hassasiyetini, pozisyon/hesap
bağlantılarını ve günlük nakit yeterliliğini doğrular. Aynı nakit iki yatırıma
ayrılamaz; kalan anaparadan fazlası çekilemez. İleri tarihteki bir fonlama geçmiş
bir yatırımı karşılamaz. Gün içi banka aktarımı ve yatırım tahsisinin saatleri
bilinmeyebileceği için nakit yeterliliği günlük kapanış üzerinden kontrol edilir.
Anapara tahsis edilmişken bu parayı dış hesaba transfer edip nakdi eksiltmek de
reddedilir. OMR üç ondalıkla, diğer mevcut para birimleri iki ondalıkla hesaplanır.

Kaydı düzenlemek veya silmek aynı tarihli ve sonraki hesaplamaları yeniden
üretir. Sonraki kayıtları geçersiz kılacak silme/değişiklik yapılmaz. Anapara ve
değer sıfırlandıktan sonra yatırım arşivlenebilir; geçmiş getirileri aylık tabloda
korunur. Yeni hareket için yatırım ve hesabı aktif olmalıdır. Hareketli yatırımın
hesabı/para birimi değiştirilemez. Portföy kaydı bağlı hesap yatırım türünde kalır;
böylece yatırım getirisi yanlışlıkla günlük bütçeye alınmaz.
