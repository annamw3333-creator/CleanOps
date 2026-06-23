import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api";
import JobMap from "@/src/components/JobMap";
import { StatusPill, colors, spacing, radius } from "@/src/components/UI";

const POLL_MS = 8000;
const PHASE = { enroute: { c: "#1A5F7A", l: "On the way" }, on_site: { c: "#D4AF37", l: "On site" } } as any;

export default function LiveMap() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try { setJobs(await api.get("/fleet/live")); } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]));

  const jobMarkers = jobs.filter((j) => j.latitude && j.longitude);
  const people = jobs.flatMap((j) => (j.live_cleaners || []).map((c: any) => ({ ...c, job_title: j.title })));
  const liveCount = people.length;

  const first = jobMarkers[0] || (people[0] ? { latitude: people[0].latitude, longitude: people[0].longitude } : null);
  const region = first
    ? { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 }
    : { latitude: 51.0447, longitude: -114.0719, latitudeDelta: 0.15, longitudeDelta: 0.15 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}>
      <JobMap jobs={jobMarkers} region={region} people={people} onSelect={setSelected} meLocation={null} />

      <SafeAreaView edges={["top"]} style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.titleBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10} testID="live-back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Live Crew Map</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{liveCount} live</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendRow}>
          <Legend c={PHASE.enroute.c} l="On the way" />
          <Legend c={PHASE.on_site.c} l="On site" />
          <Legend c={colors.error} l="Pending job" />
          <Legend c={colors.gold} l="In progress" />
        </ScrollView>
      </SafeAreaView>

      {liveCount === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <View style={styles.emptyCard}>
            <Ionicons name="navigate-circle-outline" size={28} color={colors.brand} />
            <Text style={styles.emptyTitle}>No crew sharing location</Text>
            <Text style={styles.emptySub}>When a cleaner taps "On My Way" or starts a job, you'll see them here in real time.</Text>
          </View>
        </View>
      )}

      {selected && (
        <SafeAreaView edges={["bottom"]} style={styles.peek}>
          <View style={styles.peekCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                {selected._isPerson ? (
                  <>
                    <Text style={styles.peekTitle}>{selected.name}</Text>
                    <Text style={styles.peekAddr} numberOfLines={1}>{selected.job_title}</Text>
                    <View style={[styles.phasePill, { backgroundColor: (PHASE[selected.phase] || PHASE.enroute).c + "22", borderColor: (PHASE[selected.phase] || PHASE.enroute).c }]}>
                      <View style={[styles.liveDot, { backgroundColor: (PHASE[selected.phase] || PHASE.enroute).c }]} />
                      <Text style={[styles.phaseText, { color: (PHASE[selected.phase] || PHASE.enroute).c }]}>{(PHASE[selected.phase] || PHASE.enroute).l}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.peekTitle}>{selected.title}</Text>
                    <Text style={styles.peekAddr} numberOfLines={1}>{selected.address}</Text>
                    <View style={{ marginTop: spacing.sm }}><StatusPill status={selected.status} small /></View>
                  </>
                )}
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
            </View>
            {!selected._isPerson && (
              <Pressable style={styles.peekCta} onPress={() => router.push(`/job/${selected.job_id}`)} testID="live-peek-view">
                <Text style={styles.peekCtaText}>View job</Text><Ionicons name="arrow-forward" size={16} color={colors.brand} />
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const Legend = ({ c, l }: { c: string; l: string }) => (
  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c }]} /><Text style={styles.legendLabel}>{l}</Text></View>
);

const styles = StyleSheet.create({
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  titleBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface + "ee", alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface, backgroundColor: colors.surface + "ee", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface + "ee", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  liveText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  legendRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface + "ee", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 11.5, fontWeight: "700", color: colors.onSurface },
  emptyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, maxWidth: 320 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19 },
  peek: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg },
  peekCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, elevation: 8 },
  peekTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  peekAddr: { fontSize: 13, color: colors.muted, marginTop: 2 },
  phasePill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, marginTop: spacing.sm },
  phaseText: { fontSize: 12, fontWeight: "800" },
  peekCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  peekCtaText: { fontSize: 14, fontWeight: "700", color: colors.brand },
});
