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
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const activity = accountMonthActivity(data, account, month, today());
  const rows = activity.transactions.filter(
    (t) => filter === "all" || t.type === filter,
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
        Gelirler ve giderler · {activity.transactions.length}
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
      {rows.length ? (
        rows.map((t) => (
          <View
            key={t.id}
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
              <Txt bold style={{ flexShrink: 1 }}>
                {t.description ||
                  data.categories.find((c) => c.id === t.categoryId)?.name ||
                  "İşlem"}
              </Txt>
              <Txt
                bold
                style={{ color: t.type === "income" ? C.green : C.red }}
              >
                {t.type === "income" ? "+" : "−"}
                {format(t.amount)}
              </Txt>
            </View>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {t.date} · {t.time ?? "Saat belirtilmedi"} ·{" "}
              {t.type === "income" ? "Gelir" : "Gider"} ·{" "}
              {data.categories.find((c) => c.id === t.categoryId)?.name}
            </Txt>
          </View>
        ))
      ) : (
        <Empty
          title={
            filter === "all"
              ? "Bu ay hesapta gelir/gider yok"
              : filter === "income"
                ? "Bu ay hesapta gelir yok"
                : "Bu ay hesapta gider yok"
          }
          body="Hesapsız kayıtlar, diğer hesaplar ve henüz işlenmemiş planlar bu listeye alınmaz."
        />
      )}
      <Txt bold style={{ fontSize: 16, marginTop: 22, marginBottom: 6 }}>
        Transferler · {activity.transfers.length}
      </Txt>
      <Txt style={{ color: C.dim, fontSize: 11 }}>
        Transferler ve kart ödemeleri yukarıdaki gelir/gider toplamına dahil
        değildir.
      </Txt>
      {activity.transfers.length ? (
        activity.transfers.map((t) => {
          const incoming = t.toId === account.id,
            otherId = incoming ? t.fromId : t.toId;
          const other = data.financialAccounts?.find((a) => a.id === otherId);
          return (
            <View
              key={t.id}
              style={{
                gap: 4,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: C.border,
              }}
            >
              <Txt bold>
                {incoming ? "Gelen transfer" : "Giden transfer"} ·{" "}
                {incoming ? "+" : "−"}
                {format(t.amount)}
              </Txt>
              <Txt style={{ color: C.muted, fontSize: 12 }}>
                {t.date} · {other?.name ?? "Diğer hesap"}
                {t.note ? ` · ${t.note}` : ""}
              </Txt>
            </View>
          );
        })
      ) : (
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>
          Bu ay bu hesapta transfer yok.
        </Txt>
      )}
    </Sheet>
  );
}
