import { activityRows } from "@/lib/budget/activity";
import type { AccountTransfer, FinancialAccount } from "@/lib/budget/finance";
import React from "react";
import { Pressable, View } from "react-native";
import {
  BudgetData,
  Category,
  Transaction,
  insights,
  money,
  moneyIn,
  summarize,
} from "@/lib/budget/model";
import { C, Card, Empty, Icon, Progress, Txt, styles } from "./ui";
export function Metrics({
  data,
  month,
  mobile,
}: {
  data: BudgetData;
  month: string;
  mobile: boolean;
}) {
  const s = summarize(data, month);
  const items = [
    {
      label: "TOPLAM GELİR",
      value: s.income,
      icon: "arrow-down-left",
      color: C.green,
      note: "Bu ay hesabına giren",
    },
    {
      label: "TOPLAM GİDER",
      value: s.expense,
      icon: "arrow-up-right",
      color: C.red,
      note: "Bu ay yaptığın harcamalar",
    },
    {
      label: "NET BAKİYE",
      value: s.net,
      icon: "activity",
      color: C.blue,
      note: "Gelir − gider",
    },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {items.map((item, i) => (
        <Card
          key={item.label}
          style={{
            flex: mobile && i === 2 ? undefined : 1,
            width: mobile && i === 2 ? "100%" : undefined,
            padding: mobile ? 17 : 22,
            backgroundColor: i === 2 ? "#13281F" : C.panel,
            borderColor: i === 2 ? "#254638" : C.border,
          }}
        >
          <View style={styles.between}>
            <Txt style={[styles.label, { fontSize: 10, flex: 1 }]}>
              {item.label}
            </Txt>
            <View
              style={{
                backgroundColor: `${item.color}12`,
                borderRadius: 8,
                padding: 6,
              }}
            >
              <Icon name={item.icon} color={item.color} size={17} />
            </View>
          </View>
          <Txt
            bold
            style={{
              fontSize: mobile ? 25 : 33,
              lineHeight: mobile ? 36 : 44,
              marginTop: 12,
              letterSpacing: -0.8,
              color: i === 2 ? (s.net < 0 ? C.red : C.green) : C.text,
            }}
          >
            {money(item.value, true)}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
            {item.note}
          </Txt>
        </Card>
      ))}
    </View>
  );
}
export function BudgetTile({
  category,
  onPress,
  dense = false,
}: {
  category: ReturnType<typeof summarize>["categories"][number];
  onPress: () => void;
  dense?: boolean;
}) {
  const over = category.remaining !== undefined && category.remaining < 0;
  const color = over ? C.red : category.color;
  const budgetDefined = category.budget !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name} bütçesini düzenle`}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: dense ? 15 : 18,
        paddingHorizontal: dense ? 0 : 18,
        borderWidth: dense ? 0 : 1,
        borderBottomWidth: 1,
        borderColor: C.border,
        borderRadius: dense ? 0 : 14,
        backgroundColor: pressed ? C.elevated : dense ? "transparent" : C.panel,
        gap: 12,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            backgroundColor: `${category.color}14`,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={category.icon} color={category.color} size={17} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt bold style={{ fontSize: 13 }}>
            {category.name}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 11 }}>
            {money(category.spent, true)}
            {budgetDefined
              ? ` / ${money(category.budget!, true)}`
              : " harcandı"}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt
            bold
            style={{
              fontSize: 12,
              color: budgetDefined ? (over ? C.red : C.green) : C.dim,
            }}
          >
            {budgetDefined
              ? `${money(Math.abs(category.remaining!), true)} ${over ? "aşıldı" : "kaldı"}`
              : "Limit belirle"}
          </Txt>
          <Txt style={{ color: over ? C.red : C.dim, fontSize: 10 }}>
            {budgetDefined
              ? category.budget === 0
                ? category.spent
                  ? "Sıfır limit aşıldı"
                  : "Sıfır limit"
                : `%${Math.round(category.ratio * 100)} kullanıldı`
              : "Aylık bütçe yok"}
          </Txt>
        </View>
        <Icon name="chevron-right" size={14} color={C.dim} />
      </View>
      <Progress
        ratio={
          budgetDefined && category.budget === 0 && category.spent
            ? 1
            : category.ratio
        }
        color={color}
      />
    </Pressable>
  );
}
export function InsightCards({
  data,
  month,
  mobile,
}: {
  data: BudgetData;
  month: string;
  mobile: boolean;
}) {
  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Icon name="zap" size={19} color={C.green} />
        <Txt bold style={styles.sectionTitle}>
          Bütçenin söyledikleri
        </Txt>
        <View
          style={{
            backgroundColor: C.elevated,
            borderRadius: 5,
            paddingHorizontal: 6,
            marginLeft: "auto",
          }}
        >
          <Txt style={{ fontSize: 9, color: C.muted, letterSpacing: 0.7 }}>
            VERİYE DAYALI
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: mobile ? "column" : "row", gap: 12 }}>
        {insights(data, month).map((item, i) => {
          const color =
            item.tone === "warning"
              ? C.amber
              : item.tone === "positive"
                ? C.green
                : C.blue;
          return (
            <Card
              key={i}
              style={{
                flex: mobile ? undefined : 1,
                padding: 18,
                borderTopWidth: 2,
                borderTopColor: `${color}90`,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ marginTop: 2 }}>
                  <Icon name={item.icon} color={color} size={17} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt bold style={{ fontSize: 13, lineHeight: 20 }}>
                    {item.title}
                  </Txt>
                  <Txt
                    style={{
                      color: C.muted,
                      fontSize: 11,
                      lineHeight: 18,
                      marginTop: 7,
                    }}
                  >
                    {item.body}
                  </Txt>
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}
export function TransactionRows({
  transactions,
  transfers = [],
  accounts = [],
  onTransferPress,
  categories,
  onPress,
  limit,
}: {
  transactions: Transaction[];
  transfers?: AccountTransfer[];
  accounts?: FinancialAccount[];
  onTransferPress?: (transfer: AccountTransfer) => void;
  categories: Category[];
  onPress: (t: Transaction) => void;
  limit?: number;
}) {
  const rows = activityRows(transactions, transfers);
  if (!rows.length)
    return (
      <Empty
        icon="repeat"
        title="Bu ay henüz işlem yok"
        body="Gelir, gider veya transfer ekle; arama ve filtrelerini kontrol et."
      />
    );
  return (
    <View>
      {rows.slice(0, limit || rows.length).map((entry) => {
        if (entry.kind === "transfer") {
          const t = entry.value;
          const from =
            accounts.find((a) => a.id === t.fromId)?.name ?? "Kaynak hesap";
          const to =
            accounts.find((a) => a.id === t.toId)?.name ?? "Hedef hesap";
          return (
            <Pressable
              key={`transfer:${t.id}`}
              onPress={() => onTransferPress?.(t)}
              accessibilityRole="button"
              accessibilityLabel={`Transfer ${from} → ${to} düzenle`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
                backgroundColor: pressed ? C.elevated : "transparent",
              })}
            >
              <View
                style={{
                  width: 37,
                  height: 37,
                  borderRadius: 10,
                  backgroundColor: "#60A5FA14",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="repeat" size={17} color={C.blue} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt bold numberOfLines={1} style={{ fontSize: 13 }}>
                  {t.note || "Hesaplar arası transfer"}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  {from} → {to}
                </Txt>
                <Txt style={{ color: C.dim, fontSize: 11 }}>
                  {new Intl.DateTimeFormat("tr-TR", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(`${t.date}T12:00:00`))}{" "}
                  · {t.time ?? "Saat belirtilmedi"}
                </Txt>
              </View>
              <View style={{ alignItems: "flex-end", maxWidth: 140 }}>
                <Txt
                  bold
                  style={{ color: C.blue, fontSize: 13, textAlign: "right" }}
                >
                  {moneyIn(t.amount, t.currency)}
                </Txt>
                <Txt style={{ color: C.blue, fontSize: 10 }}>Transfer</Txt>
              </View>
              <Icon name="chevron-right" size={13} color={C.dim} />
            </Pressable>
          );
        }
        const t = entry.value;
        const c = categories.find((c) => c.id === t.categoryId);
        return (
          <Pressable
            key={`transaction:${t.id}`}
            onPress={() => onPress(t)}
            accessibilityRole="button"
            accessibilityLabel={`${t.description || c?.name} işlemini düzenle`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
              backgroundColor: pressed ? C.elevated : "transparent",
            })}
          >
            <View
              style={{
                width: 37,
                height: 37,
                borderRadius: 10,
                backgroundColor: `${c?.color || C.dim}14`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={c?.icon || "tag"}
                size={17}
                color={c?.color || C.muted}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold numberOfLines={1} style={{ fontSize: 13 }}>
                {t.description || c?.name}
              </Txt>
              <Txt style={{ color: C.dim, fontSize: 11 }}>
                {c?.name} ·{" "}
                {new Intl.DateTimeFormat("tr-TR", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(`${t.date}T12:00:00`))}{" "}
                · {t.time || "Saat belirtilmedi"}
              </Txt>
            </View>
            <View style={{ alignItems: "flex-end", maxWidth: 160 }}>
              <Txt
                bold
                style={{
                  color: t.type === "income" ? C.green : C.text,
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                {t.type === "income" ? "+" : "−"}
                {moneyIn(t.amount, t.currency || "TRY")}
              </Txt>
              {t.currency && t.currency !== "TRY" ? (
                <Txt
                  style={{
                    color: C.dim,
                    fontSize: 9,
                    marginTop: 3,
                    textAlign: "right",
                  }}
                >
                  ≈ {money(t.baseAmount ?? 0)} · {t.fxDate || "kur yok"}
                </Txt>
              ) : null}
            </View>
            <Icon name="chevron-right" size={13} color={C.dim} />
          </Pressable>
        );
      })}
    </View>
  );
}
export function CategoryList({ categories }: { categories: Category[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {categories.map((c) => (
        <View
          key={c.id}
          style={{
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.bg,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 9,
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Icon name={c.icon} size={15} color={c.color} />
          <Txt style={{ fontSize: 12 }}>{c.name}</Txt>
        </View>
      ))}
    </View>
  );
}
