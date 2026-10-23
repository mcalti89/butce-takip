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
import { buildExchange, type CurrencyExchange } from "@/lib/budget/exchange";
import { fetchFxRate } from "@/lib/budget/fxApi";
import { rateSourceLabel, type FxCurrencyCode } from "@/lib/budget/fx";
import { Button, C, Card, ErrorText, Field, Sheet, Txt } from "./ui";

export function ExchangeDetails({
  exchange,
  currency,
}: {
  exchange: CurrencyExchange;
  currency: string;
}) {
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
  const key = JSON.stringify([fromId, toId, n, date]);
  const [result, setResult] = useState<{
    key: string;
    exchange: CurrencyExchange;
  } | null>(transfer?.exchange ? { key, exchange: transfer.exchange } : null);
  const preview = result?.key === key ? result.exchange : undefined;
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
  async function calculate() {
    setError("");
    try {
      checkInputs();
      setBusy(true);
      setResult(null);
      const requestedKey = key;
      const [from, to] = await Promise.all([
        source!.currency === "TRY"
          ? undefined
          : fetchFxRate(source!.currency as FxCurrencyCode, date),
        target!.currency === "TRY"
          ? undefined
          : fetchFxRate(target!.currency as FxCurrencyCode, date),
      ]);
      setResult({
        key: requestedKey,
        exchange: buildExchange(
          n,
          source!.currency,
          target!.currency,
          date,
          from?.rate,
          to?.rate,
        ),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setError("");
    try {
      checkInputs();
      if (!preview)
        throw new Error("Önce işlem tarihinin kurunu getir ve hesapla.");
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
        Bozdururken TCMB döviz alış, satın alırken döviz satış kuru kullanılır.
        Tatil ve hafta sonunda işlem tarihinden önceki son bülten esas alınır.
        Bu kayıt gelir veya gider sayılmaz.
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
              onPress={() => setTo(a.id)}
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
      <Button
        kind="secondary"
        busy={busy}
        disabled={!source || !target}
        onPress={() => void calculate()}
      >
        Kuru getir ve hesapla
      </Button>
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
            Referans günlük kur kullanılır; banka veya döviz bürosunun gerçek
            kuru farklı olabilir. Kullanılan kur bu kayda sabitlenir.
          </Txt>
        </Card>
      ) : (
        <Txt style={{ color: C.dim, fontSize: 11, marginVertical: 12 }}>
          Tutar, tarih veya hesap değişirse kuru yeniden hesapla.
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
