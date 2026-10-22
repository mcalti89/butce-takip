# Bütçe Takip — ChatGPT Codex Devir Notu

> Bu dosya, projeyi ChatGPT Codex'e verip çalışmaya kaldığı yerden devam etmek için hazırlanmıştır. Bu belge **22 Ekim 2026** itibarıyla doğrulanmış proje durumunu anlatır. Kod ve yapılandırma dosyaları asıl kaynaktır; uygulama durumunu değiştirmeden önce mevcut depoyu inceleyin. Bu dosyada parola, API anahtarı veya veritabanı bağlantı dizesi bulunmaz.

## 1. Projenin amacı ve kullanıcı önceliği

Türkçe kişisel bütçe uygulamasıdır. Kullanıcı önce Windows'a kurulabilen bir **PWA** istemiştir; daha sonra aynı ürünü iOS ve Android için de geliştirmeyi planlamaktadır. Mevcut proje Expo Router + React Native + TypeScript kod tabanıdır ve Windows/web sürümü PWA olarak dışa aktarılır. Bu ürün yerel Windows `.exe`/`.msix` değildir.

Tasarım kimliği **Gece Terminali**: koyu lacivert yüzeyler, yeşil vurgu, IBM Plex Sans ve yoğunluğu kontrollü finans panosu. Türkçe arayüz korunmalıdır.

## 2. Kaynak deposu ve mevcut durum

- Proje kökü: `/home/ubuntu/butcetakip`
- Varsayılan dal: `main`
- Son doğrulanmış kaynak commit'i: `c02b693fcc6cfe924999dc1877e344706efa79c6` — `feat: add TCMB multi-currency tracking`
- Son commit kontrolünde çalışma ağacı temizdi.
- Uygulama özel geliştirme komutları `package.json` içinde tanımlıdır; Expo portlarını veya başlangıç komutlarını değiştirmeyin.
- Bağımlılık yöneticisi `pnpm`; `pnpm-lock.yaml` depodadır.

Başlangıçta şu dosyaları inceleyin: `README.md`, `PWA.md`, `plan.md`, `TODO.md`, `hosting/cpanel/README.md`, `package.json` ve aşağıdaki ilgili kaynak modülleri. Aynı işi baştan kurmak yerine mevcut kodu genişletin.

## 3. Tamamlanmış ürün özellikleri

### Bütçe ve raporlama

- Gelir/gider işlemleri; kategori, açıklama, tutar ve tarih ile eklenir, düzenlenir ve silinir.
- Her kategori için aya özel bütçe belirlenebilir; harcama, kalan ve aşım hesapları gösterilir.
- Pano kategori dağılımını, altı aylık gider eğilimini ve sade Türkçe içgörüleri sunar.
- Aya özel tasarruf hedefi belirlenebilir/düzenlenebilir/kaldırılabilir. İlerleme, kayıtlı gelir eksi giderin pozitif kısmından hesaplanır; gerçek banka/birikim transferi değildir.
- İlk açılışta örnek veri modu bulunur. **Kendi bütçeme geç** akışı örnek kayıtları onay sonrası kaldırır.

### CSV

CSV içe/dışa aktarımı, şablon, doğrulama ve içe aktarma önizlemesi vardır. Eski dört sütunlu dosyalar TRY olarak okunur. Dövizli işlemler için ek para birimi/kur snapshot alanları taşınabilir. CSV aylık bütçe ve tasarruf hedeflerini taşımaz. Biçim ve sütun ayrıntıları `README.md` içindedir.

### Çoklu döviz ve TCMB

- Döviz ekranı, izleme listesi, güncel kur/kur geçmişi sunumunu içerir.
- Varsayılan raporlama para birimi TRY'dir; toplamlar, kategori bütçeleri ve tasarruf hedefleri TRY kalır.
- TRY dışı işlem özgün para birimi ve tutarını korur; kurla hesaplanan TRY tutarı ve kur snapshot'ı (oran, yön, `Unit`, kaynak bülten tarihi) işlemle birlikte sabitlenir. Sonradan kur güncellemesi geçmiş işlemin karşılığını değiştirmemelidir.
- Varsayılan dönüşüm yaklaşımı: gelirde TCMB **ForexBuying**, giderde **ForexSelling**. TCMB `Unit` değerine göre normalize edilir (ör. 100 JPY için oran 100'e bölünür). TCMB gösterge kuru banka/kartın fiili işlem fiyatı değildir; bu ayrımı arayüz ve dokümanlarda koruyun.
- Desteklenen kodlar ve hesaplama yardımcıları `lib/budget/fx.ts` içindedir.
- API ayarlanmamışken Döviz ekranı bağlantının beklemede olduğunu açıkça bildirir. TRY işlemleri ve mevcut kayıtlar çalışmalıdır; kur gerektiren yeni yabancı para işlemi, geçerli kur olmadan sessizce kaydedilmemelidir.

## 4. Veri saklama ve gizlilik — kritik ayrım

Şu an kişisel bütçe verisi cihaz/tarayıcıda yerel olarak saklanır:

- Web: aynı origin için `localStorage`, anahtar `butce-takip-v1`.
- Yerel Expo: AsyncStorage.
- Site adresi/origin veya cihaz değiştirildiğinde bu veriler otomatik taşınmaz. PWA kurulumu tek başına bulut senkronizasyonu sağlamaz.
- Kişisel işlemler, kategoriler, bütçeler ve tasarruf hedefleri sunucuya gönderilmez. Bunları MySQL'e aktarmak veya cihazlar arası eşitlemek **henüz uygulanmış değildir**.
- Mevcut cPanel/MySQL tasarımı yalnızca kamuya açık TCMB kur arşivini saklamak içindir; kişisel finans verisini depolamamalıdır.
- Service worker yalnızca sürümlü statik uygulama kabuğunu önbelleğe alır; API yanıtları/finansal kayıtlar cache dışıdır.

Kullanıcı daha önce veritabanını cihazlar arası erişim için sormuştur, fakat kapsam ve hosting bilgileri sonra için ertelenmiştir. Kişisel veri senkronizasyonunu otomatik olarak eklemeyin: önce veri modeli, giriş/kimlik doğrulama, erişim kontrolü, yedekleme, migration ve mevcut yerel veriyi kayıpsız taşıma tasarımını açıklığa kavuşturun. Mevcut TCMB API'si bu senkronizasyon değildir.

## 5. Mevcut teknik yapı

| Konum | Sorumluluk |
|---|---|
| `app/(tabs)/index.tsx` | Ana ekran, dahili gezinme, pano/işlem/bütçe/döviz/veri görünümleri ve modal bağlantıları |
| `app/_layout.tsx`, `app.config.ts` | Expo kök düzeni, fontlar, uygulama kimliği/yapılandırması ve proje logo metaverisi |
| `components/budget/` | Bütçe UI'si, grafikler, formlar, savings kartı ve `fx.tsx` döviz ekranı |
| `lib/budget/model.ts` | Bütçe veri modeli, eski veri uyumluluğu, TRY toplamları ve doğrulama |
| `lib/budget/store.tsx` | Yerel saklama sağlayıcısı; yazma bitmeden başarılı UI sonucu göstermemelidir |
| `lib/budget/csv.ts` | CSV import/export, tekrar/bozuk kayıt doğrulaması |
| `lib/budget/fx.ts` | TCMB para birimleri, kur veri tipleri, dönüşüm ve snapshot yardımcıları |
| `lib/budget/fxApi.ts` | İstemcinin cPanel FX API sözleşmesi/HTTP istekleri; build-time `EXPO_PUBLIC_FX_API_URL` ayarını kullanır |
| `lib/budget/savings.ts` ve `components/budget/savings.tsx` | Aya özel hedef saklama ve arayüzü |
| `hosting/cpanel/schema.sql` | Günlük kamuya açık kur tablosu şeması |
| `hosting/cpanel/public/fx-api.php` | Kur okuma için PHP API; salt okunur ve origin allowlist'li |
| `hosting/cpanel/cron/sync-tcmb.php` | Sadece CLI cron üzerinden TCMB XML alıp MySQL'e yazan görev |
| `hosting/cpanel/private/config.example.php` | Parola içermeyen örnek özel sunucu konfigürasyonu |
| `tests/` | Mevcut bütçe/CSV/PWA/savings/FX regresyon testleri |
| `scripts/prepare-pwa.mjs` | Expo statik çıktısını PWA'ya hazırlar; font yollarını ve sürümlü service worker varlık listesini düzenler |
| `public/manifest.webmanifest`, `public/sw.js` | PWA manifesti ve statik shell service worker |

Expo başlangıç projesinde ayrıca Express/tRPC, Drizzle ve Manus sağlayıcılarının API/kimlik doğrulama iskeleti vardır. Bütçe kayıtları bu API/veritabanını kullanmaz; başlangıç şemasını bütçe verisiymiş gibi sunmayın.

## 6. Hosting ve yayın durumu

### Vercel

- Mevcut bilinen production adresi: <https://butcetakip-vercel-drop.vercel.app/>.
- Vercel Drop statik PWA sürümü daha önce yayımlandı; son onaylı Vercel sürümü tasarruf hedefini içeriyor.
- **22 Ekim 2026'da eklenen çoklu döviz kaynak kodu henüz Vercel production'a aktarılmadı.** Canlı URL'de FX sekmesinin veya canlı kur bağlantısının bulunduğunu iddia etmeyin.
- `ButceTakip-Vercel-Drop.zip` eski olabilir; güncel Vercel yayını için önce `pnpm build:pwa` çalıştırıp doğru çıktıyı hazırlayın. Production deploy açık bir görev/izin olmadan yapılmamalıdır.
- Vercel PWA statiktir; cron/PHP/MySQL kendiliğinden çalıştırmaz.

### cPanel/MySQL/PHP

Kullanıcı hostingi “sanırım cPanel/MySQL ve PHP” olarak tarif etmiş, alan adı/PHP sürümü/cron ayrıntılarını **sonra** vereceğini söylemiştir. Bu yüzden canlı hosting hesabına hiçbir dosya yüklenmedi ve cron kurulmadı.

Kaynak kit `hosting/cpanel/` altındadır. Belgelenen model:

1. `fx_daily_rates` tablosunu oluştur.
2. PHP + PDO MySQL + SimpleXML bulunan HTTPS cPanel API'sini yükle.
3. DB parola/config dosyasını webroot dışında tut; API okuyucusuna yalnızca SELECT, cron kullanıcısına yalnız gerekli SELECT/INSERT/UPDATE izinlerini ver.
4. Yalnız izin verilen gerçek PWA origin'ine CORS izni tanımla.
5. Cron'u cPanel'in gerçek PHP binary ve mutlak paths bilgileriyle 16:15 veya sonrası (Europe/Istanbul; hosting sunucusunun saat dilimini teyit et) çalıştır.
6. TCMB bülten tarihini kullan; tatil/hafta sonunda yapay kur tarihi üretme.
7. `EXPO_PUBLIC_FX_API_URL` değerini build'e bağla ve Vercel PWA'yı yeniden build/deploy et.
8. Gerçek HTTPS API, CORS, SQL ve en az bir cron çalışmasını host üzerinde doğrula.

`hosting/cpanel/README.md` yükleme örnekleri sunar; gerçek cPanel yolları/versiyonlarıyla doğrulanmadan tahminî değerleri canlıya taşımayın. API yalnız kamuya açık oranları verir. DB parolalarını sohbete, kaynak dosyaya, JS bundle'ına veya ZIP'e yazmayın; uygun korumalı secret/config mekanizmasını kullanın.

## 7. Geliştirme ve doğrulama komutları

Komutları proje kökünde çalıştırın (`cd /home/ubuntu/butcetakip`).

```bash
pnpm install --prefer-offline   # yalnız node_modules yoksa/bağımlılık eksikse
pnpm check                      # TypeScript, tsc --noEmit
pnpm lint                       # Expo ESLint
pnpm test                       # Vitest'in tam birim/regresyon paketi
pnpm build:pwa                  # Windows/web statik PWA -> web-dist/
pnpm dev                        # Metro/Web 8081 ve API 3000
```

Notlar:

- `pnpm dev` uzun çalışan yerel geliştirme komutudur. İlk erişimden önce Metro `8081` ve API `3000` sağlık durumlarını kontrol edin.
- Sabit Expo starter için CI değişkenini Metro'ya aktarmayın; komutu gerekirse `unset CI; pnpm dev` ile başlatın.
- `pnpm db:push` başlangıç Expo şemasını değiştirir/migrate eder; FX cPanel veritabanı bununla yönetilmez. İhtiyaç yoksa çalıştırmayın.
- Son FX kaynak doğrulamasında: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build:pwa` geçti; **110 test başarılı, bir mevcut logout testi skip** idi. Üç PHP dosyası `php -l` kontrolünden geçti. Bu, gerçek cPanel/MySQL bağlantısının test edildiği anlamına gelmez.
- TypeScript/Expo host tanılaması zaten kaydedilidir; aynı Sandbox'ta ikinci bir LSP başlatmayın.

## 8. Codex için önerilen çalışma ilkeleri

1. Önce depodaki son commit/durum ve bu devir belgesinin doğruluğunu kontrol edin; dosya sistemi ve güncel `git status` bu metinden daha günceldir.
2. Var olan Expo/React Native/TypeScript mimarisini koruyun. Yalnız kullanıcı açıkça farklı bir teslimat isterse framework/mimariyi değiştirin.
3. Kapsamı Windows PWA önceliği olarak tutun; native iOS/Android sonraki aşamadır. Platforma özgü web DOM kodunu platform sınırlarında tutun.
4. Var olan kişisel kayıtları koruyun. `butce-takip-v1` biçimini veya depolama anahtarını değiştirmek gerekiyorsa geriye uyumlu migration ve test ekleyin; silme/reset işlemi yapmayın.
5. Kur hesabında orijinal döviz tutarını, `Unit`, TCMB bülten tarihini ve yönü koruyun; geçmiş snapshot'ları yeniden fiyatlamayın. Kaynak fiyat/gerçek banka kuru ayrımını görünür tutun.
6. Günlük otomasyonu tarayıcıda veya ziyaretçi açılışında çalıştırmayın. Sunucuda cPanel cron/CLI yazıcısı kullanın; public API write endpoint açmayın.
7. TCMB rate DB'si ile olası kişisel bütçe bulut DB'sini birbirine karıştırmayın. Veritabanı erişim/kişisel veri özelliği açıkça tasarlanmadan bütçe kayıtlarını sunucuya aktarmayın.
8. Secrets/credentials üretmeyin, kullanıcıdan chat'e parola istemeyin ve gizli değerleri terminal çıktısına yazdırmayın. `.env`, özel config ve deploy token'larını commit/zip'e eklemeyin.
9. Mevcut testleri koruyup değişiklikten sonra ilgili testler ve tam suite'i çalıştırın; PWA değişikliklerinde production build'i de deneyin.
10. Canlı Vercel/cPanel değişikliğini yerel kod düzeltmesinden ayrı tutun. Production deploy veya veri taşıma ancak kullanıcı kapsamı net ve ilgili izin verildiyse yapılır.

## 9. Önemli teslim notları

- Ana kullanım/ürün notu: `README.md`
- PWA kurulum/yayın ve sınırlamalar: `PWA.md`
- Günlük kur API/cron kurulum talimatı: `hosting/cpanel/README.md`
- Tasarım/teknik plan: `plan.md`
- Sonuç bazlı iş listesi: `TODO.md`
- TCMB kaynak notu: `docs/fx-sources.md`

Projede gerçek hosting bilgileri henüz yoktur. Codex'in ilk hedefi bu eksikliği varsayım ile doldurmak değil, mevcut çalışan davranışı anlamak ve kullanıcı hosting bilgilerini verdiğinde kontrollü biçimde tamamlamaktır.
