import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, statusColors, statusLabels, spacing, radius } from "@/src/theme";

// Web fallback: react-native-maps is not supported on web preview.
export default function JobMap({ jobs, onSelect }: { jobs: any[]; region: any; onSelect: (j: any) => void }) {
  return (
    <View style={styles.wrap} testID="job-map">
      <View style={styles.banner}>
        <Ionicons name="map-outline" size={16} color={colors.brand} />
        <Text style={styles.bannerText}>Map preview (live map renders on the mobile app)</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
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
  title: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  addr: { fontSize: 13, color: colors.muted },
  status: { fontSize: 12, fontWeight: "700" },
});
