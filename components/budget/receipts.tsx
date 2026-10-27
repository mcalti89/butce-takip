import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import { useReceiptIndex } from "@/lib/budget/receipts";
import {
  MAX_RECEIPTS_PER_ENTRY,
  MAX_STORED_RECEIPTS,
  MAX_RECEIPT_STORAGE,
  type PickedReceipt,
  type Receipt,
  type ReceiptKind,
} from "@/lib/budget/receipt-model";
import { pickReceipt, saveReceipt } from "@/lib/budget/receipt-files";
import {
  cloudDeleteReceipt,
  cloudDownloadReceipt,
  cloudUploadReceipt,
} from "@/lib/budget/cloudApi";
import { Button, C, ErrorText, Icon, Txt } from "./ui";
const sizeLabel = (size: number) =>
  size >= 1024 * 1024 * 1024
    ? `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
    : size >= 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(size / 1024)} KB`;
export function useReceiptEditor(
  kind: ReceiptKind,
  entryId: string,
  busy: boolean,
  initialFile?: PickedReceipt,
) {
  const { cloud } = useBudget();
  const accountId = cloud.accountId ?? "";
  const index = useReceiptIndex();
  const [pending, setPending] = useState<PickedReceipt[]>(() =>
    initialFile ? [initialFile] : [],
  );
  const [uploaded, setUploaded] = useState<Receipt[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const existing = [
    ...index.receipts,
    ...uploaded.filter((u) => !index.receipts.some((r) => r.id === u.id)),
  ].filter((r) => r.kind === kind && r.entryId === entryId);
  const visible = existing.filter((r) => !removed.includes(r.id));
  const count = visible.length + pending.length;
  async function pick() {
    setError("");
    setWorking(true);
    try {
      const file = await pickReceipt();
      if (file && active.current) setPending((p) => [...p, file]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function download(receipt: Receipt) {
    setWorking(true);
    setError("");
    try {
      const bytes = await cloudDownloadReceipt(accountId, receipt.id);
      if (active.current) await saveReceipt(bytes, receipt.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function flush() {
    try {
      for (const receiptId of removed) {
        if (!active.current)
          throw new Error(
            "İşlem ekranı kapandı. Dekontları tekrar kontrol et.",
          );
        await cloudDeleteReceipt(accountId, receiptId);
        setUploaded((rows) => rows.filter((r) => r.id !== receiptId));
        setRemoved((ids) => ids.filter((id) => id !== receiptId));
      }
      for (const file of pending) {
        if (!active.current)
          throw new Error(
            "İşlem ekranı kapandı. Dekontları tekrar kontrol et.",
          );
        const receipt = await cloudUploadReceipt(
          accountId,
          kind,
          entryId,
          file,
        );
        setUploaded((rows) => [...rows, receipt]);
        setPending((rows) => rows.filter((r) => r.id !== file.id));
      }
    } finally {
      await index.refresh();
    }
  }
  const disabled = busy || working;
  return {
    flush,
    working,
    panel: (
      <View
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          padding: 14,
          gap: 10,
          marginBottom: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="paperclip" size={16} color={C.blue} />
          <Txt bold>Banka dekontları</Txt>
          <Txt style={{ color: C.dim, fontSize: 11 }}>{count}/10</Txt>
        </View>
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          PDF · Dosya başına en fazla 3 MB. Kaydettiğinde hesabına yüklenir;
          diğer cihazlarından da indirebilirsin.
        </Txt>
        {visible.map((r) => (
          <View key={r.id} style={{ gap: 6 }}>
            <Txt numberOfLines={2} style={{ fontSize: 12 }}>
              {r.name} · {sizeLabel(r.size)}
              {r.storage === "nas"
                ? " · NAS"
                : r.storage === "pending"
                  ? " · NAS aktarımı bekliyor; çevrimiçi kaydedildi"
                  : ""}
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                small
                kind="secondary"
                icon="download"
                disabled={disabled}
                onPress={() => void download(r)}
              >
                PDF’yi indir / aç
              </Button>
              <Button
                small
                kind="danger"
                disabled={disabled}
                onPress={() => setRemoved((ids) => [...ids, r.id])}
              >
                Kaldır
              </Button>
            </View>
          </View>
        ))}
        {pending.map((file) => (
          <View key={file.id} style={{ gap: 6 }}>
            <Txt numberOfLines={2} style={{ fontSize: 12 }}>
              {file.name} · {sizeLabel(file.size)} · Yüklenmeyi bekliyor
            </Txt>
            <Button
              small
              kind="secondary"
              disabled={disabled}
              onPress={() =>
                setPending((rows) => rows.filter((f) => f.id !== file.id))
              }
            >
              Seçimi kaldır
            </Button>
          </View>
        ))}
        {removed.length ? (
          <View style={{ gap: 6 }}>
            <Txt style={{ fontSize: 12, color: C.muted }}>
              {removed.length} dekont kaydettiğinde silinecek.
            </Txt>
            <Button
              small
              kind="secondary"
              disabled={disabled}
              onPress={() => setRemoved([])}
            >
              Kaldırmayı geri al
            </Button>
          </View>
        ) : null}
        <Button
          small
          kind="secondary"
          icon="upload"
          disabled={
            disabled ||
            count >= MAX_RECEIPTS_PER_ENTRY ||
            !accountId ||
            !!index.error
          }
          onPress={() => void pick()}
        >
          PDF dekont ekle
        </Button>
        {index.error ? (
          <Button
            small
            kind="secondary"
            disabled={disabled}
            onPress={() => void index.refresh()}
          >
            Dekontları tekrar yükle
          </Button>
        ) : null}
        <ErrorText message={error || index.error} />
        <Txt style={{ fontSize: 10, color: C.dim }}>
          Kullanılan alan:{" "}
          {sizeLabel(index.receipts.reduce((sum, r) => sum + r.size, 0))} /{" "}
          {sizeLabel(MAX_RECEIPT_STORAGE)}
          {" · "}
          {index.receipts.length}/{MAX_STORED_RECEIPTS} dosya. Yalnızca sen
          erişebilirsin. İşlemi silmek, bağlı dekontları da siler. CSV/JSON
          yedekleri PDF dosyalarını içermez.
        </Txt>
      </View>
    ),
  };
}
