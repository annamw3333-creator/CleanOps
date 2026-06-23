import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, Avatar, Chip, RatingLabel, colors, spacing, radius } from "@/src/components/UI";
import { QUALIFICATIONS, SUBSCRIPTION_TIERS } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [rate, setRate] = useState(String(user?.hourly_rate || ""));
  const [quals, setQuals] = useState<string[]>(user?.qualifications || []);
  const [autoAccept, setAutoAccept] = useState(!!user?.auto_accept);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myReviews, setMyReviews] = useState<any>(null);
  const isCleaner = user?.role === "cleaner" || user?.role === "owner_cleaner" || user?.role === "admin";

  useEffect(() => {
    if (user?.user_id && isCleaner) {
      api.get(`/users/${user.user_id}/reviews`).then(setMyReviews).catch(() => {});
    }
  }, [user?.user_id]);

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

        <Card onPress={() => router.push("/subscription")} testID="manage-subscription" style={styles.subCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Ionicons name={user?.role === "admin" ? "shield-checkmark" : "star"} size={22} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.subTitle}>{user?.role === "admin" ? "Admin — Full Access" : `${(user?.tier || "free").toUpperCase()} Plan`}</Text>
              <Text style={styles.subSub}>{user?.ads_enabled ? "Ad-supported · tap to go ad-free" : "Ad-free · manage plan"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>

        <Card onPress={() => router.push("/subscription")} testID="subscription-card" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={[styles.tierIcon, { backgroundColor: (SUBSCRIPTION_TIERS.find(t => t.id === (user?.tier || "free"))?.accent || colors.brand) + "22" }]}>
            <Ionicons name={user?.role === "admin" ? "shield-checkmark" : "star"} size={20} color={SUBSCRIPTION_TIERS.find(t => t.id === (user?.tier || "free"))?.accent || colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.section}>{user?.role === "admin" ? "Admin Access" : `${(user?.tier || "free").charAt(0).toUpperCase() + (user?.tier || "free").slice(1)} Plan`}</Text>
            <Text style={styles.hint}>{user?.ads_enabled ? "Ad-supported · tap to go ad-free" : "Ad-free · manage your plan"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        {(user?.role === "company_owner" || user?.role === "owner_cleaner" || user?.role === "admin") && (
          <Card onPress={() => router.push("/teams")} testID="teams-card" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={[styles.tierIcon, { backgroundColor: colors.sage }]}>
              <Ionicons name="people" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.section}>Manage Teams</Text>
              <Text style={styles.hint}>Create crews & add cleaners</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        )}

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

        {isCleaner && myReviews && (
          <Card style={{ gap: spacing.md }} testID="reviews-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.section}>Reviews</Text>
              <RatingLabel rating={myReviews.avg_rating || 0} count={myReviews.review_count || 0} size={15} />
            </View>
            {(!myReviews.reviews || myReviews.reviews.length === 0) ? (
              <Text style={styles.hint}>Complete jobs to start earning reviews from clients.</Text>
            ) : myReviews.reviews.slice(0, 8).map((r: any) => (
              <View key={r.review_id} style={styles.reviewItem}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.reviewer}>{r.reviewer_name}</Text>
                  <RatingLabel rating={r.rating} count={1} size={12} />
                </View>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                {r.job_title ? <Text style={styles.reviewJob}>{r.job_title}</Text> : null}
              </View>
            ))}
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
  subCard: { backgroundColor: colors.surfaceInverse },
  subTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurfaceInverse },
  subSub: { fontSize: 12, color: "#ffffffaa" },
  tierIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  section: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12.5, color: colors.muted },
  qualWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  saved: { color: colors.success, fontWeight: "700", textAlign: "center" },
  reviewItem: { gap: 2, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  reviewer: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  reviewComment: { fontSize: 13, color: colors.onSurface },
  reviewJob: { fontSize: 11, color: colors.muted },
});
