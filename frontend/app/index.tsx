import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/auth");
  }, [user, loading]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.gold} />
    </View>
  );
}
