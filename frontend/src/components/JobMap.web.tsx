import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, statusColors, statusLabels, spacing, radius } from "@/src/theme";

const PHASE = { enroute: { c: "#1A5F7A", l: "On the way" }, on_site: { c: "#D4AF37", l: "On site" }, completed: { c: "#2B7043", l: "Done" } } as any;

// Web fallback: react-native-maps is not supported on web preview.
export default function JobMap({ jobs, onSelect, people = [], meLocation }: {
  jobs: any[]; region: any; onSelect: (j: any) => void; people?: any[]; meLocation?: any;
}) {
  return (
    <View style={styles.wrap} testID="job-map">
      <View style={styles.banner}>
        <Ionicons name="map-outline" size={16} color={colors.brand} />
        <Text style={styles.bannerText}>Map preview (live map renders on the mobile app)</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 110, gap: spacing.md }}>
        {people.filter((p) => p.latitude && p.longitude).map((p) => (
          <Pressable key={`person-${p.user_id}`} onPress={() => onSelect({ ...p, _isPerson: true })} style={styles.row} testID={`map-person-${p.user_id}`}>
            <View style={[styles.personPin, { borderColor: (PHASE[p.phase] || PHASE.enroute).c }]}>
              <Ionicons name="person" size={14} color={(PHASE[p.phase] || PHASE.enroute).c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{p.name}</Text>
              <Text style={styles.addr}>{(PHASE[p.phase] || PHASE.enroute).l} · live location</Text>
            </View>
            <Ionicons name="navigate" size={16} color={colors.brand} />
          </Pressable>
        ))}
        {jobs.map((j) => (
          <Pressable key={j.job_id} onPress={() => onSelect(j)} style={styles.row} testID={`map-marker-${j.job_id}`}>
            <View style={[styles.pin, { backgroundColor: (statusColors as any)[j.status] || "#888" }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{j.title}</Text>
              <Text style={styles.addr} numberOfLines={1}>{j.address}</Text>
            </View>
            <Text style={[styles.status, { color: (statusColors as any)[j.status] }]}>{(statusLabels as any)[j.status]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceTertiary },
  banner: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.sage, padding: spacing.md, justifyContent: "center" },
  bannerText: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#fff" },
  personPin: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  addr: { fontSize: 13, color: colors.muted },
  status: { fontSize: 12, fontWeight: "700" },
});
