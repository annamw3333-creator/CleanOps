import { useEffect, useState } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading, loginAsGuest } = useAuth();
  const router = useRouter();
  const [guestTried, setGuestTried] = useState(false);

  // Shareable demo: visiting `…/?guest=1` auto-enters the app as the demo Owner.
  const wantsGuest = Platform.OS === "web" && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("guest") === "1";

  useEffect(() => {
    if (loading) return;
    if (user) { router.replace("/(tabs)"); return; }
    if (wantsGuest && !guestTried) {
      setGuestTried(true);
      loginAsGuest()
        .then(() => router.replace("/(tabs)"))
        .catch(() => router.replace("/auth"));
      return;
    }
    if (!wantsGuest) router.replace("/auth");
  }, [user, loading, wantsGuest, guestTried]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.gold} />
    </View>
  );
}
