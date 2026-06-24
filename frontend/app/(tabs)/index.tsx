import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, StatusPill, EmptyState, Avatar, AdBanner, Chip, colors, spacing, radius } from "@/src/components/UI";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const isCleaner = user?.role === "cleaner";

  const load = useCallback(async () => {
    try {
      const s = await api.get("/stats");
      setStats(s);
      const scope = isCleaner ? "assigned" : "mine";
      const j = await api.get(`/jobs?scope=${scope}`);
      setJobs(j);
    } catch {}
  }, [isCleaner]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleDay = async (day: string) => {
    const current: string[] = user?.availability || [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setSavingAvail(true);
    try { await api.put("/profile", { availability: next }); await refresh(); } catch {} finally { setSavingAvail(false); }
  };

  const upcoming = jobs.filter((j) => j.status !== "completed").slice(0, 5);

  return (
    <Screen>
      <Header title={`Hi, ${user?.name?.split(" ")[0] || "there"}`} subtitle={isCleaner ? "Your work at a glance" : "Your command center"} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {user?.ads_enabled && <AdBanner onUpgrade={() => router.push("/subscription")} />}

        {(user?.role === "cleaner" || user?.role === "owner_cleaner") && (
          <Card onPress={() => router.push("/driver")} testID="driver-card"
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.sageDeep, borderColor: colors.sageDeep }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="car-sport-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Driver Mode</Text>
              <Text style={{ fontSize: 12.5, color: "#ffffffcc" }}>Go online & grab nearby jobs instantly</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ffffffcc" />
          </Card>
        )}

        {isCleaner ? (
          <View style={styles.statsRow}>
            <StatCard icon="time-outline" label="Hours" value={stats?.total_hours ?? 0} color={colors.brand} />
            <StatCard icon="cash-outline" label="Earnings" value={`$${stats?.total_pay ?? 0}`} color={colors.sageDeep} />
            <StatCard icon="briefcase-outline" label="Upcoming" value={stats?.upcoming ?? 0} color={colors.gold} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatCard icon="ellipse" label="Pending" value={stats?.pending ?? 0} color={colors.error} />
            <StatCard icon="ellipse" label="In Progress" value={stats?.in_progress ?? 0} color={colors.gold} />
            <StatCard icon="ellipse" label="Completed" value={stats?.completed ?? 0} color={colors.success} />
          </View>
        )}

        {!isCleaner && (
          <Button title="Create Job" icon="add-circle-outline" onPress={() => router.push("/post-job")} testID="post-job-button" />
        )}

        {(user?.role === "company_owner" || user?.role === "owner_cleaner" || user?.role === "admin") && (
          <Card onPress={() => router.push("/operations")} testID="operations-card"
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="speedometer-outline" size={22} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurfaceInverse }}>Command Center</Text>
              <Text style={{ fontSize: 12.5, color: "#ffffff99" }}>Assign, start, complete & manage all jobs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ffffff99" />
          </Card>
        )}

        <Card onPress={() => router.push("/onboarding")} testID="onboarding-card" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="school-outline" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>{isCleaner ? "Onboarding & Training" : "Onboarding Builder"}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{isCleaner ? "Complete SOPs & quizzes" : "Create SOP docs & quizzes"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        {(user?.role === "company_owner" || user?.role === "owner_cleaner" || user?.role === "admin") && (
          <Card onPress={() => router.push("/live-map")} testID="live-map-card"
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brand, borderColor: colors.brand }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="location-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Live Crew Map</Text>
              <Text style={{ fontSize: 12.5, color: "#ffffffcc" }}>Track cleaners' live locations on active jobs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ffffffcc" />
          </Card>
        )}

        <Card onPress={() => router.push("/clients")} testID="clients-card" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="people-outline" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>Client List</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{isCleaner ? "Companies, contacts & notes" : "Clients, frequency, cleaners & notes"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        <Card onPress={() => router.push(`/employee/${user?.user_id}`)} testID="payroll-card" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="calculator-outline" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>Pay & Tax Calculator</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>Estimate pay stubs & deductions (Canada 2026)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        {isCleaner && (
          <Card style={{ gap: spacing.sm }} testID="availability-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Ionicons name="calendar-clear-outline" size={18} color={colors.brand} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface, flex: 1 }}>My Availability</Text>
              {savingAvail ? <Text style={{ fontSize: 11, color: colors.muted }}>Saving…</Text> : null}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted }}>Tap days you can work. Jobs match your availability.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 }}>
              {WEEKDAYS.map((d) => (
                <Chip key={d} label={d} active={(user?.availability || []).includes(d)} onPress={() => toggleDay(d)} testID={`avail-${d}`} />
              ))}
            </View>
          </Card>
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.section}>{isCleaner ? "Today's Agenda" : "Active Jobs"}</Text>
          <Pressable onPress={() => router.push("/(tabs)/jobs")}><Text style={styles.link}>View all</Text></Pressable>
        </View>

        {upcoming.length === 0 ? (
          <Card><EmptyState icon="calendar-outline" title="No active jobs"
            subtitle={isCleaner ? "Go online in Driver Mode or check the map for jobs near you." : "Create your first job and your crew can get to work."}
            actionLabel={isCleaner ? "Open Driver Mode" : "Create Job"}
            onAction={() => router.push(isCleaner ? "/driver" : "/post-job")}
            testID="dash-empty-cta" /></Card>
        ) : upcoming.map((j) => <JobRow key={j.job_id} job={j} onPress={() => router.push(`/job/${j.job_id}`)} />)}
      </ScrollView>
    </Screen>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function JobRow({ job, onPress }: { job: any; onPress: () => void }) {
  return (
    <Card onPress={onPress} testID={`job-card-${job.job_id}`} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.jobMeta} numberOfLines={1}><Ionicons name="location-outline" size={12} color={colors.muted} /> {job.address}</Text>
        </View>
        <StatusPill status={job.status} small />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.lg }}>
        <Text style={styles.jobMeta}><Ionicons name="calendar-outline" size={12} color={colors.muted} /> {job.date}</Text>
        <Text style={styles.jobMeta}><Ionicons name="time-outline" size={12} color={colors.muted} /> {job.start_window_from}–{job.start_window_to}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={styles.typeTag}><Text style={styles.typeTagText}>{job.clean_type} clean</Text></View>
        {job.assigned_cleaners_info?.length > 0 && (
          <View style={{ flexDirection: "row" }}>
            {job.assigned_cleaners_info.slice(0, 3).map((c: any, i: number) => (
              <View key={c.user_id} style={{ marginLeft: i ? -8 : 0 }}><Avatar uri={c.avatar} name={c.name} size={26} /></View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 12, color: colors.muted },
  section: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  link: { fontSize: 14, color: colors.brand, fontWeight: "600" },
  jobTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  jobMeta: { fontSize: 12.5, color: colors.muted },
  typeTag: { backgroundColor: colors.sage, paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill },
  typeTagText: { fontSize: 11, fontWeight: "700", color: colors.onSurface, textTransform: "capitalize" },
});
