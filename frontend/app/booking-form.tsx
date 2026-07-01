import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/src/AuthContext";
import { Screen, Header, Card, colors, spacing, radius } from "@/src/components/UI";

export default function BookingForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  const apiUrl = `${base}/api/public/book/${user?.user_id}`;

  const snippet = useMemo(() => `<!-- CleanOps booking form -->
<div id="cleanops-booking"></div>
<script>
(function(){
  var API = "${apiUrl}";
  var el = document.getElementById("cleanops-booking");
  var box = "padding:10px;border:1px solid #d5d9e0;border-radius:8px;font-size:15px";
  el.innerHTML =
    '<form style="max-width:440px;font-family:sans-serif;display:grid;gap:10px">'
    + '<h3 style="margin:0 0 4px">Book a Cleaning</h3>'
    + '<input name="client_name" placeholder="Your name" required style="'+box+'"/>'
    + '<input name="email" type="email" placeholder="Email" style="'+box+'"/>'
    + '<input name="phone" placeholder="Phone" style="'+box+'"/>'
    + '<input name="address" placeholder="Service address" required style="'+box+'"/>'
    + '<input name="date" type="date" required style="'+box+'"/>'
    + '<select name="clean_type" style="'+box+'">'
      + '<option value="standard">Standard clean</option>'
      + '<option value="deep">Deep clean</option>'
      + '<option value="airbnb">Airbnb turnover</option>'
      + '<option value="move_out">Move-out clean</option></select>'
    + '<textarea name="notes" placeholder="Notes (pets, access, etc.)" rows="3" style="'+box+'"></textarea>'
    + '<button type="submit" style="padding:12px;border:0;border-radius:8px;background:#1a5f7a;color:#fff;font-size:16px;cursor:pointer">Request Booking</button>'
    + '<p id="cleanops-msg" style="margin:4px 0;color:#1a5f7a"></p></form>';
  el.querySelector("form").addEventListener("submit", function(e){
    e.preventDefault();
    var f = e.target, data = {};
    ["client_name","email","phone","address","date","clean_type","notes"].forEach(function(k){ data[k] = f[k].value; });
    fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(data) })
      .then(function(r){ return r.json(); })
      .then(function(d){ document.getElementById("cleanops-msg").innerText = d.message || "Booking received!"; f.reset(); })
      .catch(function(){ document.getElementById("cleanops-msg").innerText = "Something went wrong. Please try again."; });
  });
})();
</script>`, [apiUrl]);

  const copy = async () => {
    await Clipboard.setStringAsync(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen>
      <Header title="Booking Form" subtitle="Embed on your website" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.iconRow}>
            <View style={styles.iconWrap}><Ionicons name="code-slash" size={22} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Ready-to-embed form</Text>
              <Text style={styles.hint}>Paste this snippet into any webpage. New requests land in your Work Hub as pending jobs.</Text>
            </View>
          </View>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.label}>HTML Snippet</Text>
            <Pressable onPress={copy} style={styles.copyBtn} testID="copy-snippet">
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={15} color="#fff" />
              <Text style={styles.copyText}>{copied ? "Copied!" : "Copy"}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal style={styles.codeBox} contentContainerStyle={{ padding: spacing.md }}>
            <Text style={styles.code} selectable testID="snippet-text">{snippet}</Text>
          </ScrollView>
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Text style={styles.label}>How it works</Text>
          <Step n="1" text="Copy the snippet above." />
          <Step n="2" text="Paste it into your website's HTML (Squarespace, Wix, WordPress, or a raw page)." />
          <Step n="3" text="Visitors fill it out — bookings appear instantly in your Work Hub as pending jobs, using your custom checklist." />
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>Note: the form points at your current CleanOps URL. After you publish/deploy, re-copy the snippet so it uses your live domain.</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const Step = ({ n, text }: any) => (
  <View style={styles.step}>
    <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
    <Text style={styles.stepText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  iconRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  copyText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  codeBox: { backgroundColor: "#0f172a", borderRadius: radius.md, maxHeight: 260 },
  code: { fontFamily: "monospace", fontSize: 11, color: "#a5f3fc", lineHeight: 16 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: 4 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  stepText: { flex: 1, fontSize: 13.5, color: colors.onSurface, lineHeight: 19 },
});
