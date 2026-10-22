# Bütçe Takip — ürün ve teslim durumu

## [x] İşlem ve kategori yönetimi
- Gelir ve gider işlemlerini tutar, kategori, tarih ve isteğe bağlı açıklama bilgileriyle kaydetme, düzenleme ve silme.
- Gelir ve gider kategorilerini oluşturma ve işlemlerde kullanma.

Kanıt: `components/budget/editors.tsx` ve ana ekrandaki işlem listesi/kontrollü silme akışı.

## [x] Aylık kategori bütçeleri
- Her gider kategorisi için aya özel bütçe belirleme.
- Kategori bütçelerinde harcanan ve kalan tutarı, aşım durumuyla birlikte görüntüleme.

Kanıt: `lib/budget/model.ts`, `BudgetEditor`, `BudgetTile`; aya özel hesap, limiti olmayan kategori ve sıfır limit davranışları otomatik testlidir.

## [x] Pano ve analizler
- Seçili aya ait gelir, gider ve net bakiye özetlerini gösteren pano.
- Kategori bazında harcama dağılımını görselleştiren grafik.
- Toplam harcamaların aydan aya değişimini gösteren trend grafiği.
- “Dışarıda yemek bütçeyi %32 aştı” benzeri, verilerden otomatik üretilen sade dilli içgörüler.

Kanıt: `Metrics`, `Distribution`, `TrendChart`, `InsightCards`. Örnek kayıtlarda dışarıda yemek gideri 2.640 TL ve limiti 2.000 TL, dolayısıyla %32 aşım gerçek veriden hesaplanır.

## [x] CSV ve mevcut cihazdaki yerel veriler
- İşlem verilerini CSV dosyasından içe aktarma ve CSV olarak dışa aktarma.
- İlk uygulama aşamasında tüm bütçe verilerini sunucu gerektirmeden tarayıcıda kalıcı saklama.
- Web'de `localStorage`, yerel Expo istemcisinde cihaz depolaması; bütçe kayıtları finansal API'ye gönderilmez.

Kanıt: CSV dosya seçimi/indirme, önizleme, validation, tekrar atlama, yeni kategori ve formül güvenliği; `store.tsx` kalıcı yazma kuyruğu ve depolama hatası davranışı. 33 bütçe/CSV testi başarılı. CSV tüm ayların işlemlerini taşır, aylık limitleri içermez.

## [x] Windows'a kurulabilir Web PWA
- Windows'ta Edge/Chrome üzerinden uygulama olarak kurulabilsin; manifest, kare ikonlar ve bağımsız pencere modu sağlansın.
- Kurulum düğmesi uygun tarayıcıda kurulum istemini kullansın; uygun olmayan/iframe ortamlarda manuel yönergeler sunulsun.
- Web arayüzü masaüstü kullanımını önceliklendirsin; mevcut işlevler, Gece Terminali kimliği ve yerel kayıtlar korunsun.
- Service worker yayın sürümünde yalnızca sürümlü statik uygulama kabuğunu önbelleğe alsın; kişisel/API/auth yanıtları önbelleğe alınmasın. Geliştirme Metro yenilemesini önbelleğe alma.
- Mevcut iOS/Android kaynakları silinmesin; native uygulama ve release geliştirmesi sonraki aşamaya kalsın.

Kanıt: `public/manifest.webmanifest`, 192/512 px ikonlar, `components/budget/pwa.web.tsx`, `public/sw.js`, `scripts/prepare-pwa.mjs`. `pnpm build:pwa` 45 statik yolu içerik hash'iyle paketler. Tam Vitest paketi 68 başarılı, 1 atlanan test; TypeScript ve üretim Web paketlemesi başarılı. Gerçek Windows cihaza kurulum ve offline cihaz testi yapılmadı.

## [x] Vercel Drop için doğrudan yükleme paketi
- Vercel Drop'a yüklenecek statik PWA ZIP'inde kök `index.html`, PWA manifest/ikonları, service worker ve Vercel özel cache başlıkları bulunsun.
- Yükleme adımları ve localStorage verilerinin cihazla sınırlı olduğu, cPanel API'sinin bağlı olmadığı açıkça belirtilecek.

Kanıt: Güncellenen `ButceTakip-Vercel-Drop.zip` ZIP bütünlük kontrolünden geçti; kök `vercel.json` ve fontları `assets/vendor/` altında içerir. Vercel Drop üretim akışı ve başlık belgeleri `PWA.md`/`VERCEL-KURULUM.md` içinde kaynaklandırılmıştır.

## [x] Canlı Vercel simge/font düzeltmesi
- https://butcetakip-vercel-drop.vercel.app/ adresindeki arayüz simgeleri ve IBM Plex Sans fontları normal görünsün; hatalı font yolları giderilsin.
- Aynı Vercel projesine otomatik güncelleme yapılsın; alan adı, bütçe kayıtları ve mevcut işlevler korunsun.
- Kaynak düzeltmesi yeniden paketlemede de geçerli olsun; native kaynaklara ve localStorage verilerine dokunulmasın.

Kanıt: Üretimdeki üç fontun önceki `/assets/node_modules/...` istekleri 404'tü. `scripts/prepare-pwa.mjs` dependency assetlerini `assets/vendor/` altına taşır, bundle referanslarını değiştirir, değişen JS dosyasına yeni içerik hash'i verir ve service worker precache yolunu günceller. Kaynak regresyon testi, yeniden paketlemeyi de kapsar. Tam test paketi 68/68 başarılı, 1 mevcut logout testi atlandı. Vercel CLI ile aynı `tea-3a9c/butcetakip-vercel-drop` projesine production deployment `dpl_EkpR1jQP8GpNe7c1TE2brGetun9n` yayımlandı; `https://butcetakip-vercel-drop.vercel.app/` alias'ı atandı. Canlı kök sayfa, manifest, service worker, ikon, Feather/IBM fontları ve yeni hash'li JS HTTP 200 verdi. Tarayıcıda `feather`, `Plex`, `PlexSemi` fontlarının üçü de `loaded`; kontrol sonuçları `true`, hata yok ve simgeler ekranda görünüyor. Aynı site origin'i korundu; localStorage veya native kaynaklar değiştirilmedi.

## [ ] cPanel MySQL ile ortak veri ve cihazlar arası senkronizasyon
- Kullanıcının kendi hostingindeki MySQL veritabanı ortak kaynak olsun; Windows PWA ve ileride iOS/Android kimlik doğrulamalı HTTPS API üzerinden erişsin.
- Veritabanı parolası istemciye değil PHP/API sunucusuna ait korumalı ayarlara konulsun.
- Kullanıcı hostingini muhtemelen cPanel + MySQL + PHP olarak belirtti. Tam PHP sürümü, kullanılacak HTTPS alan adı/SSL ve cPanel Directory Privacy imkânı “sonra” paylaşılacak.
- DB bağlantısı, hosting yüklemesi, kullanıcı verisi aktarımı ve cihazlar arası senkronizasyon henüz yapılmadı. Mevcut `localStorage` kayıtları silinmez veya otomatik taşınmış varsayılmaz.
- Alan adı/HTTPS ve API erişim yolu belirlendikten sonra aynı kaynakta uygulama, kimlik doğrulama, veri sahipliği, hata/çakışma ve güvenli taşıma tamamlanacak.

## Tasarım ve sınırlar

Gece Terminali: koyu #111827 kimlik, #22C55E yeşil vurgu, IBM Plex Sans. Mevcut proje sabit Expo türündedir; Web PWA aynı projenin web yüzeyine eklendi ve native kaynaklara dokunulmadı. iOS/Android yerel uygulama sürümü sonraki aşamaya bırakılmıştır.

PWA ZIP'i statik site paketidir; native `.exe`/`.msix` değildir. Çevrim dışı statik kabuğu destekler ama bulut verisi eşitlemez. Vercel production adresi yukarıdaki deployment ile güncellendi. cPanel alan adı henüz verilmediği için orada canlı yayın/veritabanı bağlantısı yapılmadı.

## [x] Aylık tasarruf hedefi
- Seçili ay için TL cinsinden pozitif hedef belirleme, düzenleme ve kontrollü kaldırma; hedef başka aylara otomatik kopyalanmaz.
- Pano ve Bütçeler bölümünde hedef, gelir eksi giderden hesaplanan pozitif net tasarruf, ilerleme yüzdesi ve hedefe kalan tutar gösterilir. Bu, fiili banka/birikim transferi değildir; kayıtlı aylık net bakiyenin göstergesidir.
- Gider gelirden yüksekse ilerleme %0; net bakiye eksi durumu açıkça belirtilir. Hedef aşılırsa kalan 0 ve aşan tutar gösterilir. Hedef olmayan ay için hedef belirleme çağrısı gösterilir.
- Eski `butce-takip-v1` kayıtları ve CSV işlemleri korunur; hedefler aynı yerel belgede saklanır, CSV'nin işlem-only kapsamı açıkça belirtilir. Hatalı/boş/sıfır/negatif/geçersiz hedef kaydedilmez; kayıt hatasında form kapanmaz.
- Mevcut görsel kimlik, font yolu düzeltmesi ve PWA güncelleme akışı korunur; Vercel'deki mevcut site adresi üzerinden teslim edilir. Çoklu döviz, günlük kur otomasyonu ve cPanel bağlantısı bu aşamaya dahil değildir.

Kanıt: Hedefli `savings.test.ts` 30/30 ve tam Vitest 98 başarılı/1 mevcut skip; TypeScript, hedefli ESLint ve `pnpm build:pwa` başarılı. Canlı Vercel deployment `dpl_7FucELuZ1PXecd5dQY3RwK2yyVKZ` READY, mevcut production alias'ı korunmuş ve sayfada Aylık tasarruf hedefi kartı görülmüştür. PWA ZIP temiz root config, kart metinleri ve yeni bundle hash'iyle yeniden üretildi. Eski v1 verisi, CSV kapsamı, native kod ve tarayıcıdaki mevcut localStorage değiştirilmedi.


## [ ] Çoklu dövizle işlem girişi ve TRY raporlama
- Döviz bölümünden TCMB listesindeki izleme para birimleri seçilebilsin; seçimler uygulamada kalıcı olsun.
- Kullanıcı seçili para biriminde gelir/gider girebilsin; özgün miktar ve döviz kodu işlemde korunsun. Kayıt anında gelir için resmî TCMB ForexBuying, gider için ForexSelling ve kurun `Unit` değeri hesaba katılarak TRY karşılığı hesaplanıp işlemde sabitlensin; uygulanan kur yönü ve bülten tarihi saklansın.
- Pano, kategori harcamaları, aylık bütçeler, tasarruf hedefleri ve içgörüler TRY raporlama para biriminde tutarlı kalsın. Para birimi alanı olmayan eski kayıtlar TRY olarak kabul edilsin. Tarih/kod için kullanılabilir resmî oran yoksa tahmin yapılmasın ve yabancı para işlemi kaydedilmesin; neden açıkça gösterilsin.
- CSV dışa aktarma/içe aktarma yabancı işlem miktarını ve tarihli TRY kur snapshot'ını taşısın; eski dört zorunlu sütunlu CSV'ler TRY varsayımıyla geriye uyumlu kalsın.
- Kişisel işlemler, bütçeler, kategoriler ve tasarruf hedefleri tarayıcıdaki yerel depolamada kalsın; kamuya açık kur API'sine kişisel finans kayıtları gönderilmesin.

## [ ] Günlük TCMB alış/satış kur arşivi ve cPanel MySQL bağlantısı
- Uygulamada seçilen para birimleri için resmî TCMB günlük bültenindeki döviz alış ve döviz satış değerleri, kur birimi (`Unit`), gerçek bülten tarihi/numarası, kaynak ve çekim zamanı veritabanında saklansın ve tekrar çalıştırma aynı tarih/para birimi satırını çoğaltmasın.
- cPanel'de PHP API oran geçmişini PWA'ya sunabilsin; API CORS izinleri PWA'nın tam HTTPS origin'iyle sınırlandırılsın. MySQL kimlik bilgileri public_html dışında kalsın; web API'si salt-okunur ve cron yazıcısı ayrı en az yetkili DB kullanıcısı olsun; günlük yazıcı yalnız CLI'dan çalışsın.
- Cron TCMB günlük XML bültenini 16:15 Europe/Istanbul veya sonrasında alsın. Hafta sonu/tatilde yeni bülten yoksa sahte gün kaydı oluşturmasın; ekranda mevcut son bülten tarihi belli olsun. Döviz ekranı günlük alış/satış oranlarını ve veritabanındaki tarihli geçmişi gösterip güncelleme/bağlantı durumunu anlaşılır sunsun.
- Gerçek cPanel alan adı, PHP sürümü, MySQL kurulum ve cron imkânı kullanıcıdan “sonra” alınacağından, hosting ayarı verilene ve kurulum doğrulanana kadar günlük MySQL yazımı/üretim bağlantısı etkin ya da tamamlanmış sayılmasın. Var olan yerel kullanıcı kayıtları değiştirilmesin.

### FX kaynak kodu ilerlemesi (22 Ekim 2026; teslim maddeleri açık)

`lib/budget/fx.ts`, `fxApi.ts`, `components/budget/fx.tsx`, işlem/CSV modeli ve `hosting/cpanel/` PHP/MySQL kurulum kiti hazırlandı. TCMB'nin doğrulanan 22 kodu (XDR/SDR dahil), gelir/gider kur yönü, JPY gibi birim sayısı, bülten tarihi ve tekilleştirme ele alındı. Hosting bilgileri “sonra” denildiği için API URL'si boş; gerçek DB/cron, PWA API bağlantısı ve Vercel production güncellemesi henüz yapılmadı; yeni yabancı para işlemleri canlı API kurulana kadar engelleniyor.

Doğrulama: TypeScript, Expo lint ve `pnpm build:pwa` başarılı; tam test paketi 110 başarılı / 1 mevcut logout testi atlandı; üç PHP dosyası `php -l` kontrolünden geçti. cPanel/MySQL üzerinde canlı entegrasyon henüz doğrulanmadı.