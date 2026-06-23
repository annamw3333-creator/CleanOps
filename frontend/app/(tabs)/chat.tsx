import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Header, Avatar, EmptyState, Card, colors, spacing, radius } from "@/src/components/UI";

export default function ChatList() {
  const router = useRouter();
  const [convos, setConvos] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setConvos(await api.get("/conversations")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = async () => { try { setUsers(await api.get("/users")); setShowNew(true); } catch {} };
  const startChat = async (uid: string) => {
    const c = await api.post("/conversations", { participant_id: uid });
    setShowNew(false);
    router.push(`/chat/${c.conv_id}`);
  };

  return (
    <Screen>
      <Header title="Messages" right={
        <Pressable onPress={openNew} style={styles.newBtn} testID="new-chat-button"><Ionicons name="create-outline" size={22} color={colors.brand} /></Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.sm }}>
        {convos.length === 0 ? (
          <Card><EmptyState icon="chatbubbles-outline" title="No conversations" subtitle="Tap the pencil to message a cleaner, client, or teammate." /></Card>
        ) : convos.map((c) => (
          <Pressable key={c.conv_id} onPress={() => router.push(`/chat/${c.conv_id}`)} style={styles.row} testID={`convo-${c.conv_id}`}>
            <Avatar uri={c.other?.avatar} name={c.other?.name} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.other?.name || "Unknown"}</Text>
              <Text style={styles.last} numberOfLines={1}>{c.last_message || "Say hi 👋"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={showNew} animationType="slide" transparent onRequestClose={() => setShowNew(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Message</Text>
              <Pressable onPress={() => setShowNew(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
              {users.map((u) => (
                <Pressable key={u.user_id} onPress={() => startChat(u.user_id)} style={styles.row} testID={`user-${u.user_id}`}>
                  <Avatar uri={u.avatar} name={u.name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{u.name}</Text>
                    <Text style={styles.last}>{u.role.replace("_", " ")}</Text>
                  </View>
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
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  last: { fontSize: 13, color: colors.muted, textTransform: "capitalize" },
  modalBg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
});
