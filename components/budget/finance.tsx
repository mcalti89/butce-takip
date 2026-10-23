import { ExchangeDetails } from "./exchange";
import { EntryTypeSelector } from "./entry-type";
import { compareDatedRecordsNewestFirst } from "@/lib/budget/time";
import { AccountActivitySheet } from "./account-activity";
import { currencyScale } from "@/lib/budget/currency";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  id,
  monthLabel,
  moneyIn,
  parseAmount,
  today,
  validDate,
  validTime,
  localTime,
  type TransactionType,
} from "@/lib/budget/model";
import {
  accountBalance,
  cardDates,
  deleteTransfer,
  monthlyDate,
  paymentOccurrences,
  pendingInstallments,
  saveFinancialAccount,
  saveTransfer,
  setAccountArchived,
  type AccountTransfer,
  type FinancialAccount,
  type PaymentPlan,
  type PaymentOccurrence,
} from "@/lib/budget/finance";
import { Button, C, Card, ErrorText, Field, Icon, Sheet, Txt } from "./ui";
const kindNames = { cash: "Nakit", bank: "Banka", card: "Kredi kartı" };
function Choice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      small
      style={{ maxWidth: "100%" }}
      kind={selected ? "secondary" : "ghost"}
      onPress={onPress}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}
function Choices({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
        marginBottom: 16,
      }}
    >
      {children}
    </View>
  );
}
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Txt
      style={{ color: C.muted, fontSize: 12, lineHeight: 19, marginBottom: 16 }}
    >
      {children}
    </Txt>
  );
}
function balanceInput(s: string, currency: string) {
  const negative = s.trim().startsWith("-");
  const value = s.trim().replace(/^[-+]/, "");
  if (/^0([.,]0{1,3})?$/.test(value)) return 0;
  const n = parseAmount(value, currency);
  return negative ? -n : n;
}
export function AccountEditor({
  account,
  onClose,
  onDone,
}: {
  account?: FinancialAccount;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<FinancialAccount["kind"]>(
    account?.kind ?? "bank",
  );
  const [currency, setCurrency] = useState(account?.currency ?? "TRY");
  const [opening, setOpening] = useState(
    String(
      account
        ? account.kind === "card"
          ? -account.openingBalance
          : account.openingBalance
        : 0,
    ),
  );
  const [date, setDate] = useState(account?.openingDate ?? today());
  const [limit, setLimit] = useState(String(account?.creditLimit ?? ""));
  const [closing, setClosing] = useState(String(account?.statementDay ?? 15));
  const [payment, setPayment] = useState(String(account?.paymentDay ?? 25));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const used =
    !!account &&
    (data.transactions.some((t) => t.accountId === account.id) ||
      (data.accountTransfers ?? []).some(
        (t) => t.fromId === account.id || t.toId === account.id,
      ) ||
      (data.paymentPlans ?? []).some((p) => p.accountId === account.id));
  async function save() {
    setError("");
    const n = balanceInput(opening, currency),
      l = parseAmount(limit, currency),
      sd = Number(closing),
      pd = Number(payment);
    if (
      !name.trim() ||
      name.trim().length > 80 ||
      !Number.isFinite(n) ||
      !validDate(date) ||
      date > today()
    )
      return setError(
        "Ad, geçerli açılış bakiyesi ve bugünü geçmeyen bir başlangıç tarihi gir.",
      );
    if (
      kind === "card" &&
      (!Number.isFinite(l) ||
        !Number.isInteger(sd) ||
        sd < 1 ||
        sd > 31 ||
        !Number.isInteger(pd) ||
        pd < 1 ||
        pd > 31)
    )
      return setError(
        "Kart limiti pozitif olmalı; kesim ve son ödeme günü 1–31 arasında olmalı.",
      );
    const entry: FinancialAccount = {
      id: account?.id ?? id(),
      name: name.trim(),
      kind,
      currency,
      openingBalance: kind === "card" ? -n : n,
      openingDate: date,
      archived: account?.archived ?? false,
      ...(kind === "card"
        ? { creditLimit: l, statementDay: sd, paymentDay: pd }
        : {}),
    };
    setBusy(true);
    try {
      await update((d) => saveFinancialAccount(d, entry));
      onDone("Hesap kaydedildi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={account ? "Hesabı düzenle" : "Yeni hesap"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Field
        label="Hesap adı"
        placeholder="Örn. Maaş hesabım"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Choices>
        {(["cash", "bank", "card"] as const).map((k) => (
          <Choice
            key={k}
            label={kindNames[k]}
            selected={kind === k}
            disabled={used}
            onPress={() => setKind(k)}
          />
        ))}
      </Choices>
      <Txt bold>Para birimi</Txt>
      <Choices>
        {[
          ...new Set([
            "TRY",
            "USD",
            "EUR",
            "GBP",
            "OMR",
            ...(data.trackedCurrencies ?? []),
            currency,
          ]),
        ].map((c) => (
          <Choice
            key={c}
            label={c}
            selected={currency === c}
            disabled={used}
            onPress={() => setCurrency(c)}
          />
        ))}
      </Choices>
      <Field
        label="Takibe başlama tarihi"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
      />
      <Field
        label={
          kind === "card"
            ? `Başlangıçta işlenmiş kart borcu (${currency})`
            : `Açılış bakiyesi (${currency})`
        }
        value={opening}
        onChangeText={setOpening}
        keyboardType="numbers-and-punctuation"
      />
      <Caption>
        {kind === "card"
          ? "Borcu pozitif, karttaki alacak bakiyesini negatif gir."
          : "Eksi bakiye girilebilir."}{" "}
        Başlangıç, seçtiğin günün işlemlerinden önceki bakiyedir. Eski işlemler
        otomatik olarak bu hesaba atanmaz.
      </Caption>
      {kind === "card" ? (
        <>
          <Caption>
            Ayrıca planlayacağın henüz işlenmemiş taksitleri başlangıç borcuna
            tekrar ekleme.
          </Caption>
          <Field
            label={`Kart limiti (${currency})`}
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
          />
          <Field
            label="Ekstre kesim günü (1–31)"
            value={closing}
            onChangeText={setClosing}
            keyboardType="number-pad"
          />
          <Field
            label="Son ödeme günü (1–31)"
            value={payment}
            onChangeText={setPayment}
            keyboardType="number-pad"
          />
          <Caption>
            Ayın olmayan günleri ayın son gününe alınır. Bu bilgiler ödeme
            takviminde hatırlatma olarak gösterilir.
          </Caption>
        </>
      ) : null}
      {used ? (
        <Caption>
          İşlem bağlı hesabın türü ve para birimi sabittir. Tarih değişikliği
          mevcut işlemleri geçersiz kılamaz.
        </Caption>
      ) : null}
      <ErrorText message={error} />
      <Button busy={busy} onPress={() => void save()}>
        Hesabı kaydet
      </Button>
    </Sheet>
  );
}
export function TransferEditor({
  transfer,
  draft,
  onTypeChange,
  toId,
  amount,
  onClose,
  onDone,
}: {
  transfer?: AccountTransfer;
  draft?: Partial<AccountTransfer>;
  onTypeChange?: (type: TransactionType) => void;
  toId?: string;
  amount?: number;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const accounts = (data.financialAccounts ?? []).filter((a) => !a.archived);
  const [from, setFrom] = useState(
    transfer?.fromId ??
      draft?.fromId ??
      accounts.find(
        (a) =>
          a.id !== toId &&
          a.kind !== "card" &&
          a.currency === accounts.find((a) => a.id === toId)?.currency,
      )?.id ??
      accounts.find((a) => a.id !== toId)?.id ??
      "",
  );
  const [to, setTo] = useState(transfer?.toId ?? draft?.toId ?? toId ?? "");
  const [value, setValue] = useState(
    String(transfer?.amount ?? draft?.amount ?? amount ?? ""),
  );
  const [date, setDate] = useState(transfer?.date ?? draft?.date ?? today());
  const [time, setTime] = useState(
    transfer?.time ?? (transfer ? "" : (draft?.time ?? localTime())),
  );
  const [note, setNote] = useState(transfer?.note ?? draft?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source = accounts.find((a) => a.id === from);
  async function save() {
    const n = parseAmount(value, source?.currency);
    setError("");
    if (!Number.isFinite(n) || !validDate(date) || date > today())
      return setError(
        "Pozitif tutar ve bugünü geçmeyen geçerli bir tarih gir.",
      );
    if (time.trim() && !validTime(time.trim()))
      return setError("Geçerli bir saat gir. Biçim: SS:DD (00:00–23:59).");
    setBusy(true);
    try {
      await update((d) =>
        saveTransfer(d, {
          ...(transfer ?? {}),
          id: transfer?.id ?? id(),
          fromId: from,
          toId: to,
          amount: n,
          currency: source?.currency ?? "",
          date,
          time: time.trim() || undefined,
          note: note.trim(),
        }),
      );
      onDone("Transfer kaydedildi; gelir ve gider toplamları değişmedi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={transfer ? "Transferi düzenle" : "Transfer / kart ödemesi"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {onTypeChange ? (
        <EntryTypeSelector
          value="transfer"
          onChange={(type) => {
            if (type !== "transfer") onTypeChange(type);
          }}
        />
      ) : null}
      <Caption>
        Hesaplar arası aktarım ve kart borcu ödemesi burada kaydedilir. Bu
        hareketler gelir veya gider sayılmaz. İki hesap aynı para biriminde
        olmalı.
      </Caption>
      <Txt bold>Çıkan hesap</Txt>
      <Choices>
        {accounts.map((a) => (
          <Choice
            key={a.id}
            label={`${a.name} · ${a.currency}`}
            selected={from === a.id}
            onPress={() => {
              setFrom(a.id);
              if (
                accounts.find((b) => b.id === to)?.currency !== a.currency ||
                to === a.id
              )
                setTo("");
            }}
          />
        ))}
      </Choices>
      <Txt bold>Giren hesap / kart</Txt>
      <Choices>
        {accounts
          .filter((a) => a.id !== from && a.currency === source?.currency)
          .map((a) => (
            <Choice
              key={a.id}
              label={a.name}
              selected={to === a.id}
              onPress={() => setTo(a.id)}
            />
          ))}
      </Choices>
      <Field
        label={`Tutar (${source?.currency ?? "TRY"})`}
        value={value}
        onChangeText={setValue}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />
      <Field
        label="Transfer tarihi"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="Saat · SS:DD"
        value={time}
        onChangeText={setTime}
        placeholder="14:30"
        maxLength={5}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field label="Not" value={note} onChangeText={setNote} maxLength={300} />
      <ErrorText message={error} />
      <Button busy={busy} disabled={!from || !to} onPress={() => void save()}>
        Transferi kaydet
      </Button>
    </Sheet>
  );
}
export function PlanEditor({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PaymentPlan["kind"]>("monthly");
  const [type, setType] = useState<PaymentPlan["type"]>("expense");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("3");
  const [date, setDate] = useState(today());
  const [end, setEnd] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState(
    data.categories.find((c) => c.type === "expense")?.id ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accounts = (data.financialAccounts ?? []).filter(
    (a) =>
      !a.archived &&
      a.currency === currency &&
      (kind !== "installment" || a.kind === "card"),
  );
  const categories = data.categories.filter((c) => c.type === type);
  async function save() {
    const n = parseAmount(amount, currency),
      parts = Number(count);
    setError("");
    if (
      !title.trim() ||
      !Number.isFinite(n) ||
      !validDate(date) ||
      (end && (!validDate(end) || end < date)) ||
      !categories.some((c) => c.id === categoryId)
    )
      return setError("Plan adı, tutar, geçerli tarih ve kategori seç.");
    if (
      kind === "installment" &&
      (!accountId ||
        !Number.isInteger(parts) ||
        parts < 2 ||
        parts > 120 ||
        Math.round(n * currencyScale(currency)) < parts)
    )
      return setError(
        "Taksit için bir kart ve 2–120 arasında geçerli taksit sayısı seç.",
      );
    const entry: PaymentPlan = {
      id: id(),
      title: title.trim(),
      kind,
      type: kind === "installment" ? "expense" : type,
      amount: n,
      currency,
      categoryId,
      accountId: accountId || undefined,
      startDate: date,
      ...(kind === "monthly" && end ? { endDate: end } : {}),
      ...(kind === "installment" ? { count: parts } : {}),
      archived: false,
    };
    setBusy(true);
    try {
      await update((d) => {
        if (
          entry.accountId &&
          !d.financialAccounts?.some(
            (a) => a.id === entry.accountId && !a.archived,
          )
        )
          throw new Error("Plan için aktif bir hesap seç.");
        return { ...d, paymentPlans: [...(d.paymentPlans ?? []), entry] };
      });
      onDone(
        "Plan kaydedildi. Gerçekleştiğinde takvimden işleme dönüştürebilirsin.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="Yeni ödeme / gelir planı"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Field
        label="Plan adı"
        placeholder="Örn. Kira, maaş veya telefon taksiti"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
      />
      <Choices>
        {(
          [
            ["monthly", "Her ay"],
            ["once", "Tek sefer"],
            ["installment", "Kart taksiti"],
          ] as const
        ).map(([k, n]) => (
          <Choice
            key={k}
            label={n}
            selected={kind === k}
            onPress={() => {
              setKind(k);
              setAccountId("");
              if (k === "installment") {
                setType("expense");
                setCategoryId(
                  data.categories.find((c) => c.type === "expense")?.id ?? "",
                );
              }
            }}
          />
        ))}
      </Choices>
      {kind !== "installment" ? (
        <Choices>
          {(["expense", "income"] as const).map((t) => (
            <Choice
              key={t}
              label={t === "income" ? "Gelir" : "Gider"}
              selected={type === t}
              onPress={() => {
                setType(t);
                setCategoryId(
                  data.categories.find((c) => c.type === t)?.id ?? "",
                );
              }}
            />
          ))}
        </Choices>
      ) : null}
      <Choices>
        {[
          ...new Set([
            "TRY",
            "USD",
            "EUR",
            "GBP",
            "OMR",
            ...(data.trackedCurrencies ?? []),
          ]),
        ].map((c) => (
          <Choice
            key={c}
            label={c}
            selected={currency === c}
            onPress={() => {
              setCurrency(c);
              setAccountId("");
            }}
          />
        ))}
      </Choices>
      <Field
        label={
          kind === "installment"
            ? `Toplam alışveriş tutarı (${currency})`
            : `Her seferindeki tutar (${currency})`
        }
        value={amount}
        onChangeText={setAmount}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />
      {kind === "installment" ? (
        <Field
          label="Taksit sayısı"
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
        />
      ) : null}
      <Field
        label={
          kind === "installment"
            ? "İlk taksitin işleneceği tarih"
            : "İlk gerçekleşme tarihi"
        }
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      {kind === "monthly" ? (
        <Field
          label="Bitiş tarihi (isteğe bağlı)"
          value={end}
          onChangeText={setEnd}
          placeholder="YYYY-MM-DD"
        />
      ) : null}
      <Txt bold>
        {kind === "installment" ? "Kredi kartı" : "Hesap (isteğe bağlı)"}
      </Txt>
      <Choices>
        {kind !== "installment" ? (
          <Choice
            label="Hesapsız"
            selected={!accountId}
            onPress={() => setAccountId("")}
          />
        ) : null}
        {accounts.map((a) => (
          <Choice
            key={a.id}
            label={a.name}
            selected={accountId === a.id}
            onPress={() => setAccountId(a.id)}
          />
        ))}
      </Choices>
      <Txt bold>Kategori</Txt>
      <Choices>
        {categories.map((c) => (
          <Choice
            key={c.id}
            label={c.name}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
      </Choices>
      <Caption>
        Plan oluşturmak bakiye veya gideri değiştirmez. Takvimden onayladığın
        her dönem tek işlem olur. Kart taksitleri işlendiğinde gider ve kart
        borcu oluşur; bankadan karta ödeme ayrıca transferdir. Ayın olmayan
        günleri ay sonuna alınır.
      </Caption>
      <ErrorText message={error} />
      <Button busy={busy} onPress={() => void save()}>
        Planı kaydet
      </Button>
    </Sheet>
  );
}
export function AccountsDashboard({
  onExchange,
  onAccount,
  onTransfer,
}: {
  onExchange: (transfer?: AccountTransfer) => void;
  onAccount: (a?: FinancialAccount) => void;
  onTransfer: (draft?: {
    transfer?: AccountTransfer;
    toId?: string;
    amount?: number;
  }) => void;
}) {
  const { data, update } = useBudget();
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<"accounts" | "transfers" | "exchange">(
    "accounts",
  );
  const [activityId, setActivityId] = useState<string | null>(null);
  const activityAccount = data.financialAccounts?.find(
    (a) => a.id === activityId,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AccountTransfer | null>(null);
  const all = data.financialAccounts ?? [],
    visible = all.filter((a) => showArchived || !a.archived);
  const now = today();
  const currencies = [
    ...new Set(all.filter((a) => !a.archived).map((a) => a.currency)),
  ];
  async function archive(a: FinancialAccount) {
    setBusy(true);
    setError("");
    try {
      await update((d) => setAccountArchived(d, a.id, !a.archived, now));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      {activityAccount ? (
        <AccountActivitySheet
          key={activityAccount.id}
          data={data}
          account={activityAccount}
          onClose={() => setActivityId(null)}
        />
      ) : null}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Hesaplar ve transferler"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}
      >
        {(
          [
            {
              id: "accounts",
              label: "Hesaplar & Kartlar",
              icon: "credit-card",
            },
            { id: "transfers", label: "Transferler", icon: "repeat" },
            { id: "exchange", label: "Döviz al / sat", icon: "refresh-cw" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.id }}
            aria-selected={tab === item.id}
            onPress={() => {
              setTab(item.id);
              setError("");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: tab === item.id ? C.green : C.border,
              backgroundColor: tab === item.id ? "#22C55E16" : C.panel,
            }}
          >
            <Icon
              name={item.icon}
              size={17}
              color={tab === item.id ? C.green : C.muted}
            />
            <Txt
              bold
              style={{
                color: tab === item.id ? C.green : C.muted,
                fontSize: 13,
              }}
            >
              {item.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      <ErrorText message={error} />
      {tab === "accounts" ? (
        <>
          <Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                kind="ghost"
                small
                onPress={() => setShowArchived((v) => !v)}
              >
                {showArchived
                  ? "Aktif hesapları göster"
                  : "Arşivlenenleri de göster"}
              </Button>
            </View>
            <Txt style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>
              Bakiyeler {now} tarihine kadarki atanmış işlemlerden hesaplanır.
              Hesapsız eski kayıtlar raporlarında kalır. Farklı para birimleri
              birbirine eklenmez.
            </Txt>
          </Card>
          {currencies.map((c) => {
            const accounts = all.filter((a) => !a.archived && a.currency === c);
            const assets = accounts
              .filter((a) => a.kind !== "card")
              .reduce((n, a) => n + accountBalance(data, a, now), 0);
            const cardBalance = accounts
              .filter((a) => a.kind === "card")
              .reduce((n, a) => n + accountBalance(data, a, now), 0);
            return (
              <Card key={c}>
                <Txt bold>
                  {c} · Hesap toplamı {moneyIn(assets, c)}
                </Txt>
                <Txt style={{ color: C.muted, marginTop: 6 }}>
                  Kart net borcu {moneyIn(-cardBalance, c)} · Net varlık{" "}
                  {moneyIn(assets + cardBalance, c)}
                </Txt>
              </Card>
            );
          })}
          {!visible.length ? (
            <Card>
              <Icon name="credit-card" size={26} color={C.green} />
              <Txt bold style={{ marginTop: 12 }}>
                Hesaplarını ekleyerek başla
              </Txt>
              <Txt style={{ color: C.muted, marginTop: 8 }}>
                Nakit, banka veya kredi kartı oluştur. Var olan gelir ve
                giderlerin hiçbir hesaba otomatik atanmaz.
              </Txt>
              <Button style={{ marginTop: 14 }} onPress={() => onAccount()}>
                İlk hesabını ekle
              </Button>
            </Card>
          ) : null}
          {visible.map((a) => {
            const balance = accountBalance(data, a, now);
            const pending = pendingInstallments(data, a.id);
            const dates = a.kind === "card" ? cardDates(a, now) : null;
            return (
              <Card key={a.id}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Txt bold style={{ fontSize: 18 }}>
                      {a.name}
                      {a.archived ? " · Arşivde" : ""}
                    </Txt>
                    <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
                      {kindNames[a.kind]} · {a.currency}
                    </Txt>
                  </View>
                  <Icon
                    name={
                      a.kind === "card"
                        ? "credit-card"
                        : a.kind === "cash"
                          ? "pocket"
                          : "briefcase"
                    }
                    color={C.green}
                  />
                </View>
                <Txt
                  bold
                  style={{
                    fontSize: 26,
                    marginVertical: 16,
                    color: balance < 0 ? C.red : C.green,
                  }}
                >
                  {moneyIn(a.kind === "card" ? -balance : balance, a.currency)}
                </Txt>
                {a.kind === "card" ? (
                  <>
                    <Caption>
                      Kayıtlı kart borcu. Eksi değer kartta alacak bakiyesi
                      olduğunu gösterir. Bankanın ekstre tutarı farklı olabilir.
                    </Caption>
                    <Txt style={{ color: C.muted, fontSize: 12 }}>
                      İşlenmemiş taksitler: {moneyIn(pending, a.currency)}
                    </Txt>
                    <Txt style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
                      Taksitler dahil tahmini kalan limit:{" "}
                      {moneyIn(a.creditLimit! + balance - pending, a.currency)}
                    </Txt>
                    <Txt
                      style={{
                        color: C.muted,
                        fontSize: 12,
                        marginTop: 6,
                        marginBottom: 14,
                      }}
                    >
                      Sonraki kesim: {dates!.closing} · Son ödeme:{" "}
                      {dates!.payment}
                    </Txt>
                  </>
                ) : null}
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  <Button
                    small
                    kind="secondary"
                    icon="list"
                    accessibilityLabel={`${a.name} aylık hareketleri`}
                    onPress={() => setActivityId(a.id)}
                  >
                    Aylık hareketler
                  </Button>
                  <Button
                    small
                    kind="secondary"
                    disabled={a.archived}
                    onPress={() => onAccount(a)}
                  >
                    Düzenle
                  </Button>
                  {a.kind === "card" && !a.archived ? (
                    <Button
                      small
                      disabled={balance >= 0}
                      onPress={() =>
                        onTransfer({ toId: a.id, amount: -balance })
                      }
                    >
                      Kart öde
                    </Button>
                  ) : null}
                  <Button
                    small
                    kind="ghost"
                    busy={busy}
                    onPress={() => void archive(a)}
                  >
                    {a.archived ? "Arşivden çıkar" : "Arşivle"}
                  </Button>
                </View>
              </Card>
            );
          })}
        </>
      ) : (
        <>
          <Card>
            <Button
              kind="secondary"
              icon={tab === "exchange" ? "refresh-cw" : "repeat"}
              disabled={
                tab === "exchange"
                  ? !all.some(
                      (a) =>
                        !a.archived &&
                        a.kind !== "card" &&
                        all.some(
                          (b) =>
                            !b.archived &&
                            b.kind !== "card" &&
                            b.currency !== a.currency,
                        ),
                    )
                  : all.filter((a) => !a.archived).length < 2
              }
              onPress={() => (tab === "exchange" ? onExchange() : onTransfer())}
            >
              {tab === "exchange" ? "Döviz işlemi ekle" : "Transfer / kart öde"}
            </Button>
            <Txt style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>
              {tab === "exchange"
                ? "Dövizini işlem tarihindeki TCMB kuru ile bozdur veya satın al; tutar seçtiğin hesaba aktarılır. Farklı para birimlerinde nakit/banka hesapları gerekir."
                : "Hesaplar arası transfer ve kart ödemelerini burada yönet."}{" "}
              Bu hareketler gelir veya gider sayılmaz.
            </Txt>
          </Card>
          <Card>
            <Txt bold style={{ fontSize: 18, marginBottom: 12 }}>
              {tab === "exchange"
                ? "Döviz al / sat geçmişi"
                : "Transfer geçmişi"}
            </Txt>
            {!(data.accountTransfers ?? []).some((t) =>
              tab === "exchange" ? !!t.exchange : !t.exchange,
            ) ? (
              <Txt style={{ color: C.muted }}>
                {tab === "exchange"
                  ? "Henüz döviz işlemi yok."
                  : "Henüz transfer yok."}
              </Txt>
            ) : (
              [...(data.accountTransfers ?? [])]
                .filter((t) =>
                  tab === "exchange" ? !!t.exchange : !t.exchange,
                )
                .sort(compareDatedRecordsNewestFirst)
                .slice(0, 50)
                .map((t) => (
                  <View
                    key={t.id}
                    style={{
                      borderBottomWidth: 1,
                      borderColor: C.border,
                      paddingVertical: 12,
                      gap: 6,
                    }}
                  >
                    <Txt>
                      {all.find((a) => a.id === t.fromId)?.name} →{" "}
                      {all.find((a) => a.id === t.toId)?.name}
                    </Txt>
                    <Txt style={{ color: C.muted, fontSize: 12 }}>
                      {t.date}
                      {t.time ? ` ${t.time}` : ""} ·{" "}
                      {moneyIn(t.amount, t.currency)}
                      {t.exchange
                        ? ` → ${moneyIn(t.exchange.toAmount, t.exchange.toCurrency)}`
                        : ""}
                      {t.note ? ` · ${t.note}` : ""}
                    </Txt>
                    {t.exchange ? (
                      <ExchangeDetails
                        exchange={t.exchange}
                        currency={t.currency}
                      />
                    ) : null}
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                    >
                      <Button
                        small
                        kind="ghost"
                        onPress={() =>
                          t.exchange
                            ? onExchange(t)
                            : onTransfer({ transfer: t })
                        }
                      >
                        {t.exchange
                          ? "Döviz işlemini düzenle"
                          : "Transferi düzenle"}
                      </Button>
                      <Button small kind="ghost" onPress={() => setDeleting(t)}>
                        {t.exchange ? "Döviz işlemini sil" : "Transferi sil"}
                      </Button>
                    </View>
                  </View>
                ))
            )}
          </Card>
        </>
      )}
      {deleting ? (
        <Sheet
          title={
            deleting.exchange
              ? "Döviz işlemi silinsin mi?"
              : "Transfer silinsin mi?"
          }
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <Caption>
            İki hesabın bakiyesi yeniden hesaplanır. Gelir ve gider kayıtları
            değişmez.
          </Caption>
          <ErrorText message={error} />
          <Button
            kind="danger"
            busy={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              void update((d) => deleteTransfer(d, deleting.id))
                .then(() => setDeleting(null))
                .catch((e) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            {deleting.exchange
              ? "Döviz işlemini silmeyi onayla"
              : "Transferi silmeyi onayla"}
          </Button>
        </Sheet>
      ) : null}
    </View>
  );
}
export function PaymentCalendar({
  month,
  onExecute,
  onTransfer,
}: {
  month: string;
  onExecute: (o: PaymentOccurrence) => void;
  onTransfer: (d: { toId: string; amount: number }) => void;
}) {
  const { data, update } = useBudget();
  const [showPlans, setShowPlans] = useState(false);
  const [closing, setClosing] = useState<PaymentPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const now = today();
  const from = month + "-01",
    to = monthlyDate(from, 0, 31);
  const occurrences = paymentOccurrences(data, from, to);
  const accounts = data.financialAccounts ?? [];
  const groups: Record<string, { income: number; expense: number }> = {};
  for (const o of occurrences.filter((o) => !o.transaction)) {
    const g = (groups[o.plan.currency] ??= { income: 0, expense: 0 });
    g[o.plan.type] += o.amount;
  }
  const cards = accounts
    .filter((a) => a.kind === "card" && !a.archived)
    .map((a) => ({
      a,
      date: monthlyDate(from, 0, a.paymentDay!),
      balance: accountBalance(data, a, now),
    }))
    .filter((e) => e.date >= e.a.openingDate);
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Txt bold style={{ fontSize: 18 }}>
          {monthLabel(month)} · Ödeme takvimi
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
          Planlar gerçekleşene kadar bakiyeni değiştirmez. Geciken kayıtları
          ilgili ayda görebilirsin. Bildirimler bu ekran içinde gösterilir.
        </Txt>
        {Object.entries(groups).map(([c, g]) => (
          <Txt key={c} style={{ color: C.muted, marginTop: 8, fontSize: 12 }}>
            Bekleyen gelir: {moneyIn(g.income, c)} · Bekleyen gider:{" "}
            {moneyIn(g.expense, c)}
          </Txt>
        ))}
      </Card>
      {!occurrences.length && !cards.length ? (
        <Card>
          <Txt style={{ color: C.muted }}>
            Bu ay için ödeme planı yok. “Plan ekle” ile kira, maaş, abonelik
            veya kart taksiti oluşturabilirsin.
          </Txt>
        </Card>
      ) : null}
      {occurrences.map((o) => (
        <Card key={`${o.plan.id}:${o.index}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon
              name={
                o.transaction
                  ? "check-circle"
                  : o.date < now
                    ? "alert-circle"
                    : "calendar"
              }
              color={o.transaction ? C.green : o.date < now ? C.red : C.blue}
            />
            <View style={{ flex: 1 }}>
              <Txt bold>
                {o.plan.title}
                {o.plan.kind === "installment"
                  ? ` · ${o.index + 1}/${o.plan.count}`
                  : ""}
              </Txt>
              <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
                {o.date} · {o.plan.type === "income" ? "Gelir" : "Gider"} ·{" "}
                {moneyIn(o.amount, o.plan.currency)}
              </Txt>
              <Txt
                style={{
                  color: o.transaction
                    ? C.green
                    : o.date < now
                      ? C.red
                      : C.muted,
                  fontSize: 11,
                  marginTop: 5,
                }}
              >
                {o.transaction
                  ? `İşlendi · ${o.transaction.date} · ${moneyIn(o.transaction.amount, o.plan.currency)}`
                  : o.date < now
                    ? "Gecikmiş / henüz işlenmedi"
                    : "Planlandı"}
              </Txt>
            </View>
          </View>
          {!o.transaction ? (
            <Button
              style={{ marginTop: 12 }}
              small
              kind="secondary"
              onPress={() => onExecute(o)}
            >
              İşleme dönüştür
            </Button>
          ) : null}
        </Card>
      ))}
      {cards.map(({ a, date, balance }) => (
        <Card key={`card:${a.id}`}>
          <Txt bold>{a.name} · Kart son ödeme hatırlatması</Txt>
          <Txt style={{ color: C.muted, fontSize: 12, marginTop: 7 }}>
            {date} · Bugünkü kayıtlı toplam borç{" "}
            {moneyIn(Math.max(0, -balance), a.currency)}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 11, marginVertical: 10 }}>
            Bu tutar banka ekstresi değildir; yeni dönem harcamalarını da
            içerebilir. Gerçek ödemeni transfer olarak kaydet.
          </Txt>
          <Button
            small
            kind="secondary"
            disabled={balance >= 0}
            onPress={() => onTransfer({ toId: a.id, amount: -balance })}
          >
            Kart ödemesi kaydet
          </Button>
        </Card>
      ))}
      <Card>
        <Button kind="ghost" onPress={() => setShowPlans((v) => !v)}>
          {showPlans ? "Plan listesini kapat" : "Tüm planları yönet"}
        </Button>
        {showPlans
          ? (data.paymentPlans ?? []).map((p) => (
              <View
                key={p.id}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderColor: C.border,
                  gap: 6,
                }}
              >
                <Txt bold>
                  {p.title} · {p.archived ? "Arşivde" : "Aktif"}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 12 }}>
                  {p.kind === "installment"
                    ? `${p.count} taksit · toplam `
                    : p.kind === "monthly"
                      ? "Her ay · "
                      : "Tek sefer · "}
                  {moneyIn(p.amount, p.currency)}
                </Txt>
                <Button small kind="ghost" onPress={() => setClosing(p)}>
                  {p.archived ? "Planı yeniden aç" : "Planı arşivle"}
                </Button>
              </View>
            ))
          : null}
      </Card>
      {closing ? (
        <Sheet
          title={
            closing.archived
              ? "Plan yeniden açılsın mı?"
              : "Plan arşivlensin mi?"
          }
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        >
          <Caption>
            Gerçekleşmiş işlemler korunur. Arşivlenen planın işlenmemiş
            dönemleri takvimden ve taksit tahmininden çıkarılır. Bankadaki
            taksiti veya aboneliği iptal etmez.
          </Caption>
          <ErrorText message={error} />
          <Button
            busy={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              void update((d) => {
                if (
                  closing.archived &&
                  d.financialAccounts?.some(
                    (a) => a.id === closing.accountId && a.archived,
                  )
                )
                  throw new Error("Önce bağlı hesabı arşivden çıkar.");
                return {
                  ...d,
                  paymentPlans: (d.paymentPlans ?? []).map((p) =>
                    p.id === closing.id ? { ...p, archived: !p.archived } : p,
                  ),
                };
              })
                .then(() => setClosing(null))
                .catch((e) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            Onayla
          </Button>
        </Sheet>
      ) : null}
    </View>
  );
}
