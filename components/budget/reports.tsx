import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import {
  type BudgetData,
  money,
  moneyIn,
  monthLabel,
  today,
} from "@/lib/budget/model";
import {
  exportReportCSV,
  dailyMonthReport,
  budgetAlerts,
  monthReport,
  nextMonthForecast,
  type BudgetAlert,
} from "@/lib/budget/reports";
import { Button, C, Card, Empty, Icon, Progress, Txt, styles } from "./ui";
import { downloadCSV } from "@/lib/budget/files";

function Choice({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 13,
        borderRadius: 9,
        backgroundColor: selected ? "#22C55E1A" : C.elevated,
        borderWidth: 1,
        borderColor: selected ? C.green : C.border,
      }}
    >
      <Txt bold style={{ color: selected ? C.green : C.muted, fontSize: 12 }}>
        {title}
      </Txt>
    </Pressable>
  );
}
function Metric({
  label,
  value,
  color = C.text,
  note,
}: {
  label: string;
  value: string;
  color?: string;
  note?: string;
}) {
  return (
    <View style={{ minWidth: 0, gap: 4, flex: 1 }}>
      <Txt style={{ color: C.muted, fontSize: 11 }}>{label}</Txt>
      <Txt bold style={{ fontSize: 22, lineHeight: 31, color }}>
        {value}
      </Txt>
      {note ? <Txt style={{ color: C.dim, fontSize: 11 }}>{note}</Txt> : null}
    </View>
  );
}
function AlertRow({
  alert,
  onBudget,
}: {
  alert: BudgetAlert;
  onBudget?: (id: string) => void;
}) {
  const over = alert.status === "over",
    color = over ? C.red : C.amber;
  return (
    <View
      style={{
        gap: 9,
        paddingVertical: 13,
        borderTopWidth: 1,
        borderColor: C.border,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <Icon name={over ? "alert-triangle" : "bell"} color={color} size={18} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt bold style={{ color }}>
            {alert.name} ·{" "}
            {over
              ? "Bütçe aşıldı"
              : alert.status === "near"
                ? "Limite yaklaşıldı"
                : "Ay sonu aşım riski"}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            {money(alert.spent)} harcandı / {money(alert.limit)} limit.{" "}
            {over
              ? `${money(-alert.remaining)} aşım.`
              : `${money(alert.remaining)} kaldı.`}
          </Txt>
          {alert.projected !== null ? (
            <Txt style={{ color: C.dim, fontSize: 11 }}>
              Günlük ortalama sürerse ay sonu: {money(alert.projected)}. Düzenli
              faturalar bu tahmini etkileyebilir.
            </Txt>
          ) : null}
        </View>
      </View>
      <Progress ratio={alert.ratio ?? (over ? 1 : 0)} color={color} />
      {onBudget ? (
        <Button small kind="ghost" onPress={() => onBudget(alert.categoryId)}>
          Kategori limitini düzenle
        </Button>
      ) : null}
    </View>
  );
}
export function BudgetWarnings({
  data,
  month,
  onBudget,
  compact = false,
  onReports,
}: {
  data: BudgetData;
  month: string;
  onBudget?: (id: string) => void;
  compact?: boolean;
  onReports?: () => void;
}) {
  const alerts = budgetAlerts(data, month, today());
  if (compact && !alerts.length) return null;
  return (
    <Card>
      <View accessibilityLiveRegion="polite">
        <Txt bold style={styles.sectionTitle}>
          Bütçe uyarıları{alerts.length ? ` · ${alerts.length}` : ""}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          Gerçekleşen aşım, %80 kullanım ve ilk 7 günden sonra harcama hızına
          göre risk. Uyarılar kayıtlarınla güncellenir.
        </Txt>
      </View>
      {alerts.length ? (
        (compact ? alerts.slice(0, 2) : alerts).map((a) => (
          <AlertRow key={a.categoryId} alert={a} onBudget={onBudget} />
        ))
      ) : (
        <Empty
          icon="check-circle"
          title="Şu anda bütçe uyarısı yok"
          body="Uyarı almak istediğin kategorilere Bütçeler ekranından aylık limit belirle. Sıfır limit de takip edilir."
        />
      )}
      {compact && alerts.length > 2 && onReports ? (
        <Button small kind="secondary" onPress={onReports}>
          Tüm uyarıları gör ({alerts.length})
        </Button>
      ) : null}
      {!compact ? (
        <Txt style={{ color: C.dim, fontSize: 11 }}>
          Uygulama içi uyarılardır; e-posta veya telefon bildirimi gönderilmez.
        </Txt>
      ) : null}
    </Card>
  );
}
function BalanceChart({
  points,
  currency,
}: {
  points: { date: string; balance: number }[];
  currency: string;
}) {
  const values = points.map((p) => p.balance),
    low = Math.min(...values, 0),
    high = Math.max(...values, 1),
    range = high - low || 1;
  const start = Date.parse(points[0].date),
    finish = Date.parse(points[points.length - 1].date);
  const x = (date: string) =>
    18 + ((Date.parse(date) - start) / Math.max(1, finish - start)) * 324;
  const y = (value: number) => 26 + ((high - value) / range) * 105;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.balance)}`)
    .join(" ");
  return (
    <View
      accessible
      accessibilityLabel={`${currency} tahmini net durum grafiği. Başlangıç ${moneyIn(values[0], currency)}, bitiş ${moneyIn(values[values.length - 1], currency)}.`}
    >
      <Svg width="100%" height={185} viewBox="0 0 360 185">
        <Line
          x1={18}
          x2={342}
          y1={y(0)}
          y2={y(0)}
          stroke={C.dim}
          strokeDasharray="4 5"
        />
        <Path d={path} fill="none" stroke={C.blue} strokeWidth={2.5} />
        {points.map((p, index) => (
          <Circle
            key={`${p.date}-${index}`}
            cx={x(p.date)}
            cy={y(p.balance)}
            r={3}
            fill={p.balance < 0 ? C.red : C.blue}
          />
        ))}
        <SvgText x={18} y={162} fontSize={11} fill={C.muted}>
          {points[0].date.slice(5)}
        </SvgText>
        <SvgText x={342} y={162} textAnchor="end" fontSize={11} fill={C.muted}>
          {points[points.length - 1].date.slice(5)}
        </SvgText>
        <SvgText x={18} y={16} fontSize={10} fill={C.muted}>
          {moneyIn(high, currency)}
        </SvgText>
        <SvgText x={342} y={143} textAnchor="end" fontSize={10} fill={C.muted}>
          {moneyIn(low, currency)}
        </SvgText>
      </Svg>
    </View>
  );
}
export function ForecastDashboard({
  data,
  mobile,
  onAccounts,
  onCalendar,
}: {
  data: BudgetData;
  mobile: boolean;
  onAccounts: () => void;
  onCalendar: () => void;
}) {
  const [includeOverdue, setIncludeOverdue] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const asOf = today();
  const f = useMemo(
    () => nextMonthForecast(data, asOf, includeOverdue),
    [data, asOf, includeOverdue],
  );
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ borderColor: "#2B4262" }}>
        <Txt bold style={{ fontSize: 21, lineHeight: 30 }}>
          Gelecek ay tahmini · {monthLabel(f.nextMonth)}
        </Txt>
        <Txt style={{ color: C.muted, marginTop: 7 }}>
          {asOf} itibarıyla hesapların + bu ayın kalan planları + gelecek ayın
          planları. Bu tahmin kayıt oluşturmaz ve ödeme yapmaz.
        </Txt>
        <Txt style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
          Gösterilen tutar net durumdur: nakit/banka bakiyeleri ve kartın borç
          veya alacak bakiyesi birlikte hesaplanır. Harcanabilir nakit anlamına
          gelmez. Para birimleri kendi içinde tutulur; gelecekteki döviz kuru
          tahmin edilmez.
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14,
          }}
        >
          <Choice
            title="Gecikmiş planları hariç tut"
            selected={!includeOverdue}
            onPress={() => setIncludeOverdue(false)}
          />
          <Choice
            title="Gecikmiş planları da dahil et"
            selected={includeOverdue}
            onPress={() => setIncludeOverdue(true)}
          />
        </View>
        <Txt style={{ color: C.dim, fontSize: 11, marginTop: 9 }}>
          {includeOverdue
            ? "Henüz işlenmemiş gecikmiş gelir ve ödemeler bugün gerçekleşecek varsayılır."
            : "Tarihi geçmiş, henüz işlenmemiş planlar tahmine katılmaz; aşağıda ayrıca gösterilir."}{" "}
          Bugün bekleyen planlar dahil. Plansız yeni harcamalar, faiz ve kur
          değişimi dahil değildir.
        </Txt>
      </Card>
      {!f.hasAccounts ? (
        <Card>
          <Empty
            icon="credit-card"
            title="Gerçek başlangıç bakiyeni ekle"
            body="Hesap eklemediğin için tahminin başlangıcı sıfır kabul edilir. Yalnızca işlem gelir-gider toplamı banka bakiyen değildir."
          />
          <Button kind="secondary" onPress={onAccounts}>
            Hesaplara git
          </Button>
        </Card>
      ) : null}
      {f.unassignedTransactions > 0 ? (
        <Card style={{ padding: 15 }}>
          <Txt style={{ color: C.amber, fontSize: 12 }}>
            {f.unassignedTransactions} hesapsız geçmiş işlem başlangıç
            bakiyesine eklenmedi. Hesap açılış bakiyen bu hareketleri zaten
            içeriyorsa ayrıca eklemek çifte sayım yapabilir.
          </Txt>
        </Card>
      ) : null}
      {f.rows.map((r) => (
        <Card key={r.currency}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Txt bold style={styles.sectionTitle}>
              {r.currency} · Beklenen ay sonu
            </Txt>
            <Txt
              bold
              style={{
                color: r.nextMonthEnd < 0 ? C.red : C.green,
                fontSize: 26,
                lineHeight: 35,
              }}
            >
              {moneyIn(r.nextMonthEnd, r.currency)}
            </Txt>
          </View>
          <View
            style={{
              flexDirection: mobile ? "column" : "row",
              gap: 18,
              marginTop: 18,
            }}
          >
            <Metric
              label="BUGÜNKÜ NET DURUM"
              value={moneyIn(r.current, r.currency)}
              note={`Nakit/banka ${moneyIn(r.cash, r.currency)} · Kart neti ${moneyIn(r.cards, r.currency)}`}
            />
            <Metric
              label="BU AY SONUNDAN DEVREDEN"
              value={moneyIn(r.thisMonthEnd, r.currency)}
              note={`${f.currentEnd} tahmini`}
            />
          </View>
          <View
            style={{
              flexDirection: mobile ? "column" : "row",
              gap: 18,
              marginTop: 18,
            }}
          >
            <Metric
              label="GELECEK AY PLANLANAN GELİR"
              value={moneyIn(r.income, r.currency)}
              color={C.green}
            />
            <Metric
              label="GELECEK AY PLANLANAN GİDER"
              value={moneyIn(r.expense, r.currency)}
              color={C.red}
            />
          </View>
          {r.openingAdjustments !== 0 ? (
            <Txt style={{ color: C.muted, marginTop: 12 }}>
              Gelecek ay başlayacak hesapların açılış farkı:{" "}
              {moneyIn(r.openingAdjustments, r.currency)}
            </Txt>
          ) : null}
          <BalanceChart points={r.daily} currency={r.currency} />
          <Txt style={{ color: r.lowest < 0 ? C.red : C.muted, fontSize: 12 }}>
            Dönemin en düşük net durumu: {moneyIn(r.lowest, r.currency)} ·{" "}
            {r.lowestDate}
            {r.lowest < 0
              ? ". Planlarına göre net durum eksiye düşüyor; nakit ve kart bakiyelerini ayrıca kontrol et."
              : "."}
          </Txt>
          {r.overdueIncome > 0 || r.overdueExpense > 0 ? (
            <Txt style={{ color: C.amber, fontSize: 12, marginTop: 10 }}>
              Gecikmiş ve işlenmemiş: {moneyIn(r.overdueIncome, r.currency)}{" "}
              gelir / {moneyIn(r.overdueExpense, r.currency)} ödeme ·{" "}
              {includeOverdue ? "tahmine dahil" : "tahmin dışında"}.
            </Txt>
          ) : null}
          {r.unassignedPlans ? (
            <Txt style={{ color: C.dim, fontSize: 11, marginTop: 9 }}>
              {r.unassignedPlans} hesapsız plan hareketi net tahmine dahil;
              belirli bir hesaba dağıtılmadı.
            </Txt>
          ) : null}
        </Card>
      ))}
      {!f.rows.length ? (
        <Card>
          <Empty
            icon="trending-up"
            title="Tahmin için henüz veri yok"
            body="Hesap bakiyelerini ve beklediğin maaş, kira, fatura veya taksit planlarını ekleyerek başlayabilirsin."
          />
        </Card>
      ) : null}
      <Card>
        <Txt bold style={styles.sectionTitle}>
          Tahmine giren hareketler · {f.events.length}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
          Gerçekleşmiş plan dönemleri tekrar eklenmez. Hesaplar arası transfer
          ve kart ödemesi toplam net durumu değiştirmez; ayrıca gider sayılmaz.
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
          }}
        >
          <Button
            small
            kind="secondary"
            onPress={() => setShowEvents((v) => !v)}
          >
            {showEvents ? "Hareketleri gizle" : "Hesaplama detayını göster"}
          </Button>
          <Button small kind="ghost" onPress={onCalendar}>
            Ödeme takvimine git
          </Button>
        </View>
        {showEvents ? (
          f.events.length ? (
            f.events.map((e, i) => (
              <View
                key={i}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                  gap: 3,
                }}
              >
                <Txt bold>{e.title}</Txt>
                <Txt style={{ color: C.muted, fontSize: 12 }}>
                  {e.date} ·{" "}
                  {e.source === "overdue"
                    ? "Gecikmiş plan"
                    : e.source === "recorded"
                      ? "İleri tarihli kayıt"
                      : e.source === "opening"
                        ? "Hesap açılışı"
                        : "Bekleyen plan"}{" "}
                  · {e.type === "expense" ? "−" : "+"}
                  {moneyIn(e.amount, e.currency)}
                </Txt>
              </View>
            ))
          ) : (
            <Txt style={{ color: C.muted, marginTop: 12 }}>
              Bu dönemde bekleyen hareket yok; bakiyeler sabit kabul edildi.
            </Txt>
          )
        ) : null}
      </Card>
    </View>
  );
}
function ComparisonChart({
  rows,
}: {
  rows: ReturnType<typeof monthReport>["months"];
}) {
  const max = Math.max(...rows.flatMap((r) => [r.income, r.expense]), 1);
  return (
    <View
      accessible
      accessibilityLabel="Son altı ay gelir ve gider karşılaştırması. Ayrıntılı tutarlar grafiğin altındadır."
    >
      <Svg width="100%" height={190} viewBox="0 0 360 190">
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            <Rect
              x={18 + i * 57}
              y={145 - (r.income / max) * 120}
              width={15}
              height={(r.income / max) * 120}
              rx={3}
              fill={C.green}
            />
            <Rect
              x={35 + i * 57}
              y={145 - (r.expense / max) * 120}
              width={15}
              height={(r.expense / max) * 120}
              rx={3}
              fill={C.red}
            />
            <SvgText
              x={34 + i * 57}
              y={170}
              textAnchor="middle"
              fill={C.muted}
              fontSize={10}
            >
              {monthLabel(r.key, true)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <Txt style={{ color: C.muted, fontSize: 11 }}>
        Yeşil: gelir · Pembe: gider · TRY
      </Txt>
    </View>
  );
}
function DailyMonthTable({
  data,
  month,
  asOf,
  mobile,
}: {
  data: BudgetData;
  month: string;
  asOf: string;
  mobile: boolean;
}) {
  const report = dailyMonthReport(data, month, asOf);
  const cell = {
    flex: 1,
    minWidth: 0,
    textAlign: "right" as const,
    fontSize: mobile ? 11 : 13,
  };
  return (
    <Card style={{ padding: mobile ? 14 : 22 }}>
      <Txt bold style={styles.sectionTitle}>
        Günlük gelir ve gider
      </Txt>
      <Txt
        style={{ color: C.muted, fontSize: 12, marginTop: 5, marginBottom: 15 }}
      >
        {monthLabel(month)} · TRY. Tüm takvim günleri gösterilir. Kayıtsız
        geçmiş günler sıfır, henüz gelmeyen günler çizgiyle gösterilir.
        Transferler ve açılış bakiyeleri gelir/gider sayılmaz.
      </Txt>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <Txt bold style={{ width: mobile ? 45 : 110, fontSize: 12 }}>
          Gün
        </Txt>
        <Txt bold style={cell}>
          Gelir
        </Txt>
        <Txt bold style={cell}>
          Gider
        </Txt>
        <Txt bold style={cell}>
          Net
        </Txt>
      </View>
      {report.rows.map((day) => (
        <View
          key={day.date}
          accessible
          accessibilityLabel={`${day.date}: ${day.future ? "Henüz gelmedi" : `Gelir ${money(day.income)}, gider ${money(day.expense)}, net ${money(day.net)}`}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: C.border,
            backgroundColor: day.date === asOf ? "#22C55E0A" : "transparent",
          }}
        >
          <Txt
            style={{
              width: mobile ? 45 : 110,
              color: day.future ? C.dim : C.muted,
              fontSize: 12,
            }}
          >
            {mobile
              ? day.date.slice(8)
              : day.date.slice(8) + "." + day.date.slice(5, 7)}
            {day.date === asOf ? " •" : ""}
          </Txt>
          <Txt
            style={[
              cell,
              { color: day.future ? C.dim : day.income ? C.green : C.muted },
            ]}
          >
            {day.future ? "—" : money(day.income)}
          </Txt>
          <Txt
            style={[
              cell,
              { color: day.future ? C.dim : day.expense ? C.red : C.muted },
            ]}
          >
            {day.future ? "—" : money(day.expense)}
          </Txt>
          <Txt
            style={[
              cell,
              {
                color: day.future
                  ? C.dim
                  : day.net < 0
                    ? C.red
                    : day.net > 0
                      ? C.green
                      : C.muted,
              },
            ]}
          >
            {day.future ? "—" : money(day.net)}
          </Txt>
        </View>
      ))}
      <View
        style={{ flexDirection: "row", paddingTop: 14, alignItems: "center" }}
      >
        <Txt bold style={{ width: mobile ? 45 : 110, fontSize: 11 }}>
          Toplam
        </Txt>
        <Txt bold style={[cell, { color: C.green }]}>
          {money(report.totals.income)}
        </Txt>
        <Txt bold style={[cell, { color: C.red }]}>
          {money(report.totals.expense)}
        </Txt>
        <Txt
          bold
          style={[cell, { color: report.totals.net < 0 ? C.red : C.green }]}
        >
          {money(report.totals.net)}
        </Txt>
      </View>
      <Txt style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>
        Döviz işlemleri kayıtlı sabit TL karşılığıyla gösterilir. Bugün • ile
        işaretlidir. Günlük tablo raporun CSV dosyasına da dahildir.
      </Txt>
    </Card>
  );
}
export function ReportsDashboard({
  data,
  month,
  mobile,
  onBudget,
}: {
  data: BudgetData;
  month: string;
  mobile: boolean;
  onBudget: (id: string) => void;
}) {
  const [matched, setMatched] = useState(true);
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const asOf = today();
  const r = useMemo(
    () => monthReport(data, month, asOf, matched),
    [data, month, asOf, matched],
  );
  const selected =
    r.categories.find((c) => c.id === categoryId) ??
    r.categories.find((c) => c.spent > 0) ??
    r.categories[0];
  const changeText = (pct: number | null, prior: number) =>
    pct === null
      ? prior === 0
        ? "Önceki dönemde kayıt yok; yüzde hesaplanmadı."
        : "—"
      : `Önceki döneme göre ${pct > 0 ? "+" : ""}%${pct}`;
  if (month > asOf.slice(0, 7))
    return (
      <Card>
        <Empty
          icon="calendar"
          title="Bu ay henüz başlamadı"
          body="Gerçekleşmiş raporlar için bugünü veya geçmiş bir ayı seç. Gelecek ayın planlarını Gelecek ay tahmini bölümünde görebilirsin."
        />
      </Card>
    );
  const exportCSV = async () => {
    setExportBusy(true);
    setExportError("");
    try {
      await downloadCSV(
        exportReportCSV(data, month, asOf, matched),
        `butce-rapor-${month}.csv`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Rapor indirilemedi.",
      );
    } finally {
      setExportBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Button
          small
          kind="secondary"
          icon="download"
          busy={exportBusy}
          onPress={exportCSV}
        >
          Raporu CSV indir
        </Button>
        {exportError ? (
          <Txt accessibilityRole="alert" style={{ color: C.red, marginTop: 8 }}>
            {exportError}
          </Txt>
        ) : null}
        <Txt bold style={[styles.sectionTitle, { marginTop: 14 }]}>
          Aylık karşılaştırma · {monthLabel(month)}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
          İşlemler TRY karşılığıyla, kaydedildikleri sabit kur üzerinden
          karşılaştırılır. Hesap açılışı ve transferler gelir/gider değildir.
          Gelecek tarihli kayıtlar gerçekleşmiş rapora alınmaz.
        </Txt>
        {r.partial ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 13,
            }}
          >
            <Choice
              title="Aynı güne kadar"
              selected={matched}
              onPress={() => setMatched(true)}
            />
            <Choice
              title="Geçen ayın tamamıyla"
              selected={!matched}
              onPress={() => setMatched(false)}
            />
          </View>
        ) : null}
        <Txt style={{ color: C.dim, fontSize: 11, marginTop: 10 }}>
          {r.currentEnd
            ? `${month}-01 — ${r.currentEnd}`
            : "Seçili ay henüz başlamadı; gerçekleşen kayıt yok"}{" "}
          / {r.previousMonth}-01 — {r.previousEnd}.{" "}
          {r.partial && !matched
            ? "Devam eden ay ile tamamlanmış ay karşılaştırılıyor."
            : ""}
        </Txt>
        <View
          style={{
            flexDirection: mobile ? "column" : "row",
            gap: 22,
            marginTop: 22,
          }}
        >
          <Metric
            label="GELİR"
            value={money(r.current.income)}
            color={C.green}
            note={changeText(r.changes.income, r.previous.income)}
          />
          <Metric
            label="GİDER"
            value={money(r.current.expense)}
            color={C.red}
            note={changeText(r.changes.expense, r.previous.expense)}
          />
          <Metric
            label="AYLIK NET"
            value={money(r.current.net)}
            color={r.current.net < 0 ? C.red : C.blue}
            note={`Önceki dönem farkı: ${money(r.changes.net)}`}
          />
        </View>
        <Txt style={{ color: C.muted, marginTop: 18 }}>
          Tasarruf oranı:{" "}
          {r.current.savingsRate === null
            ? "Gelir yok; hesaplanamadı."
            : `%${r.current.savingsRate} · (gelir − gider) / gelir`}
        </Txt>
      </Card>
      <DailyMonthTable data={data} month={month} asOf={asOf} mobile={mobile} />
      <BudgetWarnings data={data} month={month} onBudget={onBudget} />
      <Card>
        <Txt bold style={styles.sectionTitle}>
          Son 6 ay · Gelir ve gider
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
          Her ayın bugüne kadar kaydedilmiş toplamı; devam eden ay eksiktir.
          Karşılaştırma seçimi bu grafiği daraltmaz.
        </Txt>
        <ComparisonChart rows={r.months} />
        {r.months.map((m) => (
          <View
            key={m.key}
            style={{
              flexDirection: mobile ? "column" : "row",
              justifyContent: "space-between",
              gap: 4,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: C.border,
            }}
          >
            <Txt bold style={{ fontSize: 12 }}>
              {monthLabel(m.key)}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Gelir {money(m.income)} · Gider {money(m.expense)} · Net{" "}
              {money(m.net)}
            </Txt>
          </View>
        ))}
      </Card>
      <Card>
        <Txt bold style={styles.sectionTitle}>
          Kategori eğilimleri
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
          Harcama payları ve önceki dönem farkları. Kategoriye dokunarak altı
          aylık geçmişini gör.
        </Txt>
        {r.categories.some((c) => c.spent > 0 || c.previousSpent > 0) ? (
          r.categories
            .filter((c) => c.spent > 0 || c.previousSpent > 0)
            .map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.name} eğilimi`}
                accessibilityState={{ selected: selected?.id === c.id }}
                onPress={() => setCategoryId(c.id)}
                style={{
                  paddingVertical: 15,
                  gap: 7,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Txt
                    bold
                    style={{ color: selected?.id === c.id ? C.green : C.text }}
                  >
                    {c.name} · %{c.share}
                  </Txt>
                  <Txt bold>{money(c.spent)}</Txt>
                </View>
                <Txt style={{ color: C.muted, fontSize: 12 }}>
                  Önceki: {money(c.previousSpent)} · Fark: {money(c.change)} ·{" "}
                  {c.percent === null
                    ? "Önceki tutar sıfır"
                    : `${c.percent > 0 ? "+" : ""}%${c.percent}`}
                </Txt>
                <Progress ratio={c.share / 100} color={c.color} />
              </Pressable>
            ))
        ) : (
          <Empty
            icon="bar-chart-2"
            title="Karşılaştırılacak gider yok"
            body="Gider eklediğinde kategori eğilimlerin burada oluşacak."
          />
        )}
      </Card>
      {selected ? (
        <Card>
          <Txt bold style={styles.sectionTitle}>
            {selected.name} · 6 aylık eğilim
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
            Seçili aydan önceki 3 tamamlanmış takvim ayı ortalaması:{" "}
            {money(selected.average)}. Kayıtsız aylar sıfır kabul edilir.
          </Txt>
          <View style={{ gap: 13, marginTop: 18 }}>
            {selected.history.map((h) => (
              <View key={h.month} style={{ gap: 5 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <Txt style={{ fontSize: 12 }}>{monthLabel(h.month)}</Txt>
                  <Txt bold style={{ fontSize: 12 }}>
                    {money(h.amount)}
                  </Txt>
                </View>
                <Progress
                  ratio={
                    h.amount /
                    Math.max(...selected.history.map((v) => v.amount), 1)
                  }
                  color={selected.color}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
export function AnalysisDashboard({
  data,
  month,
  mobile,
  onAccounts,
  onCalendar,
  onBudget,
  initialTab = "forecast",
}: {
  data: BudgetData;
  month: string;
  mobile: boolean;
  onAccounts: () => void;
  onCalendar: () => void;
  onBudget: (id: string) => void;
  initialTab?: "forecast" | "reports";
}) {
  const [tab, setTab] = useState<"forecast" | "reports">(initialTab);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
        <Choice
          title="Gelecek ay tahmini"
          selected={tab === "forecast"}
          onPress={() => setTab("forecast")}
        />
        <Choice
          title="Raporlar ve uyarılar"
          selected={tab === "reports"}
          onPress={() => setTab("reports")}
        />
      </View>
      {tab === "forecast" ? (
        <ForecastDashboard
          data={data}
          mobile={mobile}
          onAccounts={onAccounts}
          onCalendar={onCalendar}
        />
      ) : (
        <ReportsDashboard
          data={data}
          month={month}
          mobile={mobile}
          onBudget={onBudget}
        />
      )}
    </View>
  );
}
