import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, EmptyState, colors, spacing, radius } from "@/src/components/UI";

const FREQ_COLORS: Record<string, string> = {
  Weekly: colors.sageDeep,
  "Bi-weekly": colors.brand,
  Monthly: colors.gold,
  Occasional: colors.borderStrong,
  "One-time": colors.muted,
  Recurring: colors.brand,
};

export default function Clients() {
  const { user } = useAuth();
  const router = useRouter();
  const isCleaner = user?.role === "cleaner";
  const [clients, setClients] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setClients(await api.get("/clients")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openEdit = (c: any) => {
    setEdit(c); setPhone(c.phone || ""); setEmail(c.email || ""); setNotes(c.notes || "");
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/clients/notes", { key: edit.key, phone, email, notes });
      setEdit(null);
      await load();
    } catch {} finally { setBusy(false); }
  };

  return (
    <Screen>
      <Header title="Client List" subtitle={isCleaner ? "Companies you've worked with" : "People you serve"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {clients.length === 0 ? (
          <Card><EmptyState icon="people-outline" title="No clients yet"
            subtitle={isCleaner ? "Clients appear after you're assigned jobs." : "Post jobs and your clients will appear here."} /></Card>
        ) : clients.map((c) => (
          <Card key={c.key} testID={`client-${c.key}`} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={[styles.icon, { backgroundColor: c.is_company ? colors.surfaceInverse : colors.sage }]}>
                <Ionicons name={c.is_company ? "business" : "person"} size={20} color={c.is_company ? colors.gold : colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>{c.job_count} job{c.job_count === 1 ? "" : "s"} · {c.completed} completed</Text>
              </View>
              <View style={[styles.freq, { backgroundColor: (FREQ_COLORS[c.frequency] || colors.muted) + "22", borderColor: FREQ_COLORS[c.frequency] || colors.muted }]}>
                <Text style={[styles.freqText, { color: FREQ_COLORS[c.frequency] || colors.muted }]}>{c.frequency}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Row icon="sparkles-outline" label="Clean type" value={`${c.clean_type} clean`} />
            {c.member_since ? <Row icon="calendar-outline" label="Client since" value={fmtDate(c.member_since)} /> : null}
            {c.addresses?.length ? <Row icon="location-outline" label="Address" value={c.addresses[0] + (c.addresses.length > 1 ? ` (+${c.addresses.length - 1})` : "")} /> : null}
            {!isCleaner && c.cleaners?.length ? <Row icon="people-outline" label="Cleaners" value={c.cleaners.join(", ")} /> : null}
            {c.phone ? <Row icon="call-outline" label="Phone" value={c.phone} /> : null}
            {c.email ? <Row icon="mail-outline" label="Email" value={c.email} /> : null}
            {c.notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesText}>{c.notes}</Text>
              </View>
            ) : null}

            <Pressable onPress={() => openEdit(c)} style={styles.editBtn} testID={`edit-client-${c.key}`}>
              <Ionicons name="create-outline" size={16} color={colors.brand} />
              <Text style={styles.editText}>{c.phone || c.email || c.notes ? "Edit contact & notes" : "Add contact & notes"}</Text>
            </Pressable>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={!!edit} animationType="slide" transparent onRequestClose={() => setEdit(null)}>
        <View style={styles.bg}><View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{edit?.name}</Text>
            <Pressable onPress={() => setEdit(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
            <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="(403) 555-0199" keyboardType="phone-pad" testID="client-phone" />
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="client@email.com" keyboardType="email-address" autoCapitalize="none" testID="client-email" />
            <Input label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Gate code, pets, key location, preferences..." testID="client-notes" />
            <Button title="Save" onPress={save} loading={busy} testID="client-save" />
          </ScrollView>
        </View></View>
      </Modal>
    </Screen>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }); } catch { return iso; }
}

const styles = StyleSheet.create({
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "800", color: colors.onSurface, textTransform: "capitalize" },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  freq: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1 },
  freqText: { fontSize: 11, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowLabel: { fontSize: 13, color: colors.muted, width: 92 },
  rowValue: { fontSize: 13.5, color: colors.onSurface, fontWeight: "600", flex: 1, textTransform: "capitalize" },
  notesBox: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: 4 },
  notesText: { fontSize: 13, color: colors.onSurface, lineHeight: 19 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  editText: { fontSize: 13, fontWeight: "700", color: colors.brand },
  bg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing["2xl"], maxHeight: "88%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: colors.onSurface, flex: 1, textTransform: "capitalize" },
});
