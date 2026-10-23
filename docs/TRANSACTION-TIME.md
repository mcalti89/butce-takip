# İşlem saati ve sıralama

İşlemin `time` alanı isteğe bağlı, 24 saat biçiminde `SS:DD` (00:00–23:59)
saklanır. Yeni işlemde cihazın yerel saati önerilir; kullanıcı değiştirebilir
veya saati bilmiyorsa boş bırakabilir. Mevcut saatsiz işlem düzenlenirken
bugünün saati otomatik eklenmez. Eski kayıtlar aynen geçerlidir.

Tarih ve saat kullanıcının belirttiği yerel takvim değerleridir. UTC'ye
çevrilmez; farklı cihazda saat dilimi değişince eski işlemin günü/saati kaymaz.
TCMB kuru, hesap bakiyesi ve aylık rapor hâlâ işlem tarihine dayanır; yalnızca
saati düzeltmek döviz kurunu veya TRY karşılığını değiştirmez.

İşlemler ve panodaki son işlemler aynı karşılaştırıcıyı kullanır: tarih azalan,
sonra saat azalan, eşitlikte kayıt kimliği azalan. Aynı günün saatsiz kayıtları
00:00 dahil saatli kayıtların ardından gelir ve “Saat belirtilmedi” gösterilir.
Başka günün kaydı her durumda takvim tarihine göre sıralanır.

SQL'deki kullanıcıya özel JSON bütçe belgesi saati korur; migration gerekmez.
API geçersiz saatleri reddeder. Tam JSON yedeği saati içerir. CSV'ye isteğe bağlı
`time` sütunu eklenmiştir; Türkçe `saat` veya `işlem saati` de kabul edilir.
Eski CSV'ler geçerlidir. Aynı gün aynı tutardaki farklı saatli işlemler farklı
kayıtlardır; CSV mükerrerlik kontrolünde saat de kullanılır.
