import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, StatusPill, Avatar, Stars, RatingLabel, colors, spacing, radius } from "@/src/components/UI";

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [tab, setTab] = useState<"info" | "checklist">("info");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reviewDone, setReviewDone] = useState<Record<string, boolean>>({});
  const isCleaner = user?.role === "cleaner";
  const canApply = ["cleaner", "owner_cleaner", "admin"].includes(user?.role || "");
  const isAssigned = job?.assigned_cleaners?.includes(user?.user_id);
  const isPoster = job?.poster_id === user?.user_id || user?.role === "admin";
  const [assignOpen, setAssignOpen] = useState(false);
  const [cleaners, setCleaners] = useState<any[]>([]);

  const load = useCallback(async () => {
    try { setJob(await api.get(`/jobs/${id}`)); } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!job) return <Screen><Header title="Job" onBack={() => router.back()} /><ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /></Screen>;

  const act = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const apply = () => act(async () => { const r = await api.post(`/jobs/${id}/apply`); alert(r.auto_accepted ? "Auto-accepted! Job is yours." : "Application submitted."); });
  const assign = (cid: string) => act(async () => { await api.post(`/jobs/${id}/assign`, { cleaner_id: cid }); setAssignOpen(false); });
  const openAssign = async () => {
    try {
      const u = await api.get("/users");
      setCleaners(u.filter((x: any) => x.role === "cleaner" || x.role === "owner_cleaner"));
      setAssignOpen(true);
    } catch {}
  };
  const checkin = () => act(async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); await api.post(`/jobs/${id}/checkin`); });
  const complete = () => act(async () => { await api.post(`/jobs/${id}/complete`); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); });

  const pickPhoto = async (itemId: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const b64 = `data:image/jpeg;base64,${res.assets[0].base64}`;
    await act(async () => { await api.post(`/jobs/${id}/checklist`, { item_id: itemId, photo_base64: b64 }); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); });
  };
  const toggleTask = (itemId: string, done: boolean) => act(() => api.post(`/jobs/${id}/checklist`, { item_id: itemId, done: !done }));

  const submitReview = async (cleanerId: string) => {
    const rating = ratings[cleanerId] || 0;
    if (!rating) return;
    try {
      await api.post(`/jobs/${id}/review`, { cleaner_id: cleanerId, rating, comment: comments[cleanerId] || "" });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewDone((p) => ({ ...p, [cleanerId]: true }));
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const checklist = job.checklist || [];
  const allDone = checklist.length > 0 && checklist.every((i: any) => i.done);
  const doneCount = checklist.filter((i: any) => i.done).length;

  return (
    <Screen>
      <Header title={job.title} subtitle={`${job.clean_type} clean`} onBack={() => router.back()} right={<StatusPill status={job.status} small />} />

      <View style={styles.segment}>
        {(["info", "checklist"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segActive]} testID={`tab-${t}`}>
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t === "info" ? "Details" : `Checklist (${doneCount}/${checklist.length})`}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}>
        {tab === "info" ? (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Info icon="location-outline" label="Address" value={job.address} />
              <Info icon="calendar-outline" label="Date" value={job.date} />
              <Info icon="time-outline" label="Start Window" value={`${job.start_window_from} – ${job.start_window_to}`} />
              <Info icon="hourglass-outline" label="Est. Duration" value={`${job.estimated_duration} hrs`} />
              <Info icon="cash-outline" label="Pay Rate" value={`$${job.pay_rate}/hr`} />
              <Info icon="person-outline" label="Client" value={job.client_name} />
            </Card>

            {job.client_notes ? <NoteCard title="Client Notes" text={job.client_notes} /> : null}
            {job.manager_notes ? <NoteCard title="Scope of Work / Manager Notes" text={job.manager_notes} /> : null}

            {job.required_qualifications?.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Required Qualifications</Text>
                <View style={styles.wrap}>{job.required_qualifications.map((q: string) => (
                  <View key={q} style={styles.qPill}><Ionicons name="shield-checkmark" size={12} color={colors.brand} /><Text style={styles.qText}>{q}</Text></View>
                ))}</View>
              </Card>
            )}

            {job.assigned_cleaners_info?.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Assigned Cleaners</Text>
                {job.assigned_cleaners_info.map((c: any) => (
                  <View key={c.user_id} style={styles.person}>
                    <Avatar uri={c.avatar} name={c.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{c.name}</Text>
                      <RatingLabel rating={c.avg_rating || 0} count={c.review_count || 0} size={12} />
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {isPoster && job.applicants_info?.length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Qualified Applicants</Text>
                {job.applicants_info.map((a: any) => (
                  <View key={a.user_id} style={styles.applicant}>
                    <View style={styles.person}><Avatar uri={a.avatar} name={a.name} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>{a.name}</Text>
                        <Text style={styles.rate}>${a.hourly_rate}/hr · {a.qualifications.length} quals</Text>
                        <RatingLabel rating={a.avg_rating || 0} count={a.review_count || 0} size={12} />
                      </View>
                    </View>
                    {a.bio ? <Text style={styles.bio}>{a.bio}</Text> : null}
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Button title="Message" variant="outline" style={{ flex: 1, height: 42 }} onPress={async () => { const c = await api.post("/conversations", { participant_id: a.user_id }); router.push(`/chat/${c.conv_id}`); }} testID={`msg-${a.user_id}`} />
                      <Button title="Choose" style={{ flex: 1, height: 42 }} onPress={() => assign(a.user_id)} testID={`choose-${a.user_id}`} />
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </>
        ) : (
          <>
            {checklist.map((item: any) => (
              <View key={item.id}>
                {item.photo ? (
                  <Pressable onPress={() => pickPhoto(item.id)} style={styles.photoBtn} testID={`photo-${item.id}`}>
                    {item.photo_base64 ? (
                      <Image source={{ uri: item.photo_base64 }} style={styles.photo} contentFit="cover" />
                    ) : (
                      <View style={styles.photoEmpty}>
                        <Ionicons name="camera" size={28} color={colors.brand} />
                        <Text style={styles.photoLabel}>{item.label}</Text>
                        <Text style={styles.photoHint}>Tap to capture (required)</Text>
                      </View>
                    )}
                    {item.photo_base64 && (
                      <View style={styles.photoDone}><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.photoDoneText}>{item.label}</Text></View>
                    )}
                  </Pressable>
                ) : (
                  <Pressable onPress={() => isAssigned && job.status === "in_progress" ? toggleTask(item.id, item.done) : null} style={styles.task} testID={`task-${item.id}`}>
                    <Ionicons name={item.done ? "checkbox" : "square-outline"} size={24} color={item.done ? colors.success : colors.muted} />
                    <Text style={[styles.taskText, item.done && { textDecorationLine: "line-through", color: colors.muted }]}>{item.label}</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {!isAssigned && <Text style={styles.note}>Checklist editable once you're assigned and checked in.</Text>}
          </>
        )}
      </ScrollView>

      {/* Sticky action bar */}
      <View style={styles.actionBar}>
        {canApply && !isAssigned && job.status === "pending" && (
          <Button title="Accept / Apply for Job" icon="checkmark-done" onPress={apply} loading={busy} testID="apply-button" />
        )}
        {isPoster && (job.status === "pending" || job.status === "in_progress") && (
          <Button title="Assign a Cleaner" icon="person-add" variant={canApply && !isAssigned && job.status === "pending" ? "outline" : "primary"} onPress={openAssign} testID="assign-cleaner-button" />
        )}
        {isAssigned && job.status === "pending" && (
          <Button title="Check In & Start Job" icon="play" onPress={checkin} loading={busy} testID="checkin-button" />
        )}
        {isAssigned && job.status === "in_progress" && (
          <Button title="Complete Job" icon="checkmark-circle" variant="secondary" onPress={complete} loading={busy} disabled={!allDone} testID="complete-button" />
        )}
        {isAssigned && job.status === "in_progress" && !allDone && (
          <Text style={styles.note}>Finish all checklist items & photos to complete.</Text>
        )}
        {job.status === "completed" && (
          <View style={styles.completed}><Ionicons name="checkmark-circle" size={20} color={colors.success} /><Text style={styles.completedText}>Completed · {job.logged_hours}h logged{job.logged_pay ? ` · $${job.logged_pay}` : ""}</Text></View>
        )}
        {job.status === "completed" && isPoster && job.assigned_cleaners_info?.length > 0 && (
          <Button title="Rate Cleaner" icon="star" variant="secondary" onPress={() => setReviewing(true)} testID="rate-cleaner-button" />
        )}
      </View>

      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.reviewModal}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>Assign a Cleaner</Text>
              <Pressable onPress={() => setAssignOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
              {cleaners.length === 0 && <Text style={styles.note}>No cleaners available yet.</Text>}
              {cleaners.map((c: any) => (
                <Pressable key={c.user_id} onPress={() => assign(c.user_id)} style={styles.assignPick} testID={`assign-pick-${c.user_id}`}>
                  <Avatar uri={c.avatar} name={c.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{c.name}</Text>
                    <RatingLabel rating={c.avg_rating || 0} count={c.review_count || 0} size={12} />
                  </View>
                  {job.assigned_cleaners?.includes(c.user_id)
                    ? <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    : <Ionicons name="add-circle" size={24} color={colors.brand} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={reviewing} transparent animationType="slide" onRequestClose={() => setReviewing(false)}>
        <View style={styles.modalBg}>
          <View style={styles.reviewModal}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>Rate your cleaner{job.assigned_cleaners_info?.length > 1 ? "s" : ""}</Text>
              <Pressable onPress={() => setReviewing(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
              {(job.assigned_cleaners_info || []).map((c: any) => (
                <View key={c.user_id} style={styles.reviewRow}>
                  <View style={styles.person}>
                    <Avatar uri={c.avatar} name={c.name} size={40} />
                    <Text style={styles.personName}>{c.name}</Text>
                  </View>
                  {reviewDone[c.user_id] ? (
                    <Text style={styles.reviewThanks}>✓ Thanks for your review!</Text>
                  ) : (
                    <>
                      <Stars value={ratings[c.user_id] || 0} size={32} testIDPrefix={`rate-${c.user_id}`}
                        onChange={(v) => setRatings((p) => ({ ...p, [c.user_id]: v }))} />
                      <TextInput
                        value={comments[c.user_id] || ""} onChangeText={(t) => setComments((p) => ({ ...p, [c.user_id]: t }))}
                        placeholder="Add a comment (optional)" placeholderTextColor={colors.muted} multiline
                        style={styles.reviewInput} testID={`review-comment-${c.user_id}`} />
                      <Button title="Submit Review" onPress={() => submitReview(c.user_id)} disabled={!ratings[c.user_id]}
                        style={{ height: 44 }} testID={`submit-review-${c.user_id}`} />
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const Info = ({ icon, label, value }: any) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={18} color={colors.brand} />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);
const NoteCard = ({ title, text }: any) => (
  <Card><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.noteText}>{text}</Text></Card>
);

const styles = StyleSheet.create({
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4, marginBottom: spacing.sm },
  segBtn: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segActive: { backgroundColor: colors.surfaceSecondary },
  segText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  segTextActive: { color: colors.onSurface },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: colors.muted, width: 110 },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.onSurface, flex: 1, textAlign: "right" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  noteText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  qPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.sage, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  qText: { fontSize: 12, fontWeight: "600", color: colors.onSurface },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  personName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  rate: { fontSize: 12, color: colors.muted },
  applicant: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  bio: { fontSize: 13, color: colors.muted },
  photoBtn: { borderRadius: radius.md, overflow: "hidden", borderWidth: 2, borderColor: colors.border, borderStyle: "dashed" },
  photo: { width: "100%", height: 160 },
  photoEmpty: { height: 130, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: colors.surfaceSecondary },
  photoLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  photoHint: { fontSize: 12, color: colors.muted },
  photoDone: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.success + "ee", padding: 8 },
  photoDoneText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  task: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  taskText: { fontSize: 15, color: colors.onSurface, flex: 1 },
  note: { fontSize: 12.5, color: colors.muted, textAlign: "center", marginTop: spacing.xs },
  actionBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xs },
  completed: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completedText: { fontSize: 14, fontWeight: "700", color: colors.success },
  modalBg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  reviewModal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing["2xl"], maxHeight: "85%" },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  reviewTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  reviewRow: { gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  reviewInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 60, fontSize: 14, color: colors.onSurface, textAlignVertical: "top" },
  reviewThanks: { fontSize: 14, fontWeight: "700", color: colors.success },
  assignPick: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
