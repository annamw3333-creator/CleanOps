import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import JobMap from "@/src/components/JobMap";
import { Chip, StatusPill, Avatar, colors, spacing, radius } from "@/src/components/UI";
import { SafeAreaView } from "react-native-safe-area-context";

const REGION = { latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.15, longitudeDelta: 0.15 };

export default function MapScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const isCleaner = user?.role === "cleaner";

  const load = useCallback(async () => {
    try {
      const scope = isCleaner ? "available" : "mine";
      const j = await api.get(`/jobs?scope=${scope}`);
      setJobs(j.filter((x: any) => x.latitude && x.longitude));
    } catch {}
  }, [isCleaner]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const filters = isCleaner
    ? [{ k: "all", l: "Available" }]
    : [{ k: "all", l: "All" }, { k: "pending", l: "Pending" }, { k: "in_progress", l: "In Progress" }, { k: "completed", l: "Completed" }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}>
      <JobMap jobs={filtered} region={REGION} onSelect={setSelected} />

      <SafeAreaView edges={["top"]} style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.titleBar}>
          <Text style={styles.title}>{isCleaner ? "Available Jobs" : "Job Map"}</Text>
          <View style={styles.legend}>
            <Dot c={colors.error} /><Dot c={colors.gold} /><Dot c={colors.success} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filters.map((f) => (
            <Chip key={f.k} label={f.l} active={filter === f.k} onPress={() => setFilter(f.k)} testID={`map-filter-${f.k}`} />
          ))}
        </ScrollView>
      </SafeAreaView>

      {selected && (
        <SafeAreaView edges={["bottom"]} style={styles.peek}>
          <Pressable style={styles.peekCard} onPress={() => router.push(`/job/${selected.job_id}`)} testID="map-peek-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.peekTitle}>{selected.title}</Text>
                <Text style={styles.peekAddr} numberOfLines={1}>{selected.address}</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm }}>
              <StatusPill status={selected.status} small />
              <Text style={styles.peekMeta}>{selected.date} · {selected.start_window_from}–{selected.start_window_to}</Text>
            </View>
            <View style={styles.peekCta}><Text style={styles.peekCtaText}>View details</Text><Ionicons name="arrow-forward" size={16} color={colors.brand} /></View>
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

const Dot = ({ c }: { c: string }) => <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />;

const styles = StyleSheet.create({
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  titleBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, backgroundColor: colors.surface + "ee", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  legend: { flexDirection: "row", gap: 6, backgroundColor: colors.surface + "ee", padding: 8, borderRadius: radius.pill },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  peek: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg },
  peekCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  peekTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  peekAddr: { fontSize: 13, color: colors.muted, marginTop: 2 },
  peekMeta: { fontSize: 12, color: colors.muted },
  peekCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  peekCtaText: { fontSize: 14, fontWeight: "700", color: colors.brand },
});
