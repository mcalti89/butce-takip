import React, { useState } from "react";
import { View } from "react-native";
import {
  type BudgetData,
  monthKey,
  monthLabel,
  moneyIn,
  shiftMonth,
  today,
} from "@/lib/budget/model";
import type { FinancialAccount } from "@/lib/budget/finance";
import { accountMonthActivity } from "@/lib/budget/account-activity";
import { Button, C, Empty, Sheet, Txt } from "./ui";

export function AccountActivitySheet({
  data,
  account,
  onClose,
}: {
  data: BudgetData;
  account: FinancialAccount;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(monthKey());
  const [filter, setFilter] = useState<
    "all" | "income" | "expense" | "transfer"
  >("all");
  const activity = accountMonthActivity(data, account, month, today());
  const rows = activity.rows.filter(
    (row) =>
      filter === "all" ||
      (row.kind === "transfer"
        ? filter === "transfer"
        : row.value.type === filter),
  );
  const ambiguousTimes = activity.rows.some(
    (row, index, all) =>
      !row.value.time ||
      (index > 0 &&
        row.value.date === all[index - 1].value.date &&
        row.value.time === all[index - 1].value.time),
  );
  const format = (amount: number) => moneyIn(amount, account.currency);
  return (
    <Sheet
      title={`${account.name} · Aylık hareketler`}
      subtitle={`${account.currency} · Yalnızca bu hesaba atanmış gerçekleşen kayıtlar`}
      onClose={onClose}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 18,
        }}
      >
        <Button
          small
          kind="secondary"
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
        >
          Önceki ay
        </Button>
        <Txt bold>{monthLabel(month)}</Txt>
        <Button
          small
          kind="secondary"
          disabled={month >= monthKey()}
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
        >
          Sonraki ay
        </Button>
      </View>
      {account.kind === "investment" ? (
        <Txt style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
          Yatırım hesabı genel hesaplamaların dışındadır. Burada yalnızca bu
          hesabın bakiyesi ve kayıtlı geçmişi gösterilir.
        </Txt>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            padding: 14,
            borderRadius: 12,
            backgroundColor: C.bg,
          }}
        >
          {[
            { label: "Aylık gelir", value: activity.income, color: C.green },
            { label: "Aylık gider", value: activity.expense, color: C.red },
            {
              label: "Gelir − gider",
              value: activity.net,
              color: activity.net < 0 ? C.red : C.blue,
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{ flexGrow: 1, flexBasis: "45%", minWidth: 0 }}
            >
              <Txt style={{ color: C.muted, fontSize: 11 }}>{item.label}</Txt>
              <Txt
                bold
                style={{ color: item.color, fontSize: 19, lineHeight: 28 }}
              >
                {format(item.value)}
              </Txt>
            </View>
          ))}
        </View>
      )}
      <View style={{ gap: 6, marginVertical: 16 }}>
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Ay başı bakiyesi: {format(activity.opening)}
        </Txt>
        {activity.openingAdjustment !== 0 ? (
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            Bu ayki hesap açılış bakiyesi: {format(activity.openingAdjustment)}{" "}
            (gelir değildir)
          </Txt>
        ) : null}
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Gelen transfer: {format(activity.transferIn)} · Giden transfer:{" "}
          {format(activity.transferOut)}
        </Txt>
        <Txt bold style={{ fontSize: 13 }}>
          {activity.end} itibarıyla net bakiye: {format(activity.closing)}
        </Txt>
        <Txt style={{ color: C.dim, fontSize: 11 }}>
          Net bakiye = ay başı + bu ayki açılış + gelir − gider + gelen transfer
          − giden transfer.
          {account.kind === "card"
            ? " Kartta eksi bakiye borçtur; bankanın ekstre tutarı farklı olabilir."
            : ""}
        </Txt>
      </View>
      <Txt bold style={{ fontSize: 16, marginBottom: 12 }}>
        Gelir, gider ve transferler · {rows.length}
      </Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {(
          [
            { value: "all", label: "Tümü" },
            { value: "income", label: "Gelir" },
            { value: "expense", label: "Gider" },
            { value: "transfer", label: "Transferler" },
          ] as const
        ).map((item) => (
          <Button
            key={item.value}
            small
            kind={filter === item.value ? "secondary" : "ghost"}
            onPress={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </View>
      <Txt style={{ color: C.dim, fontSize: 11, marginBottom: 12 }}>
        En yeni hareket üsttedir. İşlem sonu bakiyesi tüm hareketleri içerir;
        filtre seçimi bakiyeyi değiştirmez. Transferler gelir/gider toplamına
        dahil değildir.
        {ambiguousTimes
          ? " Saatsiz kayıtlar günün başında sıralanır; aynı saatli kayıtların sırası sabittir."
          : ""}
      </Txt>
      {rows.length ? (
        rows.map((row) => {
          const t = row.value;
          const incoming = row.direction === "in";
          const transfer = row.kind === "transfer" ? row.value : undefined;
          const transaction =
            row.kind === "transaction" ? row.value : undefined;
          const other = transfer
            ? data.financialAccounts?.find(
                (a) => a.id === (incoming ? transfer.fromId : transfer.toId),
              )
            : undefined;
          const category = transaction
            ? data.categories.find((c) => c.id === transaction.categoryId)
            : undefined;
          const typeLabel = transfer
            ? `${transfer.exchange ? "Döviz al / sat · " : ""}${incoming ? "Gelen transfer" : "Giden transfer"}`
            : incoming
              ? "Gelir"
              : "Gider";
          return (
            <View
              key={`${row.kind}:${t.id}`}
              testID={`account-activity-${row.kind}-${t.id}`}
              style={{
                gap: 4,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: C.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
                  <Txt bold>
                    {transaction
                      ? transaction.description || category?.name || "İşlem"
                      : transfer?.note || typeLabel}
                  </Txt>
                  <Txt style={{ color: C.muted, fontSize: 12 }}>
                    {t.date} · {t.time ?? "Saat belirtilmedi"} · {typeLabel}
                  </Txt>
                  <Txt style={{ color: C.dim, fontSize: 11 }}>
                    {transfer
                      ? `${incoming ? "Gönderen" : "Alıcı"}: ${other?.name ?? "Diğer hesap"}`
                      : category?.name}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end", flexShrink: 1, gap: 4 }}>
                  <Txt
                    bold
                    style={{
                      color: transfer ? C.blue : incoming ? C.green : C.red,
                      textAlign: "right",
                    }}
                  >
                    {incoming ? "+" : "−"}
                    {format(row.amount)}
                  </Txt>
                  <Txt
                    style={{ color: C.muted, fontSize: 11, textAlign: "right" }}
                  >
                    İşlem sonu bakiyesi
                  </Txt>
                  <Txt
                    bold
                    style={{
                      color: row.balanceAfter < 0 ? C.red : C.text,
                      fontSize: 12,
                      textAlign: "right",
                    }}
                  >
                    {format(row.balanceAfter)}
                  </Txt>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <Empty
          title={
            filter === "all"
              ? "Bu ay hesapta hareket yok"
              : filter === "income"
                ? "Bu ay hesapta gelir yok"
                : filter === "expense"
                  ? "Bu ay hesapta gider yok"
                  : "Bu ay hesapta transfer yok"
          }
          body="Hesapsız kayıtlar, diğer hesaplar ve henüz işlenmemiş planlar bu listeye alınmaz."
        />
      )}
    </Sheet>
  );
}
