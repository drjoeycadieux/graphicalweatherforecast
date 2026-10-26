"use client";

import dynamic from "next/dynamic";

const WeatherEditor = dynamic(() => import("./weather-editor"), {
  ssr: false,
  loading: () => (
    <div className="page-shell auth-page-shell">
      <div className="page-loading">
        <span className="spinner" aria-hidden="true" />
        Loading public outlook…
      </div>
    </div>
  ),
});

export default function Home() {
  return <WeatherEditor mode="public" />;
}
