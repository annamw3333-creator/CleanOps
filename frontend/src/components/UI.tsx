import React from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  ScrollView, ViewStyle, TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, statusColors, statusLabels } from "@/src/theme";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.surface }, style]} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn} testID="header-back-button" hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, style, testID }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "outline" | "ghost";
  loading?: boolean; disabled?: boolean; icon?: any; style?: ViewStyle; testID?: string;
}) {
  const bg = variant === "primary" ? colors.brand : variant === "secondary" ? colors.gold : "transparent";
  const fg = variant === "primary" ? colors.onBrand : variant === "secondary" ? colors.onGold : colors.brand;
  const border = variant === "outline" ? { borderWidth: 1.5, borderColor: colors.brand } : {};
  const handle = () => { if (!disabled && !loading) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); } };
  return (
    <Pressable onPress={handle} disabled={disabled || loading} testID={testID}
      style={[styles.btn, { backgroundColor: bg }, border, (disabled || loading) && { opacity: 0.5 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; testID?: string }) {
  const Comp: any = onPress ? Pressable : View;
  return <Comp onPress={onPress} testID={testID} style={[styles.card, style]}>{children}</Comp>;
}

export function Input({ value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, label, autoCapitalize, testID }: any) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry} keyboardType={keyboardType} multiline={multiline}
        autoCapitalize={autoCapitalize} testID={testID}
        style={[styles.input, multiline && { height: 90, textAlignVertical: "top" }]}
      />
    </View>
  );
}

export function StatusPill({ status, small }: { status: keyof typeof statusColors; small?: boolean }) {
  const c = statusColors[status] || colors.muted;
  return (
    <View style={[styles.pill, { backgroundColor: c + "22", borderColor: c }, small && { paddingVertical: 2, paddingHorizontal: 8 }]}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text style={[styles.pillText, { color: c }, small && { fontSize: 11 }]}>{statusLabels[status] || status}</Text>
    </View>
  );
}

export function Avatar({ uri, name, size = 40 }: { uri?: string; name?: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  const initials = (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction, testID }: { icon: any; title: string; subtitle?: string; actionLabel?: string; onAction?: () => void; testID?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconOuter}>
        <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={colors.brand} /></View>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.emptyAction} testID={testID}>
          <Ionicons name="arrow-forward-circle" size={18} color={colors.onBrand} />
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, color, testID }: { label: string; active?: boolean; onPress: () => void; color?: string; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID}
      style={[styles.chip, active ? { backgroundColor: color || colors.brand, borderColor: color || colors.brand } : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Text style={[styles.chipText, { color: active ? "#fff" : colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

export function AdBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Pressable onPress={onUpgrade} style={styles.ad} testID="ad-banner">
      <View style={styles.adTag}><Text style={styles.adTagText}>AD</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.adTitle}>Sparkle Supplies — 20% off</Text>
        <Text style={styles.adSub}>Tap to go ad-free with Pro →</Text>
      </View>
      <Ionicons name="close-circle" size={20} color={colors.muted} />
    </Pressable>
  );
}

export function Stars({ value, size = 14, onChange, testIDPrefix }: { value: number; size?: number; onChange?: (v: number) => void; testIDPrefix?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline";
        const star = <Ionicons name={name as any} size={size} color={colors.gold} />;
        if (onChange) {
          return <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} testID={`${testIDPrefix || "star"}-${i}`}>{star}</Pressable>;
        }
        return <View key={i}>{star}</View>;
      })}
    </View>
  );
}

export function RatingLabel({ rating, count, size = 13 }: { rating: number; count: number; size?: number }) {
  if (!count) return <Text style={{ fontSize: size, color: colors.muted }}>No reviews yet</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name="star" size={size} color={colors.gold} />
      <Text style={{ fontSize: size, fontWeight: "700", color: colors.onSurface }}>{rating.toFixed(1)}</Text>
      <Text style={{ fontSize: size - 1, color: colors.muted }}>({count})</Text>
    </View>
  );
}

export { colors, spacing, radius };

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  backBtn: { marginRight: spacing.sm, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 24, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  btn: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  btnText: { fontSize: 16, fontWeight: "700" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  inputLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 50, fontSize: 15, color: colors.onSurface },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing["2xl"], gap: spacing.sm },
  emptyIconOuter: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.sage + "55", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.pill, marginTop: spacing.sm },
  emptyActionText: { fontSize: 14, fontWeight: "700", color: colors.onBrand },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipText: { fontSize: 13, fontWeight: "600" },
  ad: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  adTag: { backgroundColor: colors.borderStrong, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  adTagText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  adTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  adSub: { fontSize: 12, color: colors.brand, fontWeight: "600" },
});
