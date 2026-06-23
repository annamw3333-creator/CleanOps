import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { Screen, Header, Card, StatusPill, Avatar, EmptyState, colors, spacing, radius } from "@/src/components/UI";
import { statusColors } from "@/src/theme";

const SECTIONS = [
  { key: "today", label: "Today", icon: "today-outline" },
  { key: "pending", label: "Pending", icon: "ellipse-outline" },
  { key: "in_progress", label: "Active", icon: "play-circle-outline" },
  { key: "completed", label: "Completed", icon: "checkmark-circle-outline" },
  { key: "cancelled", label: "Cancelled", icon: "close-circle-outline" },
];

export default function Operations() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [j, u] = await Promise.all([api.get("/jobs?scope=mine"), api.get("/users")]);
      setJobs(j);
      setCleaners(u.filter((x: any) => x.role === "cleaner" || x.role === "owner_cleaner"));
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const setStatus = async (jobId: string, status: string) => {
    Haptics.selectionAsync().catch(() => {});
    try { await api.post(`/jobs/${jobId}/status`, { status }); await load(); } catch {}
  };
  const remove = async (jobId: string) => { try { await fetchDelete(jobId); await load(); } catch {} };
  const fetchDelete = async (jobId: string) => {
    const { getToken } = await import("@/src/api");
    const token = await getToken();
    await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/jobs/${jobId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  };
  const assign = async (jobId: string, cleanerId: string) => {
    try { await api.post(`/jobs/${jobId}/assign`, { cleaner_id: cleanerId }); setAssignFor(null); await load(); } catch {}
  };

  const today = new Date().toISOString().slice(0, 10);
  const bucket = (key: string) => key === "today" ? jobs.filter((j) => j.date === today) : jobs.filter((j) => j.status === key);

  const counts: any = {
    pending: jobs.filter((j) => j.status === "pending").length,
    in_progress: jobs.filter((j) => j.status === "in_progress").length,
    completed: jobs.filter((j) => j.status === "completed").length,
  };

  return (
    <Screen>
      <Header title="Operations" subtitle="Command center for all your jobs" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        <View style={styles.summary}>
          <Summary color={statusColors.pending} label="Pending" value={counts.pending} />
          <Summary color={statusColors.in_progress} label="Active" value={counts.in_progress} />
          <Summary color={statusColors.completed} label="Done" value={counts.completed} />
        </View>

        {SECTIONS.map((s) => {
          const items = bucket(s.key);
          return (
            <View key={s.key} style={{ gap: spacing.sm }}>
              <View style={styles.sectionHead}>
                <Ionicons name={s.icon as any} size={18} color={colors.brand} />
                <Text style={styles.sectionTitle}>{s.label}</Text>
                <View style={styles.badge}><Text style={styles.badgeText}>{items.length}</Text></View>
              </View>
              {items.length === 0 ? (
                <Text style={styles.empty}>Nothing here.</Text>
              ) : items.map((job) => (
                <Card key={job.job_id + s.key} style={{ gap: spacing.sm }} testID={`ops-job-${job.job_id}`}>
                  <Pressable onPress={() => router.push(`/job/${job.job_id}`)}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={styles.jobTitle}>{job.title}</Text>
                        <Text style={styles.jobMeta} numberOfLines={1}>{job.address}</Text>
                        <Text style={styles.jobMeta}>{job.date} · {job.start_window_from}–{job.start_window_to}</Text>
                      </View>
                      <StatusPill status={job.status} small />
                    </View>
                  </Pressable>

                  <View style={styles.assignRow}>
                    {job.assigned_cleaners_info?.length > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        {job.assigned_cleaners_info.slice(0, 3).map((c: any, i: number) => (
                          <View key={c.user_id} style={{ marginLeft: i ? -8 : 0 }}><Avatar uri={c.avatar} name={c.name} size={26} /></View>
                        ))}
                        <Text style={styles.assignedText}>  {job.assigned_cleaners_info.map((c: any) => c.name).join(", ")}</Text>
                      </View>
                    ) : <Text style={[styles.jobMeta, { flex: 1 }]}>Unassigned</Text>}
                    <Pressable onPress={() => setAssignFor(job.job_id)} style={styles.assignBtn} testID={`assign-${job.job_id}`}>
                      <Ionicons name="person-add-outline" size={16} color={colors.brand} />
                      <Text style={styles.assignBtnText}>Assign</Text>
                    </Pressable>
                  </View>

                  <View style={styles.actions}>
                    {job.status !== "in_progress" && job.status !== "completed" && (
                      <ActionBtn icon="play" label="Start" color={statusColors.in_progress} onPress={() => setStatus(job.job_id, "in_progress")} testID={`start-${job.job_id}`} />
                    )}
                    {job.status !== "completed" && (
                      <ActionBtn icon="checkmark" label="Done" color={statusColors.completed} onPress={() => setStatus(job.job_id, "completed")} testID={`done-${job.job_id}`} />
                    )}
                    {job.status !== "cancelled" && job.status !== "completed" && (
                      <ActionBtn icon="ban" label="Cancel" color={colors.muted} onPress={() => setStatus(job.job_id, "cancelled")} testID={`cancel-${job.job_id}`} />
                    )}
                    <ActionBtn icon="trash" label="Delete" color={statusColors.pending} onPress={() => remove(job.job_id)} testID={`delete-${job.job_id}`} />
                  </View>
                </Card>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => setAssignFor(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Cleaner</Text>
              <Pressable onPress={() => setAssignFor(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
              {cleaners.length === 0 && <Text style={styles.empty}>No cleaners available.</Text>}
              {cleaners.map((c) => (
                <Pressable key={c.user_id} onPress={() => assignFor && assign(assignFor, c.user_id)} style={styles.pick} testID={`assign-pick-${c.user_id}`}>
                  <Avatar uri={c.avatar} name={c.name} size={40} />
                  <Text style={styles.jobTitle}>{c.name}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="add-circle" size={24} color={colors.brand} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const Summary = ({ color, label, value }: any) => (
  <View style={styles.sumCard}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={styles.sumValue}>{value}</Text>
    <Text style={styles.sumLabel}>{label}</Text>
  </View>
);
const ActionBtn = ({ icon, label, color, onPress, testID }: any) => (
  <Pressable onPress={onPress} style={[styles.action, { borderColor: color }]} testID={testID}>
    <Ionicons name={icon} size={15} color={color} />
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  summary: { flexDirection: "row", gap: spacing.sm },
  sumCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "flex-start", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sumValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  sumLabel: { fontSize: 12, color: colors.muted },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  badge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, minWidth: 24, alignItems: "center" },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  empty: { fontSize: 13, color: colors.muted, paddingLeft: 4 },
  jobTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  jobMeta: { fontSize: 12.5, color: colors.muted },
  assignRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  assignedText: { fontSize: 12, color: colors.onSurface, flexShrink: 1 },
  assignBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.sage },
  assignBtnText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1.5 },
  actionText: { fontSize: 12.5, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing["2xl"], maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  pick: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
