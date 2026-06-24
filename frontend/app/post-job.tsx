import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { Screen, Header, Input, Button, Chip, colors, spacing, radius } from "@/src/components/UI";
import { QUALIFICATIONS } from "@/src/theme";

const TYPES = [{ k: "standard", l: "Standard" }, { k: "deep", l: "Deep Clean" }, { k: "airbnb", l: "Airbnb Turnover" }];
// scattered around NYC for demo markers
const rand = () => ({ lat: 40.7128 + (Math.random() - 0.5) * 0.08, lng: -74.006 + (Math.random() - 0.5) * 0.08 });

export default function PostJob() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    title: "", clean_type: "standard", address: "", date: "", start_window_from: "09:00", start_window_to: "10:00",
    estimated_duration: "2", client_name: "", client_notes: "", manager_notes: "", pay_rate: "30",
  });
  const [quals, setQuals] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggleQual = (q: string) => setQuals((p) => p.includes(q) ? p.filter((x) => x !== q) : [...p, q]);

  const submit = async () => {
    if (!f.title || !f.address || !f.client_name) { setError("Title, address and client name are required."); return; }
    setError(""); setLoading(true);
    const loc = rand();
    try {
      await api.post("/jobs", {
        ...f,
        latitude: loc.lat, longitude: loc.lng,
        estimated_duration: parseFloat(f.estimated_duration) || 1,
        pay_rate: parseFloat(f.pay_rate) || 0,
        date: f.date || new Date().toISOString().slice(0, 10),
        required_qualifications: quals,
      });
      router.back();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Screen>
      <Header title="Create Job" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Input label="Job Title" value={f.title} onChangeText={(v: string) => set("title", v)} placeholder="3BR Apartment Deep Clean" testID="job-title" />

          <Text style={styles.label}>Type of Clean</Text>
          <View style={styles.row}>
            {TYPES.map((t) => <Chip key={t.k} label={t.l} active={f.clean_type === t.k} onPress={() => set("clean_type", t.k)} testID={`type-${t.k}`} />)}
          </View>

          <Input label="Address" value={f.address} onChangeText={(v: string) => set("address", v)} placeholder="123 Main St, New York" testID="job-address" />
          <Input label="Date" value={f.date} onChangeText={(v: string) => set("date", v)} placeholder="2026-06-30" testID="job-date" />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Input label="Start From" value={f.start_window_from} onChangeText={(v: string) => set("start_window_from", v)} placeholder="09:00" testID="job-from" /></View>
            <View style={{ flex: 1 }}><Input label="Start To" value={f.start_window_to} onChangeText={(v: string) => set("start_window_to", v)} placeholder="10:00" testID="job-to" /></View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Input label="Duration (hrs)" value={f.estimated_duration} onChangeText={(v: string) => set("estimated_duration", v)} keyboardType="numeric" testID="job-duration" /></View>
            <View style={{ flex: 1 }}><Input label="Pay Rate ($/hr)" value={f.pay_rate} onChangeText={(v: string) => set("pay_rate", v)} keyboardType="numeric" testID="job-rate" /></View>
          </View>

          <Input label="Client Name" value={f.client_name} onChangeText={(v: string) => set("client_name", v)} placeholder="John Smith" testID="job-client" />
          <Input label="Client Notes" value={f.client_notes} onChangeText={(v: string) => set("client_notes", v)} multiline placeholder="Gate code, pets, parking..." testID="job-client-notes" />
          <Input label="Manager / Scope Notes" value={f.manager_notes} onChangeText={(v: string) => set("manager_notes", v)} multiline placeholder="Expectations, scope of work..." testID="job-manager-notes" />

          <Text style={styles.label}>Required Qualifications</Text>
          <Text style={styles.hint}>Only cleaners with all selected qualifications can apply.</Text>
          <View style={styles.wrap}>
            {QUALIFICATIONS.map((q) => <Chip key={q} label={q} active={quals.includes(q)} onPress={() => toggleQual(q)} testID={`req-${q}`} />)}
          </View>

          {error ? <Text style={styles.error} testID="post-error">{error}</Text> : null}
          <Button title="Create Job" onPress={submit} loading={loading} testID="submit-job-button" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurface, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.muted },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  row2: { flexDirection: "row", gap: spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { color: colors.error, fontSize: 14, textAlign: "center" },
});
