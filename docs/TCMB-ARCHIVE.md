# Otomatik TCMB kur arşivi

Web uygulaması aynı kökendeki `/api/fx` üzerinden resmî TCMB gösterge kurlarını
okur. Tarayıcı doğrudan TCMB XML'ine erişmez; CORS gerekmez. Vercel sunucusu
sertifika doğrulaması açık HTTPS ile `https://www.tcmb.gov.tr/kurlar/today.xml`
ve tarihsel `YYYYMM/DDMMYYYY.xml` kaynaklarını çeker. Başka kaynak URL'si veya
istemci tarafından belirlenen ağ adresi kabul edilmez.

## Saklama ve taşınabilirlik

`database/budget/003-fx-archive.sql`, mevcut MySQL'de dört bağımsız tablo oluşturur:

- `fx_bulletins`: gerçek bülten tarihi, numara, kaynak URL, özgün XML ve SHA-256.
- `fx_daily_rates`: tarihe ve para birimine göre benzersiz alış/satış ile efektif
  alış/satış değerleri. Kaynak birim korunur; JPY 100 birim olabilir.
- `fx_unpublished_days`: tarihsel 404 günleri; kur üretilmez. Otuz gün sonra
  yeniden kontrol edilebilir. Ağ hatası 404 gibi kabul edilmez.
- `fx_sync_state`: süreçler arası süreli kilit, son başarı/hata ve tekrar zamanı.

İlk başarılı alınan bülten atomik kaydedilir. Tekrar alınan aynı tarih ilk
arşiv kaydını değiştirmez. Bir HTTP/XML hatasında kısmi kayıt oluşmaz. Kaynak XML
ve kur satırları aynı transaction içindedir. Tatillerde yeni tarihli sahte
bülten oluşturulmaz; `today.xml` içindeki gerçek yayın tarihi kullanılır.

Kur verileri herkese açık piyasa bilgisidir ve ortak saklanır. Hesap bütçeleri,
Google oturumları ve izleme tercihleri ayrı kalır. Kur ekranını okumak kişisel
bütçe belgesine kur geçmişi yazmaz. İşlem tutarına uygulanan kur/birim/tarih/alış
veya satış yönü işlemde sabittir; arşiv güncellemesi eski işlemi yeniden hesaplamaz.

MySQL dökümüne bu dört tabloyu dahil etmek yeterlidir; farklı hosting'e geçerken
Node API/görev ya da eşdeğer PHP API/görev de taşınmalıdır. Eski cPanel dosyaları
referans olarak durur; bu canlı sürüm onların kurulmasını gerektirmez.

## Günlük çalışma

`vercel.json` Production için `/api/fx-sync` görevini `0 13 * * *` UTC ile
çalıştırır: Türkiye 16:00, Dubai 17:00. Vercel Hobby kesin dakika garantisi vermez;
görev belirtilen saat içinde çalışabilir. Vercel, sunucuya tanımlanan en az 32
karakterlik `CRON_SECRET` değerini Bearer başlığında gönderir. Gizli değer
repoya, Expo bundle'ına veya URL'ye konmaz. Anahtarsız/yabancı anahtarlı cron
isteği 403 alır; POST veya herkese açık bir force-sync endpoint'i yoktur.

Günlük görev son bülteni ve en fazla sekiz eksik tarihsel günü kontrol eder.
Ortak SQL kilidi eşzamanlı sunucuların TCMB'ye aynı anda tarama yapmasını önler.
`latest` okuması da dört saatlik cooldown ile son bülteni onarabilir; hata halinde
on beş dakika sonra yeniden deneme mümkündür. Başarısız kaynak isteğinde mevcut
SQL verileri korunur ve istemciye son gerçek bülten tarihi sunulur. Arşiv hiç
yoksa boş/sahte fiyat yerine 503 döner.

İlk deploy, son üç takvim ayının başından bugüne kadar tarihsel bültenleri ikişer
isteklik gruplarla, süre sınırlı olarak doldurur. Tamamlanamayan tarihsel kısım
sonraki cron görevlerinde sürer. İlk gerçek bülten hiç alınamazsa yayın başarısız
olur; dolu arşiv varken geçici kaynak kesintisi mevcut veriyi silmez. Ham XML,
bozuk tarih, gelecek bülten, yinelenen para birimi, geçersiz birim/oran, DTD ve
eksik temel dövizler veritabanına kaydedilmeden reddedilir.

`history` istekleri bir seferde en fazla 400 günlük aralık/400 bülten döndürür.
`rate` verilen tarihte veya öncesindeki son arşiv kurunu seçer; o tarih arşivin
başlangıcından eskiyse 404 verir. UI son üç aylık geçmişi ve kademeli daha fazla
satırı gösterir. Arşiv zamanla büyür; eski kayıtlar otomatik silinmez.

## Geliştirme ve doğrulama

Normal Vercel build'i `pnpm db:budget`, Google/SQL kontrolü,
`tsx scripts/sync-fx-archive.ts`, ardından PWA build'i çalıştırır. Kur API'si
normal geliştirme sunucusuna da bağlıdır. Web aynı kökeni kullanır; ayrı bir
native istemci için `EXPO_PUBLIC_FX_API_URL` ile HTTPS adresi verilebilir.

Sentetik testler gerçek piyasa kuru veya production seed'i değildir:

```sh
docker exec butce-mysql-dev mysql -e 'CREATE DATABASE IF NOT EXISTS butce_fx_test;'
FX_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_fx_test \
BUDGET_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_test \
pnpm run test --maxWorkers=2 --minWorkers=1
```

FX SQL testleri yalnızca açıkça belirtilen loopback `butce_fx_test` üzerinde
çalışır; Production verisine veya kullanıcı bütçelerine dokunmaz.
