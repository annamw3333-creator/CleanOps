import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { Screen, Header, Card, colors, spacing, radius } from "@/src/components/UI";

type Tool = { icon: any; title: string; sub: string; route: string; testID: string; tint?: string };

export default function OpsHub() {
  const router = useRouter();
  const { user } = useAuth();

  const sections: { heading: string; tools: Tool[] }[] = [
    {
      heading: "Operations",
      tools: [
        { icon: "speedometer-outline", title: "Command Center", sub: "Assign, start, complete & manage all jobs", route: "/operations", testID: "hub-operations" },
        { icon: "location-outline", title: "Live Crew Map", sub: "Track cleaners' live locations on active jobs", route: "/live-map", testID: "hub-live-map" },
        { icon: "cash-outline", title: "Payroll Reconciliation", sub: "Review logged hours & mark jobs paid", route: "/reconcile", testID: "hub-reconcile" },
      ],
    },
    {
      heading: "Growth & Quality",
      tools: [
        { icon: "code-slash-outline", title: "Booking Form", sub: "Embeddable form for your website", route: "/booking-form", testID: "hub-booking-form" },
        { icon: "list-outline", title: "Checklist Templates", sub: "Customize tasks & required photos per clean", route: "/checklist-templates", testID: "hub-checklist-templates" },
        { icon: "chatbubbles-outline", title: "Text Notifications", sub: "On-the-way, feedback & cleaner reminders", route: "/sms-settings", testID: "hub-sms-settings" },
        { icon: "school-outline", title: "Onboarding Builder", sub: "Create SOP docs & training quizzes", route: "/onboarding", testID: "hub-onboarding" },
      ],
    },
    {
      heading: "People & Clients",
      tools: [
        { icon: "people-circle-outline", title: "Team", sub: "Manage cleaners & invitations", route: "/teams", testID: "hub-teams" },
        { icon: "people-outline", title: "Client List", sub: "Clients, frequency, cleaners & notes", route: "/clients", testID: "hub-clients" },
        { icon: "calculator-outline", title: "Pay & Tax Calculator", sub: "Estimate pay stubs & deductions", route: `/employee/${user?.user_id}`, testID: "hub-payroll" },
      ],
    },
    {
      heading: "Business",
      tools: [
        { icon: "color-palette-outline", title: "Brand & Appearance", sub: "Set your company color for schedules", route: "/appearance", testID: "hub-appearance" },
        { icon: "card-outline", title: "Subscription", sub: "Plan, billing & founding-partner rate", route: "/subscription", testID: "hub-subscription" },
      ],
    },
  ];

  return (
    <Screen>
      <Header title="Ops Management Tools" subtitle="Run your whole business from here" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.xl }}>
        {sections.map((sec) => (
          <View key={sec.heading} style={{ gap: spacing.sm }}>
            <Text style={styles.heading}>{sec.heading}</Text>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {sec.tools.map((t, i) => (
                <Pressable key={t.testID} onPress={() => router.push(t.route as any)} testID={t.testID}
                  style={({ pressed }: any) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                  <View style={styles.iconWrap}><Ionicons name={t.icon} size={20} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{t.title}</Text>
                    <Text style={styles.sub}>{t.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
