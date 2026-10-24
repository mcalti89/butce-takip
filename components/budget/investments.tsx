import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  id,
  today,
  localTime,
  validDate,
  validTime,
  parseAmount,
  moneyIn,
  monthLabel,
  shiftMonth,
} from "@/lib/budget/model";
import { accountBalance, type FinancialAccount } from "@/lib/budget/finance";
import { compareDatedRecordsNewestFirst } from "@/lib/budget/time";
import { currencyScale, minorUnits } from "@/lib/budget/currency";
import {
  investmentKindNames,
  investmentEntryNames,
  portfolioAccountSummary,
  positionSummary,
  saveInvestmentPosition,
  saveInvestmentEntry,
  deleteInvestmentEntry,
  type InvestmentPosition,
  type InvestmentEntry,
} from "@/lib/budget/investment-portfolio";
import { AccountActivitySheet } from "./account-activity";
import { Button, Card, C, Txt, Field, Sheet, ErrorText, Empty } from "./ui";
function Options({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginVertical: 12,
      }}
    >
      {children}
    </View>
  );
}
function zeroAmount(text: string, currency: string) {
  return /^0([.,]0{1,3})?$/.test(text.trim()) ? 0 : parseAmount(text, currency);
}
function percent(text: string, max: number) {
  if (!text.trim()) return undefined;
  if (!/^\d+([.,]\d{1,4})?$/.test(text.trim())) return NaN;
  const n = Number(text.replace(",", "."));
  return n >= 0 && n <= max ? n : NaN;
}
function PositionEditor({
  position,
  initialAccountId,
  onClose,
  onDone,
}: {
  position?: InvestmentPosition;
  initialAccountId?: string;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const accounts = (data.financialAccounts ?? []).filter(
    (a) => a.kind === "investment" && !a.archived,
  );
  const [accountId, setAccount] = useState(
    position?.accountId ?? initialAccountId ?? accounts[0]?.id ?? "",
  );
  const account = accounts.find((a) => a.id === accountId);
  const [name, setName] = useState(position?.name ?? ""),
    [kind, setKind] = useState<InvestmentPosition["kind"]>(
      position?.kind ?? "deposit",
    ),
    [date, setDate] = useState(position?.startDate ?? today()),
    [amount, setAmount] = useState("");
  const [maturity, setMaturity] = useState(position?.maturityDate ?? ""),
    [rate, setRate] = useState(String(position?.annualRate ?? "")),
    [tax, setTax] = useState(String(position?.withholdingRate ?? ""));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const used =
    !!position &&
    data.investmentEntries?.some((e) => e.positionId === position.id);
  async function save() {
    setError("");
    try {
      const annualRate = percent(rate, 1000),
        withholdingRate = percent(tax, 100),
        initial = amount.trim() ? parseAmount(amount, account?.currency) : 0;
      if (
        !account ||
        !name.trim() ||
        !validDate(date) ||
        date > today() ||
        date < account.openingDate ||
        !Number.isFinite(initial)
      )
        throw new Error(
          "Yatırım hesabı, ad, geçerli tarih ve başlangıç tutarı gir.",
        );
      if (
        kind === "deposit" &&
        ((maturity && (!validDate(maturity) || maturity < date)) ||
          (annualRate !== undefined && !Number.isFinite(annualRate)) ||
          (withholdingRate !== undefined && !Number.isFinite(withholdingRate)))
      )
        throw new Error(
          "Vade başlangıçtan önce olamaz. Faiz 0–1000, stopaj 0–100 aralığında olmalı.",
        );
      const p: InvestmentPosition = {
        id: position?.id ?? id(),
        accountId,
        currency: account.currency,
        name: name.trim(),
        kind,
        startDate: date,
        archived: position?.archived ?? false,
        ...(kind === "deposit"
          ? {
              ...(maturity ? { maturityDate: maturity } : {}),
              ...(annualRate !== undefined ? { annualRate } : {}),
              ...(withholdingRate !== undefined ? { withholdingRate } : {}),
            }
          : {}),
      };
      setBusy(true);
      await update((d) => {
        if (
          position &&
          !d.investmentPositions?.some((p) => p.id === position.id)
        )
          throw new Error("Yatırım artık bulunamıyor; son verileri yükle.");
        return saveInvestmentPosition(
          d,
          p,
          !position && initial > 0
            ? {
                id: id(),
                positionId: p.id,
                type: "allocate",
                amount: initial,
                date,
                time: localTime(),
                note: "Başlangıç anaparası",
              }
            : undefined,
        );
      });
      onDone("Yatırım kaydedildi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={position ? "Yatırımı düzenle" : "Yeni yatırım"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Txt style={{ color: C.muted, fontSize: 12 }}>
        Yatırım hesabındaki nakdi mevduat, hisse, fon veya başka bir yatırıma
        ayır. Genel bütçe etkilenmez.
      </Txt>
      <Options>
        {accounts.map((a) => (
          <Button
            key={a.id}
            small
            kind={accountId === a.id ? "secondary" : "ghost"}
            disabled={busy || !!used}
            style={{ maxWidth: "100%" }}
            onPress={() => setAccount(a.id)}
          >
            {a.name} · {a.currency}
          </Button>
        ))}
      </Options>
      <Field
        label="Yatırım adı"
        value={name}
        onChangeText={setName}
        maxLength={80}
        placeholder="Örn. Vadeli mevduat veya THYAO"
        editable={!busy}
      />
      <Options>
        {(Object.keys(investmentKindNames) as InvestmentPosition["kind"][]).map(
          (k) => (
            <Button
              key={k}
              small
              kind={kind === k ? "secondary" : "ghost"}
              disabled={busy}
              onPress={() => setKind(k)}
            >
              {investmentKindNames[k]}
            </Button>
          ),
        )}
      </Options>
      <Field
        label="Yatırım başlangıcı · YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        editable={!busy}
      />
      {!position ? (
        <Field
          label={`Başlangıç anaparası (${account?.currency ?? "—"}) · isteğe bağlı`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
          placeholder="0"
        />
      ) : null}
      {kind === "deposit" ? (
        <>
          <Field
            label="Vade sonu · YYYY-MM-DD · isteğe bağlı"
            value={maturity}
            onChangeText={setMaturity}
            editable={!busy}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Yıllık brüt faiz (%) · isteğe bağlı"
            value={rate}
            onChangeText={setRate}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <Field
            label="Stopaj (%) · isteğe bağlı"
            value={tax}
            onChangeText={setTax}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <Txt style={{ color: C.dim, fontSize: 11, marginBottom: 12 }}>
            Tahmin, mevcut anaparanın vade boyunca sabit kaldığı varsayımıyla
            gün/365 basit faiz ve girilen stopajla hesaplanır. Tahmini tutar
            kendiliğinden gelir olarak kaydedilmez.
          </Txt>
        </>
      ) : null}
      <ErrorText message={error} />
      <Button busy={busy} disabled={!account} onPress={() => void save()}>
        Yatırımı kaydet
      </Button>
    </Sheet>
  );
}
function EntryEditor({
  position,
  entry,
  onClose,
  onDone,
}: {
  position: InvestmentPosition;
  entry?: InvestmentEntry;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const [type, setType] = useState<InvestmentEntry["type"]>(
      entry?.type ?? "allocate",
    ),
    [amount, setAmount] = useState(String(entry?.amount ?? "")),
    [date, setDate] = useState(entry?.date ?? today()),
    [time, setTime] = useState(entry?.time ?? (entry ? "" : localTime())),
    [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const s = positionSummary(data, position, today());
  const account = data.financialAccounts?.find(
    (a) => a.id === position.accountId,
  );
  const available = account
    ? portfolioAccountSummary(
        data,
        account,
        accountBalance(data, account, today()),
        today(),
        today().slice(0, 7),
      ).cash
    : 0;
  async function save() {
    setError("");
    try {
      const n =
        type === "valuation"
          ? zeroAmount(amount, position.currency)
          : parseAmount(amount, position.currency);
      if (
        !Number.isFinite(n) ||
        !validDate(date) ||
        date > today() ||
        date < position.startDate ||
        (time.trim() && !validTime(time.trim()))
      )
        throw new Error(
          "Geçerli tutar, yatırım başlangıcından bugüne kadar tarih ve SS:DD biçiminde saat gir.",
        );
      setBusy(true);
      await update((d) => {
        if (entry && !d.investmentEntries?.some((e) => e.id === entry.id))
          throw new Error("Hareket artık bulunamıyor; son verileri yükle.");
        return saveInvestmentEntry(d, {
          id: entry?.id ?? id(),
          positionId: position.id,
          type,
          amount: n,
          date,
          time: time.trim() || undefined,
          note: note.trim(),
        });
      });
      onDone("Yatırım hareketi kaydedildi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={entry ? "Yatırım hareketini düzenle" : "Yatırım hareketi ekle"}
      subtitle={`${position.name} · ${position.currency}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Options>
        {(Object.keys(investmentEntryNames) as InvestmentEntry["type"][]).map(
          (k) => (
            <Button
              key={k}
              small
              kind={type === k ? "secondary" : "ghost"}
              onPress={() => setType(k)}
              disabled={busy}
            >
              {investmentEntryNames[k]}
            </Button>
          ),
        )}
      </Options>
      <Txt style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
        {type === "allocate"
          ? "Yatırım hesabındaki kullanılabilir nakitten anaparaya aktarılır; hesap toplamı değişmez."
          : type === "release"
            ? "Yalnızca geri dönen maliyet/anaparayı yaz. Satışın kârını Gerçekleşen getiri, zararını Zarar / masraf olarak ayrıca kaydet."
            : type === "income"
              ? "Hesaba gerçekten geçen net faiz, temettü veya gerçekleşen kârı yaz. Anapara dönüşü gelir değildir."
              : type === "expense"
                ? "Gerçekleşen zarar, kesinti veya masraf yatırım hesabının nakdinden düşer. Satışta önce anaparayı geri al."
                : "Yatırımın tamamının güncel piyasa değerini yaz. Değer farkı nakit geliri değildir; bakiye veya bütçeye otomatik eklenmez."}
      </Txt>
      <Txt style={{ color: C.dim, fontSize: 11, marginBottom: 12 }}>
        Kullanılabilir nakit: {moneyIn(available, position.currency)} · Kayıtlı
        anapara: {moneyIn(s.principal, position.currency)} · Güncel değer:{" "}
        {moneyIn(s.value, position.currency)}
      </Txt>
      <Field
        label={`${type === "valuation" ? "Toplam güncel değer" : "Tutar"} (${position.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Field
        label="Hareket tarihi · YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        editable={!busy}
      />
      <Field
        label="Saat · SS:DD"
        value={time}
        onChangeText={setTime}
        maxLength={5}
        editable={!busy}
      />
      <Field
        label="Not"
        value={note}
        onChangeText={setNote}
        maxLength={300}
        editable={!busy}
      />
      <ErrorText message={error} />
      <Button busy={busy} onPress={() => void save()}>
        Yatırım hareketini kaydet
      </Button>
    </Sheet>
  );
}
export function InvestmentDashboard({
  onAccount,
  onTransfer,
  onDone,
}: {
  onAccount: () => void;
  onTransfer: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const [month, setMonth] = useState(today().slice(0, 7)),
    [accountId, setAccount] = useState("all"),
    [showArchived, setShowArchived] = useState(false),
    [error, setError] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "position"; position?: InvestmentPosition }
    | { kind: "entry"; position: InvestmentPosition; entry?: InvestmentEntry }
    | null
  >(null);
  const [deleting, setDeleting] = useState<InvestmentEntry | null>(null),
    [busy, setBusy] = useState(false),
    [activity, setActivity] = useState<FinancialAccount | null>(null);
  const accounts = (data.financialAccounts ?? []).filter(
      (a) => a.kind === "investment",
    ),
    selected = accounts.filter(
      (a) => accountId === "all" || a.id === accountId,
    ),
    now = today();
  const selectedIds = new Set(selected.map((a) => a.id));
  const summaries = selected.map((a) => ({
    account: a,
    ...portfolioAccountSummary(
      data,
      a,
      accountBalance(data, a, now),
      now,
      month,
    ),
  }));
  const positions = (data.investmentPositions ?? []).filter(
    (p) => selectedIds.has(p.accountId) && (showArchived || !p.archived),
  );
  const positionIds = new Set(
    (data.investmentPositions ?? [])
      .filter((p) => selectedIds.has(p.accountId))
      .map((p) => p.id),
  );
  const entries = (data.investmentEntries ?? [])
    .filter(
      (e) =>
        positionIds.has(e.positionId) &&
        e.date.startsWith(month + "-") &&
        e.date <= now,
    )
    .sort(compareDatedRecordsNewestFirst);
  const currencies = [...new Set(selected.map((a) => a.currency))];
  async function archive(p: InvestmentPosition) {
    setError("");
    try {
      await update((d) =>
        saveInvestmentPosition(d, { ...p, archived: !p.archived }),
      );
      onDone(
        p.archived ? "Yatırım arşivden çıkarıldı." : "Yatırım arşivlendi.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Txt bold style={{ fontSize: 20 }}>
          Yatırım takibi
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
          Yatırım hesapların, ayırdığın anapara ve gerçekleşen getiriler burada.
          Bu alan günlük bütçene dahil değildir. Tutarlar hesap para
          birimindedir; farklı para birimleri toplanmaz.
        </Txt>
        <Options>
          <Button icon="plus" onPress={onAccount}>
            Yatırım hesabı ekle
          </Button>
          <Button
            kind="secondary"
            onPress={() => setDialog({ kind: "position" })}
            disabled={!accounts.some((a) => !a.archived)}
          >
            Yeni yatırım
          </Button>
          <Button kind="secondary" onPress={onTransfer}>
            Hesaba para aktar
          </Button>
        </Options>
      </Card>
      {!accounts.length ? (
        <Empty
          title="Henüz yatırım hesabın yok"
          body="Yatırım hesabı oluştur, ardından normal transferle para aktar. Yeni hesaplar boş başlar."
        />
      ) : null}
      {accounts.length ? (
        <Card>
          <Options>
            <Button
              small
              kind={accountId === "all" ? "secondary" : "ghost"}
              onPress={() => setAccount("all")}
            >
              Tüm yatırım hesapları
            </Button>
            {accounts.map((a) => (
              <Button
                key={a.id}
                small
                style={{ maxWidth: "100%" }}
                kind={accountId === a.id ? "secondary" : "ghost"}
                onPress={() => setAccount(a.id)}
              >
                {a.name} · {a.currency}
                {a.archived ? " · Arşivde" : ""}
              </Button>
            ))}
          </Options>
          <Options>
            <Button
              small
              kind="secondary"
              onPress={() => setMonth(shiftMonth(month, -1))}
            >
              Önceki ay
            </Button>
            <Txt bold>{monthLabel(month)}</Txt>
            <Button
              small
              kind="secondary"
              disabled={month >= now.slice(0, 7)}
              onPress={() => setMonth(shiftMonth(month, 1))}
            >
              Sonraki ay
            </Button>
          </Options>
          <Txt style={{ color: C.dim, fontSize: 11 }}>
            Bakiyeler {now} itibarıyla; aylık gelir ve hareketler seçili aya
            aittir.
          </Txt>
        </Card>
      ) : null}
      {currencies.map((currency) => {
        const own = summaries.filter((s) => s.account.currency === currency),
          scale = currencyScale(currency);
        const sum = (
          key:
            | "cash"
            | "principal"
            | "totalValue"
            | "monthIncome"
            | "monthExpense"
            | "monthlyNet"
            | "unrealized",
        ) => own.reduce((n, s) => n + minorUnits(s[key], currency), 0) / scale;
        return (
          <Card key={currency}>
            <Txt bold style={{ fontSize: 17 }}>
              {currency} · Yatırım özeti
            </Txt>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 12,
              }}
            >
              {[
                { label: "Kullanılabilir yatırım nakdi", value: sum("cash") },
                {
                  label: "Yatırımlara ayrılan anapara",
                  value: sum("principal"),
                },
                {
                  label: "Nakit + güncel yatırım değeri",
                  value: sum("totalValue"),
                },
                { label: "Aylık gerçekleşen gelir", value: sum("monthIncome") },
                { label: "Aylık zarar / masraf", value: sum("monthExpense") },
                { label: "Aylık net getiri", value: sum("monthlyNet") },
                {
                  label: "Gerçekleşmemiş değer farkı",
                  value: sum("unrealized"),
                },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flexBasis: "45%", flexGrow: 1, minWidth: 0 }}
                >
                  <Txt style={{ color: C.muted, fontSize: 11 }}>
                    {item.label}
                  </Txt>
                  <Txt
                    bold
                    style={{
                      color: item.value < 0 ? C.red : C.green,
                      fontSize: 18,
                    }}
                  >
                    {moneyIn(item.value, currency)}
                  </Txt>
                </View>
              ))}
            </View>
          </Card>
        );
      })}
      {currencies.map((currency) => (
        <Card key={`allocation-${currency}`}>
          <Txt bold style={{ fontSize: 18 }}>
            {currency} · Yatırım dağılımı
          </Txt>
          {(
            Object.keys(investmentKindNames) as InvestmentPosition["kind"][]
          ).map((kind) => {
            const rows = summaries
              .filter((s) => s.account.currency === currency)
              .flatMap((s) => s.rows)
              .filter((r) => r.position.kind === kind);
            const scale = currencyScale(currency),
              sum = (key: "principal" | "monthIncome") =>
                rows.reduce((n, r) => n + minorUnits(r[key], currency), 0) /
                scale;
            return (
              <View
                key={kind}
                style={{
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                }}
              >
                <Txt bold>{investmentKindNames[kind]}</Txt>
                <Txt style={{ color: C.muted, fontSize: 12 }}>
                  Anapara {moneyIn(sum("principal"), currency)} · Aylık gelir{" "}
                  {moneyIn(sum("monthIncome"), currency)}
                </Txt>
              </View>
            );
          })}
        </Card>
      ))}
      {currencies.map((currency) => (
        <Card key={`history-${currency}`}>
          <Txt bold style={{ fontSize: 18 }}>
            {currency} · Son 6 ay gerçekleşen getiri
          </Txt>
          {Array.from({ length: 6 }, (_, i) => {
            const key = shiftMonth(month, i - 5);
            const rows = (data.investmentEntries ?? []).filter(
              (e) =>
                e.date.startsWith(key + "-") &&
                e.date <= now &&
                positionIds.has(e.positionId) &&
                data.investmentPositions?.find((p) => p.id === e.positionId)
                  ?.currency === currency,
            );
            const scale = currencyScale(currency);
            const sum = (type: "income" | "expense") =>
              rows
                .filter((e) => e.type === type)
                .reduce((n, e) => n + minorUnits(e.amount, currency), 0) /
              scale;
            const income = sum("income"),
              expense = sum("expense");
            return (
              <View
                key={key}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                  gap: 4,
                }}
              >
                <Txt bold>{monthLabel(key)}</Txt>
                <Txt style={{ color: C.muted, fontSize: 12 }}>
                  Gelir {moneyIn(income, currency)} · Zarar/masraf{" "}
                  {moneyIn(expense, currency)} · Net{" "}
                  {moneyIn(
                    (minorUnits(income, currency) -
                      minorUnits(expense, currency)) /
                      scale,
                    currency,
                  )}
                </Txt>
              </View>
            );
          })}
        </Card>
      ))}
      {summaries.map((s) => (
        <Card key={s.account.id}>
          <Txt bold style={{ fontSize: 18 }}>
            {s.account.name}
            {s.account.archived ? " · Arşivde" : ""}
          </Txt>
          <Txt style={{ color: C.muted, marginTop: 7 }}>
            Kullanılabilir nakit: {moneyIn(s.cash, s.account.currency)}
          </Txt>
          <Txt style={{ color: C.muted }}>
            Ayrılmış anapara: {moneyIn(s.principal, s.account.currency)} ·
            Güncel toplam: {moneyIn(s.totalValue, s.account.currency)}
          </Txt>
          <Button small kind="ghost" onPress={() => setActivity(s.account)}>
            Hesap hareketlerini gör
          </Button>
        </Card>
      ))}
      <ErrorText message={error} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Txt bold style={{ fontSize: 20 }}>
          Yatırımlarım
        </Txt>
        <Button
          small
          kind="ghost"
          onPress={() => setShowArchived(!showArchived)}
        >
          {showArchived
            ? "Aktif yatırımları göster"
            : "Arşivlenenleri de göster"}
        </Button>
      </View>
      {!positions.length && accounts.length ? (
        <Empty
          title="Henüz yatırım kaydı yok"
          body="Mevduat, hisse, fon veya diğer yatırımını Yeni yatırım ile ekle."
        />
      ) : null}
      {positions.map((p) => {
        const s = positionSummary(data, p, now, month);
        const account = accounts.find((a) => a.id === p.accountId);
        return (
          <Card key={p.id}>
            <Txt bold style={{ fontSize: 18 }}>
              {p.name}
              {p.archived ? " · Arşivde" : ""}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {investmentKindNames[p.kind]} · {account?.name} · {p.currency}
            </Txt>
            <Txt style={{ marginTop: 12 }}>
              Anapara: {moneyIn(s.principal, p.currency)} · Güncel değer:{" "}
              {moneyIn(s.value, p.currency)}
            </Txt>
            <Txt style={{ color: C.dim, fontSize: 11 }}>
              Toplam yatırılan: {moneyIn(s.allocated, p.currency)} · Geri alınan
              anapara: {moneyIn(s.released, p.currency)}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Seçili ay net getirisi: {moneyIn(s.monthlyNet, p.currency)} ·
              Toplam getiri: {moneyIn(s.totalReturn, p.currency)}
            </Txt>
            <Txt style={{ color: C.dim, fontSize: 11 }}>
              Son değerleme:{" "}
              {s.valuationDate ?? "Girilmedi; anapara değeri kullanılır"}
            </Txt>
            {s.expectedInterest !== undefined ? (
              <Txt style={{ color: C.amber, fontSize: 12, marginTop: 10 }}>
                Vade sonu tahmini net faiz:{" "}
                {moneyIn(s.expectedInterest, p.currency)} · {p.maturityDate} ·{" "}
                {s.days} gün. Tahmindir; aylık gerçekleşen gelire eklenmez.
              </Txt>
            ) : null}
            <Options>
              <Button
                small
                disabled={p.archived || account?.archived}
                onPress={() => setDialog({ kind: "entry", position: p })}
              >
                Hareket ekle
              </Button>
              <Button
                small
                kind="secondary"
                disabled={account?.archived}
                onPress={() => setDialog({ kind: "position", position: p })}
              >
                Yatırımı düzenle
              </Button>
              <Button
                small
                kind="ghost"
                disabled={account?.archived}
                onPress={() => void archive(p)}
              >
                {p.archived ? "Yatırımı arşivden çıkar" : "Yatırımı arşivle"}
              </Button>
            </Options>
          </Card>
        );
      })}
      <Card>
        <Txt bold style={{ fontSize: 18 }}>
          Aylık yatırım hareketleri · {entries.length}
        </Txt>
        <Txt style={{ color: C.dim, fontSize: 11, marginVertical: 10 }}>
          Anapara çekimi gelir değildir. Güncel değer, yatırımların toplam
          piyasa değeridir; gerçekleşen gelirden ayrı izlenir.
        </Txt>
        {entries.length ? (
          entries.map((e) => {
            const p = data.investmentPositions?.find(
              (p) => p.id === e.positionId,
            );
            if (!p) return null;
            return (
              <View
                key={e.id}
                testID={`investment-entry-${e.id}`}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                  gap: 5,
                }}
              >
                <Txt bold>
                  {p.name} · {investmentEntryNames[e.type]}
                </Txt>
                <Txt
                  style={{
                    color:
                      e.type === "income"
                        ? C.green
                        : e.type === "expense"
                          ? C.red
                          : C.text,
                  }}
                >
                  {moneyIn(e.amount, p.currency)}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  {e.date} · {e.time ?? "Saat belirtilmedi"}
                  {e.note ? ` · ${e.note}` : ""}
                </Txt>
                <Options>
                  <Button
                    small
                    kind="ghost"
                    disabled={
                      p.archived ||
                      accounts.find((a) => a.id === p.accountId)?.archived
                    }
                    onPress={() =>
                      setDialog({ kind: "entry", position: p, entry: e })
                    }
                  >
                    Yatırım hareketini düzenle
                  </Button>
                  <Button
                    small
                    kind="ghost"
                    disabled={
                      p.archived ||
                      accounts.find((a) => a.id === p.accountId)?.archived
                    }
                    onPress={() => setDeleting(e)}
                  >
                    Yatırım hareketini sil
                  </Button>
                </Options>
              </View>
            );
          })
        ) : (
          <Txt style={{ color: C.muted }}>
            Seçili ayda yatırım hareketi yok.
          </Txt>
        )}
      </Card>
      {dialog?.kind === "position" ? (
        <PositionEditor
          position={dialog.position}
          initialAccountId={accountId === "all" ? undefined : accountId}
          onClose={() => setDialog(null)}
          onDone={onDone}
        />
      ) : null}
      {dialog?.kind === "entry" ? (
        <EntryEditor
          position={dialog.position}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onDone={onDone}
        />
      ) : null}
      {activity ? (
        <AccountActivitySheet
          data={data}
          account={activity}
          onClose={() => setActivity(null)}
        />
      ) : null}
      {deleting ? (
        <Sheet
          title="Yatırım hareketi silinsin mi?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <Txt style={{ color: C.muted, marginBottom: 12 }}>
            Anapara, getiri ve hesap bakiyesi yeniden hesaplanır. Sonraki
            kayıtlar geçersiz olacaksa silme yapılmaz.
          </Txt>
          <ErrorText message={error} />
          <Button
            kind="danger"
            busy={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              void update((d) => deleteInvestmentEntry(d, deleting.id))
                .then(() => {
                  setDeleting(null);
                  onDone("Yatırım hareketi silindi.");
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Yatırım hareketini silmeyi onayla
          </Button>
        </Sheet>
      ) : null}
    </View>
  );
}
