"use client";

import dynamic from "next/dynamic";

const WeatherMap = dynamic(() => import("./weather-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading forecast…</div>,
});

export default function Home() {
  return <WeatherMap />;
}
