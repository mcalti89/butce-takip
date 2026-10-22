# Bütçe Takip — Windows PWA

Bu paket Windows'ta Microsoft Edge/Google Chrome ile uygulama olarak kurulabilecek **statik Web sürümüdür**. Yerel .exe veya .msix değildir. Gelir-gider, kategori bütçeleri, aylık tasarruf hedefi, grafikler, içgörüler, CSV ve çoklu döviz arayüzü bulunur. iOS/Android için yerel ürün geliştirmesi bu aşamada yapılmamıştır.

## Hostingde açma

1. ZIP'i çıkarın. ZIP'in kökünde bulunan `index.html` ve diğer dosya/klasörleri bir HTTPS alan adının belge kök dizinine yerleştirin; ör. `https://butce.orneksite.com/`. Dosyayı çift tıklayıp `file://` ile açmak desteklenmez. Paket alt klasör yerine alan adı veya alt alan adının kök yolu için hazırlanmıştır.
2. `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `_expo/` ve `assets/` dosya/klasörlerini birlikte taşıyın. Tarayıcı yüklemesi için HTTPS gerekir; geliştirme istisnası localhost'tur.
3. Manifesti JSON/Web App Manifest olarak, `sw.js` dosyasını JavaScript olarak sunun. `sw.js` ve `manifest.webmanifest` için `Cache-Control: no-cache` önerilir. Paketteki `_headers` dosyası yalnızca bunu destekleyen statik hostinglerde otomatik uygulanır; cPanel/Plesk/IIS/Apache/Nginx üzerinde eşdeğer ayarı hosting panelinden yapmak gerekebilir.
4. Adresi Edge/Chrome'da normal sekmede açın. Tarayıcı izin veriyorsa uygulamadaki **Windows’a kur** düğmesini kullanın; aksi halde adres çubuğundaki kurulum simgesi veya menüdeki siteyi uygulama olarak yükleme seçeneğini kullanın. Etiketler tarayıcı sürümüne göre değişir. Gömülü Manus önizlemesi kurulumu engelleyebilir.
5. Yayın sürümü ilk çevrim içi açılışta statik kabuğu hazırlar. Kabuk hazırlığı tamamlandıktan sonra aynı cihazdaki yerel veriler çevrim dışı açılabilir. Yeni sürüm geldiğinde **Güncellemeyi uygula** düğmesi görünür; açık formu önce kaydedin.

## Vercel Drop ile dağıtım

`ButceTakip-Vercel-Drop.zip`, Vercel’in [Drop yükleme akışı](https://vercel.com/docs/drop) için hazır statik dosyaları ve Vercel başlık ayarını içerir. [vercel.com/drop](https://vercel.com/drop) üzerinde hesabınıza giriş yapıp ZIP’i seçin, Team/proje adını belirleyin ve **Deploy**’a basın. Bu, yeni veya seçtiğiniz mevcut projeye production dağıtımı yapar. Bu oturumda `butcetakip-vercel-drop` projesi CLI ile güncellendi; canlı adres [butcetakip-vercel-drop.vercel.app](https://butcetakip-vercel-drop.vercel.app/) olarak kaldı. Drop tek başına sürekli Git deploy’u kurmaz.

`pnpm build:pwa`, Expo'nun `assets/node_modules/` altına çıkardığı Feather/IBM fontlarını normal `assets/vendor/` yoluna taşır, bundle referanslarını yeniler ve değişen JS dosyasına yeni içerik hash'i verir. Böylece Vercel Drop'ın `node_modules` alt dizinlerini dışlaması font ve simgeleri bozmaz.

Bu aktarım statik PWA içindir. Uygulama URL’si ziyaretçilere açıktır; kişisel bütçe kayıtları kullanıcı tarayıcısında kalır. cPanel kur API paketi ayrıca hazırlanmıştır ama henüz hosting hesabına yüklenmemiş ve PWA'ya bağlanmamıştır.

## Veri durumu

**Kişisel bütçe veritabanı/senkronizasyonu yoktur; TCMB kur API'si de henüz bağlanmamıştır.** Kayıtlar, kategoriler, TRY bütçeleri, tasarruf hedefleri, döviz tercihleri ve işlem kur snapshot'ları aynı site adresinin tarayıcı `localStorage` alanındaki `butce-takip-v1` kaydında saklanır. PWA kurmak cihazlar arası bulut senkronizasyonu sağlamaz. İnternet bağlantısı göstergesi sunucu veri eşitlemesi değildir. cPanel'e kurulduğunda sunucu yalnız kamuya açık TCMB kur bültenini tutacaktır; kişisel bütçe işlemlerini veritabanına yüklemez.

Önizlemede kayıt oluşturduysanız kendi alan adınıza geçiş aynı kayıtları otomatik getirmez. Önce CSV dışa aktarıp yeni adreste içe aktarın. CSV yalnızca işlemleri taşır; aylık bütçe limitlerini taşımaz. Eski tarayıcı verilerini silmeyin. Hosting bağlantısı geliştirildiğinde işlem/kategori/limit aktarımı mevcut kayıtları koruyarak ele alınmalıdır. İlk açılışta etiketlenmiş örnek veri modu bulunur; kendi kayıtlarına geçmeden önce boş bütçe seçeneğini kullanabilirsiniz.

Service worker yalnızca içerik-sürümlü statik JS, CSS, fontlar, ikonlar ve genel açılış kabuğunu önbelleğe alır. API, kimlik doğrulama, kullanıcı depolama yanıtları ve finansal kayıtlar service worker önbelleğine alınmaz. Native kaynaklar ve uygulama kimlikleri değiştirilmeden korunmuştur.

## Kendi veritabanına geçiş için gerekenler

Hostinginizin cPanel, MySQL ve PHP kullandığını düşündüğünüzü belirttiniz; alan adı/PHP sürümü/cron bilgilerini daha sonra paylaşacaksınız. Bu nedenle hosting hesabına değişiklik yapılmadı. `EXPO_PUBLIC_FX_API_URL` build-time public ayarı, izinli PWA origin'i ve PHP/MySQL kurulum yolu ancak o bilgiler alındıktan sonra ayarlanacak. DB kullanıcı/parolaları hiçbir zaman tarayıcı bundle'ına veya Vercel ZIP'ine konmayacak. Kur API'si parolalı değildir ve yalnız read-only TCMB oranı sunar; MySQL API okuyucusu ile CLI cron yazıcısı ayrı DB hesapları kullanır.

## Çoklu döviz ve TCMB günlük arşivi

İşlem formunda TRY, kullanıcının izleme listesine eklediği para birimlerinden biri seçilir. Yabancı para tutarı ve kodu orijinal haliyle korunur; raporlar, bütçeler ve tasarruf hedefi TRY'de kalır. Gelirde TCMB ForexBuying, giderde ForexSelling kullanılır; TCMB `Unit` (ör. 100 JPY) hesaba katılır. İşlem snapshot'ı uygulandığında kaynak kur, kur yönü, gerçek bülten tarihi ve TRY karşılığı işlemde sabit kalır. Bu gösterge oranları bankanın gerçekleşen fiyatı değildir.

TCMB XML'i tarayıcı CORS erişimine açık olmadığından bağlantı `hosting/cpanel/README.md` paketindeki PHP API üzerinden yapılır. Günlük cron 16:15 (Europe/Istanbul) veya sonrasında `today.xml` alır; `fx_daily_rates` tablosundaki benzersiz `(rate_date, currency_code)` anahtarına TCMB bülten tarihini yazar. Hafta sonu/tatilde aynı son yayımlanmış bülten tekrarlanır; yeni kur tarihi uydurulmaz. cPanel bağlantısı ve cron henüz kurulmadığı için Döviz sayfası “Sunucu bağlantısı bekleniyor” durumunu gösterir ve yeni yabancı para işlemleri kur API'si gelene kadar kaydedilemez; TRY işlemleri ve mevcut yerel kayıtlar çalışmaya devam eder.

## Doğrulama sınırı

Önceki tasarruf hedefi Vercel sürümü TypeScript, hedefli ESLint, 98 başarılı Vitest testi (1 mevcut logout skip) ve production PWA export ile doğrulanmıştı. Vercel production `dpl_7FucELuZ1PXecd5dQY3RwK2yyVKZ` READY; mevcut `butcetakip-vercel-drop.vercel.app` alias'ı korunarak kök sayfa, hash'li JS, service worker, manifest ve manifestteki iki ikon HTTP 200 döndü. Canlı sayfada tasarruf hedefi kartı ve `Hedef belirle` eylemi göründü. Gerçek Windows cihazında tarayıcı kurulumu/offline testi yapılmadı; cPanel/MySQL hostingine geçiş henüz yapılmadı.

## Aylık tasarruf hedefi

Pano ve Bütçeler ekranındaki **Aylık tasarruf hedefi** kartından seçili ay için TL hedefi belirlenebilir, düzenlenebilir veya onayla kaldırılabilir. Her ay bağımsızdır; hedef otomatik kopyalanmaz. İlerleme, kayıtlı aylık gelir eksi giderin pozitif kısmıdır; fiili banka/birikim aktarımı değildir. Negatif net farkta ilerleme %0, hedef aşıldığında kalan 0 ve aşan tutar gösterilir.

Hedefler `butce-takip-v1` yerel belgesinin isteğe bağlı `savingsGoals` alanında saklanır; alanı olmayan eski belgeler geçerlidir. Eski işlem/kategori/bütçe kayıtları değiştirilmez. CSV yalnızca işlemleri taşır; aylık limitleri ve tasarruf hedeflerini içermez. Bulut eşitleme hâlâ etkin değildir.

Önceki aylık tasarruf hedefi sürümü TypeScript, hedefli ESLint, 98 başarılı Vitest testi (1 mevcut logout skip) ve production PWA export ile doğrulanmıştı. Yeni çoklu döviz kaynak değişikliği henüz Vercel production'a gönderilmedi; gerçek kur API'si ve cPanel günlük DB kaydı da kullanıcının hosting ayrıntıları gelene kadar etkinleştirilmeyecek. Mevcut PWA production alias'ı `https://butcetakip-vercel-drop.vercel.app/` olarak kalır.

## Döviz özelliği — kaynak durumu (22 Ekim 2026)

Çoklu para birimi işlemleri, TRY bazlı özetler, tarihli TCMB kur snapshot'ı, CSV taşıması ve Döviz ekranı kaynak koda eklendi. TCMB'nin doğrulanan 22 kodu (XDR/SDR dahil) seçim listesinde bulunur. cPanel için MySQL şeması, CORS allowlist'li read-only PHP API, örnek özel config ve yalnız CLI'dan çalışan günlük cron da `hosting/cpanel/` altında hazırdır.

Bu değişiklik henüz Vercel production'a gönderilmedi. Hosting bilgileri kullanıcı tarafından “sonra” verileceği için `EXPO_PUBLIC_FX_API_URL` boş; canlı TCMB okuması, MySQL'e yazma ve cron henüz çalışmıyor. Önizleme/yerel kaynakta yabancı para kayıtları API kurulana kadar engellenir; TRY ve mevcut yerel veriler çalışır. Kaynak kodun test edildiği belirtilmesi, canlı cPanel/MySQL bağlantısının test edildiği anlamına gelmez.

Son kaynak doğrulaması: TypeScript ve Expo lint başarılı; tam test paketi **110 başarılı / 1 mevcut atlanan logout testi**; `pnpm build:pwa` başarılı; üç PHP dosyası `php -l` kontrolünden geçti. Canlı sunucuda SQL kurulumu, CORS, DB bağlantısı ve zamanlanmış cron kullanıcı hosting ayrıntılarını sağlayıp yükleme tamamlandıktan sonra doğrulanabilir.
