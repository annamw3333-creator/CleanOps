import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Chip, EmptyState, Card, Button, colors, spacing } from "@/src/components/UI";
import { JobRow } from "./index";

export default function Jobs() {
  const { user } = useAuth();
  const router = useRouter();
  const canBid = user?.role === "cleaner" || user?.role === "owner_cleaner" || user?.role === "admin";
  const canPost = user?.role !== "cleaner";
  const isCleaner = user?.role === "cleaner";
  const [tab, setTab] = useState(canBid ? "available" : "mine");
  const [jobs, setJobs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const tabs = [
    ...(canBid ? [{ k: "available", l: "Available" }, { k: "assigned", l: "My Work" }] : []),
    ...(canPost ? [{ k: "mine", l: "Posted" }] : []),
  ];

  const load = useCallback(async () => {
    try { setJobs(await api.get(`/jobs?scope=${tab}`)); } catch {}
  }, [tab]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const [msg, setMsg] = useState("");
  const addToSchedule = async (jobId: string) => {
    try {
      const r = await api.post(`/jobs/${jobId}/apply`);
      setMsg(r.auto_accepted ? "Added & auto-accepted! It's on your schedule." : "Added to your schedule — pending poster approval.");
      await load();
      setTimeout(() => setMsg(""), 3500);
    } catch (e: any) { setMsg(e.message); setTimeout(() => setMsg(""), 4000); }
  };

  return (
    <Screen>
      <Header title={isCleaner ? "Jobs" : "Work Hub"} />
      {tabs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {tabs.map((t) => <Chip key={t.k} label={t.l} active={tab === t.k} onPress={() => setTab(t.k)} testID={`jobs-tab-${t.k}`} />)}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: tabs.length > 1 ? 0 : spacing.lg, paddingBottom: 100, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {msg ? <Text style={{ color: colors.brand, fontWeight: "600", textAlign: "center" }} testID="jobs-msg">{msg}</Text> : null}
        {jobs.length === 0 ? (
          <Card><EmptyState icon="briefcase-outline" title="No jobs here"
            subtitle={tab === "available" ? "No jobs match your qualifications & availability yet. Update your profile to qualify for more." : "Nothing to show."} /></Card>
        ) : tab === "available" ? jobs.map((j) => (
          <View key={j.job_id} style={{ gap: spacing.sm }}>
            <JobRow job={j} onPress={() => router.push(`/job/${j.job_id}`)} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button title="Add to Schedule" icon="calendar" onPress={() => addToSchedule(j.job_id)} style={{ flex: 1, height: 46 }} testID={`add-schedule-${j.job_id}`} />
              <Button title="Details" variant="outline" onPress={() => router.push(`/job/${j.job_id}`)} style={{ flex: 1, height: 46 }} testID={`details-${j.job_id}`} />
            </View>
          </View>
        )) : jobs.map((j) => <JobRow key={j.job_id} job={j} onPress={() => router.push(`/job/${j.job_id}`)} />)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({});
