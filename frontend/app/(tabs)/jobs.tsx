import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Chip, EmptyState, Card, colors, spacing } from "@/src/components/UI";
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

  return (
    <Screen>
      <Header title={isCleaner ? "Jobs" : "My Jobs"} />
      {tabs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {tabs.map((t) => <Chip key={t.k} label={t.l} active={tab === t.k} onPress={() => setTab(t.k)} testID={`jobs-tab-${t.k}`} />)}
        </ScrollView>
      )}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: tabs.length > 1 ? 0 : spacing.lg, paddingBottom: 100, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {jobs.length === 0 ? (
          <Card><EmptyState icon="briefcase-outline" title="No jobs here"
            subtitle={isCleaner && tab === "available" ? "No jobs match your qualifications yet. Update your profile to qualify for more." : "Nothing to show."} /></Card>
        ) : jobs.map((j) => <JobRow key={j.job_id} job={j} onPress={() => router.push(`/job/${j.job_id}`)} />)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({});
