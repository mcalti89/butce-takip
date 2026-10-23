import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  id,
  localTime,
  moneyIn,
  parseAmount,
  today,
  validDate,
  validTime,
} from "@/lib/budget/model";
import { saveExchange, type AccountTransfer } from "@/lib/budget/finance";
import {
  buildManualExchange,
  exchangeRateInput,
  parseExchangeRate,
  type CurrencyExchange,
} from "@/lib/budget/exchange";
import { rateSourceLabel } from "@/lib/budget/fx";
import { Button, C, Card, ErrorText, Field, Sheet, Txt } from "./ui";

export function ExchangeDetails({
  exchange,
  currency,
}: {
  exchange: CurrencyExchange;
  currency: string;
}) {
  if (exchange.source === "MANUAL")
    return (
      <View style={{ gap: 5 }}>
        <Txt style={{ color: C.blue, fontSize: 12 }}>
          1{" "}
          {exchange.rateDirection === "divide" ? exchange.toCurrency : currency}{" "}
          ={" "}
          {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 8 }).format(
            exchange.manualRate,
          )}{" "}
          {exchange.rateDirection === "divide" ? currency : exchange.toCurrency}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 11 }}>Manuel kur</Txt>
      </View>
    );
  return (
    <View style={{ gap: 5 }}>
      <Txt style={{ color: C.blue, fontSize: 12 }}>
        1 {currency} ={" "}
        {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 8 }).format(
          exchange.rate,
        )}{" "}
        {exchange.toCurrency}
      </Txt>
      {[exchange.fromQuote, exchange.toQuote]
        .filter((q) => !!q)
        .map((q) => (
          <Txt key={q.currency} style={{ color: C.muted, fontSize: 11 }}>
            {rateSourceLabel(q.currency)} · {q.currency} döviz{" "}
            {q.side === "buying" ? "alış" : "satış"} · Bülten: {q.date}
          </Txt>
        ))}
    </View>
  );
}
export function ExchangeEditor({
  transfer,
  onClose,
  onDone,
}: {
  transfer?: AccountTransfer;
  onClose: () => void;
  onDone: (s: string) => void;
}) {
  const { data, update } = useBudget();
  const accounts = (data.financialAccounts ?? []).filter(
    (a) => !a.archived && a.kind !== "card",
  );
  const [fromId, setFrom] = useState(
    transfer?.fromId ??
      accounts.find((a) => a.currency !== "TRY")?.id ??
      accounts[0]?.id ??
      "",
  );
  const source = accounts.find((a) => a.id === fromId);
  const [toId, setTo] = useState(
    transfer?.toId ??
      accounts.find(
        (a) => a.currency === "TRY" && a.currency !== source?.currency,
      )?.id ??
      accounts.find((a) => a.currency !== source?.currency)?.id ??
      "",
  );
  const target = accounts.find((a) => a.id === toId);
  const [amount, setAmount] = useState(String(transfer?.amount ?? ""));
  const [date, setDate] = useState(transfer?.date ?? today());
  const [time, setTime] = useState(
    transfer?.time ?? (transfer ? "" : localTime()),
  );
  const [note, setNote] = useState(transfer?.note ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const n = parseAmount(amount, source?.currency);
  const initialRate = transfer?.exchange
    ? exchangeRateInput(transfer.exchange, transfer.currency)
    : "";
  const [rateText, setRateText] = useState(initialRate);
  const [rateEdited, setRateEdited] = useState(false);
  const manualRate = parseExchangeRate(rateText);
  const unchanged =
    !!transfer &&
    !rateEdited &&
    fromId === transfer.fromId &&
    toId === transfer.toId &&
    n === transfer.amount &&
    date === transfer.date &&
    manualRate === parseExchangeRate(initialRate);
  let preview: CurrencyExchange | undefined;
  let previewError = "";
  if (
    source &&
    target &&
    Number.isFinite(n) &&
    validDate(date) &&
    Number.isFinite(manualRate)
  ) {
    try {
      preview = unchanged
        ? transfer.exchange
        : buildManualExchange(
            n,
            source.currency,
            target.currency,
            date,
            manualRate,
          );
    } catch (e) {
      previewError = (e as Error).message;
    }
  }
  function checkInputs() {
    if (
      !source ||
      !target ||
      source.currency === target.currency ||
      !Number.isFinite(n) ||
      !validDate(date) ||
      date > today() ||
      date < source.openingDate ||
      date < target.openingDate
    )
      throw new Error(
        "Farklı para birimlerinde kaynak/hedef hesap, pozitif tutar ve hesap başlangıcından bugüne kadar geçerli bir tarih seç.",
      );
  }
  async function save() {
    setError("");
    try {
      checkInputs();
      if (!preview) throw new Error("İşlemde uygulanan kuru kendin gir.");
      if (time.trim() && !validTime(time.trim()))
        throw new Error("Geçerli bir saat gir. Biçim: SS:DD (00:00–23:59).");
      setBusy(true);
      await update((d) => {
        if (transfer && !d.accountTransfers?.some((t) => t.id === transfer.id))
          throw new Error(
            "Bu döviz işlemi artık bulunamıyor. Son verileri yükle.",
          );
        return saveExchange(d, {
          id: transfer?.id ?? id(),
          fromId,
          toId,
          amount: n,
          currency: source!.currency,
          date,
          time: time.trim() || undefined,
          note: note.trim(),
          exchange: preview,
        });
      });
      onDone("Döviz işlemi kaydedildi; iki hesabın bakiyesi güncellendi.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={transfer ? "Döviz işlemini düzenle" : "Döviz al / sat"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Txt
        style={{
          color: C.muted,
          fontSize: 12,
          lineHeight: 19,
          marginBottom: 16,
        }}
      >
        Bankanın işleminde uyguladığı kuru kendin gir. Hedef tutar bu kurla
        hesaplanır ve kur işlemle birlikte kaydedilir. Bu kayıt gelir veya gider
        sayılmaz.
      </Txt>
      <Txt bold>Çıkan hesap</Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 5,
          marginVertical: 10,
        }}
      >
        {accounts.map((a) => (
          <Button
            key={a.id}
            style={{ maxWidth: "100%" }}
            small
            kind={fromId === a.id ? "secondary" : "ghost"}
            disabled={busy}
            onPress={() => {
              if (a.id !== fromId) setRateText("");
              setFrom(a.id);
              if (accounts.find((b) => b.id === toId)?.currency === a.currency)
                setTo(
                  accounts.find((b) => b.currency !== a.currency)?.id ?? "",
                );
            }}
          >
            {a.name} · {a.currency}
          </Button>
        ))}
      </View>
      <Txt bold>Giren hesap</Txt>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 5,
          marginVertical: 10,
        }}
      >
        {accounts
          .filter((a) => a.currency !== source?.currency)
          .map((a) => (
            <Button
              key={a.id}
              style={{ maxWidth: "100%" }}
              small
              kind={toId === a.id ? "secondary" : "ghost"}
              disabled={busy}
              onPress={() => {
                if (a.id !== toId) setRateText("");
                setTo(a.id);
              }}
            >
              {a.name} · {a.currency}
            </Button>
          ))}
      </View>
      {!target ? (
        <Txt style={{ color: C.amber, fontSize: 12, marginBottom: 12 }}>
          Döviz işlemi için farklı para birimlerinde iki aktif nakit veya banka
          hesabı oluştur.
        </Txt>
      ) : null}
      <Field
        label={`Bozdurulan / ödenen tutar (${source?.currency ?? "—"})`}
        value={amount}
        onChangeText={setAmount}
        placeholder={source?.currency === "OMR" ? "0,000" : "0,00"}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Field
        label="İşlem tarihi · YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        editable={!busy}
      />
      <Field
        label="Saat · SS:DD"
        value={time}
        onChangeText={setTime}
        maxLength={5}
        placeholder="14:30"
        editable={!busy}
      />
      <Field
        label={`Kur (1 ${source?.currency === "TRY" ? (target?.currency ?? "döviz") : (source?.currency ?? "kaynak")} = ? ${source?.currency === "TRY" ? "TRY" : (target?.currency ?? "hedef")})`}
        value={rateText}
        onChangeText={(value) => {
          setRateText(value);
          setRateEdited(true);
        }}
        placeholder="Örn. 40,25"
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={20}
        editable={!busy}
      />
      <Txt style={{ color: C.dim, fontSize: 11, marginBottom: 12 }}>
        1 birim için uygulanan kuru gir; virgül veya nokta ve en fazla 8 ondalık
        kullanabilirsin.
      </Txt>
      {transfer?.exchange?.source === "TCMB" && unchanged ? (
        <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>
          Bu eski kayıt TCMB kuruyla oluşturulmuş. Yalnızca not veya saati
          düzenlemek mevcut kuru korur; kur, tutar, hesap veya tarih değişirse
          girdiğin kur kullanılır.
        </Txt>
      ) : null}
      <ErrorText
        message={
          rateText.trim() && !Number.isFinite(manualRate)
            ? "Sıfırdan büyük, en fazla 8 ondalıklı bir kur gir. Binlik ayırıcı kullanma."
            : previewError
        }
      />
      {preview ? (
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <Txt bold style={{ fontSize: 18, marginBottom: 10 }}>
            Hedef hesaba geçecek:{" "}
            {moneyIn(preview.toAmount, preview.toCurrency)}
          </Txt>
          <ExchangeDetails
            exchange={preview}
            currency={source?.currency ?? transfer?.currency ?? "TRY"}
          />
          <Txt style={{ color: C.dim, fontSize: 11, marginTop: 10 }}>
            Kaydettiğin kuru daha sonra Döviz işlemini düzenle ekranından
            değiştirebilirsin. İki hesabın bakiyesi birlikte yeniden hesaplanır.
          </Txt>
        </Card>
      ) : (
        <Txt style={{ color: C.dim, fontSize: 11, marginVertical: 12 }}>
          Tutarı ve kuru girince hedef hesaba geçecek tutar burada görünür.
          Hesap değiştirirsen ilgili kur alanını yeniden doldur.
        </Txt>
      )}
      <Field
        label="Not"
        value={note}
        onChangeText={setNote}
        maxLength={300}
        editable={!busy}
      />
      <ErrorText message={error} />
      <Button
        busy={busy}
        disabled={!preview || !source || !target}
        onPress={() => void save()}
      >
        Döviz işlemini kaydet
      </Button>
    </Sheet>
  );
}
