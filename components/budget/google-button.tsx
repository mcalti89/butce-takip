import React from "react";
import { Linking } from "react-native";
import { Button } from "./ui";
export function GoogleButton(_props: {
  onCredential: (credential: string) => Promise<void>;
}) {
  return (
    <Button
      onPress={() =>
        void Linking.openURL("https://butcetakip-vercel-drop.vercel.app/")
      }
    >
      Google ile web uygulamasını aç
    </Button>
  );
}
