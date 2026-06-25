import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { colors } from "@/src/theme";

// Slim global bar shown only while exploring via the shareable guest link.
export default function DemoBanner() {
  const { isGuest, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (!isGuest) return null;

  const exit = async () => {
    await logout();
    router.replace("/auth");
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Ionicons name="eye" size={15} color={colors.gold} />
      <Text style={styles.text} numberOfLines={1}>
        Demo Mode — you're exploring CleanOps as a guest
      </Text>
      <Pressable onPress={exit} style={styles.btn} testID="exit-demo-button">
        <Text style={styles.btnText}>Sign up</Text>
        <Ionicons name="arrow-forward" size={13} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surfaceInverse, paddingBottom: 8, paddingHorizontal: 14,
  },
  text: { flex: 1, color: colors.onSurfaceInverse, fontSize: 12.5, fontWeight: "600" },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.gold,
    paddingHorizontal: 10, paddingVertical: Platform.OS === "web" ? 6 : 5, borderRadius: 999,
  },
  btnText: { fontSize: 12.5, fontWeight: "800", color: colors.onSurface },
});
