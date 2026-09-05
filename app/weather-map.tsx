"use client";

import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";

const riskMeta = {
  Marginal: {
    color: "#8ecf9a",
    accent: "#2d7d46",
    label: "Marginal",
    short: "M",
  },
  Slight: {
    color: "#f5d76e",
    accent: "#b98b00",
    label: "Slight",
    short: "S",
  },
  Enhanced: {
    color: "#f9a65a",
    accent: "#d97706",
    label: "Enhanced",
    short: "E",
  },
  Moderate: {
    color: "#ea5a5a",
    accent: "#b42318",
    label: "Moderate",
    short: "M",
  },
  High: {
    color: "#b53a7a",
    accent: "#6b1f4d",
    label: "High",
    short: "H",
  },
  Extreme: {
    color: "#6b3d9f",
    accent: "#2e1a4f",
    label: "Extreme",
    short: "X",
  },
} as const;

type RiskLevel = keyof typeof riskMeta;

type RiskArea = {
  name: RiskLevel;
  positions: [number, number][];
};

type WeatherPoint = {
  risk: RiskLevel;
  position: [number, number];
  label: string;
  temp: number;
  icon: string;
  condition: string;
};

const riskAreas: RiskArea[] = [
  { name: "Marginal", positions: [[34.2, -100.5], [33.7, -96.7], [35.8, -95.1], [38.7, -92.5], [41.2, -89.8], [42.8, -87.4], [42.9, -84.2], [39.5, -82.6], [36.1, -84.4], [33.2, -90.1], [32.5, -96.2]] },
  { name: "Slight", positions: [[35.5, -101.8], [35.0, -96.6], [37.2, -95.0], [40.3, -92.0], [42.7, -88.3], [43.8, -85.5], [42.1, -81.8], [38.0, -82.6], [35.2, -86.6], [33.8, -93.2], [33.9, -99.7]] },
  { name: "Enhanced", positions: [[36.7, -99.3], [36.2, -95.2], [38.1, -93.7], [40.8, -90.8], [42.0, -88.0], [41.2, -84.9], [38.4, -85.6], [36.2, -88.8], [35.8, -94.5]] },
  { name: "Moderate", positions: [[37.1, -98.4], [36.8, -94.8], [38.5, -92.9], [40.4, -90.5], [39.9, -87.7], [37.9, -88.5], [36.6, -91.6], [36.5, -96.0]] },
  { name: "High", positions: [[39.0, -96.8], [38.7, -93.9], [39.9, -92.3], [40.7, -90.3], [39.9, -88.8], [38.4, -89.8], [38.4, -92.9]] },
  { name: "Extreme", positions: [[39.5, -95.8], [39.2, -94.2], [39.9, -93.3], [40.3, -91.7], [39.7, -90.8], [39.1, -91.5], [38.8, -93.1]] },
];

const weatherPoints: WeatherPoint[] = [
  { risk: "Slight", position: [35.5, -97.4], label: "OKC", temp: 82, icon: "☀️", condition: "Sunny" },
  { risk: "Moderate", position: [40.7, -86.3], label: "IND", temp: 76, icon: "⛅", condition: "Cloudy" },
  { risk: "Enhanced", position: [36.8, -88.8], label: "DALLAS", temp: 88, icon: "🌤️", condition: "Warm" },
  { risk: "High", position: [38.9, -90.8], label: "PLAINVIEW", temp: 84, icon: "⛈️", condition: "Storms" },
  { risk: "Extreme", position: [39.9, -92.8], label: "TULSA", temp: 91, icon: "🌩️", condition: "Severe" },
  { risk: "Marginal", position: [39.4, -94.6], label: "WICHITA", temp: 79, icon: "🌦️", condition: "Showers" },
];

function createWeatherIcon(risk: RiskLevel, icon: string, LeafletModule: typeof import("leaflet")) {
  const meta = riskMeta[risk];

  return LeafletModule.divIcon({
    className: "weather-pin-wrapper",
    html: `
      <div style="
        background:${meta.color};
        border:2px solid rgba(255,255,255,0.95);
        box-shadow:0 0 0 2px ${meta.accent};
        color:#111827;
        width:34px;
        height:34px;
        border-radius:9999px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:800;
        line-height:1;
      ">${icon}</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -12],
  });
}

export default function WeatherRiskMap() {
  const [LeafletModule, setLeafletModule] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let active = true;

    import("leaflet").then((mod) => {
      if (active) {
        setLeafletModule(mod.default ?? mod);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <div className="forecast-header">
        <div>
          <p className="eyebrow">Forecast</p>
          <h1>Weather Outlook Map</h1>
        </div>
        <div className="forecast-badge">Updated 2 min ago</div>
      </div>

      <div className="map-shell">
        <MapContainer center={[38.8, -91.5]} zoom={6} scrollWheelZoom className="leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {riskAreas.map((area) => (
            <Polyline
              key={area.name}
              positions={area.positions}
              pathOptions={{
                color: riskMeta[area.name].color,
                weight: area.name === "Extreme" ? 6 : 4,
                opacity: 0.95,
                dashArray: area.name === "Marginal" ? "12 8" : undefined,
              }}
            >
              <Tooltip sticky>{riskMeta[area.name].label}</Tooltip>
            </Polyline>
          ))}

          {LeafletModule &&
            weatherPoints.map((point) => (
              <Marker
                key={`${point.label}-${point.risk}`}
                position={point.position}
                icon={createWeatherIcon(point.risk, point.icon, LeafletModule)}
              >
                <Tooltip direction="top" offset={[0, -14]} opacity={1}>
                  {point.label} · {point.temp}°F · {point.condition}
                </Tooltip>
              </Marker>
            ))}

          <CircleMarker center={[38.8, -91.5]} radius={8} pathOptions={{ color: "#f8fafc", fillColor: "#0f172a", fillOpacity: 1 }} />
        </MapContainer>

        <div className="risk-legend" aria-label="Weather risk legend">
          {Object.entries(riskMeta).map(([name, meta]) => (
            <div key={name} className="risk-legend-item">
              <span className="swatch" style={{ background: meta.color, borderColor: meta.accent }} />
              <span>{meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
