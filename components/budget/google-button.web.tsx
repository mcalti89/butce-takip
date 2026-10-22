import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { googleConfig } from "@/lib/budget/cloudApi";
import { Button, C, ErrorText, Txt } from "./ui";

import { GOOGLE_SDK_READY, loadGoogleSdk } from "@/lib/budget/googleSdk.web";

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
  const [slow, setSlow] = useState(false);
  const retry = useCallback(() => {
    setReady(false);
    setError("");
    setSlow(false);
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    const recover = () => {
      if (!ready && error && document.visibilityState !== "hidden") retry();
    };
    window.addEventListener(GOOGLE_SDK_READY, recover);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener(GOOGLE_SDK_READY, recover);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [ready, error, retry]);
  useEffect(() => {
    let active = true;
    const slowTimer = setTimeout(() => {
      if (active) setSlow(true);
    }, 8000);
    void Promise.all([googleConfig(), loadGoogleSdk()])
      .then(([config, sdk]) => {
        if (!active || !container.current) return;
        clearTimeout(slowTimer);
        sdk.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          auto_select: false,
          callback: (response) => {
            if (!active || inFlight.current) return;
            inFlight.current = true;
            setError("");
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
        clearTimeout(slowTimer);
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
      clearTimeout(slowTimer);
    };
  }, [attempt, onCredential]);
  return (
    <View style={{ alignItems: "center", gap: 12, minHeight: 58 }}>
      {!ready && !error && (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator color={C.green} />
          <Txt style={{ color: C.muted, flexShrink: 1 }}>
            {slow
              ? "Google bağlantısı biraz yavaş; giriş düğmesi hazırlanıyor…"
              : "Google bağlantısı hazırlanıyor…"}
          </Txt>
        </View>
      )}
      <div ref={container} style={{ minHeight: ready ? 44 : 0 }} />
      <ErrorText message={error} />
      {error && (
        <Button kind="secondary" small onPress={retry}>
          Tekrar dene
        </Button>
      )}
    </View>
  );
}
