import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, colors, spacing, radius } from "@/src/components/UI";

const PALETTE = ["#1A5F7A", "#2B7043", "#D4AF37", "#9C5FB5", "#C1666B", "#3A7CA5", "#E08A3C", "#4D9078", "#5B6EE1", "#E0567A"];

export default function Appearance() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [color, setColor] = useState<string>(user?.company_color || "");
  const [companyName, setCompanyName] = useState<string>(user?.company_name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await api.put("/profile", { company_color: color, company_name: companyName });
      if (res.user) setUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const active = color || PALETTE[0];

  return (
    <Screen>
      <Header title="Brand & Appearance" subtitle="Your company color" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}>
        <Card style={{ gap: spacing.sm, alignItems: "center" }}>
          <View style={[styles.preview, { backgroundColor: active }]}>
            <Ionicons name="sparkles" size={26} color="#fff" />
          </View>
          <Text style={styles.previewLabel}>This color tags your jobs on schedules & calendars — handy for cleaners working with multiple companies.</Text>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Company Name (optional)</Text>
          <Input value={companyName} onChangeText={setCompanyName} placeholder="Sparkle Clean Co." testID="company-name" />

          <Text style={styles.section}>Pick your color</Text>
          <View style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} testID={`swatch-${c}`}
                style={[styles.swatch, { backgroundColor: c }, active === c && styles.swatchActive]}>
                {active === c && <Ionicons name="checkmark" size={20} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </Card>

        {saved ? <Text style={styles.saved}>✓ Saved — your jobs will use this color</Text> : null}
        <Button title="Save Color" icon="save-outline" onPress={save} loading={saving} testID="save-appearance" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewLabel: { fontSize: 12.5, color: colors.muted, textAlign: "center", lineHeight: 18 },
  section: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatch: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: colors.onSurface, transform: [{ scale: 1.06 }] },
  saved: { color: colors.success, fontWeight: "700", textAlign: "center" },
});
