import { Stack } from "expo-router";
export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0D1422" },
      }}
    />
  );
}
