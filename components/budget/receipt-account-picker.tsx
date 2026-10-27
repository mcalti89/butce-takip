import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import type { FinancialAccount } from "@/lib/budget/finance";
import type { ImportMode } from "@/lib/budget/receipt-import";
import {
  compareAccountIban,
  saveAccountIdentity,
} from "@/lib/budget/account-identity";
import { Button, C, ErrorText, Field, Txt } from "./ui";

function IdentityEditor({
  account,
  disabled,
  onBusy,
}: {
  account: FinancialAccount;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { update } = useBudget();
  const [bankName, setBankName] = useState(account.bankName ?? "");
  const [iban, setIban] = useState(account.iban ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save() {
    if (busy || disabled) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      await update((d) => saveAccountIdentity(d, account.id, bankName, iban));
      setMessage("Hesabın banka ve IBAN bilgileri kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Field
        label="Banka adı"
        value={bankName}
        maxLength={80}
        editable={!disabled}
        onChangeText={(value) => {
          setBankName(value);
          setMessage("");
        }}
      />
      <Field
        label="IBAN"
        value={iban}
        maxLength={48}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!disabled}
        onChangeText={(value) => {
          setIban(value);
          setMessage("");
        }}
      />
      <Txt style={{ color: C.muted, fontSize: 12 }}>
        Bu alanlar yalnızca “Banka / IBAN bilgilerini kaydet” ile hesabına
        kaydedilir. Dekonttaki karşı tarafın IBAN’ını kendi hesabına yazma.
      </Txt>
      <ErrorText message={error} />
      {message ? (
        <Txt accessibilityLiveRegion="polite" style={{ color: C.green }}>
          {message}
        </Txt>
      ) : null}
      <Button
        small
        kind="secondary"
        busy={busy}
        disabled={disabled}
        onPress={() => void save()}
      >
        Banka / IBAN bilgilerini kaydet
      </Button>
    </View>
  );
}

export function ReceiptAccountPicker({
  label,
  accountId,
  onSelect,
  readIban,
  excludeId,
  mode,
  disabled,
  onBusy,
}: {
  label: string;
  accountId: string;
  onSelect: (id: string) => void;
  readIban?: string;
  excludeId?: string;
  mode: ImportMode;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { data } = useBudget();
  const [editing, setEditing] = useState(false);
  const accounts = (data.financialAccounts ?? []).filter(
    (a) =>
      !a.archived &&
      a.id !== excludeId &&
      (mode === "transfer" ||
        (a.kind !== "investment" &&
          (mode !== "exchange" || a.kind !== "card"))),
  );
  const account = accounts.find((a) => a.id === accountId);
  const status = compareAccountIban(account?.iban, readIban);
  const messages = {
    unread: "Bu tarafın IBAN’ı dekonttan okunamadı; hesabını kontrol et.",
    missing: "Seçilen hesapta kayıtlı IBAN yok; karşılaştırma yapılamadı.",
    match: "Dekonttaki IBAN ile kayıtlı IBAN eşleşiyor.",
    mismatch:
      "Dikkat: Dekonttaki IBAN ile seçilen hesabın kayıtlı IBAN’ı farklı. Hesap seçimini kontrol et.",
  };
  return (
    <View
      style={{
        gap: 10,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <Txt bold>{label}</Txt>
      <Txt selectable>Dekonttan okunan IBAN: {readIban ?? "Bulunamadı"}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Button
          small
          kind="ghost"
          disabled={disabled || !accountId}
          onPress={() => {
            setEditing(false);
            onSelect("");
          }}
        >
          Seçimi temizle
        </Button>
        {accounts.map((a) => (
          <Button
            key={a.id}
            small
            disabled={disabled}
            kind={accountId === a.id ? "secondary" : "ghost"}
            accessibilityLabel={`${label}: ${a.name}, ${a.currency}${accountId === a.id ? ", seçili" : ""}`}
            onPress={() => {
              setEditing(false);
              onSelect(a.id);
            }}
          >
            {a.name} · {a.currency}
          </Button>
        ))}
      </View>
      {!accounts.length ? (
        <Txt>Uygun hesap yok. Hesaplar bölümünden bir hesap ekle.</Txt>
      ) : !account ? (
        <Txt>Hesabını seç.</Txt>
      ) : (
        <>
          <Txt>Banka: {account.bankName || "Kaydedilmemiş"}</Txt>
          <Txt selectable>Kayıtlı IBAN: {account.iban || "Kaydedilmemiş"}</Txt>
          <Txt
            accessibilityLiveRegion="polite"
            style={{ color: status === "match" ? C.green : C.amber }}
          >
            {messages[status]}
          </Txt>
          {account.kind !== "cash" ? (
            <>
              <Button
                small
                kind="ghost"
                disabled={disabled}
                onPress={() => setEditing((value) => !value)}
              >
                {editing
                  ? "Banka / IBAN düzenlemeyi kapat"
                  : "Banka / IBAN bilgilerini düzenle"}
              </Button>
              {editing ? (
                <IdentityEditor
                  key={account.id}
                  account={account}
                  disabled={disabled}
                  onBusy={onBusy}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}
