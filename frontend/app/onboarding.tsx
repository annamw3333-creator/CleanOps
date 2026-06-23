import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, Card, Button, Input, Chip, EmptyState, colors, spacing, radius } from "@/src/components/UI";

export default function Onboarding() {
  const { user } = useAuth();
  const router = useRouter();
  const isOwner = ["company_owner", "owner_cleaner", "admin"].includes(user?.role || "");
  const [items, setItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<any>(null);

  // create form
  const [title, setTitle] = useState("");
  const [type, setType] = useState("document");
  const [content, setContent] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [qText, setQText] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);

  // take quiz
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setItems(await api.get("/onboarding")); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const addQuestion = () => {
    if (!qText.trim() || opts.some((o) => !o.trim())) return;
    setQuestions((p) => [...p, { q: qText.trim(), options: [...opts], answer: correct }]);
    setQText(""); setOpts(["", "", "", ""]); setCorrect(0);
  };
  const createItem = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post("/onboarding", { title: title.trim(), type, content, questions: type === "quiz" ? questions : [] });
      setTitle(""); setContent(""); setQuestions([]); setCreating(false);
      await load();
    } catch {} finally { setBusy(false); }
  };
  const submitQuiz = async () => {
    setBusy(true);
    try {
      const ans = (active.questions || []).map((_: any, i: number) => answers[i] ?? -1);
      const r = await api.post(`/onboarding/${active.item_id}/complete`, { answers: ans });
      setActive(null); setAnswers({});
      await load();
      if (r.total != null) alert(`Score: ${r.score}/${r.total}`);
    } catch {} finally { setBusy(false); }
  };
  const markDocDone = async () => {
    setBusy(true);
    try { await api.post(`/onboarding/${active.item_id}/complete`, { answers: [] }); setActive(null); await load(); }
    catch {} finally { setBusy(false); }
  };

  const completedCount = items.filter((i) => i.completed).length;

  return (
    <Screen>
      <Header title="Onboarding" subtitle={isOwner ? "Build your training & SOPs" : `${completedCount}/${items.length} completed`} onBack={() => router.back()}
        right={isOwner ? <Pressable onPress={() => setCreating(true)} style={styles.add} testID="new-onboarding-button"><Ionicons name="add" size={24} color={colors.brand} /></Pressable> : undefined} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card><EmptyState icon="school-outline" title="No onboarding yet" subtitle={isOwner ? "Add SOP documents and quizzes for your cleaners." : "Your employer hasn't added training yet."} /></Card>
        ) : items.map((it) => (
          <Card key={it.item_id} onPress={() => { setActive(it); setAnswers({}); }} testID={`ob-${it.item_id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={[styles.icon, { backgroundColor: it.completed ? colors.success + "22" : colors.sage }]}>
              <Ionicons name={it.type === "quiz" ? "help-circle" : "document-text"} size={22} color={it.completed ? colors.success : colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{it.title}</Text>
              <Text style={styles.itemMeta}>{it.type === "quiz" ? `Quiz · ${it.questions?.length || 0} questions` : "Document"}{it.completed && it.total != null ? ` · scored ${it.score}/${it.total}` : ""}</Text>
            </View>
            {it.completed ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
          </Card>
        ))}
      </ScrollView>

      {/* Create modal (owner) */}
      <Modal visible={creating} animationType="slide" transparent onRequestClose={() => setCreating(false)}>
        <View style={styles.bg}><View style={styles.sheet}>
          <View style={styles.sheetHead}><Text style={styles.sheetTitle}>New Onboarding Item</Text><Pressable onPress={() => setCreating(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable></View>
          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
            <Input label="Title" value={title} onChangeText={setTitle} placeholder="Bathroom deep-clean SOP" testID="ob-title" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Chip label="Document" active={type === "document"} onPress={() => setType("document")} testID="ob-type-doc" />
              <Chip label="Quiz" active={type === "quiz"} onPress={() => setType("quiz")} testID="ob-type-quiz" />
            </View>
            <Input label={type === "quiz" ? "Study material / intro" : "Content"} value={content} onChangeText={setContent} multiline placeholder="Steps, expectations, safety notes..." testID="ob-content" />
            {type === "quiz" && (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.itemTitle}>Questions ({questions.length})</Text>
                {questions.map((q, i) => <Text key={i} style={styles.itemMeta}>• {q.q}</Text>)}
                <Input label="Question" value={qText} onChangeText={setQText} placeholder="What PPE is required?" testID="ob-q" />
                {opts.map((o, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Pressable onPress={() => setCorrect(i)} testID={`ob-correct-${i}`}><Ionicons name={correct === i ? "radio-button-on" : "radio-button-off"} size={22} color={correct === i ? colors.success : colors.muted} /></Pressable>
                    <View style={{ flex: 1 }}><Input value={o} onChangeText={(v: string) => setOpts((p) => p.map((x, j) => j === i ? v : x))} placeholder={`Option ${i + 1}`} testID={`ob-opt-${i}`} /></View>
                  </View>
                ))}
                <Button title="Add Question" variant="outline" icon="add" onPress={addQuestion} style={{ height: 44 }} testID="ob-add-q" />
              </View>
            )}
            <Button title="Create" onPress={createItem} loading={busy} testID="ob-create" />
          </ScrollView>
        </View></View>
      </Modal>

      {/* View / take modal */}
      <Modal visible={!!active} animationType="slide" transparent onRequestClose={() => setActive(null)}>
        <View style={styles.bg}><View style={styles.sheet}>
          <View style={styles.sheetHead}><Text style={styles.sheetTitle}>{active?.title}</Text><Pressable onPress={() => setActive(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable></View>
          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
            {active?.content ? <Text style={styles.body}>{active.content}</Text> : null}
            {active?.type === "quiz" && (active?.questions || []).map((q: any, i: number) => (
              <View key={i} style={{ gap: 6 }}>
                <Text style={styles.itemTitle}>{i + 1}. {q.q}</Text>
                {q.options.map((o: string, j: number) => (
                  <Pressable key={j} onPress={() => !isOwner && setAnswers((p) => ({ ...p, [i]: j }))} style={[styles.opt, answers[i] === j && styles.optSel]} testID={`take-${i}-${j}`}>
                    <Ionicons name={answers[i] === j ? "radio-button-on" : "radio-button-off"} size={18} color={answers[i] === j ? colors.brand : colors.muted} />
                    <Text style={styles.optText}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {!isOwner && active?.type === "quiz" && <Button title="Submit Answers" onPress={submitQuiz} loading={busy} testID="ob-submit" />}
            {!isOwner && active?.type === "document" && !active?.completed && <Button title="Mark as Complete" onPress={markDocDone} loading={busy} testID="ob-doc-done" />}
          </ScrollView>
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 12.5, color: colors.muted },
  body: { fontSize: 14, color: colors.onSurface, lineHeight: 21 },
  bg: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing["2xl"], maxHeight: "88%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: colors.onSurface, flex: 1 },
  opt: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  optSel: { borderColor: colors.brand, backgroundColor: colors.sage + "44" },
  optText: { fontSize: 14, color: colors.onSurface, flex: 1 },
});
