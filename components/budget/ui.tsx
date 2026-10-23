import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
export const C = {
  bg: "#0D1422",
  panel: "#151E2E",
  elevated: "#1B273A",
  border: "#283347",
  text: "#F3F6FC",
  muted: "#A0ADC1",
  dim: "#718198",
  green: "#22C55E",
  red: "#FB7185",
  amber: "#FBBF24",
  blue: "#60A5FA",
};
export function Txt({
  style,
  bold,
  children,
  ...props
}: TextProps & { bold?: boolean }) {
  return (
    <Text
      {...props}
      style={[
        {
          color: C.text,
          fontFamily: bold ? "PlexSemi" : "Plex",
          fontSize: 14,
          lineHeight: 21,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Icon({
  name,
  size = 20,
  color = C.muted,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <Feather
      name={
        name === "sparkles"
          ? "zap"
          : (name as React.ComponentProps<typeof Feather>["name"])
      }
      size={size}
      color={color}
    />
  );
}
export function Button({
  children,
  onPress,
  icon,
  kind = "primary",
  disabled,
  busy,
  small,
  style,
  accessibilityLabel,
}: {
  children?: React.ReactNode;
  accessibilityLabel?: string;
  onPress: () => void;
  icon?: string;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const color =
    kind === "primary" ? "#07150C" : kind === "danger" ? C.red : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ??
        (typeof children === "string" ? children : undefined)
      }
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        {
          minHeight: small ? 38 : 46,
          paddingHorizontal: small ? 12 : 18,
          paddingVertical: 9,
          borderRadius: 10,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            kind === "primary"
              ? C.green
              : kind === "secondary"
                ? C.elevated
                : kind === "danger"
                  ? "#FB718512"
                  : "transparent",
          borderWidth: kind === "secondary" ? 1 : 0,
          borderColor: C.border,
          opacity: disabled || busy ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={small ? 16 : 18} />
      ) : null}
      <Txt
        bold
        style={{
          color,
          fontSize: small ? 13 : 14,
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
export function IconButton({
  name,
  onPress,
  label,
}: {
  name: string;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 42,
        width: 42,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 10,
        backgroundColor: pressed ? C.elevated : "transparent",
      })}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: C.panel,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 16,
          padding: 22,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8, marginBottom: 18 }}>
      <Txt bold style={{ fontSize: 13 }}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={C.dim}
        {...props}
        style={[
          {
            backgroundColor: C.bg,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 10,
            color: C.text,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontFamily: "Plex",
            fontSize: 15,
            minHeight: 48,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  visible = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  visible?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#02060BCF",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 540,
            maxHeight: "90%",
            borderRadius: 20,
            backgroundColor: C.panel,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 18,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt bold style={{ fontSize: 23, lineHeight: 30 }}>
                {title}
              </Txt>
              {subtitle ? (
                <Txt style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <IconButton name="x" label="Kapat" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export function Empty({
  icon = "inbox",
  title,
  body,
}: {
  icon?: string;
  title: string;
  body: string;
}) {
  return (
    <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
      <View
        style={{ backgroundColor: C.elevated, padding: 16, borderRadius: 16 }}
      >
        <Icon name={icon} size={24} color={C.green} />
      </View>
      <Txt bold>{title}</Txt>
      <Txt style={{ color: C.muted, textAlign: "center", maxWidth: 320 }}>
        {body}
      </Txt>
    </View>
  );
}
export function Progress({ ratio, color }: { ratio: number; color: string }) {
  return (
    <View
      style={{
        height: 6,
        backgroundColor: C.elevated,
        borderRadius: 5,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: 6,
          backgroundColor: color,
          borderRadius: 5,
        }}
      />
    </View>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <Txt accessibilityRole="alert" style={{ color: C.red, marginBottom: 14 }}>
      {message}
    </Txt>
  ) : null;
}
export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 17, lineHeight: 25 },
  label: { fontSize: 11, letterSpacing: 1.2, color: C.muted },
});
