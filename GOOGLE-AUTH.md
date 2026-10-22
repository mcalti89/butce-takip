# Google ile giriş ve hesaplara özel bütçe

Web/PWA artık oturum açılmadan bütçe ekranını göstermez. Google Identity Services
resmî düğmesiyle alınan ID token, sunucuda Google'ın JWKS anahtarlarıyla doğrulanır.
Google parolası, erişim tokenı veya yenileme tokenı uygulamada saklanmaz. Google
kimliği `sub` ile eşlenir; tarayıcıdan gönderilen e-posta kullanıcı oluşturamaz.

## Google ve Vercel ayarları

Google Auth Platform → Clients → Web application istemcisinin Authorized JavaScript
origins listesine tam uygulama origin'ini ekleyin:

```
https://butcetakip-vercel-drop.vercel.app
```

`BUDGET_GOOGLE_CLIENT_ID` değerini Vercel Production ortamına ekleyip yeniden deploy
edin. Client ID herkese açık bir tanımlayıcıdır; Client Secret gerekmez. Bu akış
Google ID token callback'i kullandığından ayrıca bir redirect URI gerektirmez.
Önizleme veya yerel Google istemcisi gerekiyorsa o origin'i ayrıca yetkilendirin;
Production veritabanını herkese açık Preview ortamlarına vermeyin.

Birden fazla dış Google kullanıcısının kayıt olabilmesi için Google Auth Platform →
Audience ekranında External ve In production durumu gerekir. Testing durumunda
Google'ın test kullanıcıları kısıtlaması geçerlidir. Bu ayarlar kullanıcının Google
Cloud hesabındadır; uygulama kodu bunları değiştiremez.

Yeni sürümde parola giriş API'si Google yapılandırılıyken 410 döner ve eski parola
oturum cookie'leri kabul edilmez. `BUDGET_OWNER_PASSWORD` Google modu için gerekmez.
`BUDGET_OWNER_EMAIL` yalnızca önceki kişisel bütçe sahibinin güvenli geçişi için
korunur; yeni kullanıcıların girişini bu e-postaya sınırlamaz.

## Doğrulama ve veri ayrımı

- JWT imzası RS256, Google issuer, doğru audience/azp, iat/exp, doğrulanmış e-posta ve
  nonce zorunludur. Google JWKS adresi `https://www.googleapis.com/oauth2/v3/certs`.
- Her giriş isteği ayrı nonce ve ayrı HttpOnly challenge cookie kullanır; iki sekme
  birbirinin girişini bozmaz. SQL'deki hashli challenge 10 dakika geçerlidir ve
  başarılı doğrulamada atomik olarak tek kez tüketilir.
- Google oturumları ayrı `__Host-budget_google_session` cookie'siyle ve hashlenmiş
  sunucu kaydıyla tutulur: Secure, HttpOnly, SameSite=Lax, Path=/, 7 gün.
- Her bütçe `account_id` ile ayrıdır. Okuma/yazma yetkisi yalnızca oturumdan gelir.
  İstemcinin beklediği hesap kimliği de eşleşmelidir; bu kontrol eski sekmeden yeni
  hesaba yazmayı engeller. Eski sürümle yazma 409 alır.
- Çıkışta bellek temizlenir ve diğer sekmelere yalnızca bir oturum-değişti sinyali
  gönderilir. Bütçe veya Google kimlik belgesi localStorage'a yazılmaz. SQL hesabı
  açılamadığında yerel bütçeye sessiz dönüş yapılmaz.

Yeni hesap, aynı işlem içinde Google kimliği ve `demo:false` boş bütçeyle oluşturulur.
İşlem, gelir/gider, bütçe limiti, tasarruf hedefi veya kur arşivi örneği eklenmez.
Standart kategori isimleri ve varsayılan para birimi takip ayarları kullanılabilir.

## Önceki sahibin kayıtları

Önceki hesap ve bütçe belgeleri silinmez. Doğrulanmış Google kimliği, aynı e-postalı
eski kişisel hesapla yalnızca Google bu e-posta için yetkiliyse (Gmail veya imzalı
Workspace hd alanı) ve hesap başka Google subject'e bağlı değilse eşlenir. Farklı
Google kimlikleri yalnızca e-postaları aynı diye birleştirilmez. Üçüncü taraf e-posta
sahipliği yeterince doğrulanamıyorsa eski hesap korunur; destek gerekir.

`butce-takip-v1` eski cihaz kaydı olduğu gibi kalır. Başka kullanıcı bu kayıtları
uygulama ekranında göremez ve yeni hesabına otomatik yüklenmez. Yalnızca doğrulanmış
eski sahibin boş hesabında “Eski bütçemi bu hesaba aktar” görünür. Kullanıcı onaylar,
hedefin hâlâ tamamen boş olduğu ve sürümü tekrar kontrol edilir. Orijinal yerel kopya
korunur. Örnek/demo kayıtları bu geçişe dahil edilmez.

## SQL ve doğrulama

`pnpm db:budget` sıralı SQL dosyalarını çalıştırır. `002-google-auth.sql` yalnızca
kimlik, Google oturumu ve tek kullanımlık challenge tablolarını oluşturur; önceki
hesap, parola hash'i veya bütçe belgesini değiştirmez. Tüm tablolar aynı MySQL'de
saklanır ve gelecekte SQL dump ile taşınabilir.

Vercel build kontrolü Google modu için rastgele iki sentetik hesap kullanır. İmzalı
JWT'ler o build sürecinde üretilen yerel test anahtarıyla test edilir; gerçek kullanıcı
Google oturumu açılmış sayılmaz. Production'da Google'ın gerçek genel anahtarlarına
HTTPS erişimi ayrıca kontrol edilir. Testler boş hesapları, kullanıcı ayrımını,
yazma çakışmasını, nonce tekrarını ve çıkışı doğrular; sentetik hesaplar sonunda
silinir. Test anahtarları çalışma anında üretilir ve API'ye eklenmez. Gerçek API her
zaman Google'ın gerçek anahtarlarını kullanır.

Geliştirme ortamında ayrı MySQL ile:

```sh
BUDGET_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/butce_test pnpm test
```

Gerçek Google hesabı ile kullanıcı onayı gereken popup akışı kullanıcı tarayıcısında
tamamlanır. Geliştirme tarayıcı kontrolleri yerel imzalı sağlayıcı ve gerçek test
MySQL'i kullanır; bunlar gerçek Google kullanıcı onayıyla aynı kontrol değildir.
Native uygulamada bu Google web/PWA akışını açan bağlantı bulunur; ayrı yerel Google
SDK istemcileri bu değişikliğin kapsamında değildir.
