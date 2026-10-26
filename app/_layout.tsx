import "@/global.css";
import "@/lib/_core/nativewind-pressable";
import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { Metrics } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  initManusRuntime,
  subscribeSafeAreaInsets,
} from "@/lib/_core/manus-runtime";
import { BudgetGate } from "@/components/budget/auth-gate";
import { BudgetProvider } from "@/lib/budget/store";
import { ReceiptProvider } from "@/lib/budget/receipts";
export const unstable_settings = { anchor: "(tabs)" };
export default function RootLayout() {
  useFonts({ Plex: IBMPlexSans_400Regular, PlexSemi: IBMPlexSans_600SemiBold });
  const [metrics, setMetrics] = useState<Metrics>(
    initialWindowMetrics || {
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      frame: { x: 0, y: 0, width: 0, height: 0 },
    },
  );
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());
  useEffect(() => {
    initManusRuntime();
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return subscribeSafeAreaInsets(setMetrics);
  }, []);
  const content = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0D1422" }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <BudgetProvider>
            <ReceiptProvider>
              <BudgetGate>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "#0D1422" },
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="oauth/callback" />
                </Stack>
                <StatusBar style="light" />
              </BudgetGate>
            </ReceiptProvider>
          </BudgetProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {Platform.OS === "web" ? (
          <SafeAreaFrameContext.Provider value={metrics.frame}>
            <SafeAreaInsetsContext.Provider value={metrics.insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        ) : (
          content
        )}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
