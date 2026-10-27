import React from "react";
import { View } from "react-native";
import type { Receipt } from "@/lib/budget/receipt-model";
import { ErrorText } from "./ui";
export default function PdfPreview(_props: {
  accountId: string;
  receipt: Receipt;
  onClose: () => void;
}) {
  return (
    <View style={{ padding: 20 }}>
      <ErrorText message="Bu cihazda önizleme açılamıyor. Dekontu İndir düğmesiyle açabilirsin." />
    </View>
  );
}
