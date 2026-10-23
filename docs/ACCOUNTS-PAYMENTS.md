# Hesaplar, kartlar ve ödeme takvimi

Bu sürüm manuel kişisel finans takibidir. Bankaya bağlanmaz, para göndermez ve
kullanıcı adına otomatik ödeme yapmaz. Hatırlatmalar uygulama içinde görünür;
e-posta, SMS veya push bildirimi gönderilmez.

## Hesaplar ve bakiyeler

Hesaplar & kartlar ekranından nakit, banka, kredi kartı ve yatırım hesabı eklenir. Her hesabın
tek para birimi vardır. Açılış bakiyesi, takip başlangıç günündeki işlemlerden
önceki bakiyedir; gelir veya gider oluşturmaz. Eski işlemler hesapsız kalır ve
raporlarda korunur. İşlem düzenleyicisinden aynı para biriminde bir hesap seçilir.
İşlem tarihi takip başlangıcından önce olamaz. Hareketi bağlı hesabın türü
düzenlenebilir; para birimi değiştirilemez. Açılış düzeltmesi mevcut kayıtları
geçersiz kılamaz. Tür değişimi geçmiş hareketleri ve bakiyenin işaretini korur.
Yatırım hesabı genel hesaplamalardan, yeni gelir/gider ve plan seçimlerinden
hariçtir; para aktarmak için normal transfer kullanılır. Geçmişe bağlı tür
değişimi koşulları için [INVESTMENT-ACCOUNTS.md](INVESTMENT-ACCOUNTS.md).

Bakiye = açılış + atanmış gelirler − atanmış giderler + gelen transferler − çıkan
transferler. Gelecekteki işlemler bugünkü bakiyeye dahil edilmez. Döviz hesabı
orijinal tutarla hareket eder; TRY raporu işlemdeki sabit TCMB karşılığını kullanır.
Farklı para birimleri tek bir toplam gibi gösterilmez. Aynı para biriminde iki
hesap arasındaki transfer ve banka hesabından karta ödeme gelir/gider sayılmaz.
Transfer düzeltme aynı hareketi değiştirir; transfer silme iki bakiyeyi de geri alır.

Hesaplar silinmez, sıfır bakiyede ve açık plan/future hareket yokken arşivlenir.
Arşivdeki hesabın hareketini değiştirmek için önce hesabı geri açmak gerekir.
Arşivli hesabın bakiyesini değiştiren belge API tarafından da reddedilir.

## Kredi kartları

Kart borcu içeride negatif bakiye olarak tutulur; formda borç pozitif girilir.
Başlangıçta işlenmiş borca ayrıca planlanacak henüz işlenmemiş taksitler tekrar
eklenmemelidir. Pozitif kart bakiyesi alacak anlamına gelir. Kart harcaması gider
ve kart borcu oluşturur; kartı bankadan ödemek yalnızca transferdir.

Limit tahmini = limit + kart bakiyesi − işlenmemiş aktif taksitler. Tamamlanan
bir taksit kayıtlı borca geçtiğinde bekleyen taksit toplamından çıkarılır;
iki kere sayılmaz. Ekstre kesim ve son ödeme günleri kullanıcı tarafından
1–31 olarak girilir; ayda olmayan gün ay sonuna sıkıştırılır. Yakın ödeme günü,
kesim bu ay geçilmiş olsa da atlanmaz. Takvim kart ödeme hatırlatması gösterir;
kayıtlı toplam borç banka ekstresi değildir. Gerçek ekstre/son ödeme tarihi bankadan
kontrol edilir; resmî tatil ertelemesi veya bankanın faiz/ücret hesabı tahmin edilmez.

## Planlar ve taksitler

Tek sefer, her ay, kart taksiti seçenekleri vardır. Kira/maaş/abonelik gibi aylık
planlarda tutar her dönem içindir; taksitte tutar alışverişin toplamıdır. 2–120
taksit desteklenir ve kuruşlar paylaştırılır: 1000/3 = 333,34 + 333,33 + 333,33.
31 Ocak'ta başlayan aylık plan Şubat sonunda ve tekrar 31 Mart'ta görünür.
İsteğe bağlı bitiş tarihi yalnızca aylık planda vardır.

Plan kaydetmek bütçeyi veya hesabı etkilemez. Takvimde İşleme dönüştür düğmesi
normal işlem editörünü açar. Kullanıcı gerçekleşen tarih/tutarı doğrular; döviz
kurunu gerçek işlem tarihine göre alır. Kart taksiti bağlı kartında ve para
biriminde işlenir. Bir plan/dönem için ikinci işlem API ve istemci tarafından
reddedilir. Gerçekleşen işlem silinirse aktif plandaki dönem yeniden bekler.
Arşivlenen planın gerçekleşmiş dönemleri ve işlem kayıtları korunur; yalnızca
bekleyen dönemleri takvim/tahminden çıkarılır. Arşivleme bankadaki taksiti veya
aboneliği iptal etmez. Plan koşulları bu sürümde sonradan yeniden yazılmaz;
değişen gelecek koşulları için eski plan arşivlenip yeni başlangıçla plan açılır.

## Veri koruma

Version-1 bütçe belgesine opsiyonel financialAccounts, accountTransfers,
paymentPlans dizileri, işleme accountId/planId/planIndex alanları eklenir.
Eski belgeler değişmeden geçerlidir. Yeni kullanıcı boş dizilerle başlar.
Tüm bilgiler mevcut account_id ile ayrılmış budget_cloud_documents JSON belgesinde,
aynı SQL transaction/revision mekanizmasıyla saklanır; ayrı migration veya herkese
açık tablo yoktur. Başka kullanıcının hesap ID'si küresel bir hesap bağlantısı
oluşturmaz. Eski istemci bu dizileri eksik göndererek dolu alanları silmeye
çalışırsa APP_UPDATE_REQUIRED/409 alır. Hesap/plan verisi olan belge eski cihaz
verisinin üzerine aktarılmasına uygun, boş belge sayılmaz.

Tam JSON yedeği tüm yeni alanları içerir. CSV yalnızca işlem aktarımıdır;
hesaplar, transferler, planlar, bütçe ve hedefler için tam JSON kullanılır.
TCMB ortak kur arşivi bunlardan ayrıdır. Production doğrulayıcısı yalnızca iki
geçici sentetik kullanıcısında hesap, transfer ve taksit belgesini yazar/okur;
kişisel kayıtları değiştirmez.
