# Uygulama varlıkları

Seçilen Gece Terminali tasarımının IBM Plex Sans 400 ve 600 fontları `@expo-google-fonts/ibm-plex-sans` paketinin ağırlığa özel alt yollarından yüklenir. Fontlar Expo Web ve Expo Go için `useFonts` ile uygulama paketine dahil edilir; kullanılmayan ağırlıklar içe aktarılmaz.

Kaynaklar: https://github.com/expo/google-fonts ve https://fonts.google.com/specimen/IBM+Plex+Sans . Fontun lisansı kurulu paketteki `LICENSE_FONT` dosyasında bulunur ve teslim edilen kaynaklara kopyalanır.

`pnpm build:pwa` sonrasında `scripts/prepare-pwa.mjs`, Expo'nun dependency asset yolundan gelen fontları `assets/vendor/` altına taşır; JS/CSS/HTML referanslarını günceller ve değişen Expo statik bundle'ına yeni içerik hash'i verir. Bu, Vercel Drop ve `node_modules` dizinini filtreleyen diğer statik hostinglerin fontu atlayıp Feather simgelerini boş bırakmasını önler. Native Expo bundle'ı için kaynak dosyalar ve font yükleme biçimi değişmez.

Kare launcher ikonu, #111827 zemin üzerinde #22C55E grafik/para sembolüyle aynı uygulama kimliğini taşır. Sayısal dağılım ve trendler yapay görsel olarak değil, işlem tutarlarından deterministik SVG bileşenleriyle çizilir.
