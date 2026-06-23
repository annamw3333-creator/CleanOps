import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/AuthContext";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="job/[id]" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="post-job" options={{ presentation: "modal" }} />
            <Stack.Screen name="employee/[id]" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="feedback/[token]" />
            <Stack.Screen name="subscription" options={{ presentation: "modal" }} />
            <Stack.Screen name="teams" />
            <Stack.Screen name="operations" />
            <Stack.Screen name="clients" />
            <Stack.Screen name="driver" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
