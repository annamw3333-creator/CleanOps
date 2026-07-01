import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, colors, spacing, radius } from "@/src/components/UI";

export default function SmsSettings() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    try { setStatus(await api.get("/twilio/status")); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const sendTest = async () => {
    if (!testTo.trim()) return;
    setSending(true); setResult(null);
    try {
      await api.post("/twilio/test", { to: testTo.trim() });
      setResult({ ok: true, msg: "Test message sent! Check the phone." });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
    } finally { setSending(false); }
  };

  const configured = status?.configured;

  return (
    <Screen>
      <Header title="Text Notifications" subtitle="Twilio SMS" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}>
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.statusRow}>
              <Ionicons name={configured ? "checkmark-circle" : "alert-circle"} size={26} color={configured ? colors.success : colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{configured ? "SMS is live" : "SMS not fully configured"}</Text>
                <Text style={styles.hint}>{configured ? `Sending from ${status?.from_number}` : "Add your Twilio Auth Token & phone number to start texting."}</Text>
              </View>
            </View>
            <View style={styles.checks}>
              <CheckLine label="Account SID" ok={status?.has_account_sid} />
              <CheckLine label="Auth Token" ok={status?.has_auth_token} />
              <CheckLine label="From phone number" ok={status?.has_from_number} />
            </View>
          </Card>

          <Card style={{ gap: spacing.xs }}>
            <Text style={styles.title}>What gets texted</Text>
            <Bullet text="Clients get a text when their cleaner taps 'On My Way' (needs client phone on the job)." />
            <Bullet text="Clients get a feedback-survey text when the job is completed." />
            <Bullet text="Cleaners get a reminder the day before a clean, and an alert if they miss a start time." />
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.title}>Send a test message</Text>
            <Input label="To (phone number)" value={testTo} onChangeText={setTestTo} keyboardType="phone-pad" placeholder="+1 555 123 4567" testID="sms-test-to" />
            <Button title="Send Test SMS" icon="paper-plane-outline" onPress={sendTest} loading={sending} testID="sms-test-send" />
            {result && (
              <Text style={[styles.result, { color: result.ok ? colors.success : colors.error }]}>{result.msg}</Text>
            )}
          </Card>

          {!configured && (
            <Card style={{ gap: spacing.xs, backgroundColor: colors.sage + "55" }}>
              <Text style={styles.title}>How to finish setup</Text>
              <Bullet text="Buy a phone number in your Twilio console (Phone Numbers → Buy a number)." />
              <Bullet text="Copy your Auth Token and the number into the backend .env (TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER), then restart." />
              <Bullet text="Trial accounts can only text verified numbers — upgrade to text any client." />
            </Card>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const CheckLine = ({ label, ok }: any) => (
  <View style={styles.checkLine}>
    <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={18} color={ok ? colors.success : colors.muted} />
    <Text style={[styles.checkText, !ok && { color: colors.muted }]}>{label}</Text>
  </View>
);
const Bullet = ({ text }: any) => (
  <View style={styles.bullet}><Text style={styles.dot}>•</Text><Text style={styles.bulletText}>{text}</Text></View>
);

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12.5, color: colors.muted },
  checks: { gap: 6, marginTop: spacing.xs },
  checkLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  bullet: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  dot: { fontSize: 14, color: colors.brand },
  bulletText: { flex: 1, fontSize: 13, color: colors.onSurface, lineHeight: 19 },
  result: { fontSize: 13, fontWeight: "700" },
});
