import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { Screen, Header, Card, Button, Input, Avatar, Chip, colors, spacing, radius } from "@/src/components/UI";

const FREQS = [
  { k: "weekly", l: "Weekly" }, { k: "biweekly", l: "Bi-weekly" },
  { k: "semimonthly", l: "Semi-monthly" }, { k: "monthly", l: "Monthly" },
];
const WORKER = [
  { k: "employee", l: "Employee" }, { k: "freelancer", l: "Freelancer" }, { k: "subcontractor", l: "Subcontractor" },
];

function fmt12(t: string) {
  const [h, m] = (t || "0:0").split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function EmployeeProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [emp, setEmp] = useState<any>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [province, setProvince] = useState("ON");
  const [hours, setHours] = useState("40");
  const [rate, setRate] = useState("25");
  const [freq, setFreq] = useState("biweekly");
  const [worker, setWorker] = useState("employee");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([api.get(`/users/${id}`), api.get("/payroll/provinces")]);
      setEmp(u);
      setProvinces(p.provinces);
      if (u.hourly_rate) setRate(String(u.hourly_rate));
    } catch {}
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const calc = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api.post("/payroll/calculate", {
        province, hourly_rate: parseFloat(rate) || 0, hours_per_week: parseFloat(hours) || 0,
        pay_frequency: freq, worker_type: worker,
      });
      setResult(r);
    } catch (e: any) { setResult({ error: e.message }); }
    finally { setBusy(false); }
  };

  const tenure = (since?: string) => {
    if (!since) return "—";
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
    if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
    if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"}`;
    return `${(days / 365).toFixed(1)} years`;
  };

  if (!emp) return <Screen><Header title="Profile" onBack={() => router.back()} /></Screen>;

  return (
    <Screen>
      <Header title={emp.name} subtitle={emp.role.replace("_", " ")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.lg }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Avatar uri={emp.avatar} name={emp.name} size={72} />
        </View>

        <View style={styles.statsRow}>
          <Stat label="Hourly Wage" value={emp.hourly_rate ? `$${emp.hourly_rate}` : "—"} />
          <Stat label="At Company" value={tenure(emp.member_since)} />
          <Stat label="Cleans Done" value={String(emp.completed_count || 0)} />
        </View>

        {emp.experience_summary ? (
          <Card><Text style={styles.section}>Experience</Text><Text style={styles.body}>{emp.experience_summary}</Text></Card>
        ) : null}

        {emp.availability?.length > 0 && (
          <Card><Text style={styles.section}>Availability</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {emp.availability.map((d: string) => {
                const s = emp.availability_schedule?.[d];
                const detail = !s || s.mode === "all"
                  ? "All day"
                  : (s.windows || []).map((w: any) => `${fmt12(w.from)}–${fmt12(w.to)}`).join(", ");
                return (
                  <View key={d} style={styles.availRow}>
                    <View style={styles.dayPill}><Text style={styles.dayText}>{d}</Text></View>
                    <Text style={styles.availDetail}>{detail}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {emp.portfolio?.length > 0 && (
          <Card><Text style={styles.section}>Work Photos ({emp.portfolio.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {emp.portfolio.map((p: string, i: number) => (<Image key={i} source={{ uri: p }} style={styles.photo} contentFit="cover" />))}
            </ScrollView>
          </Card>
        )}

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Pay Stub Preview (Canada {result?.tax_year || 2026})</Text>
          <Text style={styles.hint}>Estimate for planning only — not official payroll/tax advice.</Text>

          <Text style={styles.label}>Worker type</Text>
          <View style={styles.wrap}>{WORKER.map((w) => <Chip key={w.k} label={w.l} active={worker === w.k} onPress={() => setWorker(w.k)} testID={`worker-${w.k}`} />)}</View>

          <Text style={styles.label}>Province / Territory</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {provinces.map((p) => <Chip key={p.code} label={p.code} active={province === p.code} onPress={() => setProvince(p.code)} testID={`prov-${p.code}`} />)}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Input label="Hourly Rate ($)" value={rate} onChangeText={setRate} keyboardType="numeric" testID="pay-rate" /></View>
            <View style={{ flex: 1 }}><Input label="Hours / week" value={hours} onChangeText={setHours} keyboardType="numeric" testID="pay-hours" /></View>
          </View>

          <Text style={styles.label}>Pay frequency</Text>
          <View style={styles.wrap}>{FREQS.map((f) => <Chip key={f.k} label={f.l} active={freq === f.k} onPress={() => setFreq(f.k)} testID={`freq-${f.k}`} />)}</View>

          <Button title="Calculate Pay Stub" icon="calculator" onPress={calc} loading={busy} testID="calc-button" />

          {result?.error ? <Text style={styles.err}>{result.error}</Text> : null}
          {result && !result.error && (
            <View style={styles.stub} testID="paystub-result">
              <Text style={styles.stubTitle}>Per pay ({result.pay_frequency}, {result.periods_per_year}×/yr) · {result.province_name}</Text>
              {result.worker_type === "employee" ? (
                <>
                  <Row l="Gross pay" v={result.per_period.gross} bold />
                  <Row l="CPP" v={-result.per_period.cpp} />
                  {result.per_period.cpp2 > 0 && <Row l="CPP2" v={-result.per_period.cpp2} />}
                  <Row l="EI" v={-result.per_period.ei} />
                  <Row l="Federal tax" v={-result.per_period.federal_tax} />
                  <Row l="Provincial tax" v={-result.per_period.provincial_tax} />
                  <View style={styles.divider} />
                  <Row l="Net pay" v={result.per_period.net} bold big />
                  <View style={styles.divider} />
                  <Text style={styles.annual}>Annual: gross ${result.annual.gross.toLocaleString()} · net ${result.annual.net.toLocaleString()}</Text>
                  <Text style={styles.annual}>Employer cost: CPP ${result.annual.employer_cpp.toLocaleString()} + EI ${result.annual.employer_ei.toLocaleString()}</Text>
                </>
              ) : (
                <>
                  <Row l="Gross (invoiced)" v={result.per_period.gross} bold />
                  <Row l="Recommended set-aside" v={-result.per_period.set_aside} />
                  <View style={styles.divider} />
                  <Row l="Keep (after set-aside)" v={result.per_period.net} bold big />
                  <View style={styles.divider} />
                  <Text style={styles.annual}>Annual set-aside ${result.annual.total_set_aside.toLocaleString()} (CPP self ${result.annual.cpp_self.toLocaleString()} + fed ${result.annual.federal_tax.toLocaleString()} + prov ${result.annual.provincial_tax.toLocaleString()})</Text>
                  {result.gst_registration_required && <Text style={styles.note}>⚠︎ Over $30k/yr — GST/HST registration required.</Text>}
                  <Text style={styles.note}>Self-employed: no EI; responsible for own remittances.</Text>
                </>
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const Stat = ({ label, value }: any) => (
  <View style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
);
const Row = ({ l, v, bold, big }: any) => (
  <View style={styles.row}>
    <Text style={[styles.rowL, bold && { fontWeight: "700" }]}>{l}</Text>
    <Text style={[styles.rowV, bold && { fontWeight: "800" }, big && { fontSize: 18 }, v < 0 && { color: colors.error }]}>
      {v < 0 ? "-" : ""}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 },
  statValue: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.muted, textAlign: "center" },
  section: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginBottom: 6 },
  body: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  hint: { fontSize: 12, color: colors.muted },
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dayPill: { backgroundColor: colors.sage, paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill },
  dayText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  availRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  availDetail: { fontSize: 13, color: colors.onSurface, fontWeight: "600", flex: 1 },
  photo: { width: 90, height: 90, borderRadius: 10 },
  stub: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 6 },
  stubTitle: { fontSize: 13, fontWeight: "700", color: colors.brand, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowL: { fontSize: 14, color: colors.onSurface },
  rowV: { fontSize: 14, color: colors.onSurface },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  annual: { fontSize: 12, color: colors.muted },
  note: { fontSize: 12, color: colors.warning, fontWeight: "600" },
  err: { color: colors.error, fontSize: 13, textAlign: "center" },
});
