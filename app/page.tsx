"use client";

import dynamic from "next/dynamic";

const WeatherEditor = dynamic(() => import("./weather-editor"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading SPC workspace...</div>,
});

export default function Home() {
  return <WeatherEditor />;
}
