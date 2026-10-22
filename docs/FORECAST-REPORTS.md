# Gelecek ay tahmini ve raporlar

Tahmin & raporlar ekranı iki bölüm içerir. Hesaplamalar oturumdaki bütçe
belgesinden salt okunur üretilir; ayrı bir veri kopyası, SQL tablosu veya yeni
servis gerektirmez. Yeni kullanıcıya örnek hesap veya işlem eklenmez.

## Tahmin

- Başlangıç: cihazın yerel bugünü itibarıyla aktif hesapların bakiyeleri.
  Nakit ve banka bakiyesi ile kartın negatif/pozitif bakiyesi ayrıca gösterilir.
  Toplam **net finansal durumdur**, harcanabilir nakit veya banka ekstresi değildir.
- Bu ayın kalan hareketleri başlangıca eklenerek gelecek ay devri bulunur.
  Gelecek ay sonu = devir + gelecek ay planlanan gelir − gider + o ay takibe
  başlayacak hesapların açılış farkı. Açılış farkı gelir değildir.
- Her para birimi ayrı hesaplanır. Gelecekteki TCMB kuru varsayılmaz.
- Aktif tek seferlik, aylık ve taksit planlarının henüz işleme dönüşmemiş
  dönemleri kullanılır. Kaydedilmiş bir dönem tekrar tahmine eklenmez. İleri
  tarihli, hesaba bağlı gerçek kayıt varsa kendi tutarı ve tarihiyle bir kez
  eklenir; bugünkü bakiyeye henüz dahil edilmez.
- Bugün vadesi gelen ve işlenmemiş planlar dahildir. Geçmiş vadeli planlar
  varsayılan olarak hariçtir, fakat tutarları gösterilir. Dahil et seçeneği
  gecikmiş gelir ve ödemeleri bugün gerçekleşecek kabul eder.
- Hesapsız planlar toplam net tahmine dahildir ve sayıları belirtilir. Geçmiş
  hesapsız işlemler açılış bakiyesine eklenmez. Açılış bakiyesinin içerdiği bir
  geçmiş kaydı tekrar eklemek çifte sayım oluşturabilir.
- Aynı para birimli hesap transferi ve kart ödemesi toplam neti değiştirmez;
  ayrı gider sayılmaz. Bu ekran belirli bir hesabın nakit yeterliliğini veya
  bankanın ödeme planını hesaplamaz.
- Grafik tarih sıralı hareket günlerini gösterir; aynı günün hareketleri
  gruplanır. Düşük net durum tarihi ayrıca verilir. Hareket olmayan aralıklar
  arasında çizgi görseldir; gösterilmeyen ara günlerde yeni hareket varsayılmaz.
- Plansız yaşam giderleri, bankanın faiz/ücretleri ve kur değişimi dahil değildir.
  Tahmin kayıt oluşturmaz; takvimdeki normal onay akışı korunur.

## Raporlar

Seçili ayın gerçekleşmiş kayıtları önceki ayla karşılaştırılır. Devam eden ayda
varsayılan önceki ayın aynı gününe kadar karşılaştırmadır; kısa ayda son gün
kullanılır. Önceki ayın tamamını seçme seçeneği vardır. Tamamlanmış aylarda
iki tam ay karşılaştırılır. Bugünden ileri kayıtlar gerçekleşmiş rapora girmez.

Gelir/gider, net fark, tasarruf oranı, kategori payı ve değişimi gösterilir.
Önceki tutar sıfırsa yüzde değişimi hesaplanmaz. Gelir yoksa tasarruf oranı
hesaplanmaz; gider geliri aşıyorsa oran negatif olabilir. Döviz işlemleri
kayıtlı sabit TRY karşılığıyla raporlanır; yeni kur eski raporu değiştirmez.
Transferler ve açılışlar aylık gelir/gider değildir.

Altı aylık grafik ve kategori geçmişleri takvim ayı toplamlarıdır; aynı güne
kadar seçeneği bu seriyi daraltmaz. Devam eden ayın eksik olduğu açıkça yazılır.
Kategori ortalaması seçili aydan önceki üç takvim ayına dayanır; kayıtsız aylar
sıfırdır ve bu bir harcama/hesap kapsamı varsayımıdır.

Raporu CSV indir seçeneği dönemleri, TRY gelir/gider/net tutarlarını, kategori
farklarını, limitleri ve altı aylık toplamları UTF-8, noktalı virgülle ayrılmış
dosyaya aktarır. Bu dosya tam veri yedeği veya işlem içe aktarma formatı değildir.
Formül gibi başlayan kategori adları elektronik tablo için güvenli metne çevrilir.

## Bütçe uyarıları

Uyarılar yalnızca o ay için açıkça limit konmuş kategorilerde oluşur:

1. Gerçek harcama limiti geçtiğinde **aşım** (sıfır limit dahil).
2. Limitin en az %80'i harcandıysa **limite yaklaşma**; tam limit aşım değildir.
3. Devam eden ayda ilk 7 gün geçtikten sonra günlük ortalama × ayın gün sayısı
   limiti geçiyorsa **tahmini risk**. Bu düz bir harcama hızı tahminidir;
   dönem başındaki kira/fatura gibi toplu ödemeler yanıltabilir. Geçmiş ay veya
   ayın son gününde ileri tahmin üretilmez.

Öncelik aşım > yaklaşma > tahmini risktir. Aynı kategoriye üst üste üç uyarı
üretilmez. Uyarılar pano ve raporlar içinde görünür; kayıt, silme, düzeltme ve
limit değişikliğinde yeniden hesaplanır. E-posta, SMS veya arka plan push
bildirimi yoktur. Limit düzenleme mevcut bütçe editörünü açar.

## Doğrulama

`tests/reports.test.ts`: tahmin devri, kullanıcı başlangıcı, transferler,
taksitlerin bir kez sayılması, kuruş dağılımı, yıl/ay sonları, döviz ayrımı,
gecikmiş plan seçimi, rapor kesim tarihleri, TRY sabit kuru, sıfır paydalar,
kategori geçmişi ve bütçe uyarı eşikleri. Mevcut SQL, Google ve finans testleri
aynı veri modelini ve kullanıcı ayrımını korumalıdır.
