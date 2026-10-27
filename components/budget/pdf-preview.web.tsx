import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { Receipt } from "@/lib/budget/receipt-model";
import { cloudDownloadReceipt } from "@/lib/budget/cloudApi";
import { C, ErrorText, Txt } from "./ui";
export default function PdfPreview({
  accountId,
  receipt,
  onClose,
}: {
  accountId: string;
  receipt: Receipt;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(() => crypto.randomUUID());
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState("");
  const finished = useRef(false);
  useEffect(() => {
    let active = true;
    void cloudDownloadReceipt(accountId, receipt.id)
      .then((data) => {
        if (active) setBytes(data);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [accountId, receipt.id]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.nonce !== nonce
      )
        return;
      if (event.data.type === "budget-pdf-ready") setReady(true);
      if (event.data.type === "budget-pdf-rendered") {
        finished.current = true;
        setRendered(true);
      }
      if (event.data.type === "budget-pdf-error") {
        finished.current = true;
        setError(
          "PDF görüntülenemedi. Pencereyi kapatıp tekrar deneyebilir veya İndir düğmesini kullanabilirsin.",
        );
      }
      if (event.data.type === "budget-pdf-close") onClose();
    };
    window.addEventListener("message", message);
    const timer = setTimeout(() => {
      if (!finished.current)
        setError(
          (old) =>
            old ||
            "Önizleme yüklenemedi. Pencereyi kapatıp tekrar deneyebilirsin.",
        );
    }, 30000);
    return () => {
      window.removeEventListener("message", message);
      clearTimeout(timer);
    };
  }, [nonce, onClose]);
  useEffect(() => {
    if (!ready || !bytes || error) return;
    const data = bytes.slice().buffer;
    frame.current?.contentWindow?.postMessage(
      { type: "budget-pdf-document", nonce, data },
      window.location.origin,
      [data],
    );
  }, [bytes, ready, nonce, error]);
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: C.bg }}>
      {!rendered && !error ? (
        <View
          style={{
            padding: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ActivityIndicator color={C.green} />
          <Txt style={{ color: C.muted }}>Dekont yükleniyor…</Txt>
        </View>
      ) : null}
      {error ? (
        <View style={{ padding: 18 }}>
          <ErrorText message={error} />
        </View>
      ) : null}
      <iframe
        ref={frame}
        title={`${receipt.name} PDF önizleme`}
        src={`/receipt-viewer.html#${nonce}`}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        style={{
          display: error ? "none" : "block",
          flex: 1,
          width: "100%",
          height: "100%",
          minHeight: 0,
          border: 0,
        }}
      />
    </View>
  );
}
