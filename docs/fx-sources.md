# Döviz verisi kaynağı araştırma notu

- TCMB günlük gösterge kurları ve açıklama: https://www.tcmb.gov.tr/wps/wcm/connect/en/tcmb+en/main+menu/statistics/exchange+rates/indicative+exchange+rates
- TCMB günlük bülten sayfası: https://www.tcmb.gov.tr/wps/wcm/connect/en/tcmb+en/main+page+site+area/today
- TCMB günlük XML: https://www.tcmb.gov.tr/kurlar/today.xml
- Tarihsel XML biçimi doğrulanan gün için: `https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml` (ör. 21 Ekim 2026: `https://www.tcmb.gov.tr/kurlar/202610/21102026.xml`). Kaynak bülten tarihi `<Tarih>` ve no `<Bulten_No>`; `CurrencyCode`, `Unit`, `ForexBuying`, `ForexSelling`, opsiyonel `BanknoteBuying`, `BanknoteSelling` düğümleri mevcut.
- 21 Ekim 2026 tarihli resmi İngilizce sayfada bültenin 15:30'da belirlenen gösterge kurları olduğu, döviz alış/satış ve efektif banknot alış/satış sütunlarının ayrı olduğu gözlendi. JPY için `Unit=100`; hesaplama birim başına normalize edilmelidir.
- Doğrudan HTTPS isteği 200 ve `application/xml` verdi ancak `Access-Control-Allow-Origin` başlığı yoktu; bu nedenle web istemcisinden doğrudan `fetch` kullanımı CORS açısından güvenilir değil. Sunucu tarafı aracısı gerekir.
- XML gözlemi 22 Ekim 2026 tarihinde yapıldı; bugünkü bülten tarihi 21 Ekim 2026'ydı. Tatil/hafta sonu veya henüz yayımlanmamış günlerde `today.xml` son bülten tarihini tutabilir; veritabanı günlük çalışma zamanına değil, XML bülten tarihine göre tekilleştirmeli.
