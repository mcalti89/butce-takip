import { ExchangeEditor } from "@/components/budget/exchange";
import { filterActivity, type ActivityFilter } from "@/lib/budget/activity";
import { CategoryManager } from "@/components/budget/categories";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBudget } from "@/lib/budget/store";
import {
  Category,
  Transaction,
  money,
  monthKey,
  monthLabel,
  shiftMonth,
  summarize,
  today,
} from "@/lib/budget/model";
import {
  CSV_TEMPLATE,
  ImportResult,
  exportCSV,
  importCSV,
} from "@/lib/budget/csv";
import { downloadCSV, pickCSV } from "@/lib/budget/files";
import {
  Button,
  C,
  Card,
  ErrorText,
  Icon,
  IconButton,
  Sheet,
  Txt,
  styles,
} from "@/components/budget/ui";
import { Distribution, TrendChart } from "@/components/budget/charts";
import {
  BudgetTile,
  CategoryList,
  InsightCards,
  Metrics,
  TransactionRows,
} from "@/components/budget/views";
import {
  BudgetEditor,
  CategoryEditor,
  ImportEditor,
  TransactionEditor,
} from "@/components/budget/editors";
import { AccountPopup, CloudPanel } from "@/components/budget/cloud";
import PwaPanel from "@/components/budget/pwa";
import { SavingsCard, SavingsEditor } from "@/components/budget/savings";
import { FxDashboard } from "@/components/budget/fx";
import {
  AccountEditor,
  AccountsDashboard,
  PaymentCalendar,
  PlanEditor,
  TransferEditor,
} from "@/components/budget/finance";
import type { FinancialAccount, AccountTransfer } from "@/lib/budget/finance";
import { AnalysisDashboard, BudgetWarnings } from "@/components/budget/reports";

type Page =
  | "overview"
  | "analysis"
  | "transactions"
  | "budgets"
  | "fx"
  | "accounts"
  | "calendar"
  | "data"
  | "settings";
type Dialog =
  | {
      kind: "transaction";
      transaction?: Transaction;
      draft?: Partial<Transaction>;
    }
  | { kind: "account"; account?: FinancialAccount }
  | { kind: "exchange"; transfer?: AccountTransfer }
  | {
      kind: "transfer";
      transfer?: AccountTransfer;
      toId?: string;
      amount?: number;
    }
  | { kind: "plan" }
  | { kind: "budget"; category: Category }
  | { kind: "category" }
  | { kind: "categories" }
  | { kind: "import"; text: string; result: ImportResult }
  | { kind: "delete"; transaction: Transaction }
  | { kind: "fresh" }
  | { kind: "savings"; month: string }
  | null;
const NAV: { id: Page; title: string; short: string; icon: string }[] = [
  { id: "overview", title: "Genel bakış", short: "Pano", icon: "grid" },
  { id: "transactions", title: "İşlemler", short: "İşlemler", icon: "repeat" },
  { id: "budgets", title: "Bütçeler", short: "Bütçeler", icon: "target" },
  {
    id: "accounts",
    title: "Hesaplar & kartlar",
    short: "Hesaplar",
    icon: "credit-card",
  },
  { id: "calendar", title: "Ödeme takvimi", short: "Takvim", icon: "calendar" },
  {
    id: "analysis",
    title: "Tahmin & raporlar",
    short: "Analiz",
    icon: "bar-chart-2",
  },
  { id: "fx", title: "Döviz", short: "Döviz", icon: "dollar-sign" },
];
function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          backgroundColor: C.green,
          width: small ? 32 : 37,
          height: small ? 32 : 37,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="bar-chart-2" size={small ? 20 : 25} color="#08150D" />
      </View>
      <View>
        <Txt bold style={{ fontSize: small ? 18 : 21, letterSpacing: -0.5 }}>
          bütçe
          <Txt bold style={{ color: C.green, fontSize: small ? 18 : 21 }}>
            .
          </Txt>
        </Txt>
        {!small ? (
          <Txt
            style={{
              fontSize: 9,
              color: C.dim,
              letterSpacing: 1.8,
              lineHeight: 13,
            }}
          >
            PARANIN KONTROLÜ SENDE
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

export default function BudgetApp() {
  const { data, loading, storageError, update, startFresh } = useBudget();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mobile = width < 720;
  const desktop = width >= 1080;
  const stackedHeader = mobile || width - (desktop ? 278 : 60) < 780;
  const [page, setPage] = useState<Page>("overview");
  const [analysisStart, setAnalysisStart] = useState<"forecast" | "reports">(
    "forecast",
  );
  const hasMonth = [
    "overview",
    "transactions",
    "budgets",
    "calendar",
    "analysis",
  ].includes(page);
  const [accountOpen, setAccountOpen] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [selectedCategoryFilter, setCategoryFilter] = useState("all");
  const categoryFilter = data.categories.some(
    (c) => c.id === selectedCategoryFilter,
  )
    ? selectedCategoryFilter
    : "all";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroll = useRef<ScrollView>(null);
  const s = summarize(data, month);
  const notify = (message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 4000);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const navigate = (next: Page) => {
    setAccountOpen(false);
    setPage(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const close = () => {
    setDialog(null);
    setConfirmError("");
  };
  const loadFile = async () => {
    setFileError("");
    setFileBusy(true);
    try {
      const text = await pickCSV();
      if (text !== null)
        setDialog({ kind: "import", text, result: importCSV(text, data) });
    } catch (e) {
      setFileError((e as Error).message);
      notify((e as Error).message);
    } finally {
      setFileBusy(false);
    }
  };
  const exportFile = async (template = false) => {
    setFileError("");
    setFileBusy(true);
    try {
      await downloadCSV(
        template ? CSV_TEMPLATE : exportCSV(data),
        template
          ? "butce-csv-sablonu.csv"
          : `butce-islemleri-${monthKey()}.csv`,
      );
      notify(
        template
          ? "CSV şablonu indirildi."
          : "Gelir/gider kayıtları CSV olarak aktarıldı. Transferler tam JSON yedeğinde yer alır.",
      );
    } catch (e) {
      setFileError((e as Error).message);
      notify((e as Error).message);
    } finally {
      setFileBusy(false);
    }
  };
  const confirm = async () => {
    setConfirmBusy(true);
    setConfirmError("");
    try {
      if (dialog?.kind === "delete") {
        const target = dialog.transaction.id;
        await update((d) => {
          const transaction = d.transactions.find((t) => t.id === target);
          if (
            transaction?.accountId &&
            d.financialAccounts?.some(
              (a) => a.id === transaction.accountId && a.archived,
            )
          )
            throw new Error(
              "İşlemi silmeden önce bağlı hesabı arşivden çıkar.",
            );
          return {
            ...d,
            transactions: d.transactions.filter((t) => t.id !== target),
          };
        });
        notify("İşlem silindi.");
      } else if (dialog?.kind === "fresh") {
        await startFresh();
        notify("Kendi bütçen hazır. İlk işlemini ekleyebilirsin.");
      }
      close();
    } catch (e) {
      setConfirmError((e as Error).message);
    } finally {
      setConfirmBusy(false);
    }
  };
  const visibleActivity = filterActivity(
    data,
    month,
    filter,
    categoryFilter,
    search,
  );
  if (loading)
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: C.bg, gap: 18 }}
      >
        <Brand />
        <ActivityIndicator color={C.green} />
        <Txt style={{ color: C.muted }}>Hesabın hazırlanıyor…</Txt>
      </View>
    );
  return (
    <View
      className="flex-1"
      style={{ backgroundColor: C.bg, flexDirection: "row" }}
    >
      {desktop ? (
        <View
          style={{
            width: 218,
            backgroundColor: "#101827",
            borderRightWidth: 1,
            borderRightColor: C.border,
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top, 30),
            paddingBottom: 24,
          }}
        >
          <Brand />
          <Txt
            style={{
              color: C.dim,
              fontSize: 10,
              letterSpacing: 1.5,
              marginTop: 48,
              marginBottom: 13,
            }}
          >
            KİŞİSEL FİNANS
          </Txt>
          <View style={{ gap: 7 }}>
            {NAV.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityState={{ selected: page === item.id }}
                onPress={() => navigate(item.id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 13,
                  borderRadius: 10,
                  backgroundColor:
                    page === item.id
                      ? "#22C55E13"
                      : pressed
                        ? C.elevated
                        : "transparent",
                  borderLeftWidth: 2,
                  borderLeftColor: page === item.id ? C.green : "transparent",
                })}
              >
                <Icon
                  name={item.icon}
                  color={page === item.id ? C.green : C.dim}
                  size={18}
                />
                <Txt
                  bold={page === item.id}
                  style={{
                    fontSize: 12,
                    color: page === item.id ? C.green : C.muted,
                  }}
                >
                  {item.title}
                </Txt>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: "auto" }}>
            {height >= 1000 ? (
              <Card
                style={{
                  backgroundColor: "#15231F",
                  borderColor: "#254638",
                  padding: 14,
                }}
              >
                <Icon name="shield" color={C.green} size={19} />
                <Txt bold style={{ marginTop: 9, fontSize: 12 }}>
                  Sadece sana ait.
                </Txt>
                <Txt
                  style={{
                    color: C.muted,
                    fontSize: 10,
                    lineHeight: 17,
                    marginTop: 4,
                  }}
                >
                  Google hesabına özel bütçen. Kayıtlarını farklı cihazlarda
                  aynı hesapla açabilirsin.
                </Txt>
              </Card>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hesap menüsü"
              accessibilityState={{ expanded: accountOpen }}
              onPress={() => setAccountOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingTop: 22,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: C.elevated,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="user" size={16} />
              </View>
              <View>
                <Txt bold style={{ fontSize: 11 }}>
                  Kişisel bütçem
                </Txt>
                <Txt style={{ color: C.dim, fontSize: 10 }}>
                  TRY · Raporlama para birimi
                </Txt>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View className="flex-1" style={{ minWidth: 0 }}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(insets.top, mobile ? 18 : 24),
            paddingBottom: 28,
            paddingHorizontal: mobile ? 18 : 30,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1220,
              alignSelf: "center",
              gap: 22,
            }}
          >
            {!desktop ? (
              <View style={[styles.between, { marginBottom: 4 }]}>
                <Brand small />
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <IconButton
                    name="user"
                    label="Hesap menüsü"
                    onPress={() => setAccountOpen(true)}
                  />
                </View>
              </View>
            ) : null}
            {!desktop && !mobile ? (
              <View style={{ flexDirection: "row", gap: 7 }}>
                {NAV.map((item) => (
                  <Button
                    key={item.id}
                    kind={page === item.id ? "primary" : "ghost"}
                    small
                    icon={item.icon}
                    onPress={() => navigate(item.id)}
                  >
                    {item.title}
                  </Button>
                ))}
              </View>
            ) : null}
            <View
              style={{
                flexDirection: stackedHeader ? "column" : "row",
                justifyContent: "space-between",
                alignItems: stackedHeader ? "stretch" : "center",
                gap: 18,
              }}
            >
              <View>
                <Txt
                  style={{
                    color: C.dim,
                    fontSize: 10,
                    letterSpacing: 1.4,
                    marginBottom: 4,
                  }}
                >
                  BÜTÇE TAKİP /{" "}
                  {(page === "settings"
                    ? "Ayarlar"
                    : page === "data"
                      ? "Veriler & kategoriler"
                      : NAV.find((n) => n.id === page)?.title
                  )?.toLocaleUpperCase("tr-TR")}
                </Txt>
                <Txt
                  bold
                  style={{
                    fontSize: mobile ? 29 : 32,
                    lineHeight: 42,
                    letterSpacing: -1,
                  }}
                >
                  {page === "overview"
                    ? "Paranın kontrolü sende."
                    : page === "analysis"
                      ? "Bugünü anla, yarını planla."
                      : page === "transactions"
                        ? "Her işlem, bir hikâye."
                        : page === "budgets"
                          ? "Planın ne kadar kaldı?"
                          : page === "fx"
                            ? "Döviz de, net gör."
                            : page === "accounts"
                              ? "Hesapların ve kartların."
                              : page === "calendar"
                                ? "Ödemelerini planla."
                                : page === "settings"
                                  ? "Ayarlar"
                                  : "Bütçen. Senin düzenin."}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                  {page === "overview"
                    ? "Büyük resmi gör, küçük adımlarla ilerle."
                    : page === "analysis"
                      ? "Gelecek ay tahmini bugüne, raporlar seçili aya göre hesaplanır."
                      : page === "transactions"
                        ? "Gelir ve giderlerini tek yerde takip et."
                        : page === "budgets"
                          ? "Kategori limitlerini aya özel belirle."
                          : page === "fx"
                            ? "TCMB alış ve satış kurlarını tarihleriyle izle."
                            : page === "accounts"
                              ? "Bakiyelerini ve transferlerini tek yerde gör."
                              : page === "calendar"
                                ? "Yaklaşan gelir, ödeme ve taksitlerini takip et."
                                : page === "settings"
                                  ? "Uygulama kurulumu ve cihazında kullanım."
                                  : "Kategorilerini yönet, verilerini yanında taşı."}
                </Txt>
              </View>
              {page === "accounts" ? (
                <Button
                  icon="plus"
                  onPress={() => setDialog({ kind: "account" })}
                >
                  Hesap ekle
                </Button>
              ) : page === "settings" ? null : hasMonth ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: mobile ? 8 : 12,
                    maxWidth: "100%",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      backgroundColor: C.panel,
                      borderWidth: 1,
                      borderColor: C.border,
                      borderRadius: 10,
                      paddingHorizontal: 4,
                    }}
                  >
                    <IconButton
                      name="chevron-left"
                      label="Önceki ay"
                      onPress={() => setMonth((m) => shiftMonth(m, -1))}
                    />
                    {!mobile ? <Icon name="calendar" size={15} /> : null}
                    <Txt
                      bold
                      style={{
                        minWidth: mobile ? 84 : 102,
                        textAlign: "center",
                        fontSize: 12,
                      }}
                    >
                      {monthLabel(month)}
                    </Txt>
                    <IconButton
                      name="chevron-right"
                      label="Sonraki ay"
                      onPress={() => setMonth((m) => shiftMonth(m, 1))}
                    />
                  </View>
                  <Button
                    icon="plus"
                    small={mobile}
                    onPress={() =>
                      setDialog(
                        page === "calendar"
                          ? { kind: "plan" }
                          : { kind: "transaction" },
                      )
                    }
                  >
                    {page === "calendar" ? "Plan ekle" : "İşlem ekle"}
                  </Button>
                </View>
              ) : page === "data" ? (
                <Button
                  icon="plus"
                  onPress={() => setDialog({ kind: "category" })}
                >
                  Kategori ekle
                </Button>
              ) : null}
            </View>
            {data.demo ? (
              <View
                style={{
                  backgroundColor: "#172639",
                  borderWidth: 1,
                  borderColor: "#2F4661",
                  borderRadius: 10,
                  paddingHorizontal: 13,
                  paddingVertical: 9,
                  flexDirection: mobile ? "column" : "row",
                  gap: 8,
                  alignItems: mobile ? "flex-start" : "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <Icon name="info" size={15} color={C.blue} />
                  <Txt style={{ color: "#B2C9E7", fontSize: 11, flex: 1 }}>
                    Örnek veri modu · Rakamlar uygulamayı keşfetmen için.
                  </Txt>
                </View>
                <Button
                  kind="ghost"
                  small
                  icon="arrow-right"
                  onPress={() => setDialog({ kind: "fresh" })}
                >
                  Kendi bütçeme geç
                </Button>
              </View>
            ) : null}
            {storageError ? (
              <Card style={{ borderColor: C.red, padding: 14 }}>
                <ErrorText message={storageError} />
              </Card>
            ) : null}
            {Platform.OS === "web" ? (
              <PwaPanel visible={page === "settings"} />
            ) : null}
            {page === "accounts" ? (
              <AccountsDashboard
                onExchange={(transfer) =>
                  setDialog({ kind: "exchange", transfer })
                }
                onAccount={(account) => setDialog({ kind: "account", account })}
                onTransfer={(draft) =>
                  setDialog({
                    ...draft,
                    kind: draft?.transfer?.exchange ? "exchange" : "transfer",
                  })
                }
              />
            ) : null}
            {page === "calendar" ? (
              <PaymentCalendar
                month={month}
                onTransfer={(draft) =>
                  setDialog({
                    ...draft,
                    kind: "transfer",
                  })
                }
                onExecute={(o) =>
                  setDialog({
                    kind: "transaction",
                    draft: {
                      type: o.plan.type,
                      amount: o.amount,
                      currency: o.plan.currency,
                      accountId: o.plan.accountId,
                      categoryId: o.plan.categoryId,
                      description:
                        o.plan.title +
                        (o.plan.kind === "installment"
                          ? ` · ${o.index + 1}/${o.plan.count}`
                          : ""),
                      date: today(),
                      planId: o.plan.id,
                      planIndex: o.index,
                    },
                  })
                }
              />
            ) : null}
            {page === "analysis" ? (
              <AnalysisDashboard
                initialTab={analysisStart}
                data={data}
                month={month}
                mobile={mobile}
                onAccounts={() => navigate("accounts")}
                onCalendar={() => navigate("calendar")}
                onBudget={(categoryId) => {
                  const category = data.categories.find(
                    (c) => c.id === categoryId,
                  );
                  if (category) setDialog({ kind: "budget", category });
                }}
              />
            ) : null}
            {page === "overview" ? (
              <>
                <Metrics data={data} month={month} mobile={mobile} />
                <Card style={{ padding: 17 }}>
                  <View
                    style={{
                      flexDirection: mobile ? "column" : "row",
                      alignItems: mobile ? "stretch" : "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt bold>Gelecek ay seni ne bekliyor?</Txt>
                      <Txt
                        style={{ color: C.muted, fontSize: 12, marginTop: 4 }}
                      >
                        Hesap bakiyelerin ve ödeme planlarınla ay sonu
                        tahminini, karşılaştırmalarını ve kategori eğilimlerini
                        gör.
                      </Txt>
                    </View>
                    <Button
                      small
                      kind="secondary"
                      icon="trending-up"
                      onPress={() => {
                        setAnalysisStart("forecast");
                        navigate("analysis");
                      }}
                    >
                      Tahmin ve raporları aç
                    </Button>
                  </View>
                </Card>
                <BudgetWarnings
                  data={data}
                  month={month}
                  compact
                  onReports={() => {
                    setAnalysisStart("reports");
                    navigate("analysis");
                  }}
                  onBudget={(categoryId) => {
                    const category = data.categories.find(
                      (c) => c.id === categoryId,
                    );
                    if (category) setDialog({ kind: "budget", category });
                  }}
                />
                <SavingsCard
                  data={data}
                  month={month}
                  mobile={mobile}
                  onEdit={() => setDialog({ kind: "savings", month })}
                />
                <View
                  style={{ flexDirection: mobile ? "column" : "row", gap: 16 }}
                >
                  <Distribution data={data} month={month} narrow={!desktop} />
                  <TrendChart data={data} month={month} />
                </View>
                <InsightCards data={data} month={month} mobile={mobile} />
                <View
                  style={{ flexDirection: mobile ? "column" : "row", gap: 16 }}
                >
                  <Card style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.between}>
                      <Txt bold style={styles.sectionTitle}>
                        Kategori bütçeleri
                      </Txt>
                      <Button
                        kind="ghost"
                        small
                        icon="arrow-up-right"
                        onPress={() => navigate("budgets")}
                      >
                        Tümü
                      </Button>
                    </View>
                    <Txt
                      style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}
                    >
                      Kalan tutarını bir bakışta gör.
                    </Txt>
                    {s.categories.slice(0, 4).map((c) => (
                      <BudgetTile
                        key={c.id}
                        category={c}
                        dense
                        onPress={() =>
                          setDialog({ kind: "budget", category: c })
                        }
                      />
                    ))}
                  </Card>
                  <Card style={{ flex: 1.1, minWidth: 0 }}>
                    <View style={styles.between}>
                      <Txt bold style={styles.sectionTitle}>
                        Son işlemler
                      </Txt>
                      <Button
                        kind="ghost"
                        small
                        icon="arrow-up-right"
                        onPress={() => navigate("transactions")}
                      >
                        Tümü
                      </Button>
                    </View>
                    <Txt
                      style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}
                    >
                      Seçili ayın en yeni hareketleri.
                    </Txt>
                    <TransactionRows
                      transactions={s.transactions}
                      transfers={(data.accountTransfers ?? []).filter((t) =>
                        t.date.startsWith(month + "-"),
                      )}
                      accounts={data.financialAccounts}
                      onTransferPress={(transfer) =>
                        setDialog({
                          kind: transfer.exchange ? "exchange" : "transfer",
                          transfer,
                        })
                      }
                      categories={data.categories}
                      limit={5}
                      onPress={(t) =>
                        setDialog({ kind: "transaction", transaction: t })
                      }
                    />
                  </Card>
                </View>
              </>
            ) : null}
            {page === "transactions" ? (
              <>
                <Metrics data={data} month={month} mobile={mobile} />
                <Button
                  small
                  kind="secondary"
                  icon="settings"
                  style={{ alignSelf: "flex-start" }}
                  onPress={() => setDialog({ kind: "categories" })}
                >
                  Kategorileri yönet
                </Button>
                <Card style={{ padding: mobile ? 16 : 22 }}>
                  <View
                    style={{
                      flexDirection: mobile ? "column" : "row",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: C.bg,
                        borderWidth: 1,
                        borderColor: C.border,
                        borderRadius: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 9,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Icon name="search" size={16} />
                      <TextInput
                        accessibilityLabel="İşlem ara"
                        placeholder="İşlem, kategori veya hesap ara…"
                        placeholderTextColor={C.dim}
                        value={search}
                        onChangeText={setSearch}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color: C.text,
                          paddingVertical: 13,
                          fontFamily: "Plex",
                          fontSize: 13,
                        }}
                      />
                    </View>
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}
                    >
                      {(["all", "expense", "income", "transfer"] as const).map(
                        (f) => (
                          <Button
                            key={f}
                            kind={filter === f ? "primary" : "secondary"}
                            small
                            onPress={() => {
                              setFilter(f);
                              if (f === "transfer") setCategoryFilter("all");
                            }}
                            style={{
                              flexGrow: mobile ? 1 : 0,
                              flexBasis: mobile ? "45%" : undefined,
                            }}
                          >
                            {f === "all"
                              ? "Tümü"
                              : f === "expense"
                                ? "Gider"
                                : f === "income"
                                  ? "Gelir"
                                  : "Transfer"}
                          </Button>
                        ),
                      )}
                    </View>
                  </View>
                  {filter !== "transfer" ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 7, paddingBottom: 12 }}
                    >
                      <Button
                        small
                        kind={categoryFilter === "all" ? "secondary" : "ghost"}
                        onPress={() => setCategoryFilter("all")}
                      >
                        Tüm kategoriler
                      </Button>
                      {data.categories
                        .filter((c) => filter === "all" || c.type === filter)
                        .map((c) => (
                          <Button
                            key={c.id}
                            small
                            kind={
                              categoryFilter === c.id ? "secondary" : "ghost"
                            }
                            onPress={() => setCategoryFilter(c.id)}
                          >
                            {c.name}
                          </Button>
                        ))}
                    </ScrollView>
                  ) : null}
                  <View style={[styles.between, { marginTop: 8 }]}>
                    <Txt style={styles.label}>
                      {visibleActivity.count} HAREKET
                    </Txt>
                    <Txt style={{ color: C.dim, fontSize: 10 }}>
                      Düzenlemek için dokun
                    </Txt>
                  </View>
                  <TransactionRows
                    transactions={visibleActivity.transactions}
                    transfers={visibleActivity.transfers}
                    accounts={data.financialAccounts}
                    onTransferPress={(transfer) =>
                      setDialog({
                        kind: transfer.exchange ? "exchange" : "transfer",
                        transfer,
                      })
                    }
                    categories={data.categories}
                    onPress={(t) =>
                      setDialog({ kind: "transaction", transaction: t })
                    }
                  />
                </Card>
              </>
            ) : null}
            {page === "budgets" ? (
              <>
                <SavingsCard
                  data={data}
                  month={month}
                  mobile={mobile}
                  onEdit={() => setDialog({ kind: "savings", month })}
                />
                <Card
                  style={{
                    padding: mobile ? 20 : 25,
                    backgroundColor: "#13281F",
                    borderColor: "#254638",
                  }}
                >
                  <View
                    style={{
                      flexDirection: mobile ? "column" : "row",
                      gap: 24,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt style={styles.label}>
                        BÜTÇELENEN KATEGORİLERDE KALAN
                      </Txt>
                      <Txt
                        bold
                        style={{
                          fontSize: 36,
                          lineHeight: 48,
                          color: s.budgetRemaining < 0 ? C.red : C.green,
                          marginVertical: 7,
                        }}
                      >
                        {money(s.budgetRemaining, true)}
                      </Txt>
                      <Txt style={{ color: C.muted, fontSize: 12 }}>
                        Yalnızca limit belirlediğin kategorilerin kalan toplamı.
                      </Txt>
                    </View>
                    <View style={{ gap: 9, justifyContent: "center" }}>
                      <Txt style={{ color: C.muted }}>
                        Toplam limit{" "}
                        <Txt bold>{money(s.budgetTotal, true)}</Txt>
                      </Txt>
                      <Txt style={{ color: C.muted }}>
                        Bu kategorilerde harcanan{" "}
                        <Txt bold>
                          {money(s.budgetTotal - s.budgetRemaining, true)}
                        </Txt>
                      </Txt>
                      <Txt style={{ color: C.muted }}>
                        {
                          s.categories.filter(
                            (c) => c.remaining !== undefined && c.remaining < 0,
                          ).length
                        }{" "}
                        kategori limitini aştı
                      </Txt>
                    </View>
                  </View>
                </Card>
                <View style={styles.between}>
                  <Txt bold style={styles.sectionTitle}>
                    Aylık kategori limitleri
                  </Txt>
                  <Txt style={{ color: C.dim, fontSize: 10 }}>
                    Düzenlemek için dokun
                  </Txt>
                </View>
                <View
                  style={{
                    flexDirection: mobile ? "column" : "row",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  {s.categories.map((c) => (
                    <View
                      key={c.id}
                      style={{
                        width: mobile ? "100%" : "48.8%",
                        flexGrow: mobile ? 0 : 1,
                      }}
                    >
                      <BudgetTile
                        category={c}
                        onPress={() =>
                          setDialog({ kind: "budget", category: c })
                        }
                      />
                    </View>
                  ))}
                </View>
                <InsightCards data={data} month={month} mobile={mobile} />
              </>
            ) : null}
            {page === "fx" ? <FxDashboard mobile={mobile} /> : null}
            {page === "data" ? (
              <>
                <CloudPanel />
                <Card
                  style={{ borderColor: "#254638", backgroundColor: "#13281F" }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 14,
                      alignItems: "flex-start",
                    }}
                  >
                    <Icon name="shield" color={C.green} size={25} />
                    <View style={{ flex: 1 }}>
                      <Txt bold style={styles.sectionTitle}>
                        Verilerin nerede saklanıyor?
                      </Txt>
                      <Txt
                        style={{ color: C.muted, marginTop: 7, fontSize: 12 }}
                      >
                        Bütçen, Google ile giriş yaptığın hesaba bağlı sunucuda
                        saklanır. Başka kullanıcılar bu kayıtlara erişemez. Eski
                        cihaz kayıtların otomatik aktarılmaz; mevcut özgün kopya
                        korunur. İnternet bağlantısı gerekir.
                        {
                          " Düzenli olarak tam JSON yedeği indir; CSV yalnızca gelir/gider kayıtlarını içerir."
                        }
                      </Txt>
                    </View>
                  </View>
                </Card>
                <View
                  style={{ flexDirection: mobile ? "column" : "row", gap: 16 }}
                >
                  <Card style={{ flex: 1 }}>
                    <Icon name="upload" color={C.blue} size={24} />
                    <Txt bold style={{ fontSize: 20, marginTop: 15 }}>
                      Kayıtlarını getir.
                    </Txt>
                    <Txt
                      style={{
                        color: C.muted,
                        fontSize: 12,
                        marginTop: 8,
                        marginBottom: 18,
                      }}
                    >
                      CSV dosyanı seç, kontrol et ve geçerli işlemleri içe
                      aktar. Yeni kategoriler otomatik eklenir.
                    </Txt>
                    <Button
                      icon="upload"
                      kind="secondary"
                      busy={fileBusy}
                      onPress={loadFile}
                    >
                      CSV içe aktar
                    </Button>
                    <Button
                      kind="ghost"
                      small
                      icon="download"
                      onPress={() => exportFile(true)}
                      disabled={fileBusy}
                      style={{ marginTop: 8 }}
                    >
                      Örnek CSV şablonu indir
                    </Button>
                  </Card>
                  <Card style={{ flex: 1 }}>
                    <Icon name="download" color={C.green} size={24} />
                    <Txt bold style={{ fontSize: 20, marginTop: 15 }}>
                      Bir kopyası sende olsun.
                    </Txt>
                    <Txt
                      style={{
                        color: C.muted,
                        fontSize: 12,
                        marginTop: 8,
                        marginBottom: 18,
                      }}
                    >
                      {data.transactions.length} gelir/gider kaydı, tüm aylar
                      dahil. CSV işlem tarihini, türünü, kategorisini, tutarını
                      ve açıklamasını içerir.
                    </Txt>
                    <Button
                      icon="download"
                      onPress={() => exportFile()}
                      busy={fileBusy}
                      disabled={!data.transactions.length}
                    >
                      CSV dışa aktar
                    </Button>
                    <Txt style={{ fontSize: 10, color: C.dim, marginTop: 13 }}>
                      CSV yalnızca gelir/gider kayıtlarını taşır; hesapları,
                      transferleri, planları, aylık limitleri ve tasarruf
                      hedeflerini içermez.
                    </Txt>
                  </Card>
                </View>
                <ErrorText message={fileError} />
                <Card>
                  <Txt bold style={styles.sectionTitle}>
                    CSV biçimi
                  </Txt>
                  <Txt
                    style={{ color: C.muted, fontSize: 12, marginVertical: 10 }}
                  >
                    Gerekli sütunlar: date, type, category, amount. description
                    ve id isteğe bağlı. Türkçe başlıklar da kabul edilir: tarih,
                    tür, kategori, tutar, açıklama.
                  </Txt>
                  <View
                    style={{
                      backgroundColor: C.bg,
                      borderRadius: 9,
                      padding: 12,
                    }}
                  >
                    <Txt
                      selectable
                      style={{
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                        color: C.green,
                        fontSize: 10,
                        lineHeight: 19,
                      }}
                    >
                      date,type,category,amount,description,time{"\n"}
                      2026-10-02,expense,Market,450.50,Alışveriş,14:30
                    </Txt>
                  </View>
                  <Txt style={{ color: C.dim, fontSize: 11, marginTop: 10 }}>
                    Tarih: YYYY-MM-DD · Saat: SS:DD (isteğe bağlı) · Tür:
                    income/expense veya gelir/gider · Ayraç: virgül ya da
                    noktalı virgül · En fazla 5 MB / 10.000 işlem.
                  </Txt>
                </Card>
                <Card>
                  <View style={[styles.between, { marginBottom: 18 }]}>
                    <Txt bold style={styles.sectionTitle}>
                      Kategorilerin
                    </Txt>
                    <Button
                      small
                      kind="secondary"
                      icon="plus"
                      onPress={() => setDialog({ kind: "category" })}
                    >
                      Yeni kategori
                    </Button>
                  </View>
                  <Button
                    small
                    kind="secondary"
                    icon="settings"
                    style={{ marginBottom: 16 }}
                    onPress={() => setDialog({ kind: "categories" })}
                  >
                    Kategorileri yönet
                  </Button>
                  <Txt style={[styles.label, { marginBottom: 12 }]}>
                    GİDER KATEGORİLERİ
                  </Txt>
                  <CategoryList
                    categories={data.categories.filter(
                      (c) => c.type === "expense",
                    )}
                  />
                  <Txt
                    style={[styles.label, { marginTop: 22, marginBottom: 12 }]}
                  >
                    GELİR KATEGORİLERİ
                  </Txt>
                  <CategoryList
                    categories={data.categories.filter(
                      (c) => c.type === "income",
                    )}
                  />
                </Card>
              </>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 7,
                marginTop: 5,
              }}
            >
              <Icon name="lock" size={11} color={C.dim} />
              <Txt style={{ fontSize: 10, color: C.dim }}>
                Sana ait veriler. Daha bilinçli kararlar.
              </Txt>
            </View>
          </View>
        </ScrollView>
        {mobile ? (
          <View
            style={{
              flexDirection: "row",
              paddingTop: 9,
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: "#101827",
              borderTopWidth: 1,
              borderTopColor: C.border,
            }}
          >
            {NAV.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.short}
                accessibilityState={{ selected: page === item.id }}
                onPress={() => navigate(item.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 5,
                  paddingVertical: 7,
                }}
              >
                <Icon
                  name={item.icon}
                  color={page === item.id ? C.green : C.dim}
                  size={21}
                />
                <Txt
                  bold={page === item.id}
                  style={{
                    color: page === item.id ? C.green : C.dim,
                    fontSize: 10,
                  }}
                >
                  {item.short}
                </Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {accountOpen ? (
        <AccountPopup
          desktop={desktop}
          onClose={() => setAccountOpen(false)}
          onNavigate={navigate}
        />
      ) : null}
      {toast ? (
        <View
          accessibilityRole="alert"
          style={{
            position: "absolute",
            bottom: mobile ? 95 : 25,
            left: desktop ? 245 : 18,
            right: 18,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => setToast("")}
            style={{
              maxWidth: 520,
              backgroundColor: C.elevated,
              paddingHorizontal: 18,
              paddingVertical: 13,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#3F526A",
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Icon name="info" color={C.green} size={17} />
            <Txt style={{ flexShrink: 1, fontSize: 12 }}>{toast}</Txt>
            <Icon name="x" size={13} />
          </Pressable>
        </View>
      ) : null}
      {dialog?.kind === "account" ? (
        <AccountEditor
          account={dialog.account}
          onClose={close}
          onDone={notify}
        />
      ) : null}
      {dialog?.kind === "exchange" ? (
        <ExchangeEditor
          transfer={dialog.transfer}
          onClose={close}
          onDone={notify}
        />
      ) : null}
      {dialog?.kind === "transfer" ? (
        <TransferEditor
          transfer={dialog.transfer}
          toId={dialog.toId}
          amount={dialog.amount}
          onClose={close}
          onDone={notify}
        />
      ) : null}
      {dialog?.kind === "plan" ? (
        <PlanEditor onClose={close} onDone={notify} />
      ) : null}
      {dialog?.kind === "transaction" ? (
        <TransactionEditor
          transaction={dialog.transaction}
          draft={dialog.draft}
          onClose={close}
          onDone={notify}
          onDelete={(t) => setDialog({ kind: "delete", transaction: t })}
        />
      ) : null}
      {dialog?.kind === "savings" ? (
        <SavingsEditor month={dialog.month} onClose={close} onDone={notify} />
      ) : null}
      {dialog?.kind === "budget" ? (
        <BudgetEditor
          category={dialog.category}
          month={month}
          onClose={close}
          onDone={notify}
        />
      ) : null}
      {dialog?.kind === "categories" ? (
        <CategoryManager onClose={close} onDone={notify} />
      ) : null}
      {dialog?.kind === "category" ? (
        <CategoryEditor onClose={close} onDone={notify} />
      ) : null}
      {dialog?.kind === "import" ? (
        <ImportEditor
          text={dialog.text}
          result={dialog.result}
          onClose={close}
          onDone={notify}
        />
      ) : null}
      {dialog?.kind === "delete" || dialog?.kind === "fresh" ? (
        <Sheet
          title={
            dialog.kind === "delete"
              ? "Bu işlem silinsin mi?"
              : "Kendi bütçene geç"
          }
          subtitle={
            dialog.kind === "delete"
              ? "Bu işlem geri alınamaz."
              : "Boş bir bütçe ile başla."
          }
          onClose={close}
        >
          <Txt style={{ color: C.muted, marginVertical: 18 }}>
            {dialog.kind === "delete"
              ? `${dialog.transaction.description || "Seçili işlem"} · ${money(dialog.transaction.amount)} tutarındaki kayıt hesabından silinecek.`
              : `Bu moddaki ${data.transactions.length} işlem, özel kategoriler, bütçe limitleri ve tasarruf hedefleri kaldırılacak. Eklediğin kayıtlar varsa onlar da silinir; önce CSV dışa aktarabilirsin. CSV yalnızca işlemleri taşır.`}
          </Txt>
          <ErrorText message={confirmError} />
          <Button
            kind="danger"
            icon="trash-2"
            busy={confirmBusy}
            onPress={confirm}
          >
            {dialog.kind === "delete"
              ? "Evet, işlemi sil"
              : "Kayıtları kaldır ve boş başla"}
          </Button>
          <Button
            kind="secondary"
            onPress={close}
            style={{ marginTop: 10 }}
            disabled={confirmBusy}
          >
            Vazgeç
          </Button>
        </Sheet>
      ) : null}
    </View>
  );
}
