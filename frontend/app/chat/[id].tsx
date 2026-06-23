import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { Screen, Header, colors, spacing, radius } from "@/src/components/UI";

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const m = await api.get(`/conversations/${id}/messages`);
      setMessages(m);
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const optimistic = { message_id: `tmp_${Date.now()}`, sender_id: user?.user_id, text: body };
    setMessages((p) => [...p, optimistic]);
    try { await api.post(`/conversations/${id}/messages`, { text: body }); await load(); } catch {}
  };

  return (
    <Screen>
      <Header title="Chat" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && <Text style={styles.empty}>No messages yet. Say hi! 👋</Text>}
          {messages.map((m) => {
            const mine = m.sender_id === user?.user_id;
            return (
              <View key={m.message_id} style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID={`message-${m.message_id}`}>
                <Text style={[styles.msgText, mine && { color: "#fff" }]}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.inputBar}>
          <TextInput value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={colors.muted}
            style={styles.input} multiline testID="message-input" onSubmitEditing={send} />
          <Pressable onPress={send} style={styles.sendBtn} testID="send-button"><Ionicons name="arrow-up" size={20} color="#fff" /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xl },
  bubble: { maxWidth: "78%", padding: spacing.md, borderRadius: radius.lg },
  mine: { backgroundColor: colors.brand, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surfaceSecondary, alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 15, color: colors.onSurface },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 100, minHeight: 44, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingTop: 12, fontSize: 15, color: colors.onSurface },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
