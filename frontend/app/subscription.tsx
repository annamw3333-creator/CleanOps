import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Button, colors, spacing, radius } from "@/src/components/UI";
import { SUBSCRIPTION_TIERS } from "@/src/theme";

export default function Subscription() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const current = user?.tier || "free";
  const isAdmin = user?.role === "admin";

  const upgrade = async (tier: string) => {
    setBusy(tier);
    try { const res = await api.post("/subscription/upgrade", { tier }); setUser(res.user); }
    catch {} finally { setBusy(""); }
  };

  return (
    <Screen>
      <Header title="Subscription" subtitle="Choose the plan that fits you" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.lg }}>
        {isAdmin && (
          <View style={styles.adminCard}>
            <Ionicons name="shield-checkmark" size={22} color={colors.gold} />
            <Text style={styles.adminText}>Admin account — all features unlocked, ad-free.</Text>
          </View>
        )}
        {SUBSCRIPTION_TIERS.map((t) => {
          const active = current === t.id;
          return (
            <View key={t.id} style={[styles.card, active && { borderColor: t.accent, borderWidth: 2 }]} testID={`tier-${t.id}`}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.tierName}>{t.name}</Text>
                  <Text style={styles.tagline}>{t.tagline}</Text>
                </View>
                <View style={[styles.priceTag, { backgroundColor: t.accent + "22" }]}>
                  <Text style={[styles.price, { color: t.accent }]}>{t.price}</Text>
                  <Text style={styles.period}>{t.period}</Text>
                </View>
              </View>
              <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
                {t.features.map((f) => (
                  <View key={f} style={styles.feature}>
                    <Ionicons name="checkmark-circle" size={18} color={t.accent} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
              {active ? (
                <View style={styles.currentBadge}><Ionicons name="checkmark" size={16} color={colors.success} /><Text style={styles.currentText}>Current plan</Text></View>
              ) : (
                <Button title={t.id === "free" ? "Downgrade" : `Upgrade to ${t.name}`} onPress={() => upgrade(t.id)} loading={busy === t.id}
                  variant={t.id === "business" ? "secondary" : "primary"} testID={`upgrade-${t.id}`} />
              )}
            </View>
          );
        })}
        <Text style={styles.note}>Simulated checkout — connect Stripe to charge real subscriptions.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  adminCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radius.md },
  adminText: { color: colors.onSurfaceInverse, fontWeight: "600", fontSize: 13, flex: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tierName: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  tagline: { fontSize: 13, color: colors.muted },
  priceTag: { alignItems: "center", paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.md },
  price: { fontSize: 22, fontWeight: "800" },
  period: { fontSize: 11, color: colors.muted },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  featureText: { fontSize: 14, color: colors.onSurface },
  currentBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  currentText: { color: colors.success, fontWeight: "700" },
  note: { fontSize: 12, color: colors.muted, textAlign: "center" },
});
