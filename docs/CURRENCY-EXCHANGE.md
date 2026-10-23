# Döviz al / sat — manuel banka kuru

Hesaplar & Kartlar → Döviz al / sat, farklı para birimlerindeki iki aktif
nakit/banka hesabı arasında dönüşüm kaydeder. Kaynak/hedef hesap, tutar, tarih,
isteğe bağlı saat ve bankada uygulanan kur kullanıcı tarafından girilir.
Editör kur servisine istek göndermez ve TCMB'den otomatik kur almaz. Hedef
hesaba geçecek tutar anında hesaplanır. Kaydet iki bakiyeyi tek SQL JSON belge
güncellemesinde değiştirir; gelir/gider kaydı veya gerçek banka emri oluşturmaz.

## Kurun yönü

- USD → TRY: “Kur (1 USD = ? TRY)” alanına örneğin 40,25 girilir; dolar tutarı
  40,25 ile çarpılır.
- TRY → USD: aynı “1 USD = ? TRY” biçimi kullanılır; TL tutarı 40,25'e bölünür.
- Diğer döviz çiftleri: 1 kaynak para biriminin kaç hedef para birimi ettiği
  girilir. Örneğin USD → OMR için “1 USD = ? OMR”.

Kur virgül veya nokta ile ve en fazla 8 ondalıkla yazılır; binlik ayırıcı,
negatif, sıfır, sonsuz veya bilimsel gösterim kabul edilmez. 100 birimlik kur
bülteni yerine her zaman 1 birim kuru girilir. Hesap değişirse kur alanı
boşaltılır; başka para biriminin kuru yanlışlıkla kullanılamaz. Tutar değişirse
aynı manuel kurla hedef tutar yeniden hesaplanır. Yalnızca hedef tutar kendi
para birimine yuvarlanır: OMR üç, diğer mevcut para birimleri iki ondalık.

## Saklama ve düzeltme

`accountTransfers[].exchange` içinde `source: "MANUAL"`, kullanıcının girdiği
`manualRate`, çarpma/bölme yönü `rateDirection`, hedef tutar/para birimi ve
hesaplamada kullanılan normalize oran `rate` saklanır. Her işlem kendi kurunu
saklar; aynı gün farklı bankalarda yapılan işlemler birbirini değiştirmez.
Tarih, kaynak tutar, kaynak hesap ve saat mevcut transfer alanlarında kalır.
API manuel kurun hassasiyetini, yönünü ve hedef tutarla uyumunu doğrular.

Döviz geçmişinden veya İşlemler listesinden Döviz işlemini düzenle açılınca
kaydedilmiş kur alanı dolu gelir. Kur veya tutar düzeltildiğinde aynı kayıt
kimliği korunur; her iki hesabın bakiyesi ve aylık hareketlerdeki sonraki
bakiyeler yeniden türetilir. Silme iki ayağı birlikte kaldırır. Kur düzeltmesi
kaynak tutar değişmedikçe kaynak hesaptaki çıkışı değiştirmez.

Eski `source: "TCMB"` kayıtları ve kur snapshot'ları geriye uyumlu biçimde
okunur ve aynen korunur. Eski kaydı yalnızca açmak, notunu veya saatini değiştirmek
kuru dönüştürmez. Kur alanı düzenlenirse (aynı sayı tekrar girilse bile) veya tutar,
hesap/tarih değiştirilirse önizleme manuel kurla hesaplanır; kaydetten sonra yeni
kayıt manuel kaynağı taşır ve eski TCMB snapshot'ı kaldırılır. Kullanıcı kaydetmeden
hiçbir dönüşüm yapılmaz.

SQL şeması/veri göçü veya yeni ortam değişkeni gerekmez. Tam JSON yedeği girilen
kuru taşır; CSV yalnızca gelir/gider kayıtlarını taşımaya devam eder.
`accountBalance` kaynakta `amount`, hedefte `exchange.toAmount` kullanır. İşlemler
ve birleşik aylık hesap hareketleri tek döviz hareketini gösterir. Döviz geçmişi
girilen kuru “Manuel kur” etiketiyle gösterir. Bütçe ve gelir/gider raporları bu
dönüşümü harcama saymaz. Genel döviz ekranı ve gelir/giderin mevcut TRY kur
snapshot'ları bu düzenlemeden bağımsızdır.
