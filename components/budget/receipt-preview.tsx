import React from "react";
import { Modal, View, useWindowDimensions } from "react-native";
import type { Receipt } from "@/lib/budget/receipt-model";
import PdfPreview from "./pdf-preview";
import { C, IconButton, Txt } from "./ui";
export function ReceiptPreview({
  accountId,
  receipt,
  onClose,
}: {
  accountId: string;
  receipt: Receipt;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "#02060BE6",
          justifyContent: "center",
          alignItems: "center",
          padding: width < 720 ? 8 : 20,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 1120,
            height: Math.min(height - (width < 720 ? 24 : 48), 960),
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.panel,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold style={{ fontSize: 18 }}>
                PDF önizleme
              </Txt>
              <Txt numberOfLines={2} style={{ color: C.muted, fontSize: 12 }}>
                {receipt.name}
              </Txt>
            </View>
            <IconButton name="x" label="Önizlemeyi kapat" onPress={onClose} />
          </View>
          <PdfPreview
            accountId={accountId}
            receipt={receipt}
            onClose={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}
