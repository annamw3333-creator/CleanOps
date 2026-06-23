import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Screen, Button, Input, Stars, colors, spacing, radius } from "@/src/components/UI";

export default function PublicFeedback() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [job, setJob] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get(`/public/feedback/${token}`).then((j) => { setJob(j); setDone(j.submitted); }).catch(() => setErr("This feedback link is invalid or expired."));
  }, [token]);

  const submit = async () => {
    if (!rating) { setErr("Please select a star rating."); return; }
    setBusy(true); setErr("");
    try { await api.post(`/public/feedback/${token}`, { rating, comment, client_name: name }); setDone(true); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingTop: spacing["2xl"] }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <View style={styles.logo}><Ionicons name="sparkles" size={24} color={colors.gold} /></View>
          <Text style={styles.brand}>AbodeOps</Text>
          <Text style={styles.sub}>Rate your cleaning service</Text>
        </View>

        {err ? <Text style={styles.err} testID="fb-error">{err}</Text> : null}

        {job && !err && (
          <View style={styles.card}>
            <Text style={styles.jobTitle}>{job.job_title}</Text>
            <Text style={styles.meta}>{job.address}</Text>
            <Text style={styles.meta}>{job.date}{job.cleaners?.length ? ` · ${job.cleaners.join(", ")}` : ""}</Text>
          </View>
        )}

        {done ? (
          <View style={styles.thanks} testID="fb-thanks">
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={styles.thanksText}>Thank you for your feedback!</Text>
          </View>
        ) : job && !err ? (
          <View style={styles.card}>
            <Text style={styles.label}>Your rating</Text>
            <View style={{ alignItems: "center", marginVertical: spacing.sm }}>
              <Stars value={rating} size={40} onChange={setRating} testIDPrefix="fb-star" />
            </View>
            <Input label="Your name (optional)" value={name} onChangeText={setName} placeholder="Jane Smith" testID="fb-name" />
            <View style={{ height: spacing.sm }} />
            <Input label="Comments" value={comment} onChangeText={setComment} multiline placeholder="How did we do?" testID="fb-comment" />
            <View style={{ height: spacing.md }} />
            <Button title="Submit Feedback" onPress={submit} loading={busy} testID="fb-submit" />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted },
  err: { color: colors.error, textAlign: "center", fontSize: 14 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  jobTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  thanks: { alignItems: "center", gap: spacing.md, padding: spacing["2xl"] },
  thanksText: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
});
