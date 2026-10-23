import { currencyDigits } from "@/lib/budget/currency";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Category,
  PALETTE,
  Transaction,
  TransactionType,
  id,
  money,
  moneyIn,
  monthLabel,
  parseAmount,
  today,
  validDate,
  validTime,
  localTime,
} from "@/lib/budget/model";
import {
  DEFAULT_TRACKED_CURRENCIES,
  rateSourceLabel,
  FxCurrencyCode,
  FxQuote,
  convertToTry,
  quoteForTransaction,
} from "@/lib/budget/fx";
import { fetchFxRate, isFxApiConfigured } from "@/lib/budget/fxApi";
import { useBudget } from "@/lib/budget/store";
import { importCSV, ImportResult } from "@/lib/budget/csv";
import { Button, C, ErrorText, Field, Icon, Sheet, Txt, styles } from "./ui";
export function TransactionEditor({
  transaction,
  draft,
  onClose,
  onDone,
  onDelete,
}: {
  transaction?: Transaction;
  draft?: Partial<Transaction>;
  onClose: () => void;
  onDone: (message: string) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const { data, update } = useBudget();
  const initial = transaction ?? draft;
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [type, setType] = useState<TransactionType>(initial?.type || "expense");
  const [amount, setAmount] = useState(
    initial?.amount !== undefined
      ? String(initial.amount).replace(".", ",")
      : "",
  );
  const [date, setDate] = useState(initial?.date || today());
  const [time, setTime] = useState(
    initial?.time ?? (transaction ? "" : localTime()),
  );
  const [description, setDescription] = useState(initial?.description || "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ||
      data.categories.find((c) => c.type === "expense")?.id ||
      "",
  );
  const [currency, setCurrency] = useState(initial?.currency || "TRY");
  const [quotePreview, setQuotePreview] = useState<FxQuote | null>(null);
  const [quotePreviewRequestedDate, setQuotePreviewRequestedDate] =
    useState("");
  const [quoteError, setQuoteError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const categories = data.categories.filter((c) => c.type === type);
  const previewSide = type === "income" ? "buying" : "selling";
  const previewRate =
    type === "income" ? quotePreview?.forexBuying : quotePreview?.forexSelling;
  const previewAmount = parseAmount(amount, currency);
  const previewTry =
    quotePreview &&
    quotePreview.currency === currency &&
    quotePreviewRequestedDate === date &&
    Number.isFinite(previewAmount) &&
    previewRate !== null &&
    previewRate !== undefined &&
    previewRate > 0
      ? convertToTry(previewAmount, quotePreview, previewSide)
      : null;
  useEffect(() => {
    let active = true;
    if (
      currency === "TRY" ||
      !validDate(date) ||
      date > today() ||
      !isFxApiConfigured()
    )
      return;
    void fetchFxRate(currency as FxCurrencyCode, date)
      .then((result) => {
        if (active) {
          setQuotePreview(result.rate);
          setQuotePreviewRequestedDate(date);
          setQuoteError(null);
        }
      })
      .catch((err: Error) => {
        if (active) {
          setQuoteError({ key: `${currency}:${date}`, message: err.message });
        }
      });
    return () => {
      active = false;
    };
  }, [currency, date]);
  const changeType = (next: TransactionType) => {
    setType(next);
    setCategoryId(data.categories.find((c) => c.type === next)?.id || "");
  };
  const save = async () => {
    const value = parseAmount(amount, currency);
    if (!Number.isFinite(value)) {
      setError(
        `0’dan büyük, en fazla ${currencyDigits(currency)} ondalıklı bir tutar gir. Örnek: ${currency === "OMR" ? "2,750 OMR" : "450,50"}`,
      );
      return;
    }
    if (!validDate(date)) {
      setError("Geçerli bir tarih gir. Biçim: YYYY-MM-DD");
      return;
    }
    if (time.trim() && !validTime(time.trim()))
      return setError(
        "Geçerli bir saat gir. Biçim: SS:DD (00:00–23:59). Saati bilmiyorsan boş bırak.",
      );
    if ((currency !== "TRY" || initial?.planId) && date > today()) {
      setError("Döviz kuru gelecekteki bir işlem tarihi için kullanılamaz.");
      return;
    }
    if (!categories.some((c) => c.id === categoryId)) {
      setError(
        "Bir kategori seç. Veriler sekmesinden yeni kategori de ekleyebilirsin.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const unchangedQuote =
        transaction &&
        transaction.currency === currency &&
        transaction.type === type &&
        transaction.date === date &&
        transaction.amount === value &&
        transaction.baseAmount !== undefined &&
        transaction.fxRate !== undefined &&
        transaction.fxUnit !== undefined &&
        transaction.fxDate !== undefined &&
        transaction.fxSide !== undefined;
      let fxSnapshot = {};
      let baseAmount = value;
      if (currency !== "TRY") {
        if (unchangedQuote) {
          fxSnapshot = {
            baseAmount: transaction.baseAmount,
            fxRate: transaction.fxRate,
            fxUnit: transaction.fxUnit,
            fxDate: transaction.fxDate,
            fxSide: transaction.fxSide,
          };
          baseAmount = transaction.baseAmount!;
        } else {
          const result =
            quotePreview &&
            quotePreviewRequestedDate === date &&
            quotePreview.currency === currency &&
            quotePreview.date <= date
              ? { rate: quotePreview }
              : await fetchFxRate(currency as FxCurrencyCode, date);
          const quoteInfo = quoteForTransaction(type, result.rate);
          const rate =
            type === "income"
              ? result.rate.forexBuying
              : result.rate.forexSelling;
          if (rate === null) throw new Error("Bu tarih için TCMB kuru boş.");
          fxSnapshot = {
            baseAmount:
              Math.round(((value * rate) / result.rate.unit) * 100) / 100,
            ...quoteInfo,
          };
          baseAmount = Number(
            (fxSnapshot as { baseAmount: number }).baseAmount,
          );
        }
      }
      const entry: Transaction = {
        ...(transaction ?? {}),
        ...(initial?.planId
          ? { planId: initial.planId, planIndex: initial.planIndex }
          : {}),
        accountId: accountId || undefined,
        id: transaction?.id || id(),
        type,
        amount: value,
        date,
        time: time.trim() || undefined,
        categoryId,
        description: description.trim(),
        currency,
        ...fxSnapshot,
        ...(currency === "TRY" ? { baseAmount } : {}),
      };
      await update((d) => {
        const account = accountId
          ? d.financialAccounts?.find((a) => a.id === accountId)
          : undefined;
        if (
          accountId &&
          (!account ||
            account.currency !== currency ||
            date < account.openingDate ||
            account.archived)
        )
          throw new Error(
            "İşlem için aynı para biriminde bir hesap ve takip başlangıcından sonraki bir tarih seç.",
          );
        if (
          transaction?.accountId &&
          d.financialAccounts?.some(
            (a) => a.id === transaction.accountId && a.archived,
          )
        )
          throw new Error("Düzenlemeden önce bağlı hesabı arşivden çıkar.");
        if (transaction && !d.transactions.some((t) => t.id === transaction.id))
          throw new Error("İşlem artık bulunamıyor; son verileri yükle.");
        if (!transaction && initial?.planId) {
          if (
            !d.paymentPlans?.some((p) => p.id === initial.planId && !p.archived)
          )
            throw new Error("Bu plan kapatılmış veya artık bulunamıyor.");
          if (
            d.transactions.some(
              (t) =>
                t.planId === initial.planId &&
                t.planIndex === initial.planIndex,
            )
          )
            throw new Error("Bu dönem zaten işleme dönüştürülmüş.");
        }
        return {
          ...d,
          transactions: transaction
            ? d.transactions.map((t) => (t.id === entry.id ? entry : t))
            : [...d.transactions, entry],
        };
      });
      onDone(
        currency === "TRY"
          ? transaction
            ? "İşlem güncellendi."
            : "İşlem hesabına kaydedildi."
          : `İşlem ${money(baseAmount)} TRY karşılığıyla hesabına kaydedildi.`,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={transaction ? "İşlemi düzenle" : "Yeni işlem"}
      subtitle="Küçük kayıtlar, büyük bir netlik."
      onClose={onClose}
    >
      <View
        style={{
          flexDirection: "row",
          backgroundColor: C.bg,
          borderRadius: 11,
          padding: 4,
          gap: 4,
          marginBottom: 22,
        }}
      >
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            disabled={!!initial?.planId}
            onPress={() => changeType(t)}
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              padding: 12,
              borderRadius: 8,
              backgroundColor: type === t ? C.elevated : "transparent",
            }}
          >
            <Icon
              name={t === "expense" ? "arrow-up-right" : "arrow-down-left"}
              color={type === t ? (t === "expense" ? C.red : C.green) : C.dim}
              size={17}
            />
            <Txt bold style={{ color: type === t ? C.text : C.dim }}>
              {t === "expense" ? "Gider" : "Gelir"}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Field
        label={`Tutar (${currency})`}
        value={amount}
        onChangeText={setAmount}
        placeholder={currency === "OMR" ? "0,000" : "0,00"}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={20}
        style={{ fontSize: 30, minHeight: 72 }}
      />
      <Txt
        style={{
          color: C.muted,
          fontSize: 11,
          marginTop: -13,
          marginBottom: 14,
        }}
      >
        Tutar para birimi
      </Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 7,
          marginBottom: 15,
        }}
      >
        {[
          ...new Set([
            "TRY",
            "OMR",
            ...(data.trackedCurrencies ?? DEFAULT_TRACKED_CURRENCIES),
            currency,
          ]),
        ].map((code) => {
          const active = currency === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              disabled={!!initial?.planId}
              onPress={() => {
                setCurrency(code);
                if (
                  data.financialAccounts?.find((a) => a.id === accountId)
                    ?.currency !== code
                )
                  setAccountId("");
              }}
              style={{
                borderWidth: 1,
                borderColor: active ? C.green : C.border,
                backgroundColor: active ? "#13281F" : C.bg,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Txt
                bold={active}
                style={{ color: active ? C.green : C.muted, fontSize: 11 }}
              >
                {code}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {currency === "OMR" ? (
        <Txt style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
          1 OMR = 1.000 baisa. Üç ondalık basamak kullanabilirsin. TL karşılığı
          TCMB USD kuru / 0,3845 ile hesaplanır; banka veya kartının gerçek kuru
          farklı olabilir.
        </Txt>
      ) : null}
      {currency !== "TRY" ? (
        <Txt
          style={{
            color: isFxApiConfigured() ? C.muted : C.amber,
            fontSize: 10,
            lineHeight: 16,
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          {isFxApiConfigured()
            ? `${type === "income" ? "Döviz alış" : "Döviz satış"} kuruyla çevrilecek; bülten tarihi işlem gününden önce olabilir.`
            : "Kur API'si bağlanınca yabancı para işlemleri kaydedilebilir. Kur sunucusu henüz yapılandırılmadı."}
        </Txt>
      ) : null}
      {currency !== "TRY" &&
      quotePreview &&
      quotePreview.currency === currency &&
      quotePreviewRequestedDate === date ? (
        <View
          style={{
            backgroundColor: C.bg,
            borderRadius: 8,
            padding: 11,
            marginTop: -7,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Txt style={{ color: C.muted, fontSize: 10 }}>
            {rateSourceLabel(currency)} {quotePreview.date} ·{" "}
            {type === "income" ? "döviz alış" : "döviz satış"} ·{" "}
            {quotePreview.unit} {currency} ={" "}
            {money(
              type === "income"
                ? quotePreview.forexBuying || 0
                : quotePreview.forexSelling || 0,
            )}
          </Txt>
          {previewTry !== null ? (
            <Txt bold style={{ color: C.green, fontSize: 12, marginTop: 4 }}>
              Yaklaşık TRY karşılığı: {money(previewTry)}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {currency !== "TRY" && quoteError?.key === `${currency}:${date}` ? (
        <Txt
          style={{
            color: C.amber,
            fontSize: 10,
            lineHeight: 16,
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          {quoteError.message}
        </Txt>
      ) : currency !== "TRY" && date > today() ? (
        <Txt
          style={{
            color: C.amber,
            fontSize: 10,
            lineHeight: 16,
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          TCMB kuru gelecekteki tarihler için yayımlanmadı.
        </Txt>
      ) : null}
      <Txt bold style={{ fontSize: 13, marginBottom: 10 }}>
        Hesap
      </Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 18,
        }}
      >
        <Button
          small
          kind={!accountId ? "secondary" : "ghost"}
          onPress={() => setAccountId("")}
          disabled={
            !!initial?.planId &&
            data.paymentPlans?.find((p) => p.id === initial.planId)?.kind ===
              "installment"
          }
        >
          Hesapsız
        </Button>
        {(data.financialAccounts ?? [])
          .filter(
            (a) =>
              a.currency === currency &&
              (!a.archived || a.id === initial?.accountId),
          )
          .map((a) => (
            <Button
              key={a.id}
              small
              kind={accountId === a.id ? "secondary" : "ghost"}
              style={{ maxWidth: "100%" }}
              onPress={() => setAccountId(a.id)}
              disabled={
                !!initial?.planId &&
                data.paymentPlans?.find((p) => p.id === initial.planId)
                  ?.kind === "installment" &&
                a.id !== initial.accountId
              }
            >
              {a.name}
            </Button>
          ))}
      </View>
      {initial?.planId ? (
        <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>
          Planlı dönem kaydediliyor. Aynı dönem ikinci kez işlenemez. İşlemi
          silmek, aktif plandaki dönemi yeniden bekleyen duruma getirir.
        </Txt>
      ) : null}
      <Txt bold style={{ fontSize: 13, marginBottom: 10 }}>
        Kategori
      </Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {categories.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => setCategoryId(c.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: categoryId === c.id ? c.color : C.border,
              borderRadius: 8,
              paddingHorizontal: 11,
              paddingVertical: 10,
              backgroundColor: categoryId === c.id ? `${c.color}16` : C.bg,
            }}
          >
            <Icon name={c.icon} size={15} color={c.color} />
            <Txt
              style={{
                fontSize: 12,
                color: categoryId === c.id ? C.text : C.muted,
              }}
            >
              {c.name}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Field
        label="Tarih · YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        placeholder="2026-10-16"
        maxLength={10}
        autoCapitalize="none"
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
      <Txt
        style={{ color: C.dim, fontSize: 11, marginTop: -10, marginBottom: 18 }}
      >
        24 saat biçimi, cihazının yerel saati. Saati bilinmeyen kayıtlar boş
        bırakılabilir.
      </Txt>
      <Field
        label="Açıklama (isteğe bağlı)"
        value={description}
        onChangeText={setDescription}
        placeholder="Örn. haftalık market alışverişi"
        maxLength={300}
      />
      <ErrorText message={error} />
      <Button onPress={save} busy={busy} icon="check">
        {transaction ? "Değişiklikleri kaydet" : "İşlemi kaydet"}
      </Button>
      {transaction ? (
        <Button
          kind="danger"
          onPress={() => onDelete(transaction)}
          icon="trash-2"
          style={{ marginTop: 10 }}
        >
          İşlemi sil
        </Button>
      ) : null}
    </Sheet>
  );
}
export function BudgetEditor({
  category,
  month,
  onClose,
  onDone,
}: {
  category: Category;
  month: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { data, update } = useBudget();
  const current = data.budgets[month]?.[category.id];
  const [amount, setAmount] = useState(
    current === undefined ? "" : String(current).replace(".", ","),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (remove = false) => {
    const value = /^0([,.]0{1,2})?$/.test(amount.trim())
      ? 0
      : parseAmount(amount);
    if (!remove && !Number.isFinite(value)) {
      setError("Sıfır veya pozitif bir bütçe tutarı gir.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await update((d) => {
        const budgets = { ...d.budgets[month] };
        if (remove) delete budgets[category.id];
        else budgets[category.id] = value;
        return { ...d, budgets: { ...d.budgets, [month]: budgets } };
      });
      onDone(
        remove ? "Kategori bütçesi kaldırıldı." : "Aylık bütçe kaydedildi.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`${category.name} bütçesi`}
      subtitle={`${monthLabel(month)} · Bu limit yalnızca seçili ay için geçerli.`}
      onClose={onClose}
    >
      <View style={{ alignItems: "center", marginVertical: 16 }}>
        <View
          style={{
            backgroundColor: `${category.color}15`,
            padding: 18,
            borderRadius: 16,
          }}
        >
          <Icon name={category.icon} size={30} color={category.color} />
        </View>
      </View>
      <Field
        label="Aylık limit (₺)"
        placeholder="Örn. 2.000 yerine 2000"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={20}
      />
      <ErrorText message={error} />
      <Button icon="check" busy={busy} onPress={() => save()}>
        Bütçeyi kaydet
      </Button>
      {current !== undefined ? (
        <Button
          kind="ghost"
          onPress={() => save(true)}
          disabled={busy}
          style={{ marginTop: 10 }}
        >
          Bu ayın limitini kaldır
        </Button>
      ) : null}
    </Sheet>
  );
}
export function CategoryEditor({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { data, update } = useBudget();
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Kategori adına ihtiyacımız var.");
      return;
    }
    if (
      data.categories.some(
        (c) =>
          c.type === type &&
          c.name.toLocaleLowerCase("tr-TR") ===
            trimmed.toLocaleLowerCase("tr-TR"),
      )
    ) {
      setError("Bu isimde bir kategori zaten var.");
      return;
    }
    setBusy(true);
    try {
      await update((d) => ({
        ...d,
        categories: [
          ...d.categories,
          {
            id: id(),
            name: trimmed,
            type,
            color,
            icon: type === "income" ? "briefcase" : "tag",
          },
        ],
      }));
      onDone("Yeni kategori eklendi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Yeni kategori"
      subtitle="Bütçeni kendi hayatına göre düzenle."
      onClose={onClose}
    >
      <Field
        label="Kategori adı"
        value={name}
        onChangeText={setName}
        placeholder="Örn. Eğitim"
        maxLength={40}
      />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <Button
            key={t}
            kind={type === t ? "primary" : "secondary"}
            onPress={() => setType(t)}
            style={{ flex: 1 }}
          >
            {t === "expense" ? "Gider kategorisi" : "Gelir kategorisi"}
          </Button>
        ))}
      </View>
      <Txt bold style={{ marginBottom: 10 }}>
        Kategori rengi
      </Txt>
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={`${c} renk seç`}
            onPress={() => setColor(c)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: color === c ? C.text : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {color === c ? <Icon name="check" size={17} color={C.bg} /> : null}
          </Pressable>
        ))}
      </View>
      <ErrorText message={error} />
      <Button busy={busy} icon="plus" onPress={save}>
        Kategoriyi ekle
      </Button>
    </Sheet>
  );
}
export function ImportEditor({
  text,
  result,
  onClose,
  onDone,
}: {
  text: string;
  result: ImportResult;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { update } = useBudget();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      let added = 0;
      let skipped = 0;
      await update((d) => {
        const fresh = importCSV(text, d);
        added = fresh.transactions.length;
        skipped = fresh.skipped;
        return {
          ...d,
          categories: fresh.categories,
          transactions: [...d.transactions, ...fresh.transactions],
        };
      });
      onDone(
        `${added} işlem içe aktarıldı.${skipped ? ` ${skipped} tekrar atlandı.` : ""}`,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="CSV önizlemesi"
      subtitle="Onayından önce hiçbir kayıt değişmez."
      onClose={onClose}
    >
      <View style={{ flexDirection: "row", gap: 12, paddingVertical: 20 }}>
        {[
          [result.transactions.length, "Geçerli", C.green],
          [result.skipped, "Tekrar", C.muted],
          [result.errors.length, "Hatalı", C.red],
        ].map(([n, label, color]) => (
          <View
            key={String(label)}
            style={{
              flex: 1,
              backgroundColor: C.bg,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Txt bold style={{ fontSize: 24, color: String(color) }}>
              {n}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>{label}</Txt>
          </View>
        ))}
      </View>
      {result.errors.length ? (
        <View style={{ marginBottom: 18 }}>
          <Txt bold style={{ color: C.amber, marginBottom: 8 }}>
            Hatalı satırlar içe aktarılmayacak.
          </Txt>
          {result.errors.slice(0, 5).map((e, i) => (
            <Txt
              key={i}
              style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}
            >
              {e}
            </Txt>
          ))}
          {result.errors.length > 5 ? (
            <Txt style={{ color: C.dim }}>
              Ve {result.errors.length - 5} hata daha.
            </Txt>
          ) : null}
        </View>
      ) : null}
      {result.transactions.slice(0, 4).map((t) => (
        <View
          key={t.id}
          style={[
            styles.between,
            {
              borderBottomWidth: 1,
              borderBottomColor: C.border,
              paddingVertical: 12,
              gap: 10,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Txt bold>
              {result.categories.find((c) => c.id === t.categoryId)?.name}
            </Txt>
            <Txt style={{ fontSize: 12, color: C.muted }}>
              {t.date}
              {t.time ? ` ${t.time}` : ""} ·{" "}
              {t.type === "income" ? "Gelir" : "Gider"}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt style={{ color: t.type === "income" ? C.green : C.text }}>
              {moneyIn(t.amount, t.currency || "TRY")}
            </Txt>
            {t.currency && t.currency !== "TRY" ? (
              <Txt style={{ color: C.dim, fontSize: 9, marginTop: 3 }}>
                ≈ {money(t.baseAmount ?? 0)} · {t.fxDate}
              </Txt>
            ) : null}
          </View>
        </View>
      ))}
      <Txt style={{ color: C.muted, fontSize: 12, marginVertical: 18 }}>
        Kayıtlar mevcut işlemlere eklenir. Aynı kimlik veya aynı tarih, tür,
        kategori, döviz türü, tutar ve açıklamaya sahip tekrarlar atlanır. Yeni
        kategoriler otomatik oluşturulur.
      </Txt>
      <ErrorText message={error} />
      <Button
        onPress={save}
        disabled={!result.transactions.length}
        busy={busy}
        icon="upload"
      >
        {result.transactions.length} geçerli kaydı aktar
      </Button>
    </Sheet>
  );
}
