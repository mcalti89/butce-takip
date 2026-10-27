# Dekonttan işlem ekleme

Ana tarih filtresinin yanındaki **Dekont ekle**, en fazla 3 MB ve 20 sayfalık, şifresiz PDF seçer. PDF.js metni cihazda çıkarır; ham metin harici bir analiz servisine gönderilmez. Banka, işlem tutarı/para birimi, tarih, saat, açıklama ve referans alanları Türkçe/İngilizce etiketlerden önerilir. Destek, her bankanın her dekont biçimi için garanti edilmez. Görüntü/tarama PDF'lerinde OCR yoktur; kullanıcı bilgileri elle tamamlar.

Öneriler önce gösterilir. Kullanıcı türü ve hesapları kontrol ederek mevcut gelir/gider, transfer veya döviz formunu açar. Kaydet öncesi finansal kayıt ve PDF yüklemesi yapılmaz. Hesap eşleşmesi kayıtlı IBAN'a, yoksa banka adı ve para birimiyle tek bir hesaba dayanır. Eşleşmeyen hesaplar kendiliğinden oluşturulmaz. Hesap düzenleme ekranında isteğe bağlı banka adı ve checksum doğrulamalı IBAN vardır.

Kendi iki hesabı arasında hareket transfer/döviz olarak önerilir. Döviz işleminin gerçek kuru kullanıcı tarafından tamamlanır. Komisyon/bakiye etiketleri tutardan ayrılır; banka masrafı gerekiyorsa ayrı işlem olarak girilir. Belirsiz tutar/tarih boş kalır; bulunamayan saat yerine güncel saat yazılmaz.

Orijinal PDF, finansal kayıt başarıyla yazıldıktan sonra mevcut kimlik doğrulamalı NAS dekont servisine yüklenir. Yükleme hatasında aynı formdan tekrar Kaydet aynı kaydı kullanır. Dosya SHA-256 özeti ve varsa banka/referans, `receiptImport` alanında saklanır. Aynı dosya veya aynı banka/referans/tarih ile ikinci kayıt engellenir; kontrol kaydetme aşamasında da tekrarlanır. Eski elle girilmiş aynı hesap/tarih/tutarlı işlemler için uyarı gösterilir. Bu denetim bütün bankalardaki farklı PDF kopyalarının eşdeğer olduğunu garanti etmez.

Yeni sunucu uç noktası/SQL tablosu, NAS yeniden kurulumu veya dış analiz anahtarı gerektirmez. Yeni alanlar sürüm-1 JSON belgesinde isteğe bağlıdır; NAS v2 bilinmeyen alanları korur. Önceki kayıtlar geçerlidir.

Kontroller: etiket/tutar/IBAN/yön/mükerrer kayıt birim testleri; finans ve döviz regresyonları; gerçek tarayıcıda sentetik PDF okuma, taslak, kayıt+PDF indirme, yükleme hatası/tekrar, mükerrer ret, tarama PDF ve mobil ekran kontrolleri. Gerçek müşteri verileri testlere eklenmez.

## Banka ve IBAN kontrolü

Hesap kartlarında kayıtlı banka adı ve IBAN gösterilir. Dekont önerisinde gelir/gider için kendi hesabını, transfer/döviz için gönderen ve alıcı hesaplarını seç. Seçilen hesapların kayıtlı IBAN’ları, dekontun ilgili tarafında okunan IBAN ile karşılaştırılır; eksik bilgi ve uyuşmazlık açıkça gösterilir. Banka/IBAN düzenlemesi ayrı kaydetme düğmesiyle mevcut hesaba yazılır; bakiye, geçmiş işlemler ve dekont değişmez. Karşı tarafın IBAN’ını kendi hesabına kaydetme. PDF bilgileri kayıtlı banka/IBAN alanlarının üzerine otomatik yazılmaz.
