import React from "react";
import JobMapFallback from "./JobMapFallback";

// Web fallback: react-native-maps is not supported on web preview.
export default function JobMap({ jobs, onSelect, people = [] }: {
  jobs: any[]; region: any; onSelect: (j: any) => void; people?: any[]; meLocation?: any;
}) {
  return <JobMapFallback jobs={jobs} onSelect={onSelect} people={people} banner="Map preview · live map renders in the mobile app" />;
}
