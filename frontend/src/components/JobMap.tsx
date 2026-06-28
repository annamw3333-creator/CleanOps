import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { statusColors } from "@/src/theme";

const PHASE_COLORS: Record<string, string> = { enroute: "#1A5F7A", on_site: "#D4AF37", completed: "#2B7043" };

const zoomFromDelta = (delta: number) => {
  if (!delta) return 12;
  const z = Math.round(Math.log2(360 / delta));
  return Math.min(16, Math.max(3, z));
};

const buildHtml = (region: any) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#E8EEF1}</style>
</head>
<body>
<div id="map"></div>
<script>
  function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  var map, layer;
  function jobIcon(c){ return L.divIcon({html:'<div style="width:22px;height:22px;border-radius:50%;background:'+c+';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]}); }
  function personIcon(c,ini){ return L.divIcon({html:'<div style="width:32px;height:32px;border-radius:50%;background:#0A192F;border:3px solid '+c+';box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;font-family:sans-serif">'+ini+'</div>',className:'',iconSize:[32,32],iconAnchor:[16,16]}); }
  function updateMarkers(list){
    if(!map||!layer) return;
    layer.clearLayers();
    var bounds=[];
    list.forEach(function(m){
      var icon = m.kind==='person' ? personIcon(m.color, m.initials||'?') : jobIcon(m.color);
      var mk = L.marker([m.lat,m.lng],{icon:icon}).addTo(layer);
      mk.on('click', function(){ post({type:'select', id:m.id, kind:m.kind}); });
      bounds.push([m.lat,m.lng]);
    });
    if(bounds.length>1){ map.fitBounds(bounds,{padding:[50,50],maxZoom:15}); }
    else if(bounds.length===1){ map.setView(bounds[0],13); }
  }
  function init(){
    try {
      map = L.map('map',{zoomControl:true}).setView([${region.latitude},${region.longitude}], ${zoomFromDelta(region.latitudeDelta)});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
      layer = L.layerGroup().addTo(map);
      post({type:'loaded'});
    } catch(e){ post({type:'error', msg:String(e)}); }
  }
  if(window.L){ init(); } else { window.addEventListener('load', init); }
</script>
</body>
</html>`;

// Native map: Leaflet / OpenStreetMap rendered in a WebView (no Google Maps key required).
export default function JobMap({ jobs, region, onSelect, people = [] }: {
  jobs: any[]; region: any; onSelect: (j: any) => void; people?: any[]; meLocation?: any;
}) {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const initialRegion = useRef(region).current;
  const html = useMemo(() => buildHtml(initialRegion), [initialRegion]);

  const jobsById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.job_id, j])), [jobs]);
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.user_id, p])), [people]);

  const markers = useMemo(() => [
    ...jobs.filter((j) => j.latitude && j.longitude).map((j) => ({
      id: j.job_id, kind: "job", lat: j.latitude, lng: j.longitude, color: (statusColors as any)[j.status] || "#888",
    })),
    ...people.filter((p) => p.latitude && p.longitude).map((p) => ({
      id: p.user_id, kind: "person", lat: p.latitude, lng: p.longitude,
      color: PHASE_COLORS[p.phase] || "#1A5F7A",
      initials: (p.name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase(),
    })),
  ], [jobs, people]);

  useEffect(() => {
    if (loaded && webRef.current) {
      webRef.current.injectJavaScript(`updateMarkers(${JSON.stringify(markers)}); true;`);
    }
  }, [markers, loaded]);

  const onMessage = (e: any) => {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (d.type === "loaded") setLoaded(true);
      else if (d.type === "select") {
        if (d.kind === "person") { const p = peopleById[d.id]; if (p) onSelect({ ...p, _isPerson: true }); }
        else { const j = jobsById[d.id]; if (j) onSelect(j); }
      }
    } catch {}
  };

  return (
    <View style={StyleSheet.absoluteFill} testID="job-map">
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={StyleSheet.absoluteFill}
        startInLoadingState={false}
      />
    </View>
  );
}
