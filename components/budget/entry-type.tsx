import React from "react";
import { Pressable, View } from "react-native";
import { C, Icon, Txt } from "./ui";
export function EntryTypeSelector({
  value,
  onChange,
  locked = false,
  disableTransfer = false,
}: {
  value: "expense" | "income" | "transfer";
  onChange: (type: "expense" | "income" | "transfer") => void;
  locked?: boolean;
  disableTransfer?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.bg,
        borderRadius: 11,
        padding: 4,
        gap: 4,
        marginBottom: 22,
      }}
    >
      {(
        [
          {
            id: "expense",
            label: "Gider",
            icon: "arrow-up-right",
            color: C.red,
          },
          {
            id: "income",
            label: "Gelir",
            icon: "arrow-down-left",
            color: C.green,
          },
          { id: "transfer", label: "Transfer", icon: "repeat", color: C.blue },
        ] as const
      ).map((item) => {
        const disabled = locked || (item.id === "transfer" && disableTransfer);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            aria-pressed={value === item.id}
            disabled={disabled}
            onPress={() => onChange(item.id)}
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingHorizontal: 6,
              paddingVertical: 10,
              borderRadius: 8,
              opacity: disabled ? 0.45 : 1,
              backgroundColor: value === item.id ? C.elevated : "transparent",
            }}
          >
            <Icon
              name={item.icon}
              color={value === item.id ? item.color : C.dim}
              size={15}
            />
            <Txt
              bold
              style={{
                fontSize: 12,
                flexShrink: 1,
                color: value === item.id ? C.text : C.dim,
              }}
            >
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
