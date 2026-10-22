import React, { useState } from "react";
import { View } from "react-native";
import { BudgetData, money, monthLabel } from "@/lib/budget/model";
import { savingsSummary, setSavingsGoal } from "@/lib/budget/savings";
import { useBudget } from "@/lib/budget/store";
import {
  Button,
  C,
  Card,
  ErrorText,
  Field,
  Icon,
  Progress,
  Sheet,
  Txt,
  styles,
} from "./ui";

export function SavingsCard({
  data,
  month,
  mobile,
  onEdit,
}: {
  data: BudgetData;
  month: string;
  mobile: boolean;
  onEdit: () => void;
}) {
  const s = savingsSummary(data, month);
  const hasGoal = s.target !== undefined;
  const color = s.net < 0 ? C.amber : C.green;
  return (
    <Card
      style={{
        backgroundColor: "#13281F",
        borderColor: "#254638",
        padding: mobile ? 18 : 22,
      }}
    >
      <View
        style={{
          flexDirection: mobile ? "column" : "row",
          gap: 12,
          justifyContent: "space-between",
          alignItems: mobile ? "stretch" : "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            flex: 1,
          }}
        >
          <View
            style={{
              backgroundColor: "#22C55E18",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Icon name="target" color={C.green} size={23} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold style={styles.sectionTitle}>
              Aylık tasarruf hedefi
            </Txt>
            <Txt style={{ fontSize: 11, color: C.muted }}>
              {monthLabel(month)} · Küçük adımlar, güçlü bir birikim.
            </Txt>
          </View>
        </View>
        <Button
          small
          kind={hasGoal ? "secondary" : "primary"}
          icon={hasGoal ? "edit-2" : "plus"}
          onPress={onEdit}
        >
          {hasGoal ? "Hedefi düzenle" : "Hedef belirle"}
        </Button>
      </View>
      {hasGoal ? (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 18,
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, minWidth: 135 }}>
              <Txt style={styles.label}>NET TASARRUF</Txt>
              <Txt
                bold
                style={{ fontSize: mobile ? 25 : 30, lineHeight: 42, color }}
              >
                {money(s.saved)}
              </Txt>
              <Txt style={{ fontSize: 11, color: C.muted }}>
                Hedef: {money(s.target!)}
              </Txt>
            </View>
            <View
              style={{
                justifyContent: "center",
                alignItems: "flex-end",
                flexGrow: 1,
              }}
            >
              <Txt
                bold
                style={{ fontSize: 22, color: s.achieved ? C.green : C.text }}
              >
                %{Math.floor(s.ratio * 100)} tamamlandı
              </Txt>
              <Txt style={{ fontSize: 12, color: C.muted }}>
                {s.achieved
                  ? s.surplus > 0
                    ? `${money(s.surplus)} hedefin üzerinde`
                    : "Hedefine ulaştın!"
                  : `${money(s.remaining!)} hedefe kaldı`}
              </Txt>
            </View>
          </View>
          <Progress ratio={s.ratio} color={color} />
          {s.net < 0 ? (
            <Txt style={{ color: C.amber, fontSize: 12, marginTop: 12 }}>
              Giderlerin gelirinden {money(Math.abs(s.net))} fazla. Bu ay net
              tasarruf henüz oluşmadı.
            </Txt>
          ) : s.achieved ? (
            <Txt style={{ color: C.green, fontSize: 12, marginTop: 12 }}>
              Kayıtlarına göre bu ayki hedef tamamlandı. Yeni işlemler
              ilerlemeyi günceller.
            </Txt>
          ) : null}
        </>
      ) : (
        <Txt style={{ color: C.muted, fontSize: 12, marginTop: 17 }}>
          Bu ay için bir tutar seç. Gelir ve giderlerini kaydettikçe hedefe ne
          kadar yaklaştığını gör.
        </Txt>
      )}
      <Txt
        style={{ color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 14 }}
      >
        İlerleme = seçili ayın gelir − gider farkı (en az 0). Gerçek bir birikim
        hesabına ayrılan tutar değildir; kategori limitlerinden bağımsızdır.
      </Txt>
    </Card>
  );
}

export function SavingsEditor({
  month,
  onClose,
  onDone,
}: {
  month: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { data, update } = useBudget();
  const current = data.savingsGoals?.[month];
  const [amount, setAmount] = useState(
    current === undefined ? "" : String(current).replace(".", ","),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const save = async (remove = false) => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await update((d) => setSavingsGoal(d, month, remove ? null : amount));
      onDone(
        remove
          ? "Bu ayın tasarruf hedefi kaldırıldı."
          : "Aylık tasarruf hedefi kaydedildi.",
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
      title={confirmRemove ? "Hedef kaldırılsın mı?" : "Aylık tasarruf hedefi"}
      subtitle={`${monthLabel(month)} · Yalnızca bu ay için geçerli.`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {confirmRemove ? (
        <>
          <Txt style={{ color: C.muted, marginVertical: 18 }}>
            {money(current!)} hedefi kaldırılacak. Gelir, gider, diğer ayların
            hedefleri ve kategori bütçeleri korunur.
          </Txt>
          <ErrorText message={error} />
          <Button
            kind="danger"
            icon="trash-2"
            busy={busy}
            onPress={() => save(true)}
          >
            Evet, hedefi kaldır
          </Button>
          <Button
            kind="secondary"
            disabled={busy}
            style={{ marginTop: 10 }}
            onPress={() => {
              setConfirmRemove(false);
              setError("");
            }}
          >
            Vazgeç
          </Button>
        </>
      ) : (
        <>
          <Txt style={{ color: C.muted, fontSize: 12, marginVertical: 16 }}>
            Bu ay gelirinden ne kadarını elde tutmak istiyorsun? Hedefi
            değiştirmek işlem veya gider oluşturmaz.
          </Txt>
          <Field
            label="Tasarruf hedefi (₺)"
            accessibilityLabel="Tasarruf hedefi tutarı"
            value={amount}
            onChangeText={setAmount}
            placeholder="Örn. 5.000,00"
            inputMode="decimal"
            keyboardType="decimal-pad"
            maxLength={20}
            editable={!busy}
          />
          <ErrorText message={error} />
          <Button icon="check" busy={busy} onPress={() => save()}>
            Hedefi kaydet
          </Button>
          {current !== undefined ? (
            <Button
              kind="danger"
              icon="trash-2"
              disabled={busy}
              style={{ marginTop: 10 }}
              onPress={() => {
                setConfirmRemove(true);
                setError("");
              }}
            >
              Hedefi kaldır
            </Button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
