# Bütçe Takip

Türkçe kişisel bütçe uygulaması. Mevcut kod tabanı Expo Router, React Native, TypeScript ve NativeWind kullanır; Windows-öncelikli kurulum için aynı web yüzeyine PWA manifesti, install akışı ve yayın kabuğu eklendi. Seçilen Gece Terminali tasarımı koyu lacivert zemin, yeşil vurgular ve IBM Plex Sans kullanır. Native iOS/Android uygulamaları sonraki aşamadır; mevcut native kaynaklar korunur.

## Windows PWA

Yerel geliştirme/önizleme açık bir preview'dır; service worker orada etkinleşmez. `pnpm build:pwa`, Windows Edge/Chrome ile kurulabilen ve yayınlandıktan sonra statik uygulama kabuğunu çevrim dışı sunabilen `web-dist/` klasörünü üretir. Build, içerik hash'li kesin JavaScript/CSS/font/icon listesini oluşturur. API/kimlik doğrulama/kullanıcı verileri worker cache'ine alınmaz. Geliştirici notları [`PWA.md`](PWA.md); önceden teslim edilmiş `ButceTakip-Windows-PWA.zip` son TCMB FX kaynak değişikliğini içermez. Güncel cPanel kurulum dosyaları ayrıca paketlenmiştir; PWA production paketi API adresi ayarlandığında yenilenmelidir.

**cPanel/MySQL henüz bağlı değil.** Hosting sağlayıcısı cPanel, veritabanı MySQL ve PHP kullanımı olası olarak belirtildi; alan adı/SSL, PHP sürümü ve koruma imkânı sonra verilecek. Uygulama şu an aynı cihaz/tarayıcıdaki `localStorage` verisini tutar; PWA kurulumu tek başına eşitleme yapmaz. Alan adı bilinene kadar hiçbir finansal kayıt veritabanına aktarılmaz.

## Kullanım

İlk açılışta açıkça etiketlenmiş örnek veriler uygulamayı keşfetmek için gösterilir. **Kendi bütçeme geç** seçeneği, bir onaydan sonra örnek modundaki tüm işlemleri ve limitleri kaldırır. Örnek moduna kişisel kayıt eklediysen önce CSV dışa aktar; bu işlem onları da kaldırır.

**İşlem ekle** ile gelir veya gider türünü, tutarı, kategoriyi, YYYY-MM-DD biçimindeki tarihi ve isteğe bağlı açıklamayı gir. İşlemler sekmesindeki bir kayda dokunarak düzenle veya sil. Yeni kategorileri Veriler sekmesinden oluştur.

**Bütçeler** sekmesinde ayı seç ve kategoriye dokunarak limitini belirle. Limit yalnızca seçili ayı etkiler. Harcanan, kalan ve aşım hesapları kayıtlarından otomatik üretilir. Toplam kalan yalnızca limit atanmış kategorileri kapsar. Pano ayrıca aylık gelir, gider, net bakiye, gider dağılımı, son altı aylık toplam gider trendi ve sade Türkçe içgörüler sunar. Trend, her ayın tüm mevcut kayıtlarını karşılaştırır; kısmi aylar tam aylara göre düşük görünebilir.

## Çoklu döviz ve günlük kurlar

**Döviz** sekmesinde TCMB listesinden izlenecek para birimleri seçilir. İşlem formunda gelir/gider tutarının özgün dövizi korunur; raporlar, limitler ve tasarruf hedefi TRY kalır. Kayıt sırasında gelirde TCMB döviz alış, giderde döviz satış kuru ve ilgili `Unit` kullanılarak TRY karşılığı hesaplanır; kur ve bülten tarihi işlemle birlikte sabitlenir. Örn. JPY `Unit=100` olduğunda dönüşüm 100 birime bölünür. TCMB gösterge kurları bankanın gerçek işlem fiyatı değildir.

Bu işlevin günlük canlı oran alması için cPanel PHP/MySQL kur API'si gerekir. Hosting bilgileri henüz paylaşılmadığı için API/cron kurulmadı; Döviz ekranı bu durumu açıkça gösterir ve yeni yabancı para işlemlerini kur servisi bağlanana kadar kaydetmez. TRY işlemleri kullanılabilir. Hazırlanan server dosyaları ve kurulum adımları [`hosting/cpanel/README.md`](hosting/cpanel/README.md) içindedir; server yalnız herkese açık TCMB oranlarını tutar, kişisel bütçe verisini değil.

## CSV

Veriler sekmesinde içe aktarma, dışa aktarma ve indirilebilir şablon bulunur. Gerekli sütunlar `date,type,category,amount`; isteğe bağlı sütunlar `description,id,currency,baseAmount,fxRate,fxUnit,fxDate,fxSide`. Türkçe eşdeğerleri de kabul edilir; eski dört sütunlu CSV'ler TRY olarak içe alınır. Tür `income/expense` veya `gelir/gider`, tarih `YYYY-MM-DD` olmalı. Virgül/noktalı virgül ayracı, UTF-8 BOM, tırnaklı alanlar, ondalık virgül ve çok satırlı açıklamalar desteklenir. Dosya sınırı 5 MB ve 10.000 işlemdir.

İçe aktarma önizlemesinde hatalı satırlar ayrı gösterilir ve aktarılmaz. Kullanıcı geçerli kayıtların eklenmesini onaylar. Aynı kimlik veya aynı tarih, tür, kategori, para birimi, tutar ve açıklamaya sahip tekrarlar atlanır. Yeni kategoriler otomatik oluşturulur. CSV tüm aylardaki işlemleri içerir; aylık bütçe limitlerini/kur arşivini içermez. Dövizli işlem varsa işlem başına tarihli kur snapshot'ı da taşınır. Elektronik tablo formülü gibi başlayan metinler dışa aktarımda güvenli hale getirilir.

## Yerel depolama ve gizlilik

Kişisel finansal veriler API'ye gönderilmez. Web'de `butce-takip-v1` anahtarında `localStorage`, yerel Expo istemcisinde AsyncStorage kullanılır. Kur API'si etkinleştirildiğinde PWA sadece TCMB'nin kamuya açık oranlarını ister; kullanıcı işlem/kategori/bütçe verisini sunucuya göndermez. Depolama hatalarında kayıt başarılı görünmez; kalıcı kaydetme tamamlanınca arayüz güncellenir. Web veri alanı tarayıcı ve önizleme adresine özgüdür. Tarayıcı verilerini temizlemek veya başka cihaz/tarayıcı kullanmak aynı kayıtları getirmez. Düzenli CSV yedeği al.

## Geliştirme

- `pnpm dev`: Metro/Web 8081 ve API 3000.
- `pnpm check`: TypeScript.
- `pnpm exec vitest run tests/budget.test.ts tests/fx.test.ts tests/fx-api.test.ts`: bütçe/CSV ve FX hesaplama/API testleri.
- `pnpm test`: tüm regresyon testleri.
- `pnpm exec expo export --platform web --output-dir web-dist`: Web paketleme kontrolü.
- `pnpm build:pwa`: dağıtılabilir manifest/service-worker'lı `web-dist/` oluşturur.

`app/` rotaları, `components/budget/` ortak arayüz, grafik ve editörleri, `lib/budget/` hesaplama modeli/yerel durum/CSV/platform dosya sınırlarını içerir. API ve başlangıç Drizzle kullanıcı şeması sabit Expo şablonunun parçasıdır; bütçe kayıtları bunları kullanmaz.

Android/iOS release dosyaları Sandbox içinde oluşturulmaz; kabul edilen checkpoint üzerinden Manus Dashboard build akışı kullanılır. Expo Web önizlemesi native release veya gerçek cihaz testi değildir.
