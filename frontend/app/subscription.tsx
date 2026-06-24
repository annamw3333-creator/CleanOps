import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Button, colors, spacing, radius } from "@/src/components/UI";
import { SUBSCRIPTION_TIERS, BETA_NOTE } from "@/src/theme";

export default function Subscription() {
  const { user, setUser, refresh } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const current = user?.tier || "free";
  const isAdmin = user?.role === "admin";

  // On web, Stripe redirects back here with ?session_id=...; confirm it.
  useEffect(() => {
    if (params.session_id) {
      confirm(String(params.session_id));
    }
  }, [params.session_id]);

  const confirm = async (sessionId: string) => {
    setMsg("Confirming payment...");
    for (let i = 0; i < 8; i++) {
      try {
        const res = await api.get(`/billing/status/${sessionId}`);
        if (res.paid) { setUser(res.user); setMsg("✓ Payment confirmed — you're upgraded!"); return; }
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    setMsg("Payment still processing. Pull to refresh shortly.");
  };

  const downgrade = async () => {
    setBusy("free");
    try { const res = await api.post("/subscription/upgrade", { tier: "free" }); setUser(res.user); }
    catch {} finally { setBusy(""); }
  };

  const checkout = async (tier: string) => {
    setBusy(tier); setMsg("");
    try {
      const redirectUrl = Platform.OS === "web"
        ? window.location.origin + "/subscription"
        : Linking.createURL("subscription");
      const res = await api.post("/billing/checkout", { tier, redirect_url: redirectUrl });
      if (Platform.OS === "web") {
        window.location.href = res.checkout_url;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(res.checkout_url, redirectUrl);
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const sid = String(parsed.queryParams?.session_id || res.session_id);
        await confirm(sid);
      } else {
        // browser closed — verify anyway in case payment completed
        await confirm(res.session_id);
        await refresh();
      }
    } catch (e: any) { setMsg(e.message || "Checkout failed"); }
    finally { setBusy(""); }
  };

  const onSelect = (tier: string) => { if (tier === "free") downgrade(); else checkout(tier); };

  return (
    <Screen>
      <Header title="Subscription" subtitle="Choose the plan that fits you" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.lg }}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}><Ionicons name="sparkles" size={14} color={colors.gold} /><Text style={styles.heroBadgeText}>CleanOps Business</Text></View>
          <Text style={styles.heroTitle}>Run your entire cleaning operation</Text>
          <Text style={styles.heroSub}>Live GPS crew tracking, teams, onboarding, payroll previews and messaging — all in one place.</Text>
          <View style={styles.betaBanner}><Ionicons name="rocket" size={13} color={colors.gold} /><Text style={styles.betaBannerText}>{BETA_NOTE}</Text></View>
        </View>
        {isAdmin && (
          <View style={styles.adminCard}>
            <Ionicons name="shield-checkmark" size={22} color={colors.gold} />
            <Text style={styles.adminText}>Admin account — all features unlocked, ad-free.</Text>
          </View>
        )}
        {msg ? <Text style={styles.msg} testID="billing-msg">{msg}</Text> : null}
        {SUBSCRIPTION_TIERS.map((t) => {
          const active = current === t.id;
          return (
            <View key={t.id} style={[styles.card, t.popular && { borderColor: t.accent, borderWidth: 2 }, active && { borderColor: t.accent, borderWidth: 2 }]} testID={`tier-${t.id}`}>
              {t.popular && (
                <View style={[styles.ribbon, { backgroundColor: t.accent }]}>
                  <Ionicons name="star" size={11} color={colors.onGold} />
                  <Text style={styles.ribbonText}>MOST POPULAR</Text>
                </View>
              )}
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierName}>{t.name}</Text>
                  <Text style={styles.tagline}>{t.tagline}</Text>
                  {t.beta && (
                    <View style={styles.betaChip}><Ionicons name="rocket-outline" size={11} color={t.accent} /><Text style={[styles.betaChipText, { color: t.accent }]}>BETA PRICE</Text></View>
                  )}
                </View>
                <View style={[styles.priceTag, { backgroundColor: t.accent + "22" }]}>
                  {t.originalPrice ? <Text style={styles.origPrice}>{t.originalPrice}</Text> : null}
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
                <Button title={t.id === "free" ? "Downgrade to Free" : `Upgrade to ${t.name}`} onPress={() => onSelect(t.id)} loading={busy === t.id}
                  variant={t.popular ? "secondary" : "primary"} testID={`upgrade-${t.id}`} />
              )}
            </View>
          );
        })}
        <Text style={styles.note}>Cancel anytime · Secure checkout by Stripe (test mode). Use card 4242 4242 4242 4242.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "#ffffff15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  heroBadgeText: { fontSize: 11.5, fontWeight: "800", color: colors.gold, letterSpacing: 0.3 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurfaceInverse, lineHeight: 28 },
  heroSub: { fontSize: 13.5, color: "#ffffffbb", lineHeight: 19 },
  betaBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ffffff12", borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  betaBannerText: { flex: 1, fontSize: 11.5, color: colors.gold, fontWeight: "600", lineHeight: 16 },
  betaChip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 6, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  betaChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  origPrice: { fontSize: 12, color: colors.muted, textDecorationLine: "line-through", fontWeight: "700" },
  ribbon: { position: "absolute", top: -1, right: 16, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm },
  ribbonText: { fontSize: 10.5, fontWeight: "900", color: colors.onGold, letterSpacing: 0.5 },
  adminCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceInverse, padding: spacing.md, borderRadius: radius.md },
  adminText: { color: colors.onSurfaceInverse, fontWeight: "600", fontSize: 13, flex: 1 },
  msg: { fontSize: 14, fontWeight: "600", color: colors.brand, textAlign: "center" },
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
