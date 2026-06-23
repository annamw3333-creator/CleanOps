import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { Button, Input, colors, spacing, radius } from "@/src/components/UI";

const HERO = "https://images.unsplash.com/photo-1759722668087-efcc63c91ed2?crop=entropy&cs=srgb&fm=jpg&q=85&w=1080";
const ROLES = [
  { key: "cleaner", label: "Cleaner", icon: "sparkles-outline", desc: "Find jobs & log hours" },
  { key: "company_owner", label: "Company Owner", icon: "business-outline", desc: "Manage teams & jobs" },
  { key: "owner_cleaner", label: "Owner + Cleaner", icon: "git-merge-outline", desc: "Post jobs AND bid on big ones" },
  { key: "client", label: "Homeowner / Landlord", icon: "home-outline", desc: "Post cleaning jobs" },
];

export default function Auth() {
  const { login, register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("cleaner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim(), role);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally { setLoading(false); }
  };

  const google = async () => {
    setError(""); setLoading(true);
    try { await loginWithGoogle(role); router.replace("/(tabs)"); }
    catch (e: any) { setError(e.message || "Google sign-in failed"); }
    finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={styles.hero}>
        <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["#0A192Fcc", "#0A192F"]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroContent}>
          <View style={styles.logo}><Ionicons name="sparkles" size={26} color={colors.gold} /></View>
          <Text style={styles.brand}>Auto Abodes</Text>
          <Text style={styles.tagline}>The smarter cleaning marketplace</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.tabs}>
            <Pressable onPress={() => setMode("login")} style={[styles.tab, mode === "login" && styles.tabActive]} testID="login-tab">
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>Sign In</Text>
            </Pressable>
            <Pressable onPress={() => setMode("register")} style={[styles.tab, mode === "register" && styles.tabActive]} testID="register-tab">
              <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>Register</Text>
            </Pressable>
          </View>

          {mode === "register" && (
            <>
              <Input label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" testID="name-input" />
              <Text style={styles.roleLabel}>I am a...</Text>
              <View style={{ gap: spacing.sm }}>
                {ROLES.map((r) => (
                  <Pressable key={r.key} onPress={() => setRole(r.key)} testID={`role-${r.key}`}
                    style={[styles.role, role === r.key && styles.roleActive]}>
                    <View style={[styles.roleIcon, role === r.key && { backgroundColor: colors.brand }]}>
                      <Ionicons name={r.icon as any} size={20} color={role === r.key ? "#fff" : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleTitle}>{r.label}</Text>
                      <Text style={styles.roleDesc}>{r.desc}</Text>
                    </View>
                    {role === r.key && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" testID="email-input" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry testID="password-input" />

          {error ? <Text style={styles.error} testID="auth-error">{error}</Text> : null}

          <Button title={mode === "login" ? "Sign In" : "Create Account"} onPress={submit} loading={loading} testID="auth-submit-button" />

          <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>or</Text><View style={styles.line} /></View>

          <Button title="Continue with Google" variant="outline" icon="logo-google" onPress={google} testID="google-signin-button" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 240, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl, gap: 4 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  brand: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: "#ffffffcc" },
  form: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] },
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4, marginBottom: spacing.sm },
  tab: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surfaceSecondary },
  tabText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  tabTextActive: { color: colors.onSurface },
  roleLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurface, marginTop: spacing.xs },
  role: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  roleActive: { borderColor: colors.brand, backgroundColor: colors.sage + "44" },
  roleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  roleTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  roleDesc: { fontSize: 12, color: colors.muted },
  error: { color: colors.error, fontSize: 14, textAlign: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 13 },
});
