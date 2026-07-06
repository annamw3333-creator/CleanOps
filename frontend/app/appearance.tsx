import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useAuth } from "@/src/AuthContext";
import { useTheme } from "@/src/ThemeContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, colors, spacing, radius } from "@/src/components/UI";

const PALETTE = ["#1A5F7A", "#2B7043", "#D4AF37", "#9C5FB5", "#C1666B", "#3A7CA5", "#E08A3C", "#4D9078", "#5B6EE1", "#E0567A"];

export default function Appearance() {
  const router = useRouter();
  const { user, setUser, refresh } = useAuth();
  const { setAccent } = useTheme();
  const [color, setColor] = useState<string>(user?.company_color || "");
  const [companyName, setCompanyName] = useState<string>(user?.company_name || "");
  const [logo, setLogo] = useState<string>(user?.company_logo || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const active = color || PALETTE[0];

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    setLogo(`data:image/png;base64,${res.assets[0].base64}`);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await api.put("/profile", { company_color: color, company_name: companyName, company_logo: logo });
      if (res.user) setUser(res.user);
      setAccent(color || "#1A5F7A");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const clearSample = async () => {
    if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 4000); return; }
    setResetting(true); setResetMsg("");
    try {
      const res = await api.post("/admin/reset-sample-data");
      setResetMsg(`Removed ${res.jobs_removed} sample jobs and ${res.people_removed} sample people.`);
      await refresh();
    } catch (e: any) { setResetMsg(e.message); }
    finally { setResetting(false); setResetArmed(false); }
  };

  return (
    <Screen>
      <Header title="Brand & Appearance" subtitle="Your company color, logo & data" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}>
        <Card style={{ gap: spacing.sm, alignItems: "center" }}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" />
          ) : (
            <View style={[styles.preview, { backgroundColor: active }]}>
              <Ionicons name="sparkles" size={26} color="#fff" />
            </View>
          )}
          <Text style={styles.previewLabel}>Your color themes the whole app (buttons, tabs, highlights) for your team and tags jobs on schedules. Your logo appears in the app.</Text>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Company Logo</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title={logo ? "Replace Logo" : "Upload Logo"} icon="image-outline" variant="outline" onPress={pickLogo} testID="pick-logo" />
            {logo ? <Button title="Remove" icon="trash-outline" variant="ghost" onPress={() => setLogo("")} testID="remove-logo" /> : null}
          </View>

          <Text style={styles.section}>Company Name (optional)</Text>
          <Input value={companyName} onChangeText={setCompanyName} placeholder="Sparkle Clean Co." testID="company-name" />

          <Text style={styles.section}>Brand color</Text>
          <View style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} testID={`swatch-${c}`}
                style={[styles.swatch, { backgroundColor: c }, active === c && styles.swatchActive]}>
                {active === c && <Ionicons name="checkmark" size={20} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </Card>

        {saved ? <Text style={styles.saved}>✓ Saved — your brand is applied</Text> : null}
        <Button title="Save Brand" icon="save-outline" onPress={save} loading={saving} testID="save-appearance" />

        <Card style={{ gap: spacing.sm, borderColor: colors.error, borderWidth: 1 }}>
          <Text style={[styles.section, { color: colors.error }]}>Danger Zone</Text>
          <Text style={styles.previewLabel}>Remove all the built-in sample cleans, cleaners and clients so you can start fresh with your real data. This can't be undone.</Text>
          <Button title={resetArmed ? "Tap again to confirm — delete sample data" : "Clear All Sample Data"}
            icon="trash-outline" variant={resetArmed ? "primary" : "outline"} onPress={clearSample} loading={resetting} testID="clear-sample-data" />
          {resetMsg ? <Text style={[styles.saved, { color: colors.onSurface }]}>{resetMsg}</Text> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  logo: { width: 120, height: 72, borderRadius: 12 },
  previewLabel: { fontSize: 12.5, color: colors.muted, textAlign: "center", lineHeight: 18 },
  section: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatch: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: colors.onSurface, transform: [{ scale: 1.06 }] },
  saved: { color: colors.success, fontWeight: "700", textAlign: "center" },
});
