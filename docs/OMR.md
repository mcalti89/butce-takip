# Umman riyali (OMR)

OMR, işlem girişinde izlenen döviz tercihinden bağımsız seçilebilir. Hesap,
kart, transfer, aylık plan ve taksit para birimi olarak da desteklenir.
Mevcut kullanıcıların döviz tercihleri korunur; Döviz ekranındaki
“Umman riyali izlemeye ekle” seçeneği OMR kartını ve tarihçesini açar.

## Kur kaynağı

TCMB günlük XML bülteninde OMR yoktur. Sistemin gösterdiği OMR/TRY resmi bir
TCMB OMR fiyatı değildir; arşivlenmiş USD/TRY gösterge kuru üzerinden hesaplanır:

- Umman Merkez Bankası sabit paritesi: **1 USD = 0,3845 OMR** (1986'dan beri).
- Kaynak: https://cbo.gov.om/Pages/MonetaryPolicy.aspx
- OMR/TRY = USD/TRY / USD birimi / 0,3845.
- Döviz alış ve satış ayrı hesaplanır; 8 ondalıkla kur saklanır. OMR için
  banknot fiyatı türetilmez. Döviz kuru ve işlem girişinde hesaplanmış olduğu
  belirtilir, API satırında `rateSource: TCMB_USD_OMR_PEG` bulunur.
- Tarih ve bülten numarası USD kaynağına aittir. Hafta sonu/tatilde seçilen
  işlem gününden sonraki kur kullanılmaz; önceki son USD bülteni kullanılır.
- Geçmiş ve güncel OMR oranları aynı SQL USD arşivinden üretilir. Ham XML,
  SHA-256 ve resmi TCMB satırları değiştirilmez; dolayısıyla eski arşiv için
  veri göçü veya yeni dış servis/API anahtarı gerekmez.
- Gerçek banka/kart alışveriş fiyatı değildir; banka farkı/komisyon ayrıca
  gerçekleşen kayda göre takip edilmelidir. Kayıt esnasındaki TRY karşılığı
  sabit kalır; daha sonra kur değişince eski rapor yeniden çevrilmez.

## Baisa hassasiyeti

1 OMR = 1.000 baisa. İşlem ve finans belgelerinde 3 ondalık desteklenir.
`2,751` ve `2.751` OMR kabul edilir; `0,001` OMR kaybolmaz. OMR'de dördüncü
ondalık reddedilir. TRY ve önceki dövizlerde mevcut 2 ondalık davranışı korunur.

Hesap bakiyeleri, transferler, taksit payları ve tahminler OMR'de tamsayı baisa
üzerinden hesaplanır. Örneğin 1,001 OMR / 3 = 0,334 + 0,334 + 0,333.
TL raporunun tutarı yine iki ondalıktır. CSV özgün OMR tutarını üç ondalıkla
çıkarır; JSON yedeklerinde ve SQL bütçe belgesinde de hassasiyet korunur.

## Kontroller

`tests/omr.test.ts` ve MySQL FX entegrasyon testi, kur türetimini, kaynak
birimini, eksik kuru, işlem/gösterim/CSV hassasiyetini, bakiye ve transferi,
taksitlerin tam toplamını ve tahmini doğrular. Node/Vercel ve taşınabilir
cPanel FX okuyucusu aynı pariteyi kullanır.
