# Kişisel bütçe veritabanı

Web/PWA bütçeleri MySQL'de hesap kimliğiyle ayrılır. Oturum Google ile açılır;
ayrıntılar [Google kurulumu](../../GOOGLE-AUTH.md) dosyasındadır. API Vercel üzerinde
`/api/cloud` yolunda çalışır. MySQL adresi/parolası yalnızca sunucuda tutulur.

## Sunucu ayarları

Vercel Production ortam değişkenleri:

| Değişken | Kullanım |
| --- | --- |
| `BUDGET_DATABASE_URL` | Gerçek parolayı içeren `mysql://kullanıcı:parola@sunucu:port/veritabanı` URI'si |
| `BUDGET_DATABASE_CA` | Sağlayıcının CA PEM sertifikası; genel kökle doğrulanıyorsa gerekmeyebilir |
| `BUDGET_GOOGLE_CLIENT_ID` | Google Web application istemci kimliği |
| `BUDGET_APP_ORIGIN` | Varsayılan `https://butcetakip-vercel-drop.vercel.app` |
| `BUDGET_OWNER_EMAIL` | Yalnızca eski sahibin kayıtlarını koruyarak eşlemek için önceki e-posta |

Google modunda `BUDGET_OWNER_PASSWORD` kullanılmaz. Google devre dışıysa eski sunucu
parola girişi geriye dönük operasyonel uyumluluk için kalır; yeni arayüz yalnızca
Google hesabıyla açılır. Kimlik bilgileri `EXPO_PUBLIC_` değişkenlerine eklenmemelidir.
Vercel ayarlarını değiştirdikten sonra yeniden deploy gerekir.

Aiven API'nin standart servis yanıtı parolayı maskeler. Yetkili kurulumda
`?include_secrets=true` kullanılıp parolanın maskeli olmadığı kontrol edilmelidir.
Maskeli URI gerçek bir bağlantı değildir. Gerçek değerleri hiçbir günlüğe veya Git'e
yazmayın. URI kullanıcı/parola alanında özel karakterleri URL kodlamasıyla saklayın.
TLS, CA ve sunucu kimliği doğrulanır; URL'deki TLS kapatma seçenekleri kullanılmaz.

## Şema ve verinin saklanması

```sh
pnpm db:budget
```

Komut numaralı SQL dosyalarını sırayla çalıştırır, mevcut belgeleri değiştirmez.
Vercel build bunu ve gerçek SQL doğrulamasını PWA build'inden önce çalıştırır;
bağlantı veya kontroller başarısızsa yeni yayın durur. Google kontrolünde yalnızca
rastgele sentetik hesaplar oluşturulup silinir. Codex ortamının MySQL DNS/TCP erişimi
olmasa da Vercel build sunucusu bağlantıyı kurabilir. `/api/cloud?action=status`
yapılandırmanın varlığından ayrı olarak gerçek tablo erişimini doğrular.

V1 bütçe belgesi MySQL JSON sütununda tutulur; işlemler ayrı SQL satırlarına
normalleştirilmemiştir. Bu tasarım mevcut kategorileri, işlemleri, aylık bütçeleri,
tasarruf hedeflerini ve geçmiş kur alanlarını kayıpsız korur. Bütçe hesabın UUID'sine
bağlıdır; Google subject ayrı tabloda bu hesaba eşlenir. Sürüm kontrolü, eski sekmenin
yeni veriyi ezmesini önler. Otomatik birleştirme veya gerçek zamanlı veri akışı yoktur.
Diğer cihazdaki son kayıtları almak için “Son verileri yükle” kullanılır.

SQL bütçesini açmak/kaydetmek için internet gerekir. Hesap verileri localStorage'a
ve service worker önbelleğine yazılmaz. Oturum kapandığında bütçe ekranı kapanır;
yazma sessizce yerel moda dönmez. Eski cihaz verisi otomatik aktarılmaz.

## Yedekleme ve cPanel'e taşıma

“Hesabım ve yedekler” bölümünden Tam JSON yedeği bütün bütçe alanlarını içerir;
CSV yalnızca işlemleri içerir. JSON indirme otomatik geri yükleme veya otomatik
sunucu yedeği değildir. Sağlayıcının yedeklerini ayrıca ayarlayın; yedekler kişisel
finans verisi içerir ve güvenli tutulmalıdır.

MySQL araçları veya sağlayıcı paneliyle tüm `budget_cloud_*` tablolarını SQL dump
olarak alın. Kimlik tablolarını da ekleyin ki Google hesapları aynı bütçeleri açsın.
TLS doğrulamasını etkin tutun; parolayı komut satırında açık argüman olarak yazmayın.
`--no-tablespaces --set-gtid-purged=OFF --single-transaction` seçenekleri taşımayı
kolaylaştırır. Önce ayrı veritabanına import edip doğrulayın; son dump sırasında
uygulama yazmalarını durdurun. Yeni sunucuda oturum/challenge tablolarını boşaltıp
yeniden giriş yaptırın; gerçek hesap, Google kimliği ve belgeleri koruyun.

cPanel'de MySQL tek başına yeterli değildir. Bu Node API'nin barındırılması veya aynı
Google JWT/nonce/oturum ve sürüm kontrollerini sağlayan PHP karşılığı gerekir.
Uzak MySQL erişimi varsa Vercel API'si TLS ile cPanel'e bağlanabilir; paket desteği
ve bağlantı o aşamada doğrulanır. Origin değişirse Google Authorized JavaScript
origins ve `BUDGET_APP_ORIGIN` de güncellenir. TCMB cPanel API'si bundan ayrıdır.

## Ayrı geliştirme veritabanı

Yalnızca sahte verilerle, loopback'e bağlı geliştirme servisi:

```sh
docker start butce-mysql-dev
# İlk kurulumda:
# docker run -d --name butce-mysql-dev --publish 127.0.0.1:3307:3306 \
#   --env MYSQL_ALLOW_EMPTY_PASSWORD=yes --env MYSQL_ROOT_HOST=% \
#   --env MYSQL_DATABASE=butce_development \
#   --volume butce_mysql_dev_data:/var/lib/mysql mysql:8.4
export BUDGET_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_development
export BUDGET_DATABASE_TLS=local-only
pnpm db:budget
pnpm dev
```

`local-only` yalnızca loopback ve nonproduction bağlantılarda kabul edilir. Gerçek
kişisel verileri bu şifresiz test sunucusuna koymayın. Docker süreçleri snapshot'tan
sonra çalışıyor varsayılmamalıdır; `docker exec butce-mysql-dev mysqladmin ping` ile
hazır oluşunu kontrol edin. Gerçek Google girişini yerelde denemek için ayrı test
istemcisi ve izinli localhost origin'i gerekir.

SQL testleri yalnızca açıkça belirtilen `localhost/butce_test` veritabanını kullanır
ve bu test veritabanının bütçe hesaplarını temizler:

```sh
docker exec butce-mysql-dev mysql -e 'CREATE DATABASE IF NOT EXISTS butce_test;'
BUDGET_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_test pnpm test
```

Bağlantı belirtilmezse SQL testleri atlanır; çalıştırılmış sayılmaz. Google JWT birim
testleri ağ bağlantısı olmadan yerel imza anahtarlarıyla doğrulanır. `db:push`, Manus
başlangıç şemasına aittir; bütçe tabloları için kullanılmaz. Codex HTTPS proxy sırları
ham MySQL TCP parolası değildir; Production ayarları güvenli Vercel ortamında kalır.
