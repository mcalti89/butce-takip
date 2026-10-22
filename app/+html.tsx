import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#111827" />
        <meta name="application-name" content="Bütçe Takip" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/budget-192.png" />
        <title>Bütçe Takip — Paranın kontrolü sende</title>
        <meta
          name="description"
          content="Gelirini, giderini ve aylık kategori bütçelerini yerel olarak takip et. Sade içgörüler, görsel analizler ve CSV desteği."
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
