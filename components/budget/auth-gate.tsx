import React from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import { GoogleButton } from "./google-button";
import { Button, C, ErrorText, Icon, Txt } from "./ui";

export function BudgetGate({ children }: { children: React.ReactNode }) {
  const { loading, cloud, signInGoogle, refreshSession } = useBudget();
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator color={C.green} size="large" />
        <Txt style={{ color: C.muted }}>Hesabın hazırlanıyor…</Txt>
      </View>
    );
  if (cloud.authenticated && cloud.mode === "cloud") return <>{children}</>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 440,
          paddingVertical: 36,
          paddingHorizontal: 22,
          backgroundColor: C.panel,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 24,
          gap: 22,
        }}
      >
        <View style={{ alignItems: "center", gap: 14 }}>
          <View
            style={{
              backgroundColor: "#12382B",
              borderRadius: 20,
              padding: 18,
            }}
          >
            <Icon name="pie-chart" color={C.green} size={30} />
          </View>
          <Txt bold style={{ fontSize: 29, lineHeight: 38 }}>
            bütçe.
          </Txt>
          <Txt
            bold
            style={{ fontSize: 24, lineHeight: 32, textAlign: "center" }}
          >
            Bütçen, sana özel.
          </Txt>
          <Txt style={{ color: C.muted, textAlign: "center", lineHeight: 23 }}>
            Gelirlerini, giderlerini ve hedeflerini tek yerde takip et. Başlamak
            için Google hesabınla giriş yap.
          </Txt>
        </View>
        {cloud.googleEnabled || Platform.OS !== "web" ? (
          <GoogleButton onCredential={signInGoogle} />
        ) : (
          <Txt style={{ color: C.amber, textAlign: "center" }}>
            Google ile giriş bağlantısı şu anda kullanılamıyor. Lütfen biraz
            sonra tekrar dene.
          </Txt>
        )}
        <ErrorText message={cloud.error} />
        {(cloud.error || !cloud.googleEnabled) && (
          <Button kind="secondary" small onPress={() => void refreshSession()}>
            Bağlantıyı yeniden kontrol et
          </Button>
        )}
        <View style={{ height: 1, backgroundColor: C.border }} />
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Icon name="lock" color={C.green} size={17} />
            <Txt style={{ flex: 1, fontSize: 12, color: C.muted }}>
              Her hesap yalnızca kendi bütçesini görür.
            </Txt>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Icon name="plus-circle" color={C.green} size={17} />
            <Txt style={{ flex: 1, fontSize: 12, color: C.muted }}>
              Yeni hesaplar boş bütçeyle başlar. Örnek işlem eklenmez.
            </Txt>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
