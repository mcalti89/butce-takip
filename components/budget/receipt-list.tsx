import React, { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useBudget } from "@/lib/budget/store";
import { useReceiptIndex } from "@/lib/budget/receipts";
import { monthlyReceipts } from "@/lib/budget/receipt-list";
import { moneyIn, monthLabel } from "@/lib/budget/model";
import { transferReceivedAmount } from "@/lib/budget/exchange";
import { cloudDownloadReceipt } from "@/lib/budget/cloudApi";
import { saveReceipt } from "@/lib/budget/receipt-files";
import { Button, C, Card, ErrorText, Icon, Txt } from "./ui";

type Row = ReturnType<typeof monthlyReceipts>[number];
function ReceiptRow({
  row,
  accountId,
  compact,
}: {
  row: Row;
  accountId: string;
  compact: boolean;
}) {
  const { data } = useBudget();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const { receipt, activity } = row;
  const entry = activity.value;
  const category =
    activity.kind === "transaction"
      ? data.categories.find((c) => c.id === activity.value.categoryId)
      : undefined;
  const accountName = (id?: string) =>
    data.financialAccounts?.find((a) => a.id === id)?.name ??
    "Hesap belirtilmedi";
  const label =
    activity.kind === "transfer"
      ? activity.value.exchange
        ? "Döviz al / sat"
        : "Transfer"
      : activity.value.type === "income"
        ? "Gelir"
        : "Gider";
  const title =
    activity.kind === "transaction"
      ? activity.value.description || category?.name || label
      : activity.value.note || label;
  const accounts =
    activity.kind === "transfer"
      ? `${accountName(activity.value.fromId)} → ${accountName(activity.value.toId)}`
      : accountName(activity.value.accountId);
  const color =
    activity.kind === "transfer"
      ? C.blue
      : activity.value.type === "income"
        ? C.green
        : C.red;
  const amount =
    activity.kind === "transfer"
      ? `${moneyIn(entry.amount, entry.currency || "TRY")} → ${moneyIn(transferReceivedAmount(activity.value), activity.value.exchange?.toCurrency || activity.value.currency)}`
      : `${activity.value.type === "income" ? "+" : "−"}${moneyIn(entry.amount, entry.currency || "TRY")}`;
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const bytes = await cloudDownloadReceipt(accountId, receipt.id);
      if (active.current) await saveReceipt(bytes, receipt.name);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingVertical: 18,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "center",
          gap: 16,
        }}
      >
        <View style={{ width: compact ? undefined : 115 }}>
          <Txt bold style={{ fontSize: 12 }}>
            {entry.date.split("-").reverse().join(".")}
          </Txt>
          <Txt style={{ color: C.dim, fontSize: 11 }}>
            {entry.time || "Saat belirtilmedi"}
          </Txt>
        </View>
        <View style={{ flex: compact ? undefined : 1, minWidth: 0, gap: 4 }}>
          <Txt bold>{title}</Txt>
          <Txt style={{ color, fontSize: 12 }}>
            {label}
            {category ? ` · ${category.name}` : ""}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 12 }}>{accounts}</Txt>
          <Txt bold style={{ color, fontSize: 13 }}>
            {amount}
          </Txt>
        </View>
        <View style={{ flex: compact ? undefined : 1, minWidth: 0, gap: 4 }}>
          <View
            style={{ flexDirection: "row", gap: 7, alignItems: "flex-start" }}
          >
            <Icon name="file-text" size={16} color={C.blue} />
            <Txt style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
              {receipt.name}
            </Txt>
          </View>
          <Txt style={{ color: C.dim, fontSize: 11 }}>
            PDF ·{" "}
            {receipt.size >= 1048576
              ? `${(receipt.size / 1048576).toFixed(1)} MB`
              : `${Math.ceil(receipt.size / 1024)} KB`}
          </Txt>
        </View>
        <Button
          small
          kind="secondary"
          icon="download"
          busy={busy}
          disabled={!accountId}
          accessibilityLabel={`${receipt.name} dekontunu indir`}
          onPress={download}
          style={compact ? { alignSelf: "flex-end" } : { width: 100 }}
        >
          İndir
        </Button>
      </View>
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}
export function ReceiptsDashboard({ month }: { month: string }) {
  const { data, cloud } = useBudget();
  const index = useReceiptIndex();
  const { width } = useWindowDimensions();
  const compact = width < 940;
  const rows = monthlyReceipts(data, index.receipts, month);
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <View style={{ flex: 1, minWidth: 150 }}>
          <Txt bold style={{ fontSize: 18 }}>
            {monthLabel(month)} dekontları
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            {index.loading
              ? "Dekontlar yükleniyor…"
              : `${rows.length} dekont · İşlem tarihine göre, en yeniden eskiye`}
          </Txt>
        </View>
        <Button
          small
          icon="refresh-cw"
          kind="secondary"
          busy={index.loading}
          onPress={() => {
            void index.refresh();
          }}
        >
          Yenile
        </Button>
      </View>
      {index.error ? <ErrorText message={index.error} /> : null}
      {!compact && rows.length ? (
        <View style={{ flexDirection: "row", gap: 16, paddingBottom: 10 }}>
          <Txt style={{ width: 115, color: C.dim, fontSize: 11 }}>
            İŞLEM TARİHİ
          </Txt>
          <Txt style={{ flex: 1, color: C.dim, fontSize: 11 }}>
            İŞLEM DETAYLARI
          </Txt>
          <Txt style={{ flex: 1, color: C.dim, fontSize: 11 }}>DEKONT</Txt>
          <Txt
            style={{
              width: 100,
              textAlign: "right",
              color: C.dim,
              fontSize: 11,
            }}
          >
            İNDİR
          </Txt>
        </View>
      ) : null}
      {rows.map((row) => (
        <ReceiptRow
          key={`${cloud.accountId}:${row.receipt.id}`}
          row={row}
          accountId={cloud.accountId ?? ""}
          compact={compact}
        />
      ))}
      {!rows.length && !index.loading && !index.error ? (
        <View style={{ alignItems: "center", paddingVertical: 35, gap: 12 }}>
          <Icon name="file-text" size={30} color={C.dim} />
          <Txt bold>Bu aya ait dekont yok</Txt>
          <Txt style={{ color: C.muted, textAlign: "center", fontSize: 12 }}>
            Seçili ayın gelir, gider ve transfer işlemlerine eklediğin PDF
            dekontlar burada görünür.
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}
