import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, colors, spacing, radius } from "@/src/components/UI";

const TYPES: { id: string; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "deep", label: "Deep" },
  { id: "airbnb", label: "Airbnb" },
  { id: "move_out", label: "Move-out" },
];

export default function ChecklistTemplates() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [active, setActive] = useState("standard");
  const [tasks, setTasks] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const t = await api.get("/checklist-templates");
      setTemplates(t);
      applyType("standard", t);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const applyType = (id: string, src = templates) => {
    setActive(id);
    setTasks([...(src[id]?.tasks || [])]);
    setPhotos([...(src[id]?.photos || [])]);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put("/checklist-templates", { clean_type: active, tasks, photos });
      const t = await api.get("/checklist-templates");
      setTemplates(t);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const resetToDefault = async () => {
    setSaving(true);
    try {
      await api.del(`/checklist-templates/${active}`);
      const t = await api.get("/checklist-templates");
      setTemplates(t);
      applyType(active, t);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const editItem = (list: string[], setList: (v: string[]) => void, i: number, val: string) => {
    const next = [...list]; next[i] = val; setList(next);
  };
  const removeItem = (list: string[], setList: (v: string[]) => void, i: number) => setList(list.filter((_, j) => j !== i));
  const addItem = (list: string[], setList: (v: string[]) => void) => setList([...list, ""]);

  const isCustom = templates[active]?.custom;

  return (
    <Screen>
      <Header title="Checklist Templates" subtitle="Customize what cleaners must complete" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}>
          <View style={styles.tabs}>
            {TYPES.map((t) => (
              <Pressable key={t.id} onPress={() => applyType(t.id)} style={[styles.tab, active === t.id && styles.tabActive]} testID={`type-${t.id}`}>
                <Text style={[styles.tabText, active === t.id && styles.tabTextActive]}>{t.label}</Text>
                {templates[t.id]?.custom && <View style={styles.dot} />}
              </Pressable>
            ))}
          </View>

          <Text style={styles.badge}>{isCustom ? "Custom template active" : "Using default template"}</Text>

          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.section}>Tasks ({tasks.length})</Text>
            <Text style={styles.hint}>Check-off items cleaners must tick before completing the job.</Text>
            {tasks.map((t, i) => (
              <View key={`task-${i}`} style={styles.row}>
                <Ionicons name="checkbox-outline" size={20} color={colors.muted} />
                <TextInput value={t} onChangeText={(v) => editItem(tasks, setTasks, i, v)} placeholder="Task description"
                  placeholderTextColor={colors.muted} style={styles.input} testID={`task-input-${i}`} />
                <Pressable onPress={() => removeItem(tasks, setTasks, i)} hitSlop={8} testID={`task-remove-${i}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => addItem(tasks, setTasks)} style={styles.addBtn} testID="add-task">
              <Ionicons name="add" size={18} color={colors.brand} /><Text style={styles.addText}>Add task</Text>
            </Pressable>
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.section}>Required Photos ({photos.length})</Text>
            <Text style={styles.hint}>Mandatory photo proof — the job can't be completed until each is captured.</Text>
            {photos.map((p, i) => (
              <View key={`photo-${i}`} style={styles.row}>
                <Ionicons name="camera-outline" size={20} color={colors.muted} />
                <TextInput value={p} onChangeText={(v) => editItem(photos, setPhotos, i, v)} placeholder="Photo label (e.g. Inside fridge)"
                  placeholderTextColor={colors.muted} style={styles.input} testID={`photo-input-${i}`} />
                <Pressable onPress={() => removeItem(photos, setPhotos, i)} hitSlop={8} testID={`photo-remove-${i}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => addItem(photos, setPhotos)} style={styles.addBtn} testID="add-photo">
              <Ionicons name="add" size={18} color={colors.brand} /><Text style={styles.addText}>Add photo requirement</Text>
            </Pressable>
          </Card>

          {saved ? <Text style={styles.saved}>✓ Template saved — new jobs will use it</Text> : null}
          <Button title="Save Template" icon="save-outline" onPress={save} loading={saving} testID="save-template" />
          {isCustom && <Button title="Reset to Default" variant="outline" onPress={resetToDefault} testID="reset-template" />}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4, gap: 4 },
  tab: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, flexDirection: "row", gap: 4 },
  tabActive: { backgroundColor: colors.surfaceSecondary },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.muted },
  tabTextActive: { color: colors.onSurface },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  badge: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textAlign: "center" },
  section: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12.5, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, height: 44, fontSize: 14, color: colors.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  addText: { fontSize: 13, fontWeight: "700", color: colors.brand },
  saved: { color: colors.success, fontWeight: "700", textAlign: "center" },
});
