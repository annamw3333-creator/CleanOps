import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, Avatar, Chip, colors, spacing, radius } from "@/src/components/UI";
import { QUALIFICATIONS } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [rate, setRate] = useState(String(user?.hourly_rate || ""));
  const [quals, setQuals] = useState<string[]>(user?.qualifications || []);
  const [autoAccept, setAutoAccept] = useState(!!user?.auto_accept);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isCleaner = user?.role === "cleaner";

  const toggleQual = (q: string) => setQuals((p) => p.includes(q) ? p.filter((x) => x !== q) : [...p, q]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await api.put("/profile", {
        name, phone, bio,
        hourly_rate: parseFloat(rate) || 0,
        qualifications: quals,
        auto_accept: autoAccept,
      });
      setUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <Screen>
      <Header title="Profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}>
        <View style={styles.top}>
          <Avatar uri={user?.avatar} name={user?.name} size={72} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleBadge}><Text style={styles.roleText}>{user?.role?.replace("_", " ")}</Text></View>
        </View>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Account Details</Text>
          <Input label="Name" value={name} onChangeText={setName} testID="profile-name" />
          <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="profile-phone" />
          <Input label="Bio" value={bio} onChangeText={setBio} multiline placeholder="Tell clients about yourself" testID="profile-bio" />
        </Card>

        {isCleaner && (
          <Card style={{ gap: spacing.md }}>
            <Text style={styles.section}>Qualifications</Text>
            <Text style={styles.hint}>You'll only see jobs that require these qualifications.</Text>
            <View style={styles.qualWrap}>
              {QUALIFICATIONS.map((q) => (
                <Chip key={q} label={q} active={quals.includes(q)} onPress={() => toggleQual(q)} testID={`qual-${q}`} />
              ))}
            </View>
            <Input label="Hourly Rate ($)" value={rate} onChangeText={setRate} keyboardType="numeric" testID="profile-rate" />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Auto-accept jobs</Text>
                <Text style={styles.hint}>Automatically claim jobs you qualify for.</Text>
              </View>
              <Switch value={autoAccept} onValueChange={setAutoAccept} trackColor={{ true: colors.brand }} testID="auto-accept-switch" />
            </View>
          </Card>
        )}

        {saved ? <Text style={styles.saved}>✓ Profile saved</Text> : null}
        <Button title="Save Changes" onPress={save} loading={saving} testID="save-profile-button" />
        <Button title="Log Out" variant="outline" icon="log-out-outline" onPress={logout} testID="logout-button" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: 6 },
  name: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  email: { fontSize: 14, color: colors.muted },
  roleBadge: { backgroundColor: colors.gold, paddingVertical: 4, paddingHorizontal: 14, borderRadius: radius.pill, marginTop: 4 },
  roleText: { fontSize: 12, fontWeight: "800", color: colors.onGold, textTransform: "capitalize" },
  section: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12.5, color: colors.muted },
  qualWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  saved: { color: colors.success, fontWeight: "700", textAlign: "center" },
});
