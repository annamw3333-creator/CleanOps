import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, colors, spacing, radius } from "@/src/components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 30-min increments 00:00 → 23:30
const TIMES: string[] = [];
for (let h = 0; h < 24; h++) for (const m of [0, 30]) TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

type Day = { mode: "all" | "windows"; windows: { from: string; to: string }[] };

function initSchedule(user: any): Record<string, Day> {
  const sched = user?.availability_schedule;
  const out: Record<string, Day> = {};
  if (sched && Object.keys(sched).length) {
    for (const d of Object.keys(sched)) {
      const s = sched[d];
      out[d] = s?.mode === "windows"
        ? { mode: "windows", windows: (s.windows || []).map((w: any) => ({ from: w.from, to: w.to })) }
        : { mode: "all", windows: [] };
    }
  } else {
    // migrate legacy day-list → all-day
    for (const d of user?.availability || []) out[d] = { mode: "all", windows: [] };
  }
  return out;
}

export default function Availability() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [sched, setSched] = useState<Record<string, Day>>(() => initSchedule(user));
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ day: string; idx: number; field: "from" | "to" } | null>(null);

  const toggleDay = (day: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSched((p) => {
      const n = { ...p };
      if (n[day]) delete n[day];
      else n[day] = { mode: "all", windows: [] };
      return n;
    });
  };
  const setMode = (day: string, mode: "all" | "windows") =>
    setSched((p) => ({ ...p, [day]: { mode, windows: mode === "windows" && p[day].windows.length === 0 ? [{ from: "08:00", to: "17:00" }] : p[day].windows } }));
  const addWindow = (day: string) =>
    setSched((p) => ({ ...p, [day]: { ...p[day], windows: [...p[day].windows, { from: "08:00", to: "17:00" }] } }));
  const removeWindow = (day: string, idx: number) =>
    setSched((p) => ({ ...p, [day]: { ...p[day], windows: p[day].windows.filter((_, i) => i !== idx) } }));
  const pickTime = (t: string) => {
    if (!picker) return;
    const { day, idx, field } = picker;
    setSched((p) => {
      const ws = [...p[day].windows];
      ws[idx] = { ...ws[idx], [field]: t };
      return { ...p, [day]: { ...p[day], windows: ws } };
    });
    setPicker(null);
  };

  const save = async () => {
    // clean: drop windows-mode days with no windows
    const payload: Record<string, any> = {};
    for (const d of Object.keys(sched)) {
      const s = sched[d];
      if (s.mode === "windows") {
        const valid = s.windows.filter((w) => w.from < w.to);
        if (valid.length) payload[d] = { mode: "windows", windows: valid };
      } else {
        payload[d] = { mode: "all" };
      }
    }
    setBusy(true);
    try {
      await api.put("/profile", { availability_schedule: payload });
      await refresh();
      router.back();
    } catch {} finally { setBusy(false); }
  };

  const activeCount = Object.keys(sched).length;

  return (
    <Screen>
      <Header title="My Availability" subtitle={`${activeCount} day${activeCount === 1 ? "" : "s"} set`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}>
        <Text style={styles.intro}>Turn on the days you can work. Choose <Text style={{ fontWeight: "800" }}>All day</Text> or set one or more time windows.</Text>

        {DAYS.map((day) => {
          const on = !!sched[day];
          const d = sched[day];
          return (
            <Card key={day} testID={`day-${day}`} style={{ gap: on ? spacing.sm : 0 }}>
              <View style={styles.dayHead}>
                <Text style={[styles.dayName, !on && { color: colors.muted }]}>{day}</Text>
                {on && d.mode === "all" && <Text style={styles.allDayTag}>All day</Text>}
                {on && d.mode === "windows" && <Text style={styles.allDayTag}>{d.windows.length} window{d.windows.length === 1 ? "" : "s"}</Text>}
                <Switch value={on} onValueChange={() => toggleDay(day)} trackColor={{ false: colors.border, true: colors.sageDeep }} thumbColor="#fff" testID={`switch-${day}`} />
              </View>

              {on && (
                <>
                  <View style={styles.segment}>
                    <Seg label="All day" active={d.mode === "all"} onPress={() => setMode(day, "all")} testID={`all-${day}`} />
                    <Seg label="Custom hours" active={d.mode === "windows"} onPress={() => setMode(day, "windows")} testID={`custom-${day}`} />
                  </View>

                  {d.mode === "windows" && (
                    <View style={{ gap: spacing.sm }}>
                      {d.windows.map((w, idx) => (
                        <View key={idx} style={styles.windowRow}>
                          <TimeField label={fmt12(w.from)} onPress={() => setPicker({ day, idx, field: "from" })} testID={`from-${day}-${idx}`} />
                          <Text style={styles.dash}>–</Text>
                          <TimeField label={fmt12(w.to)} onPress={() => setPicker({ day, idx, field: "to" })} testID={`to-${day}-${idx}`} />
                          {w.from >= w.to && <Ionicons name="warning" size={16} color={colors.error} />}
                          <Pressable onPress={() => removeWindow(day, idx)} hitSlop={8} style={styles.removeBtn} testID={`remove-${day}-${idx}`}>
                            <Ionicons name="close" size={16} color={colors.muted} />
                          </Pressable>
                        </View>
                      ))}
                      <Pressable onPress={() => addWindow(day)} style={styles.addBtn} testID={`add-${day}`}>
                        <Ionicons name="add" size={16} color={colors.brand} />
                        <Text style={styles.addText}>Add time window</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Save Availability" onPress={save} loading={busy} testID="save-availability" />
      </View>

      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBg} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select time</Text>
            <FlatList
              data={TIMES}
              keyExtractor={(t) => t}
              style={{ maxHeight: 360 }}
              initialNumToRender={20}
              renderItem={({ item }) => (
                <Pressable style={styles.timeRow} onPress={() => pickTime(item)} testID={`time-${item}`}>
                  <Text style={styles.timeText}>{fmt12(item)}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const Seg = ({ label, active, onPress, testID }: any) => (
  <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]} testID={testID}>
    <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
  </Pressable>
);

const TimeField = ({ label, onPress, testID }: any) => (
  <Pressable onPress={onPress} style={styles.timeField} testID={testID}>
    <Ionicons name="time-outline" size={14} color={colors.brand} />
    <Text style={styles.timeFieldText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  intro: { fontSize: 13.5, color: colors.muted, lineHeight: 19 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayName: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1 },
  allDayTag: { fontSize: 12, fontWeight: "700", color: colors.sageDeep },
  segment: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  seg: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  segActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  segText: { fontSize: 13, fontWeight: "700", color: colors.muted },
  segTextActive: { color: colors.onSurfaceInverse },
  windowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dash: { fontSize: 15, color: colors.muted, fontWeight: "700" },
  timeField: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  timeFieldText: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  removeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 6 },
  addText: { fontSize: 13.5, fontWeight: "700", color: colors.brand },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  modalBg: { flex: 1, backgroundColor: "#0008", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", maxWidth: 320, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  modalTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  timeRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider },
  timeText: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
});
