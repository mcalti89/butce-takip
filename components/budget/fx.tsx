import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  BudgetData,
  monthKey,
  moneyIn,
  today,
  shiftMonth,
} from "@/lib/budget/model";
import {
  CURRENCY_NAMES,
  DEFAULT_TRACKED_CURRENCIES,
  FxCurrencyCode,
  mergeFxRates,
  TCMB_CURRENCY_CODES,
} from "@/lib/budget/fx";
import {
  fetchFxHistory,
  fetchLatestFx,
  isFxApiConfigured,
} from "@/lib/budget/fxApi";
import { Button, C, Card, Icon, Txt, styles } from "./ui";

const EMPTY_FX_RATES: NonNullable<BudgetData["fxRates"]> = [];

function rateText(value: number | null, unit: number, code: string) {
  if (value === null) return "—";
  return `${moneyIn(value, "TRY")} / ${unit} ${code}`;
}

export function FxDashboard({ mobile }: { mobile: boolean }) {
  const { data, update } = useBudget();
  const selected = data.trackedCurrencies ?? DEFAULT_TRACKED_CURRENCIES;
  const selectedKey = selected.join(",");
  const configured = isFxApiConfigured();
  const localRates = data.fxRates ?? EMPTY_FX_RATES;
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [historyCode, setHistoryCode] = useState<FxCurrencyCode>(
    (selected[0] || "USD") as FxCurrencyCode,
  );
  const [remoteHistory, setRemoteHistory] = useState<typeof localRates>([]);

  const latestByCode = useMemo(() => {
    const rows = new Map<string, (typeof localRates)[number]>();
    for (const quote of localRates)
      if (!rows.has(quote.currency)) rows.set(quote.currency, quote);
    return rows;
  }, [localRates]);

  const fetchLatest = useCallback(async () => {
    const codes = selectedKey
      ? (selectedKey.split(",") as FxCurrencyCode[])
      : [];
    if (!configured || !codes.length) return null;
    const result = await fetchLatestFx(codes);
    await update((d) => ({
      ...d,
      fxRates: mergeFxRates(d.fxRates, result.rates),
    }));
    return result.date;
  }, [configured, selectedKey, update]);

  const fetchHistory = useCallback(
    async (code: FxCurrencyCode) => {
      const result = await fetchFxHistory(
        code,
        `${shiftMonth(monthKey(), -3)}-01`,
        today(),
      );
      await update((d) => ({
        ...d,
        fxRates: mergeFxRates(d.fxRates, result.rates),
      }));
      return result.rates;
    },
    [update],
  );

  useEffect(() => {
    let active = true;
    void fetchLatest()
      .then((date) => {
        if (active && date) setMessage(`TCMB ${date} bülteni güncellendi.`);
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [fetchLatest]);

  const activeHistoryCode = (
    selected.includes(historyCode) ? historyCode : selected[0] || "USD"
  ) as FxCurrencyCode;

  useEffect(() => {
    if (!configured || !selected.length) return;
    let active = true;
    void fetchHistory(activeHistoryCode)
      .then((rates) => {
        if (active) {
          setRemoteHistory(rates);
          setHistoryBusy(false);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setMessage(error.message);
          setRemoteHistory([]);
          setHistoryBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeHistoryCode, configured, fetchHistory, selected.length]);

  const sync = async () => {
    setBusy(true);
    setMessage("");
    try {
      const date = await fetchLatest();
      if (date) setMessage(`TCMB ${date} bülteni güncellendi.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (code: FxCurrencyCode) => {
    const next = selected.includes(code)
      ? selected.filter((item) => item !== code)
      : [...selected, code];
    if (next.length > 12) {
      setMessage("En fazla 12 döviz türü aynı anda izlenebilir.");
      return;
    }
    setMessage("");
    await update((d) => ({ ...d, trackedCurrencies: next }));
  };

  const quotes = selected
    .map((code) => latestByCode.get(code))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const history = (remoteHistory.length ? remoteHistory : localRates)
    .filter((row) => row.currency === activeHistoryCode)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  return (
    <View style={{ gap: 16 }}>
      <Card style={{ borderColor: configured ? C.border : "#4B4228" }}>
        <View
          style={{
            flexDirection: mobile ? "column" : "row",
            gap: 16,
            alignItems: mobile ? "stretch" : "center",
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <Icon
              name="globe"
              color={configured ? C.green : C.amber}
              size={23}
            />
            <View style={{ flex: 1 }}>
              <Txt bold style={styles.sectionTitle}>
                TCMB günlük kur arşivi
              </Txt>
              <Txt
                style={{
                  color: C.muted,
                  fontSize: 12,
                  lineHeight: 19,
                  marginTop: 5,
                }}
              >
                Resmî döviz alış/satış bültenleri. Kaynak oranlar gösterge
                değeridir; bankanın veya kartının gerçekleşen işlem fiyatı
                değildir.
              </Txt>
            </View>
          </View>
          <Button
            icon="refresh-cw"
            busy={busy}
            disabled={!configured || !selected.length}
            onPress={() => void sync()}
          >
            Kurları güncelle
          </Button>
        </View>
        {!configured ? (
          <View
            style={{
              marginTop: 16,
              padding: 13,
              borderRadius: 9,
              backgroundColor: "#242016",
              borderWidth: 1,
              borderColor: "#4B4228",
            }}
          >
            <Txt bold style={{ color: C.amber, fontSize: 12 }}>
              Sunucu bağlantısı bekleniyor
            </Txt>
            <Txt
              style={{
                color: C.muted,
                fontSize: 11,
                lineHeight: 18,
                marginTop: 5,
              }}
            >
              TCMB XML&apos;i tarayıcıdan doğrudan okunamadığı için bu cihaz
              henüz günlük oran alamıyor. cPanel PHP/MySQL API&apos;si ve cron
              kurulunca kur geçmişi burada görünecek; şu an günlük veritabanı
              kaydı etkin değil.
            </Txt>
          </View>
        ) : null}
        {message ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              marginTop: 12,
            }}
          >
            <Icon
              name={message.includes("güncellendi") ? "check-circle" : "info"}
              size={14}
              color={message.includes("güncellendi") ? C.green : C.amber}
            />
            <Txt
              accessibilityRole="alert"
              style={{ color: C.muted, fontSize: 11, flex: 1 }}
            >
              {message}
            </Txt>
          </View>
        ) : null}
        <Txt style={{ color: C.dim, fontSize: 10, marginTop: 13 }}>
          Kaynak: Türkiye Cumhuriyet Merkez Bankası · ForexBuying / ForexSelling
        </Txt>
      </Card>

      <Card>
        <View style={[styles.between, { marginBottom: 7 }]}>
          <Txt bold style={styles.sectionTitle}>
            İzlemek istediklerin
          </Txt>
          <Txt style={{ color: C.dim, fontSize: 10 }}>
            {selected.length}/12 seçili
          </Txt>
        </View>
        <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 14 }}>
          Seçim bu tarayıcıda saklanır. Alış ve satış kurları ayrı gösterilir.
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TCMB_CURRENCY_CODES.map((code) => {
            const active = selected.includes(code);
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${CURRENCY_NAMES[code]} ${active ? "izlemeden çıkar" : "izlemeye ekle"}`}
                onPress={() => void toggle(code)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: active ? "#13281F" : C.bg,
                  borderColor: active ? "#326349" : C.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Icon
                  name={active ? "check-circle" : "plus-circle"}
                  size={14}
                  color={active ? C.green : C.dim}
                />
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
      </Card>

      <View style={{ gap: 11 }}>
        <View style={styles.between}>
          <Txt bold style={styles.sectionTitle}>
            Son yayımlanan bülten
          </Txt>
          <Txt style={{ color: C.dim, fontSize: 10 }}>TCMB kaynak tarihi</Txt>
        </View>
        {!quotes.length ? (
          <Card style={{ padding: 17 }}>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {selected.length
                ? "Kur servisi bağlandığında seçtiğin dövizlerin son alış/satış değerleri burada gösterilecek."
                : "Başlamak için yukarıdan en az bir döviz türü seç."}
            </Txt>
          </Card>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11 }}>
            {quotes.map((quote) => (
              <Card
                key={`${quote.date}-${quote.currency}`}
                style={{
                  flexGrow: 1,
                  flexBasis: mobile ? "100%" : "31%",
                  minWidth: mobile ? 0 : 220,
                  padding: 16,
                }}
              >
                <View style={styles.between}>
                  <View>
                    <Txt bold style={{ fontSize: 17 }}>
                      {quote.currency}
                    </Txt>
                    <Txt style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
                      {quote.currencyName}
                    </Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt style={styles.label}>BÜLTEN</Txt>
                    <Txt style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>
                      {quote.date}
                    </Txt>
                  </View>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: C.border,
                    marginVertical: 12,
                  }}
                />
                <View style={[styles.between, { marginBottom: 7 }]}>
                  <Txt style={{ color: C.muted, fontSize: 11 }}>Döviz alış</Txt>
                  <Txt bold style={{ color: C.green, fontSize: 12 }}>
                    {rateText(quote.forexBuying, quote.unit, quote.currency)}
                  </Txt>
                </View>
                <View style={styles.between}>
                  <Txt style={{ color: C.muted, fontSize: 11 }}>
                    Döviz satış
                  </Txt>
                  <Txt bold style={{ color: C.text, fontSize: 12 }}>
                    {rateText(quote.forexSelling, quote.unit, quote.currency)}
                  </Txt>
                </View>
                <Txt style={{ color: C.dim, fontSize: 9, marginTop: 10 }}>
                  Bülten {quote.bulletinNo}
                </Txt>
              </Card>
            ))}
          </View>
        )}
      </View>

      <Card>
        <View style={styles.between}>
          <View>
            <Txt bold style={styles.sectionTitle}>
              Günlük kur geçmişi
            </Txt>
            <Txt style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>
              Son 3 ay · yayınlanan bültenler
            </Txt>
          </View>
          {historyBusy ? (
            <Icon name="loader" color={C.green} size={17} />
          ) : null}
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 12,
            marginBottom: 7,
          }}
        >
          {selected.map((code) => (
            <Button
              key={code}
              small
              kind={activeHistoryCode === code ? "secondary" : "ghost"}
              disabled={!configured || historyBusy}
              onPress={() => {
                if (activeHistoryCode === code) return;
                setHistoryBusy(true);
                setHistoryCode(code as FxCurrencyCode);
              }}
            >
              {code}
            </Button>
          ))}
        </View>
        {history.length ? (
          <View>
            {history.map((quote) => (
              <View
                key={`${quote.date}-${quote.currency}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: C.border,
                }}
              >
                <Txt style={{ color: C.muted, fontSize: 11, width: 86 }}>
                  {quote.date}
                </Txt>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Txt style={{ color: C.green, fontSize: 10 }}>
                    Alış{" "}
                    {rateText(quote.forexBuying, quote.unit, quote.currency)}
                  </Txt>
                  <Txt style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                    Satış{" "}
                    {rateText(quote.forexSelling, quote.unit, quote.currency)}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Txt style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            {configured
              ? "Bu dönem için kur geçmişi alınamadı veya henüz veritabanına kaydedilmedi."
              : "Günlük veritabanı bağlantısı kurulunca geçmiş burada listelenecek."}
          </Txt>
        )}
      </Card>

      <Card style={{ backgroundColor: "#172639", borderColor: "#2F4661" }}>
        <View
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <Icon name="info" color={C.blue} size={18} />
          <Txt
            style={{ color: "#B2C9E7", flex: 1, fontSize: 11, lineHeight: 18 }}
          >
            TRY dışı gelirler döviz alış, giderler döviz satış kuru üzerinden
            TRY raporuna çevrilir. TCMB gösterge kuru, banka makbuzundaki gerçek
            kur değildir. Kur ve bülten tarihi işlem kaydında sabitlenir; eski
            işlemler kur güncellemesiyle değişmez.
          </Txt>
        </View>
      </Card>
    </View>
  );
}
