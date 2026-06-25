import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, statusColors, spacing, radius } from "@/src/theme";
import JobMapFallback from "./JobMapFallback";

const PHASE_COLORS: Record<string, string> = { enroute: "#1A5F7A", on_site: "#D4AF37", completed: "#2B7043" };

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const css = document.createElement("link");
      css.id = "leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletPromise;
}

const zoomFromDelta = (delta: number) => {
  if (!delta) return 12;
  const z = Math.round(Math.log2(360 / delta));
  return Math.min(16, Math.max(3, z));
};
const pinHtml = (color: string) =>
  `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`;
const personHtml = (color: string, initials: string) =>
  `<div style="width:32px;height:32px;border-radius:50%;background:#0A192F;border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:sans-serif;">${initials}</div>`;

// Web map: real interactive Leaflet/OpenStreetMap map with a list/map toggle.
export default function JobMap({ jobs, region, onSelect, people = [] }: {
  jobs: any[]; region: any; onSelect: (j: any) => void; people?: any[]; meLocation?: any;
}) {
  const [view, setView] = useState<"map" | "list">("map");
  const mapEl = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const drawMarkers = () => {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const bounds: any[] = [];
    jobs.forEach((j) => {
      if (!j.latitude || !j.longitude) return;
      const icon = L.divIcon({ html: pinHtml((statusColors as any)[j.status] || "#888"), className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([j.latitude, j.longitude], { icon }).addTo(layer).on("click", () => onSelect(j));
      bounds.push([j.latitude, j.longitude]);
    });
    people.filter((p) => p.latitude && p.longitude).forEach((p) => {
      const initials = (p.name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
      const icon = L.divIcon({ html: personHtml(PHASE_COLORS[p.phase] || "#1A5F7A", initials), className: "", iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([p.latitude, p.longitude], { icon }).addTo(layer).on("click", () => onSelect({ ...p, _isPerson: true }));
      bounds.push([p.latitude, p.longitude]);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    else if (bounds.length === 1) map.setView(bounds[0], 13);
  };

  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      if (!mapRef.current) {
        mapRef.current = L.map(mapEl.current, { zoomControl: true }).setView(
          [region.latitude, region.longitude], zoomFromDelta(region.latitudeDelta)
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      drawMarkers();
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 120);
    }).catch(() => setView("list"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === "map") drawMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, people, view]);

  return (
    <View style={styles.wrap} testID="job-map">
      {view === "map" ? (
        <div ref={mapEl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }} />
      ) : (
        <JobMapFallback jobs={jobs} onSelect={onSelect} people={people} banner="List view · tap a job to view details" />
      )}
      <Pressable onPress={() => setView(view === "map" ? "list" : "map")} style={styles.toggleBtn} testID="map-view-toggle">
        <Ionicons name={view === "map" ? "list" : "map"} size={16} color={colors.brand} />
        <Text style={styles.toggleText}>{view === "map" ? "List" : "Map"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceTertiary },
  toggleBtn: {
    position: "absolute", top: 116, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, zIndex: 1000,
  },
  toggleText: { fontSize: 13, fontWeight: "700", color: colors.brand },
});
