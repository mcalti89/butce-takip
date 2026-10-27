import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import { pickReceipt } from "@/lib/budget/receipt-files";
import { readReceipt } from "@/lib/budget/receipt-reader";
import {
  analyzeReceipt,
  importedDuplicate,
  suggestedCategory,
  type ImportMode,
  type ReceiptSuggestion,
} from "@/lib/budget/receipt-import";
import type { ReceiptImportDraft } from "@/lib/budget/receipt-model";
import { Sheet, Button, ErrorText, Txt, C } from "./ui";
import { TransactionEditor } from "./editors";
import { TransferEditor } from "./finance";
import { ExchangeEditor } from "./exchange";
function Caption({ children }: { children: React.ReactNode }) {
  return <Txt style={{ color: C.muted, fontSize: 12 }}>{children}</Txt>;
}
export function ReceiptImport({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data } = useBudget();
  const [result, setResult] = useState<{
    suggestion: ReceiptSuggestion;
    imported: ReceiptImportDraft;
  } | null>(null);
  const [mode, setMode] = useState<ImportMode>("expense");
  const [chosen, setChosen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function pick() {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setChosen(false);
    try {
      const file = await pickReceipt();
      if (!file) return;
      const { text, sha256 } = await readReceipt(file);
      if (!active.current) return;
      const suggestion = analyzeReceipt(text, data.financialAccounts ?? []);
      const possibleRepeat =
        suggestion.amount !== undefined &&
        suggestion.date &&
        suggestion.accountId &&
        data.transactions.some(
          (t) =>
            t.date === suggestion.date &&
            t.accountId === suggestion.accountId &&
            t.amount === suggestion.amount &&
            (t.currency ?? "TRY") === suggestion.currency,
        );
      if (possibleRepeat)
        suggestion.warnings.push(
          "Aynı hesap, tarih ve tutarla bir işlem zaten var. Mükerrer kayıt olmadığını kontrol et.",
        );
      const source = {
        sha256,
        bank: suggestion.bank,
        reference: suggestion.reference,
      };
      if (importedDuplicate(data, source, suggestion.date))
        throw new Error(
          "Bu dekont daha önce eklenmiş. İşlemler veya Dekontlar menüsünden mevcut kaydı görebilirsin.",
        );
      setResult({
        suggestion,
        imported: { file, source, warnings: suggestion.warnings },
      });
      if (suggestion.mode) {
        setMode(suggestion.mode);
        setChosen(true);
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  if (editing && result) {
    const { suggestion: s, imported } = result;
    const common = {
      id: `receipt-${imported.source.sha256.slice(0, 40)}`,
      amount: s.amount,
      date: s.date ?? "",
      time: s.time ?? "",
    };
    if (mode === "exchange")
      return (
        <ExchangeEditor
          receiptImport={imported}
          draft={{
            ...common,
            fromId: s.fromId ?? "",
            toId: s.toId ?? "",
            note: s.description ?? "",
          }}
          onClose={onClose}
          onDone={onDone}
        />
      );
    if (mode === "transfer")
      return (
        <TransferEditor
          receiptImport={imported}
          draft={{
            ...common,
            fromId: s.fromId ?? "",
            toId: s.toId ?? "",
            note: s.description ?? "",
          }}
          onClose={onClose}
          onDone={onDone}
        />
      );
    return (
      <TransactionEditor
        receiptImport={imported}
        draft={{
          ...common,
          type: mode,
          accountId: s.accountId ?? "",
          currency: s.currency ?? "TRY",
          description: s.description ?? "",
          categoryId: suggestedCategory(data, mode, s.description ?? ""),
        }}
        onClose={onClose}
        onDone={onDone}
        onDelete={() => {}}
      />
    );
  }
  return (
    <Sheet
      title="Dekonttan işlem ekle"
      subtitle="PDF bilgilerini oku, kontrol et ve kaydet."
      onClose={onClose}
    >
      <Caption>
        Metin içeren banka PDF’leri cihazında okunur. Dekont, işlemi Kaydet
        dediğinde hesabına eklenir. Taranmış PDF’lerde bilgileri elle doldurman
        gerekir.
      </Caption>
      <Button icon="upload" onPress={() => void pick()} busy={busy}>
        {busy
          ? "Dekont okunuyor…"
          : result
            ? "Başka PDF seç"
            : "PDF dekont seç"}
      </Button>
      <ErrorText message={error} />
      {result ? (
        <View style={{ gap: 14 }}>
          <Txt bold>{result.imported.file.name}</Txt>
          <Txt>Banka: {result.suggestion.bank ?? "Belirlenemedi"}</Txt>
          <Txt>
            Hesap:{" "}
            {data.financialAccounts?.find(
              (a) => a.id === result.suggestion.accountId,
            )?.name ?? "Formda seçilmeli"}
          </Txt>
          <Txt>
            Tutar:{" "}
            {result.suggestion.amount !== undefined
              ? `${result.suggestion.amount.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${result.suggestion.currency}`
              : "Formda doldurulmalı"}
          </Txt>
          <Txt>
            Tarih / saat:{" "}
            {[result.suggestion.date, result.suggestion.time]
              .filter(Boolean)
              .join(" · ") || "Formda doldurulmalı"}
          </Txt>
          <Txt bold>İşlem türü</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                { value: "expense", label: "Gider" },
                { value: "income", label: "Gelir" },
                { value: "transfer", label: "Transfer" },
                { value: "exchange", label: "Döviz" },
              ] as const
            ).map((item) => (
              <Button
                key={item.value}
                small
                kind={chosen && mode === item.value ? "secondary" : "ghost"}
                onPress={() => {
                  setMode(item.value);
                  setChosen(true);
                }}
              >
                {item.label}
              </Button>
            ))}
          </View>
          {result.suggestion.warnings.map((w) => (
            <Txt key={w} style={{ color: C.amber, fontSize: 12 }}>
              {w}
            </Txt>
          ))}
          <Caption>
            Bilgileri banka dekontuyla karşılaştır. Banka masrafı ayrıca
            kesildiyse ayrı işlem olarak ekle. Kaydetmeden bakiyelerin değişmez.
          </Caption>
          <Button
            disabled={!chosen}
            onPress={() => {
              if (
                importedDuplicate(
                  data,
                  result.imported.source,
                  result.suggestion.date,
                )
              )
                setError("Bu dekont daha önce eklenmiş.");
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
