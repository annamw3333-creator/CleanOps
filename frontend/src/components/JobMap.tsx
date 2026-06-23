import React from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { statusColors } from "@/src/theme";

const PHASE_COLORS: Record<string, string> = { enroute: "#1A5F7A", on_site: "#D4AF37", completed: "#2B7043" };

export default function JobMap({ jobs, region, onSelect, people = [], meLocation }: {
  jobs: any[]; region: any; onSelect: (j: any) => void; people?: any[]; meLocation?: { latitude: number; longitude: number } | null;
}) {
  return (
    <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} initialRegion={region} testID="job-map" showsUserLocation={!!meLocation}>
      {jobs.map((j) => (
        <Marker
          key={j.job_id}
          coordinate={{ latitude: j.latitude, longitude: j.longitude }}
          onPress={() => onSelect(j)}
          testID={`map-marker-${j.job_id}`}
        >
          <View style={[styles.pin, { backgroundColor: (statusColors as any)[j.status] || "#888" }]}>
            <View style={styles.pinInner} />
          </View>
        </Marker>
      ))}
      {people.filter((p) => p.latitude && p.longitude).map((p) => (
        <Marker
          key={`person-${p.user_id}`}
          coordinate={{ latitude: p.latitude, longitude: p.longitude }}
          onPress={() => onSelect({ ...p, _isPerson: true })}
          testID={`map-person-${p.user_id}`}
        >
          <View style={[styles.person, { borderColor: PHASE_COLORS[p.phase] || "#1A5F7A" }]}>
            <Text style={styles.personInitials}>{(p.name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  pinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  person: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 3, backgroundColor: "#0A192F", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  personInitials: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
