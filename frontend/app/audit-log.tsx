import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Header, Card, colors, spacing, radius } from "@/src/components/UI";

const META: Record<string, { icon: any; color: string; label: string }> = {
  login: { icon: "log-in-outline", color: colors.success, label: "Signed in" },
  login_failed: { icon: "warning-outline", color: colors.error, label: "Failed sign-in" },
  register: { icon: "person-add-outline", color: colors.brand, label: "Account created" },
  subscription_change: { icon: "card-outline", color: colors.gold, label: "Plan changed" },
  create_cleaner: { icon: "people-outline", color: colors.brand, label: "Cleaner added" },
  job_delete: { icon: "trash-outline", color: colors.error, label: "Job deleted" },
};

function fmt(ts: string) {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AuditLog() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setRows(await api.get("/audit-log")); } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Screen>
      <Header title="Security Log" subtitle="Recent account activity" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>No activity yet.</Text>
          ) : rows.map((r) => {
            const m = META[r.action] || { icon: "ellipse-outline", color: colors.muted, label: r.action };
            return (
              <Card key={r.audit_id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={[styles.iconWrap, { backgroundColor: m.color + "22" }]}>
                  <Ionicons name={m.icon} size={18} color={m.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{m.label}{r.detail ? ` · ${r.detail}` : ""}</Text>
                  <Text style={styles.meta}>{r.actor_email || "unknown"} · {r.ip}</Text>
                </View>
                <Text style={styles.time}>{fmt(r.created_at)}</Text>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
  time: { fontSize: 11, color: colors.muted, maxWidth: 96, textAlign: "right" },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40 },
});
