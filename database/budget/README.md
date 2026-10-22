# Bütçe için MySQL bağlantısı

Bu özellik web/PWA bütçesini, Vercel üzerindeki `/api/cloud` Node API’si aracılığıyla
MySQL’e kaydeder. Tarayıcıya MySQL adresi, parolası veya yönetim belirteci gönderilmez.
SQL yapılandırılmadığında mevcut yerel bütçe çalışır. Native uygulama yerel kalır.

## Kalıcı hizmet kurulumu

Kullanıcının kendi hesabında standart MySQL 8 sağlayan bir hizmet (ör. Aiven) oluşturun.
Hizmetin güncel ücretsiz planını, saklama ve yedekleme koşullarını hesabında kontrol edin;
ücretli plan satın almak bu değişikliğin kapsamında değildir. Geliştirme Docker’ı kalıcı
bulut veritabanı değildir. Vercel’in dosya sistemi de kişisel veriler için kullanılmaz.

Vercel → `butcetakip-vercel-drop` → Settings → Environment Variables bölümünde,
sadece sunucunun eriştiği Production değişkenlerini tanımlayın:

| Değişken | Değer |
| --- | --- |
| `BUDGET_DATABASE_URL` | Sağlayıcının `mysql://kullanıcı:parola@sunucu:port/veritabanı` bağlantı URI’si |
| `BUDGET_DATABASE_CA` | Sağlayıcının CA PEM sertifikası; genel kök sertifikayla doğrulanıyorsa gerekmeyebilir |
| `BUDGET_OWNER_EMAIL` | Tek bütçe sahibinin giriş e-postası |
| `BUDGET_OWNER_PASSWORD` | İlk hesap oluşturma için en az 12 karakterli güçlü parola |
| `BUDGET_APP_ORIGIN` | İsteğe bağlı; varsayılan `https://butcetakip-vercel-drop.vercel.app` |

Değişkenleri kaydettikten sonra yeniden deploy gerekir. `EXPO_PUBLIC_` öneki kullanmayın.
URI içerisindeki kullanıcı/parola özel karakterleri URL kodlamasıyla yazılmalıdır.
SQL servisinde TLS ve sunucu kimliği doğrulanır; bağlantı URI’sindeki TLS kapatma
bayrakları uygulanmaz. Production’da `BUDGET_DATABASE_TLS=local-only` yasaktır.
Önizleme adreslerinden Production hesabına giriş varsayılan olarak engellenir;
geliştirme/Preview için ayrı veritabanı, hesap ve tam `BUDGET_APP_ORIGIN` kullanın.

Vercel yayını, `BUDGET_DATABASE_URL` tanımlıysa önce şemayı oluşturur, ardından
gerçek veritabanında geçici ve rastgele bir test hesabıyla giriş, okuma/yazma,
sürüm çatışması ve çıkış kontrollerini yapar. Test hesabı ve belgeleri sonunda
silinir; gerçek sahibin bütçesine dokunulmaz. Şema veya test başarısızsa yayın durur.
Giriş ayarları için 12–256 karakterli parola gerekir. Önizleme ortamında bağlantı
yoksa bu SQL adımı atlanır.

Manuel kurulum için [001-initial.sql](001-initial.sql) dosyasını sağlayıcının SQL
konsolunda çalıştırın veya TLS bağlantı ayarları güvenli sunucu ortamında tanımlıyken:

```sh
pnpm db:budget
```

Veritabanı bağlantısını yerel ortamdan değil Vercel build sunucusundan kurmak,
Codex ortamında MySQL DNS/TCP erişiminin bulunmadığı durumda da kurulumu sağlar.
`/api/cloud?action=status` yalnızca ayarın varlığını değil, gerçek tablo erişimini
de doğrular; bağlantı hatasında 503 döner.

Komut tekrar çalıştırılabilir; var olan bütçe belgelerinin üzerine yazmaz.
Uygulama kullanıcısına ilgili dört tabloda SELECT/INSERT/UPDATE/DELETE izni verin;
şema kurulumu için CREATE/REFERENCES yetkisi ayrıca gerekir.

Ardından uygulamada Veriler & kategoriler → SQL hesabına giriş yap. Giriş yapmak tek başına
cihaz kayıtlarını yüklemez. İlk aktarımı onaylayın veya SQL’de boş bütçeyle başlayın.
SQL’de zaten bütçe varsa sunucudaki bütçeyi açın. Yerel özgün kopya ayrı korunur.
Yalnızca yapılandırılan bütçe sahibi giriş yapabilir; herkese açık kayıt yoktur.
İlk girişte parola scrypt ile hashlenir. Sonraki girişler kayıtlı hash’i kullanır;
bootstrap değişkenini değiştirmek mevcut hesap parolasını değiştirmez.

## Saklama, oturum ve eşzamanlı değişiklikler

İlk sürüm tüm v1 bütçe belgesini MySQL JSON sütununda tutar; finansal tablolar ayrı
satırlara normalleştirilmemiştir. Bu tercih mevcut kategoriler, işlemler, aylık
bütçeler, tasarruf hedefleri ve geçmiş kur verilerinin kayıpsız taşınmasını sağlar.
Her belge hesap kimliğiyle ayrılır. Yazmalar sürüm kontrolüyle atomiktir: aynı sürümü
iki cihaz değiştirirse ikinci yazma 409 alır; kullanıcı son verileri yükleyip yeniden
dener. Otomatik birleştirme veya arka planda anlık senkronizasyon yoktur.

SQL bütçesi kaydetmek/açmak için internet gerektirir. Sunucu kayıtları localStorage’a
ve service worker önbelleğine yazılmaz. Oturum biterse SQL bütçesi kilitlenir;
yazma sessizce yerel bütçeye yönlendirilmez. Kaybolan HTTP yanıtından sonra kaydın
sonucunu görmek için son verileri yükleyin. Yedi günlük HttpOnly/SameSite cookie
kullanılır; Production’da Secure ve __Host- öneki uygulanır. Oturum belirteçlerinin
sadece SHA-256 hashleri SQL’de tutulur. Girişler 15 dakikada 20 denemeyle sınırlandırılır.

## Yedek ve ileride cPanel’e taşıma

Veriler & kategoriler → Tam JSON yedeğini indir, bütçenin bütün alanlarını içerir.
CSV dışa aktarımı yalnızca işlem tablosudur. JSON indirme, otomatik geri yükleme
özelliği veya otomatik sunucu yedeği anlamına gelmez. Sağlayıcı yedeklerini ayrıca
ayarlayın. İndirilen yedek kişisel finans bilgileri içerir; güvenli saklayın.

MySQL araçları veya sağlayıcı paneliyle dört `budget_cloud_*` tablosunun SQL dışa
aktarımını alın. Komut satırında parolayı argümanda yazmadan `-p` istemini kullanın;
TLS doğrulama ve sağlayıcının CA dosyasını etkin tutun. `--no-tablespaces`,
`--set-gtid-purged=OFF`, `--single-transaction` seçenekleri paylaşımlı hostinge taşımayı
kolaylaştırır. Eski tablo/verileri önce yedekleyin; importu ayrı bir veritabanında
doğrulayın. Taşıma sırasında yazmaları durdurup son bir dump alın; iki etkin veritabanı
arasında bölünmüş kayıt oluşturmayın. Restore sonrası oturum tablosunu temizleyip
yeniden giriş yapın; parola hash’i korunabilir.

cPanel’de MySQL oluşturmak tek başına bu statik PWA’yı bağlamaz. Bu API’nin Node.js
barındırılması veya aynı oturum/sürüm kontrollerini sağlayan PHP karşılığının
kurulması gerekir. cPanel dış MySQL erişimi sunuyorsa Vercel API’si TLS üzerinden
oraya bağlanabilir. Paket desteği ve TLS erişimi o aşamada doğrulanmalıdır. Domain
ve API origin ayarı değişir; kullanıcıya ait yerel kayıtlar alan adları arasında
kendiliğinden taşınmaz. TCMB cPanel API’si bu kişisel bütçe API’sinden ayrıdır.

## Geliştirme ve gerçek SQL testleri

Yalnızca sahte veriler için, loopback’e bağlı test MySQL’i:

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
# BUDGET_OWNER_EMAIL ve BUDGET_OWNER_PASSWORD yalnızca sahte geliştirme hesabına ait olmalı.
pnpm dev
```

Docker ve çalışan süreçler sonraki Codex ortamında var kabul edilmemelidir.
Kalıcı gerçek verileri bu şifresiz yerel test servisine koymayın. SQL testleri
**yalnızca açıkça belirtilen localhost/butce_test** veritabanındaki test kayıtlarını
siler; başka ada veya uzak sunucuya bağlanmayı reddeder:

```sh
docker exec butce-mysql-dev mysql -e 'CREATE DATABASE IF NOT EXISTS butce_test;'
BUDGET_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_test pnpm test
```

Bağlantı verilmezse sekiz gerçek SQL testi atlanır; bu durumda SQL entegrasyonu
çalıştırılmış sayılmaz. Şema için `db:push` kullanmayın; o komut Manus başlangıç
projesinin farklı kullanıcı şemasına aittir. Codex’in HTTPS proxy sırları ham TCP
MySQL parolası yerine kullanılamaz; gerçek bağlantı bilgileri hedef sunucunun güvenli
ayarlarında tutulmalıdır.
