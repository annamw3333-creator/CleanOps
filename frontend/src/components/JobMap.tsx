import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { statusColors } from "@/src/theme";

export default function JobMap({ jobs, region, onSelect }: { jobs: any[]; region: any; onSelect: (j: any) => void }) {
  return (
    <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} initialRegion={region} testID="job-map">
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
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  pinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
});
