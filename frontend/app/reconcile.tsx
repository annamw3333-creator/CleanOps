import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { Screen, Header, Card, Avatar, EmptyState, colors, spacing, radius } from "@/src/components/UI";

export default function Reconcile() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<"payroll" | "revenue">(tab === "revenue" ? "revenue" : "payroll");
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.get("/reconcile")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const setPaid = async (jobId: string, paid: boolean) => {
    setBusy(jobId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { await api.post(`/jobs/${jobId}/mark-paid`, { paid }); await load(); } catch {} finally { setBusy(null); }
  };

  const t = data?.totals || {};
  const cleaners = data?.payroll_by_cleaner || [];
  const jobs = data?.revenue_by_job || [];

  return (
    <Screen>
      <Header title="Reconcile" subtitle="Payments at a glance" onBack={() => router.back()} />

      <View style={styles.tabs}>
        <Tab label="Payroll" active={active === "payroll"} onPress={() => setActive("payroll")} testID="tab-payroll" />
        <Tab label="Revenue" active={active === "revenue"} onPress={() => setActive("revenue")} testID="tab-revenue" />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {active === "payroll" ? (
          <>
            <View style={styles.summaryRow}>
              <SummaryBox label="Owed to cleaners" value={`$${t.payroll_owed ?? 0}`} color={colors.gold} icon="wallet-outline" />
              <SummaryBox label="Already paid" value={`$${t.payroll_paid ?? 0}`} color={colors.success} icon="checkmark-done-outline" />
            </View>

            {cleaners.length === 0 ? (
              <Card><EmptyState icon="wallet-outline" title="Nothing to reconcile" subtitle="Completed jobs and their pay will show up here." /></Card>
            ) : cleaners.map((c: any) => {
              const open = expanded === c.cleaner_id;
              return (
                <Card key={c.cleaner_id} testID={`cleaner-${c.cleaner_id}`} style={{ gap: open ? spacing.sm : 0 }}>
                  <Pressable onPress={() => setExpanded(open ? null : c.cleaner_id)} style={styles.cleanerHead}>
                    <Avatar uri={c.avatar} name={c.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cleanerName}>{c.name}</Text>
                      <Text style={styles.cleanerMeta}>{c.jobs.length} completed · ${c.total_paid} paid</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.owed, { color: c.total_owed > 0 ? colors.gold : colors.success }]}>${c.total_owed}</Text>
                      <Text style={styles.owedLabel}>owed</Text>
                    </View>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                  </Pressable>

                  {open && c.jobs.map((j: any) => (
                    <View key={j.job_id} style={styles.jobRow}>
                      <Pressable style={{ flex: 1 }} onPress={() => router.push(`/job/${j.job_id}`)}>
                        <Text style={styles.jobTitle} numberOfLines={1}>{j.title}</Text>
                        <Text style={styles.jobMeta}>{j.date} · {j.hours}h · ${j.pay}</Text>
                      </Pressable>
                      <Pressable onPress={() => setPaid(j.job_id, !j.paid)} disabled={busy === j.job_id}
                        style={[styles.payBtn, j.paid ? styles.paidBtn : styles.unpaidBtn]} testID={`pay-${j.job_id}`}>
                        {busy === j.job_id ? <ActivityIndicator size="small" color={j.paid ? colors.success : "#fff"} /> : (
                          <>
                            <Ionicons name={j.paid ? "checkmark-circle" : "cash-outline"} size={14} color={j.paid ? colors.success : "#fff"} />
                            <Text style={[styles.payBtnText, { color: j.paid ? colors.success : "#fff" }]}>{j.paid ? "Paid" : "Mark paid"}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </Card>
              );
            })}
          </>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <SummaryBox label="Revenue today" value={`$${t.revenue_today ?? 0}`} color={colors.sageDeep} icon="trending-up-outline" />
              <SummaryBox label="Total revenue" value={`$${t.revenue_total ?? 0}`} color={colors.brand} icon="cash-outline" />
            </View>

            {jobs.length === 0 ? (
              <Card><EmptyState icon="cash-outline" title="No revenue yet" subtitle="Revenue appears as jobs are completed." /></Card>
            ) : jobs.map((j: any) => (
              <Pressable key={j.job_id} onPress={() => router.push(`/job/${j.job_id}`)} testID={`rev-${j.job_id}`}>
                <Card style={styles.revRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{j.title}</Text>
                    <Text style={styles.jobMeta}>{j.client_name || "Client"} · {j.date}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={styles.rev}>${j.revenue}</Text>
                    <View style={[styles.payTag, j.paid ? { backgroundColor: colors.success + "22" } : { backgroundColor: colors.gold + "22" }]}>
                      <Text style={[styles.payTagText, { color: j.paid ? colors.success : colors.gold }]}>{j.paid ? "Settled" : "Payroll due"}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const Tab = ({ label, active, onPress, testID }: any) => (
  <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]} testID={testID}>
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
  </Pressable>
);

const SummaryBox = ({ label, value, color, icon }: any) => (
  <View style={[styles.sumBox, { borderColor: color }]}>
    <View style={[styles.sumIcon, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={16} color={color} /></View>
    <Text style={styles.sumValue}>{value}</Text>
    <Text style={styles.sumLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.muted },
  tabTextActive: { color: colors.onSurfaceInverse },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  sumBox: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, gap: 4 },
  sumIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sumValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sumLabel: { fontSize: 12, color: colors.muted },
  cleanerHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cleanerName: { fontSize: 15.5, fontWeight: "800", color: colors.onSurface },
  cleanerMeta: { fontSize: 12.5, color: colors.muted, marginTop: 1 },
  owed: { fontSize: 18, fontWeight: "800" },
  owedLabel: { fontSize: 10.5, color: colors.muted },
  jobRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  jobTitle: { fontSize: 13.5, fontWeight: "600", color: colors.onSurface },
  jobMeta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  payBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, minWidth: 96, justifyContent: "center" },
  unpaidBtn: { backgroundColor: colors.sageDeep },
  paidBtn: { backgroundColor: colors.success + "18", borderWidth: 1, borderColor: colors.success },
  payBtnText: { fontSize: 12.5, fontWeight: "800" },
  revRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rev: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  payTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  payTagText: { fontSize: 10.5, fontWeight: "800" },
});
