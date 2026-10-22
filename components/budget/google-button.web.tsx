import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { googleConfig } from "@/lib/budget/cloudApi";
import { Button, C, ErrorText, Txt } from "./ui";

type GoogleSdk = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        nonce: string;
        auto_select: boolean;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => void;
      cancel: () => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleSdk;
  }
}
let sdkPromise: Promise<GoogleSdk> | undefined;
function loadSdk() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<GoogleSdk>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      script.remove();
      sdkPromise = undefined;
      reject(
        new Error(
          "Google giriş ekranı yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.",
        ),
      );
    }, 15000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      clearTimeout(timeout);
      if (window.google?.accounts?.id) resolve(window.google);
      else {
        sdkPromise = undefined;
        script.remove();
        reject(new Error("Google giriş ekranı açılamadı."));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      sdkPromise = undefined;
      script.remove();
      reject(
        new Error(
          "Google’a ulaşılamadı. Bağlantını veya içerik engelleyicini kontrol et.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}
export function GoogleButton({
  onCredential,
}: {
  onCredential: (credential: string) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([googleConfig(), loadSdk()])
      .then(([config, sdk]) => {
        if (!active || !container.current) return;
        sdk.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          auto_select: false,
          callback: (response) => {
            if (!active || inFlight.current) return;
            inFlight.current = true;
            void onCredential(response.credential)
              .catch((e) => {
                if (active) {
                  setError((e as Error).message);
                  setAttempt((n) => n + 1);
                }
              })
              .finally(() => {
                inFlight.current = false;
              });
          },
        });
        container.current.replaceChildren();
        sdk.accounts.id.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "tr",
          width: Math.min(320, Math.max(200, window.innerWidth - 88)),
        });
        setReady(true);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [attempt, onCredential]);
  return (
    <View style={{ alignItems: "center", gap: 12, minHeight: 58 }}>
      {!ready && !error && (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator color={C.green} />
          <Txt style={{ color: C.muted }}>Google bağlantısı hazırlanıyor…</Txt>
        </View>
      )}
      <div ref={container} style={{ minHeight: ready ? 44 : 0 }} />
      <ErrorText message={error} />
      {error && (
        <Button
          kind="secondary"
          small
          onPress={() => {
            setReady(false);
            setError("");
            setAttempt((n) => n + 1);
          }}
        >
          Tekrar dene
        </Button>
      )}
    </View>
  );
}
