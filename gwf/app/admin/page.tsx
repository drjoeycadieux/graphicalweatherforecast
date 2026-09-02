"use client";

import dynamic from "next/dynamic";

const WeatherEditor = dynamic(() => import("../weather-editor"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading editor…</div>,
});

export default function AdminPage() {
  return <WeatherEditor />;
}
