import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, Avatar, EmptyState, colors, spacing, radius } from "@/src/components/UI";

export default function Teams() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addTo, setAddTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([api.get("/teams/mine"), api.get("/users")]);
      setTeams(t);
      setCleaners(u.filter((x: any) => x.role === "cleaner" || x.role === "owner_cleaner"));
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try { await api.post("/teams", { name: newName.trim() }); setNewName(""); setShowCreate(false); await load(); }
    catch {} finally { setCreating(false); }
  };

  const addMember = async (teamId: string, cleanerId: string) => {
    try { await api.post(`/teams/${teamId}/members`, { cleaner_id: cleanerId }); setAddTo(null); await load(); } catch {}
  };

  return (
    <Screen>
      <Header title="Teams" subtitle="Build & manage your crews" onBack={() => router.back()}
        right={<Pressable onPress={() => setShowCreate(true)} style={styles.addBtn} testID="new-team-button"><Ionicons name="add" size={24} color={colors.brand} /></Pressable>} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {teams.length === 0 ? (
          <Card><EmptyState icon="people-outline" title="No teams yet" subtitle="Create a team and add cleaners to coordinate larger jobs." /></Card>
        ) : teams.map((t) => (
          <Card key={t.team_id} style={{ gap: spacing.md }} testID={`team-${t.team_id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.teamName}>{t.name}</Text>
              <View style={styles.countPill}><Text style={styles.countText}>{t.members_info?.length || 0} members</Text></View>
            </View>
            {t.members_info?.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                {t.members_info.map((m: any) => (
                  <View key={m.user_id} style={styles.member}>
                    <Avatar uri={m.avatar} name={m.name} size={36} />
                    <Text style={styles.memberName}>{m.name}</Text>
                  </View>
                ))}
              </View>
            ) : <Text style={styles.hint}>No members yet.</Text>}
            <Button title="Add Member" variant="outline" icon="person-add-outline" style={{ height: 44 }}
              onPress={() => setAddTo(t.team_id)} testID={`add-member-${t.team_id}`} />
          </Card>
        ))}
      </ScrollView>

      {/* Create team modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Team</Text>
              <Pressable onPress={() => setShowCreate(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <Input label="Team Name" value={newName} onChangeText={setNewName} placeholder="Downtown Crew" testID="team-name-input" />
            <View style={{ height: spacing.md }} />
            <Button title="Create Team" onPress={create} loading={creating} testID="create-team-button" />
          </View>
        </View>
      </Modal>

      {/* Add member modal */}
      <Modal visible={!!addTo} transparent animationType="slide" onRequestClose={() => setAddTo(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Cleaner</Text>
              <Pressable onPress={() => setAddTo(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
              {cleaners.length === 0 && <Text style={styles.hint}>No cleaners available yet.</Text>}
              {cleaners.map((c) => (
                <Pressable key={c.user_id} onPress={() => addTo && addMember(addTo, c.user_id)} style={styles.member} testID={`pick-${c.user_id}`}>
                  <Avatar uri={c.avatar} name={c.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{c.name}</Text>
                    <Text style={styles.hint}>{c.role.replace("_", " ")}</Text>
                  </View>
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

const styles = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  teamName: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  countPill: { backgroundColor: colors.sage, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
  countText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  member: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  memberName: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  hint: { fontSize: 13, color: colors.muted, textTransform: "capitalize" },
  modalBg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing["2xl"], maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
});
