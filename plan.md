# Çoklu Döviz ve Günlük Kur Takibi — Uygulama Planı

## Amaç ve kapsam

Bütçe Takip'in mevcut Expo/React Native/TypeScript kod tabanını ve Windows PWA'sını koruyarak çoklu dövizle işlem girişi ve günlük kur ekranı ekle. Varsayılan raporlama para birimi TRY'dir; mevcut para birimi alanı olmayan kayıtlar TRY kabul edilir. İşlemler seçilen döviz ve orijinal tutarı korur, kayıt anında kullanılabilen TCMB gösterge kurundan TRY karşılığını ve kullanılan kur tarihini dondurur. Gelir/gider özetleri, kategori bütçeleri ve tasarruf hedefleri TRY'de kalır. Alış/satış yönü varsayılan olarak gelirde TCMB döviz alış, giderde döviz satış üzerinden gösterilir; bunlar bankanın işlem fiyatı değil, resmî gösterge değeridir.

Kullanıcı izlemek istediği TCMB para birimlerini uygulamadaki Döviz bölümünden seçer. Sunucu yalnız herkese açık TCMB para birimlerinin günlük setini saklar; istemci seçimi PWA'da filtrelenir. Kur verisi kaynağı TCMB'nin resmî günlük bültenidir: döviz alış ve döviz satış sütunları kullanılır; nakit efektif alış/satışla karıştırılmaz. Bülten tarih ve sayısı korunur. Tatil/hafta sonlarında yayın yoksa yapay bir günlük kayıt yaratılmaz; son mevcut bültenin tarihi açıkça gösterilir. Resmî XML, tarayıcıdan doğrudan kullanım için CORS başlığı sağlamadığından PWA TCMB'ye doğrudan bağlanmayacaktır.

Günlük sunucu kayıtları için `hosting/cpanel` altında PDO/MySQL PHP API, şema ve cPanel cron istemi hazırla. Cron 16:00 Europe/Istanbul'den sonra günlük XML'i alır ve bülten tarihini anahtar kullanarak idempotent biçimde kaydeder. API yalnızca herkese açık kur verisini okur; kullanıcı bütçe kayıtlarını veya parolasını sunucuya yüklemez. MySQL kimlik bilgisi public_html dışında kalır. PWA mevcut Vercel origin'inde kalacağından cPanel API'nin CORS allowlist'i tam PWA origin'iyle sınırlandırılır. Gerçek üretim API'si, MySQL kaydı ve otomatik günlük çalışma; kullanıcı HTTPS alan adını, PHP/cron durumunu ve bağlantı bilgilerini verip hosting kurulduktan sonra etkinleştirilebilir. Bunlar sağlanana kadar kullanılabilir olmayan bir kur servisi çalışıyor gibi gösterilmez.

## Uygulama yaklaşımı

- `lib/budget/model.ts`: Para birimi kodları, TRY biçimlendirme, işlemde isteğe bağlı currency/rate snapshot alanları ve eski kayıtla uyumlu doğrulama. Bütün parasal özetlere TRY karşılığını veren yardımcı kullanılacak.
- `lib/budget/fx.ts`: TCMB para birimi listesi, tarihli alış/satış kur tipleri, kur başına birim normallemesi, seçimler ve küçük hesaplama yardımcıları.
- `lib/budget/fxApi.ts`: cPanel PHP API'ye ayarlanabilir HTTPS adresinden istek atan istemci; kapalı/ulaşılamayan sunucu için açıklayıcı durum ve en son yerel kopya. Kimlik bilgisi veya DB parolası istemci paketine konmaz.
- `components/budget/fx.tsx`: Gece Terminali diliyle izleme seçimi, son bülten oran kartları ve geçmiş görünümü. Kur tarihi, kaynak ve servis eşitleme durumu açıkça gösterilir.
- `components/budget/editors.tsx` ve `views.tsx`: işlem tutarına para birimi seçimi, kaynak tutar ile sabit TRY karşılığının gösterilmesi; eski işlemlerin ve CSV dosyalarının geriye dönük uyumu.
- `app/(tabs)/index.tsx`: mevcut iç gezintiye Döviz görünümü ve işlemlerle bağlantısı.
- `hosting/cpanel/public/`: read-only PHP API ve Apache/CORS ayarı; `hosting/cpanel/private/`: yerel örnek ayar şablonu (parolasız); `hosting/cpanel/cron/`: CLI-only TCMB günlük toplayıcı; `hosting/cpanel/schema.sql`: tarih, para birimi, birim, forex alış/satış, efektif değerler (varsa), bülten numarası/kaynağı ve çekim zamanı.
- `tests/`: XML alan eşleme/JPY gibi `Unit > 1` normalizasyonu, para birimi dönüşümü, eski kayıt, CSV geriye uyumu, yinelenen bülten, eksik/boş fiyat ve veri doğrulama kapsamı.

Sunucu kodu bağımlılıkları PHP 8.x, PDO MySQL ve SimpleXML'dir. Sandbox'a PHP 8.3 CLI eklendi; PHP sintaksı ve tarihli TCMB XML'inde bülten/alış-satış/JPY `unit=100` alanları doğrulandı. Gerçek MySQL migration, cPanel dosya yolları, CORS ve cron davranışı ancak gerçek hostingde kurulumdan sonra doğrulanabilir; mock HTTP testleri istemci eşlemesini kapsar.

## Proje yapısı

- `app/(tabs)/index.tsx`: ana gezinme, işlem/bütçe/pano/döviz görünümleri.
- `components/budget/`: mevcut formlar/grafikler ve yeni FX kartları.
- `lib/budget/`: v1 kalıcı veri modeli, işlemler, CSV ve yeni kur/hesaplama/API modülleri.
- `tests/`: bütçe ve yeni döviz/kur regresyon testleri.
- `hosting/cpanel/schema.sql`: kullanıcının MySQL sunucusu için kur tablosu.
- `hosting/cpanel/public/`: TCMB oranlarını döndüren ve read-only kalan HTTPS PHP uç noktası.
- `hosting/cpanel/cron/`: günlük TCMB XML alıp date+currency unique anahtarıyla yazan CLI görev.
- `hosting/cpanel/private/`: dokümante edilen, webroot dışında saklanacak örnek yapılandırma.

## Tasarım

- **Design Movement:** Gece Terminali'nin finans paneli estetiği; yoğunluğu kontrollü modern masaüstü terminali.
- **Core Principles:** kur tarihini veriden ayır; orijinal tutarı gizleme; TRY toplamlarını tutarlı koru; eksik/teyitsiz oranı uydurma.
- **Color Philosophy:** mevcut #111827 koyu yüzey okunabilirliği, #22C55E güvenli olumlu değerleri, alış/satış için metin ve küçük yön işaretleri; renk tek başına anlam taşımaz.
- **Layout Paradigm:** Ana tutarların TRY karşılığı önce, özgün döviz ve kur tarihi yanında; Döviz sayfasında seçili para birimlerinin yatay özet kartları ve aşağıda tarih sıralı kayıt çizelgesi.
- **Signature Elements:** bülten tarihini taşıyan küçük kaynak etiketi; çift alış/satış sütunları; son senkron zamanı için ince yeşil durum çizgisi.
- **Interaction Philosophy:** kullanıcı izleyeceği para birimlerini seçer; kur satırına dokunarak tarihe göre geçmişi açar; yabancı döviz işlemi kaydedilmeden önce uygulanacak alış/satış kuru ve tarihini görür.
- **Animation:** mevcut kısa, sakin geçişleri sürdür; yeni oran geldiğinde yalnızca yumuşak sayısal değişim/renk vurgusu; grafiklerde reduce-motion erişilebilirliğini koru.
- **Typography System:** mevcut IBM Plex Sans ve font ağırlıkları; para miktarında tabular/monospace davranışı değil, sayısal değerler hizalı ve ölçülü; kur kaynağı küçük yardımcı metin.
- **Brand Essence:** Türk lirasıyla günlük bütçeyi, döviz işlem değerini değiştirmeden bir arada izleyen kişisel bütçe aracı; **açık, dikkatli, güvenilir**.
- **Brand Voice:** kısa ve kaynak/tarih belirten. Örnek: “TCMB bülteni · 21 Eki 2026”. “Bu işlem 32,10 USD; kayıt kuruyla 1.574,80 TL.”
- **Wordmark & Logo:** mevcut bütçe terminal işareti/marka ve uygulama ikonu değiştirilmez; kur alanında iki sütunlu alış-satış oku mevcut ikon ailesiyle gösterilir.
- **Signature Brand Color:** #22C55E, mevcut Gece Terminali yeşili.

## Bağımlılıklar ve sınırlar

Uygulama kodu, kullanıcı hostingini bilmeden yerel kayıtlara veya canlı PWA alan adına zarar vermeden hazırlanır. TCMB kur tablosu kamuya açık olduğu için oran okuma uç noktası read-only ve kimlik bilgisizdir; yalnızca cron yazabilir. Kur arşivi TCMB bülteni yayınlanmaya başladıktan sonraki günleri otomatik kapsar; kapalı günlerde bülten yayın tarihi ileri gitmez. Şu anki Vercel dağıtımı statik PWA'dır: otomatik günlük DB kaydı sunucu altyapısı/cron/MySQL kurulmadan etkinleştirilemez. Hosting ayrıntıları geldikten sonra API base URL, izinli PWA origin'i, korumalı MySQL yapılandırması, ilk cron çalışması ve canlı uç nokta sağlık kontrolü tamamlanmalıdır.
