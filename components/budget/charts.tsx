import React from "react";
import { View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { BudgetData, money, summarize, trend } from "@/lib/budget/model";
import { C, Card, Empty, Txt, styles } from "./ui";
export function Distribution({
  data,
  month,
  narrow,
}: {
  data: BudgetData;
  month: string;
  narrow: boolean;
}) {
  const summary = summarize(data, month);
  const rows = summary.categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const r = 68;
  const circumference = 2 * Math.PI * r;
  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.between}>
        <Txt bold style={styles.sectionTitle}>
          Harcama dağılımı
        </Txt>
        <Txt style={styles.label}>KATEGORİLER</Txt>
      </View>
      <Txt style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
        Paran bu ay nereye gitti?
      </Txt>
      {!summary.expense ? (
        <Empty
          icon="pie-chart"
          title="Henüz gider yok"
          body="İlk giderini eklediğinde kategori dağılımın burada görünecek."
        />
      ) : (
        <View
          style={{
            flexDirection: narrow ? "column" : "row",
            gap: 18,
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <View style={{ width: 182, height: 182 }}>
            <Svg width={182} height={182} viewBox="0 0 182 182">
              <Circle
                cx={91}
                cy={91}
                r={r}
                fill="none"
                stroke={C.elevated}
                strokeWidth={15}
              />
              {rows.map((c, index) => {
                const length = (c.spent / summary.expense) * circumference;
                const start = rows
                  .slice(0, index)
                  .reduce(
                    (total, category) =>
                      total +
                      (category.spent / summary.expense) * circumference,
                    0,
                  );
                return (
                  <Circle
                    key={c.id}
                    cx={91}
                    cy={91}
                    r={r}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={15}
                    strokeDasharray={`${Math.max(0.1, length - 3)} ${circumference}`}
                    strokeDashoffset={-start}
                    rotation={-90}
                    origin="91,91"
                  />
                );
              })}
            </Svg>
            <View
              style={{
                position: "absolute",
                top: 59,
                left: 0,
                width: 182,
                alignItems: "center",
              }}
            >
              <Txt style={{ fontSize: 11, color: C.muted }}>TOPLAM GİDER</Txt>
              <Txt bold style={{ fontSize: 22, lineHeight: 30, marginTop: 4 }}>
                {money(summary.expense, true)}
              </Txt>
            </View>
          </View>
          <View
            style={{
              flex: narrow ? undefined : 1,
              width: narrow ? "100%" : undefined,
              gap: 10,
            }}
          >
            {rows.map((c) => (
              <View
                key={c.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: c.color,
                  }}
                />
                <Txt
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 12, color: C.muted }}
                >
                  {c.name}
                </Txt>
                <Txt bold style={{ fontSize: 12 }}>
                  {Math.round((c.spent / summary.expense) * 100)}%
                </Txt>
                <Txt
                  style={{
                    width: 66,
                    textAlign: "right",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  {money(c.spent, true)}
                </Txt>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}
export function TrendChart({
  data,
  month,
}: {
  data: BudgetData;
  month: string;
}) {
  const rows = trend(data, month);
  const max = Math.max(...rows.map((r) => r.expense), 1);
  const ceiling = Math.max(1000, Math.ceil(max / 5000) * 5000);
  const x = (i: number) => 58 + i * 61;
  const y = (n: number) => 166 - (n / ceiling) * 123;
  const line = rows
    .map((r, i) => `${i ? "L" : "M"} ${x(i)} ${y(r.expense)}`)
    .join(" ");
  const previous = rows[4].expense;
  const current = rows[5].expense;
  const percent = previous ? Math.round((current / previous - 1) * 100) : null;
  return (
    <Card style={{ flex: 1.2, minWidth: 0 }}>
      <View style={styles.between}>
        <Txt bold style={styles.sectionTitle}>
          Aydan aya trend
        </Txt>
        {percent !== null ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: percent <= 0 ? "#22C55E12" : "#FBBF2412",
              borderRadius: 6,
            }}
          >
            <Txt
              bold
              style={{ color: percent <= 0 ? C.green : C.amber, fontSize: 11 }}
            >
              {percent > 0 ? "+" : ""}
              {percent}%
            </Txt>
          </View>
        ) : null}
      </View>
      <Txt style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
        Son 6 ayın toplam giderleri
      </Txt>
      <View style={{ marginTop: 8 }}>
        <Svg width="100%" height={225} viewBox="0 0 400 225">
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.green} stopOpacity="0.22" />
              <Stop offset="1" stopColor={C.green} stopOpacity="0.01" />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map((f) => (
            <React.Fragment key={f}>
              <Line
                x1={58}
                x2={364}
                y1={y(ceiling * f)}
                y2={y(ceiling * f)}
                stroke={C.border}
                strokeDasharray="3 5"
              />
              <SvgText
                x={43}
                y={y(ceiling * f) + 4}
                fill={C.dim}
                fontSize={11}
                textAnchor="end"
              >
                {ceiling * f >= 1000 ? `${(ceiling * f) / 1000}b` : ceiling * f}
              </SvgText>
            </React.Fragment>
          ))}
          <Path
            d={`${line} L ${x(5)} 166 L ${x(0)} 166 Z`}
            fill="url(#trendFill)"
          />
          <Path
            d={line}
            fill="none"
            stroke={C.green}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {rows.map((r, i) => (
            <React.Fragment key={r.key}>
              <Circle
                cx={x(i)}
                cy={y(r.expense)}
                r={i === 5 ? 5 : 3.5}
                fill={C.panel}
                stroke={C.green}
                strokeWidth={2}
              />
              <SvgText
                x={x(i)}
                y={194}
                fill={i === 5 ? C.text : C.dim}
                textAnchor="middle"
                fontSize={11}
              >
                {r.label}
              </SvgText>
            </React.Fragment>
          ))}
          <SvgText
            x={x(5)}
            y={Math.max(20, y(current) - 15)}
            fill={C.green}
            textAnchor="middle"
            fontSize={12}
            fontWeight="bold"
          >
            {money(current, true)}
          </SvgText>
        </Svg>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          marginTop: -5,
        }}
      >
        <View
          style={{
            height: 5,
            width: 18,
            backgroundColor: C.green,
            borderRadius: 3,
          }}
        />
        <Txt style={{ fontSize: 11, color: C.muted }}>Toplam gider · TRY</Txt>
        <Txt style={{ fontSize: 11, color: C.dim, marginLeft: "auto" }}>
          Seçili ay dahil
        </Txt>
      </View>
    </Card>
  );
}
