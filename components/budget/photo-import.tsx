import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  pickExpensePhoto,
  prepareExpensePhoto,
  readExpensePhoto,
} from "@/lib/budget/photo-files";
import type { PhotoSelection, PreparedPhoto } from "@/lib/budget/photo-types";
import { analyzeExpensePhoto } from "@/lib/budget/photo-expense";
import { importedDuplicate } from "@/lib/budget/receipt-import";
import { Button, C, ErrorText, Icon, Sheet, Txt } from "./ui";
import { TransactionEditor } from "./editors";
export function PhotoImport({
  selection: initialSelection,
  onClose,
  onDone,
}: {
  selection: Promise<PhotoSelection>;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data } = useBudget();
  const [selection, setSelection] = useState(initialSelection);
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null);
  const [analysis, setAnalysis] = useState<{
    text: string;
    confidence: number;
  } | null>(null);
  const [busy, setBusy] = useState(true),
    [progress, setProgress] = useState("Fotoğraf seçimi bekleniyor…"),
    [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");
  const [attach, setAttach] = useState(true),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    void selection.then(async (selected) => {
      if (signal.aborted) return;
      if (!selected) {
        setBusy(false);
        return;
      }
      if (selected.error || !selected.photo) {
        setError(selected.error ?? "Bir fotoğraf seç.");
        setBusy(false);
        return;
      }
      let normalized: PreparedPhoto | undefined;
      try {
        setProgress("Fotoğraf hazırlanıyor…");
        normalized = await prepareExpensePhoto(
          selected.photo,
          selected.name ?? "Fis-fotografi.jpg",
          signal,
        );
        if (signal.aborted) return;
        setPrepared(normalized);
        setProgress("Fotoğraf okuyucu hazırlanıyor…");
        const result = await readExpensePhoto(normalized, signal, (message) => {
          if (!signal.aborted) setProgress(message);
        });
        if (!signal.aborted) setAnalysis(result);
      } catch (e) {
        if (!signal.aborted) {
          setError((e as Error).message);
          if (normalized) setAnalysis({ text: "", confidence: 0 });
        }
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    });
    return () => controller.abort();
  }, [selection]);
  const suggestion = useMemo(
    () => (analysis ? analyzeExpensePhoto(analysis.text, data) : null),
    [analysis, data],
  );
  const accounts = (data.financialAccounts ?? []).filter(
    (a) =>
      !a.archived &&
      a.kind !== "investment" &&
      (!suggestion?.currency || a.currency === suggestion.currency),
  );
  const account = accounts.find((a) => a.id === accountId);
  const duplicate = prepared
    ? importedDuplicate(data, { sha256: prepared.sha256 }, suggestion?.date)
    : undefined;
  const possibleRepeat = !!(
    suggestion?.amount &&
    suggestion.date &&
    account &&
    data.transactions.some(
      (t) =>
        t.type === "expense" &&
        t.date === suggestion.date &&
        t.accountId === account.id &&
        t.amount === suggestion.amount &&
        (t.currency ?? "TRY") === account.currency,
    )
  );
  function pick(source: "camera" | "library") {
    const next = pickExpensePhoto(source);
    setPrepared(null);
    setAnalysis(null);
    setError("");
    setAccountId("");
    setProgress("Fotoğraf seçimi bekleniyor…");
    setBusy(true);
    setSelection(next);
  }
  if (editing && prepared && suggestion && account)
    return (
      <TransactionEditor
        draft={{
          id: `photo-${prepared.sha256.slice(0, 40)}`,
          type: "expense",
          amount: suggestion.amount,
          currency: suggestion.currency ?? account.currency,
          accountId: account.id,
          date: suggestion.date ?? "",
          time: suggestion.time ?? "",
          description: suggestion.merchant ?? "Fiş fotoğrafı",
          categoryId: suggestion.categoryId,
        }}
        receiptImport={{
          file: prepared.file,
          source: { sha256: prepared.sha256 },
          warnings: suggestion.warnings,
          attach,
        }}
        onClose={onClose}
        onDone={onDone}
        onDelete={() => {}}
      />
    );
  return (
    <Sheet
      title="Fotoğraftan işlem ekle"
      subtitle="Fişi çek, okunan bilgileri kontrol et ve kaydet."
      onClose={onClose}
    >
      <Txt style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
        Fişin tamamını düz, net ve iyi aydınlatılmış şekilde çek. Türkçe ve
        İngilizce metinler cihazında okunur; fotoğraf analiz için başka bir
        servise gönderilmez. İlk okumada gerekli dosyalar indirilir ve işlem
        biraz sürebilir.
      </Txt>
      {busy ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginVertical: 16,
          }}
        >
          <ActivityIndicator color={C.green} />
          <Txt accessibilityLiveRegion="polite" style={{ flex: 1 }}>
            {progress}
          </Txt>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <Button icon="camera" onPress={() => pick("camera")}>
            Fotoğraf çek
          </Button>
          <Button icon="image" kind="secondary" onPress={() => pick("library")}>
            Galeriden seç
          </Button>
        </View>
      )}
      <ErrorText message={error} />
      {prepared ? (
        <Image
          accessibilityLabel="İşlem için seçilen fiş fotoğrafı"
          source={{ uri: prepared.jpeg }}
          resizeMode="contain"
          style={{
            width: "100%",
            height: 220,
            marginBottom: 16,
            borderRadius: 10,
            backgroundColor: C.bg,
          }}
        />
      ) : null}
      {!busy && suggestion && prepared ? (
        <View style={{ gap: 12 }}>
          {duplicate ? (
            <ErrorText message="Bu fotoğraf daha önce işleme eklenmiş. Mevcut kaydı İşlemler veya Dekontlar alanında kontrol et." />
          ) : null}
          <Txt bold>Okunan bilgiler</Txt>
          <Txt>İşletme: {suggestion.merchant ?? "Formda doldurulmalı"}</Txt>
          <Txt>
            Toplam:{" "}
            {suggestion.amount !== undefined
              ? `${suggestion.amount.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${suggestion.currency ?? "(para birimini kontrol et)"}`
              : "Formda doldurulmalı"}
          </Txt>
          <Txt>
            Tarih / saat:{" "}
            {[suggestion.date, suggestion.time].filter(Boolean).join(" · ") ||
              "Formda doldurulmalı"}
          </Txt>
          <Txt>
            Kategori önerisi:{" "}
            {data.categories.find((c) => c.id === suggestion.categoryId)
              ?.name ?? "Formda seçilmeli"}
          </Txt>
          <Txt bold>Harcamanın yapıldığı hesabın</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {accounts.map((a) => (
              <Button
                key={a.id}
                small
                kind={accountId === a.id ? "secondary" : "ghost"}
                accessibilityLabel={`Harcama hesabı: ${a.name}, ${a.currency}${accountId === a.id ? ", seçili" : ""}`}
                onPress={() => setAccountId(a.id)}
              >
                {a.name} · {a.currency}
              </Button>
            ))}
          </View>
          {!accounts.length ? (
            <Txt style={{ color: C.amber }}>
              Önce Hesaplar &amp; kartlar alanından fişin para biriminde bir
              hesap ekle.
            </Txt>
          ) : null}
          {suggestion.warnings.map((w) => (
            <Txt key={w} style={{ color: C.amber, fontSize: 12 }}>
              {w}
            </Txt>
          ))}
          {analysis && analysis.confidence < 55 ? (
            <Txt style={{ color: C.amber, fontSize: 12 }}>
              Yazı net okunamadı. Özellikle toplam tutarı ve işletme adını
              fotoğrafla karşılaştır.
            </Txt>
          ) : null}
          {possibleRepeat ? (
            <Txt style={{ color: C.amber, fontSize: 12 }}>
              Aynı hesap, tarih ve tutarla bir gider zaten var. Mükerrer kayıt
              olmadığını kontrol et.
            </Txt>
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Fiş fotoğrafını PDF eki olarak sakla"
            aria-checked={attach}
            accessibilityState={{ checked: attach }}
            onPress={() => setAttach((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
            }}
          >
            <Icon
              name={attach ? "check-square" : "square"}
              color={attach ? C.green : C.muted}
            />
            <Txt style={{ flex: 1 }}>Fiş fotoğrafını PDF eki olarak sakla</Txt>
          </Pressable>
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            Okuma hataları olabilir. Sonraki ekranda tutarı, tarihi ve
            kategoriyi kontrol et. Kaydetmeden finansal kayıt oluşturulmaz.
          </Txt>
          <Button
            disabled={!account || !!duplicate}
            onPress={() => {
              if (
                importedDuplicate(
                  data,
                  { sha256: prepared.sha256 },
                  suggestion.date,
                )
              )
                setError("Bu fotoğraf daha önce eklenmiş.");
              else setEditing(true);
            }}
          >
            İşlem bilgilerini kontrol et
          </Button>
        </View>
      ) : null}
    </Sheet>
  );
}
