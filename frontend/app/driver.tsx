import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, Linking, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, EmptyState, colors, spacing, radius } from "@/src/components/UI";

const POLL_MS = 6000;

export default function Driver() {
  const { user } = useAuth();
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [earnings, setEarnings] = useState<any>({ today: 0, week: 0, total: 0, jobs_today: 0 });
  const [offers, setOffers] = useState<any[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locBlocked, setLocBlocked] = useState(false);
  const [working, setWorking] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const timer = useRef<any>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const loadEarnings = useCallback(async () => {
    try { const e = await api.get("/driver/earnings"); setEarnings(e); setOnline(!!e.is_online); } catch {}
  }, []);

  const fetchOffers = useCallback(async () => {
    const c = coordsRef.current;
    const qs = c ? `?lat=${c.lat}&lng=${c.lng}` : "";
    try { setOffers(await api.get(`/driver/offers${qs}`)); } catch {}
    try { const e = await api.get("/driver/earnings"); setEarnings(e); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadEarnings(); }, [loadEarnings]));

  // polling lifecycle
  useEffect(() => {
    if (online) {
      fetchOffers();
      timer.current = setInterval(fetchOffers, POLL_MS);
    } else {
      if (timer.current) clearInterval(timer.current);
      setOffers([]);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [online, fetchOffers]);

  const ensureLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    if (Platform.OS === "web") return null;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        if (!perm.canAskAgain) { setLocBlocked(true); return null; }
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== "granted") { setLocBlocked(!perm.canAskAgain); return null; }
      setLocBlocked(false);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { return null; }
  };

  const toggle = async (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setWorking(true);
    try {
      if (next) {
        const c = await ensureLocation();
        coordsRef.current = c; setCoords(c);
        await api.post("/driver/status", { online: true, latitude: c?.lat, longitude: c?.lng });
        setOnline(true);
      } else {
        await api.post("/driver/status", { online: false });
        setOnline(false);
      }
    } catch (e: any) { Alert.alert("Error", e.message || "Could not update status"); }
    finally { setWorking(false); }
  };

  const accept = async (job: any) => {
    setGrabbing(job.job_id);
    try {
      await api.post(`/jobs/${job.job_id}/grab`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOffers((p) => p.filter((o) => o.job_id !== job.job_id));
      await loadEarnings();
      Alert.alert("Job accepted!", `${job.title} is now yours. Head over and check in when you arrive.`, [
        { text: "View job", onPress: () => router.push(`/job/${job.job_id}`) },
        { text: "Stay online", style: "cancel" },
      ]);
    } catch (e: any) {
      Alert.alert("Missed it", e.message || "This job is no longer available");
      fetchOffers();
    } finally { setGrabbing(null); }
  };

  const decline = async (job: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOffers((p) => p.filter((o) => o.job_id !== job.job_id));
    try { await api.post(`/driver/decline/${job.job_id}`); } catch {}
  };

  return (
    <Screen>
      <Header title="Driver Mode" subtitle={online ? "You're online — finding jobs" : "Go online to get job offers"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.lg }}>

        {/* Online toggle */}
        <View style={[styles.toggleCard, { backgroundColor: online ? colors.sageDeep : colors.surfaceInverse }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>{online ? "Online" : "Offline"}</Text>
            <Text style={styles.toggleSub}>{online ? "Accepting nearby job offers" : "You won't receive offers"}</Text>
          </View>
          {working ? <ActivityIndicator color="#fff" /> : (
            <Switch value={online} onValueChange={toggle} trackColor={{ false: "#ffffff33", true: "#ffffff55" }} thumbColor="#fff" testID="driver-toggle" />
          )}
        </View>

        {locBlocked && (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: colors.warning }}>
            <Ionicons name="location-outline" size={22} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.onSurface }}>Location is off</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>Enable location to sort jobs by distance.</Text>
            </View>
            <Pressable onPress={() => Linking.openSettings()} style={styles.settingsBtn} testID="open-settings">
              <Text style={styles.settingsText}>Open Settings</Text>
            </Pressable>
          </Card>
        )}

        {/* Earnings */}
        <View style={styles.earnRow}>
          <EarnCard label="Today" value={earnings.today} highlight />
          <EarnCard label="This week" value={earnings.week} />
          <EarnCard label="All time" value={earnings.total} />
        </View>
        <Text style={styles.jobsToday}>{earnings.jobs_today} job{earnings.jobs_today === 1 ? "" : "s"} completed today</Text>

        {/* Offers */}
        <Text style={styles.section}>{online ? `Nearby Offers${offers.length ? ` (${offers.length})` : ""}` : "Job Offers"}</Text>

        {!online ? (
          <Card><EmptyState icon="power-outline" title="You're offline" subtitle="Flip the switch above to start receiving job offers near you." /></Card>
        ) : offers.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", gap: spacing.sm, padding: spacing.lg }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>Searching for jobs…</Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>We'll ping you when a job you qualify for opens up nearby.</Text>
            </View>
          </Card>
        ) : offers.map((o) => (
          <Card key={o.job_id} testID={`offer-${o.job_id}`} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.offerTitle}>{o.title}</Text>
                <Text style={styles.offerMeta} numberOfLines={1}><Ionicons name="location-outline" size={12} color={colors.muted} /> {o.address}</Text>
              </View>
              <View style={styles.payTag}><Text style={styles.payTagText}>${o.est_earnings}</Text></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" }}>
              {o.distance_km != null && <Meta icon="navigate-outline" text={`${o.distance_km} km away`} />}
              <Meta icon="time-outline" text={`~${o.estimated_duration}h`} />
              <Meta icon="cash-outline" text={`$${o.pay_rate}/hr`} />
              <Meta icon="calendar-outline" text={o.date} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={styles.typeTag}><Text style={styles.typeTagText}>{o.clean_type} clean</Text></View>
              <Text style={styles.offerMeta} numberOfLines={1}>{o.start_window_from}–{o.start_window_to}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
              <Pressable onPress={() => decline(o)} style={styles.declineBtn} testID={`decline-${o.job_id}`}>
                <Ionicons name="close" size={18} color={colors.muted} />
                <Text style={styles.declineText}>Decline</Text>
              </Pressable>
              <Pressable onPress={() => accept(o)} disabled={grabbing === o.job_id} style={[styles.acceptBtn, grabbing === o.job_id && { opacity: 0.6 }]} testID={`accept-${o.job_id}`}>
                {grabbing === o.job_id ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.acceptText}>Accept</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function EarnCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.earnCard, highlight && { backgroundColor: colors.gold + "22", borderColor: colors.gold }]}>
      <Text style={styles.earnValue}>${value}</Text>
      <Text style={styles.earnLabel}>{label}</Text>
    </View>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.muted} />
      <Text style={styles.offerMeta}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  toggleTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  toggleSub: { fontSize: 13, color: "#ffffffcc", marginTop: 2 },
  settingsBtn: { backgroundColor: colors.warning, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md },
  settingsText: { fontSize: 12.5, fontWeight: "700", color: colors.onGold },
  earnRow: { flexDirection: "row", gap: spacing.sm },
  earnCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 },
  earnValue: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  earnLabel: { fontSize: 11.5, color: colors.muted },
  jobsToday: { fontSize: 12.5, color: colors.muted, textAlign: "center", marginTop: -8 },
  section: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  offerTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  offerMeta: { fontSize: 12.5, color: colors.muted },
  payTag: { backgroundColor: colors.sageDeep, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
  payTagText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  typeTag: { backgroundColor: colors.sage, paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill },
  typeTagText: { fontSize: 11, fontWeight: "700", color: colors.onSurface, textTransform: "capitalize" },
  declineBtn: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  declineText: { fontSize: 15, fontWeight: "700", color: colors.muted },
  acceptBtn: { flex: 2, height: 48, borderRadius: radius.md, backgroundColor: colors.sageDeep, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  acceptText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
