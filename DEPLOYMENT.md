# GitHub ve Vercel üzerinden PWA yayını

Kaynak proje Expo/React Native mimarisini kullanır. Vercel'de yayımlanacak ürün,
`web-dist/` altında oluşturulan statik web/PWA çıktısıdır. `pnpm build` komutu
başlangıç Express sunucusunu derler; PWA yayını için `build:pwa` kullanılmalıdır.

## Kurulum ve kontrol

Node.js 24 ile doğrulanmıştır. Paket yöneticisi `package.json` içinde sabitlenmiş
`pnpm@9.12.0` sürümüdür. `.npmrc` dosyasındaki `node-linker=hoisted`, NativeWind'in
ürettiği `react-native-css-interop/jsx-runtime` import'unun Metro tarafından
çözümlenebilmesi için gereklidir. Bağımlılık sürümlerini veya lockfile'ı değiştirmez.

Proje kökünde:

```sh
npx --yes pnpm@9.12.0 install --frozen-lockfile
npx --yes pnpm@9.12.0 check
EXPO_NO_TELEMETRY=1 npx --yes pnpm@9.12.0 lint
npx --yes pnpm@9.12.0 run test --maxWorkers=2 --minWorkers=1
EXPO_NO_TELEMETRY=1 npx --yes pnpm@9.12.0 build:pwa
```

Yerel geliştirme için `npx --yes pnpm@9.12.0 dev` kullanılır. Metro 8081,
başlangıç API'si 3000 portundadır; API sağlık kontrolü `/api/health` yoludur.
Cloud ortamındaki başlatma talimatları ayrıca ortamın `start_skill` alanında
saklanır. Her görev zaten izoledir; mevcut checkout kullanılır, yeni worktree
oluşturulmaz.

## Mevcut Vercel projesi

- GitHub deposu: `mcalti89/butce-takip`, production dalı `main`.
- Korunacak Vercel projesi: `butcetakip-vercel-drop`.
- Korunacak adres: `https://butcetakip-vercel-drop.vercel.app/`.
- Root directory: depo kökü.
- Framework preset: Other (`framework: null`).
- Install/build/output ayarları kökteki `vercel.json` içindedir.
- `sw.js`, manifest ve hash'li statik varlıkların cache başlıkları aynı dosyada
  tanımlanır. Eski Drop yapılandırmasındaki PWA başlıkları korunmuştur.

Vercel hesabındaki GitHub entegrasyonu ilgili depoya yetkili olmalı ve mevcut
proje bu depoya bağlanmalıdır. Yeni bir proje/domain oluşturmak yerine mevcut
projenin kullanılması, tarayıcıda origin'e bağlı duran kayıtları erişilebilir
tutmak açısından önemlidir. GitHub bağlantısı kişisel verileri buluta taşımaz.

## Yapılandırma sınırları

TRY işlemleri ve yerel kayıtlar sunucu/veritabanı gerektirmez. TCMB günlük kur
servisi için ayrı cPanel/PHP/MySQL kurulumu ve HTTPS API adresi gerekir; ayrıntılar
`hosting/cpanel/README.md` içindedir. Kur servisi yokken Döviz ekranının bekleme
durumu göstermesi beklenir; yeni kur gerektiren yabancı para işlemleri kaydedilmez.

`EXPO_PUBLIC_FX_API_URL`, API kurulunca Vercel'in ilgili build ortamına eklenip
yeniden build edilmelidir. Bu public adres dışında veritabanı parolaları,
Vercel erişim anahtarları ve diğer sırlar tarayıcı build'ine eklenmemelidir.
`VERCEL_TOKEN` bir yayın yönetim kimliğidir; uygulamanın çalışması için gereken
bir frontend değişkeni değildir. Yerel finans verisini taşıma, sıfırlama veya
bulut senkronizasyonu bu yayın akışının parçası değildir.

## İsteğe bağlı kişisel MySQL bütçesi

`api/cloud.ts`, statik PWA ile aynı origin üzerinde çalışan Node Vercel Function’dır.
Sunucu kimlik bilgileri `BUDGET_*` ortam değişkenlerinde yalnızca Production’a
verilir. Kurulum ve taşıma ayrıntıları [SQL belgesinde](database/budget/README.md).
Vercel build, bağlantı ayarı varsa önce idempotent şemayı ve gerçek SQL kontrolünü
çalıştırır; hata olursa yeni sürüm yayımlanmaz. Ardından web/PWA çıktısı üretilir.
Yerel `build:pwa` komutu şema değiştirmez. Her SQL kontrolü kendine ait geçici test
hesabını temizler; kullanıcı bütçeleri test edilmek üzere değiştirilmez.

## Google ile çok kullanıcılı giriş

Google yapılandırması [GOOGLE-AUTH.md](GOOGLE-AUTH.md) içindedir. Production'da
`BUDGET_GOOGLE_CLIENT_ID` tanımlandığında yalnızca Google oturumları kabul edilir;
web bütçe ekranı da bu oturumun arkasındadır. Yeni kullanıcılar `demo:false` boş
bütçeyle oluşturulur. Önceki sahibin belgeleri korunur. SQL kontrolü bu modda yerel
imzalı test sağlayıcısıyla iki ayrı hesabı sınar ve gerçek Google JWKS erişimini
Production build sırasında kontrol eder. Gerçek kullanıcı onayıyla Google popup
akışı kullanıcının kendi tarayıcısında tamamlanır.
