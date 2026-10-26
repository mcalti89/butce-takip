import "dotenv/config";
import {
  nasFromEnvironment,
  verifyNasStorage,
  NasStorageError,
} from "../server/budget/nas";
async function main() {
  if (process.env.BUDGET_RECEIPT_STORAGE !== "nas") return;
  try {
    const nas = nasFromEnvironment();
    if (!nas) throw new Error("NAS configuration missing");
    await verifyNasStorage(nas);
    console.log(
      "NAS yayın kontrolü başarılı: imzalı yükleme, geri okuma, SHA-256 doğrulaması ve silme. Yalnızca sentetik test dosyası kullanıldı.",
    );
  } catch (error) {
    console.error(
      "NAS yayın kontrolü başarısız. HTTPS adresini ve service-key.txt ile eşleşen BUDGET_NAS_SECRET ayarını kontrol et. Mevcut yayın değiştirilmedi.",
    );
    console.error(
      "NAS hata kodu:",
      error instanceof NasStorageError && /^[A-Z0-9_]{1,30}$/.test(error.code)
        ? error.code
        : "CONFIG",
    );
    process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("NAS yayın kontrolü tamamlanamadı.");
  process.exitCode = 1;
});
