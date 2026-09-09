"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import "ol/ol.css";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { type User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type OutlookDay = 1 | 2 | 3;
type MapRegion = "USA" | "Quebec";
type Hazard = "Severe Thunderstorms" | "Tornado" | "Wind" | "Hail";
type RiskCategory = "General Thunder" | "Marginal" | "Slight" | "Enhanced" | "Moderate" | "High";
type OutlookShape = { id?: string; day: OutlookDay; hazard: Hazard; category: RiskCategory; points: [number, number][]; createdAt?: unknown; updatedAt?: unknown };
type GeoJsonCollection = FeatureCollection<Geometry, GeoJsonProperties>;

const riskMeta: Record<RiskCategory, { color: string; ink: string; short: string }> = {
  "General Thunder": { color: "#c9c9c9", ink: "#5d636b", short: "T" },
  Marginal: { color: "#7fc97f", ink: "#28633c", short: "MRGL" },
  Slight: { color: "#f5df62", ink: "#7a6500", short: "SLGT" },
  Enhanced: { color: "#f6a257", ink: "#8a4309", short: "ENH" },
  Moderate: { color: "#e86a6a", ink: "#7b2222", short: "MDT" },
  High: { color: "#c14f88", ink: "#68183f", short: "HIGH" },
};

const hazards: { value: Hazard; short: string }[] = [
  { value: "Severe Thunderstorms", short: "ALL" },
  { value: "Tornado", short: "TOR" },
  { value: "Wind", short: "WND" },
  { value: "Hail", short: "HAIL" },
];

const regionViews: Record<MapRegion, { longitude: number; latitude: number; zoom: number }> = {
  USA: { longitude: -96, latitude: 38.5, zoom: 4 },
  Quebec: { longitude: -72, latitude: 51.5, zoom: 5 },
};

const US_COUNTRIES_GEOJSON = "/api/map-data/countries";
const US_STATES_GEOJSON = "/api/map-data/states";
const QUEBEC_GEOJSON = "/api/map-data/quebec";

type PolygonFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: { fill: string; outline: string; opacity: number };
};

function polygonFeature(points: [number, number][], fill: string, outline: string, opacity: number): PolygonFeature {
  const coordinates = points.map(([lat, lng]) => [lng, lat]);
  if (coordinates.length > 2) coordinates.push(coordinates[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] }, properties: { fill, outline, opacity } };
}

function polygonCollection(features: PolygonFeature[]) {
  return { type: "FeatureCollection" as const, features };
}

function PoliticalMap({ region, selectedDay, countryData, stateData, quebecData, savedPolygonData, draft, category, onMapClick }: {
  selectedDay: OutlookDay;
  region: MapRegion; countryData: GeoJsonCollection | null; stateData: GeoJsonCollection | null; quebecData: GeoJsonCollection | null;
  savedPolygonData: ReturnType<typeof polygonCollection>; draft: [number, number][];
  category: RiskCategory; onMapClick: (point: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!countryData || !stateData || !quebecData) return;
    const container = containerRef.current;
    if (!container) return;
    const view = regionViews[region];
    const geoJson = new GeoJSON();
    const boundaryStyle = (fill: string, stroke: string, width: number) => new Style({ fill: new Fill({ color: fill }), stroke: new Stroke({ color: stroke, width }) });
    const countryLayer = new VectorLayer({ source: new VectorSource({ features: geoJson.readFeatures(countryData, { featureProjection: "EPSG:3857" }) }), style: boundaryStyle("#c9c0b1", "#8e8577", 1) });
    const stateLayer = new VectorLayer({ source: new VectorSource({ features: geoJson.readFeatures(stateData, { featureProjection: "EPSG:3857" }) }), style: boundaryStyle("#f6efe3", "#6f675b", 1.1) });
    const quebecLayer = new VectorLayer({ source: new VectorSource({ features: geoJson.readFeatures(quebecData, { featureProjection: "EPSG:3857" }) }), visible: region === "Quebec", style: boundaryStyle("#e8f0ed", "#35605a", 1.5) });
    const savedSource = new VectorSource({ features: geoJson.readFeatures(savedPolygonData, { featureProjection: "EPSG:3857" }) });
    const savedLayer = new VectorLayer({ source: savedSource, style: (feature) => boundaryStyle(String(feature.get("fill") ?? "#f5df62"), String(feature.get("outline") ?? "#7a6500"), 2) });
    const draftSource = new VectorSource();
    if (draft.length > 2) {
      draftSource.addFeature(new Feature({ geometry: new Polygon([[...draft.map(([lat, lng]) => fromLonLat([lng, lat])), fromLonLat([draft[0][1], draft[0][0]])]]), fill: riskMeta[category].color, outline: riskMeta[category].ink }));
    } else if (draft.length > 1) {
      draftSource.addFeature(new Feature({ geometry: new LineString(draft.map(([lat, lng]) => fromLonLat([lng, lat]))), outline: riskMeta[category].ink }));
    }
    const draftLayer = new VectorLayer({ source: draftSource, style: (feature) => new Style({ fill: new Fill({ color: `${feature.get("fill") ?? "#f5df62"}85` }), stroke: new Stroke({ color: String(feature.get("outline") ?? riskMeta[category].ink), width: 2, lineDash: [6, 5] }) }) });
    const montrealLayer = new VectorLayer({
      source: new VectorSource({ features: [new Feature({ geometry: new Point(fromLonLat([-73.5673, 45.5017])) })] }),
      visible: region === "Quebec",
      style: new Style({
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#193b4a" }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }),
        text: new Text({ text: "Montreal", offsetY: -16, font: "600 13px sans-serif", fill: new Fill({ color: "#193b4a" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
      }),
    });
    const map = new Map({ target: container, layers: [countryLayer, stateLayer, quebecLayer, savedLayer, draftLayer, montrealLayer], view: new View({ center: fromLonLat([view.longitude, view.latitude]), zoom: view.zoom, minZoom: 3, maxZoom: 8 }) });
    mapRef.current = map;
    map.on("click", (event) => { const [longitude, latitude] = toLonLat(event.coordinate); onMapClick([latitude, longitude]); });
    return () => { map.setTarget(undefined); mapRef.current = null; };
  }, [category, countryData, draft, onMapClick, quebecData, region, savedPolygonData, stateData]);

  const exportMapAsPng = () => {
    const map = mapRef.current;
    const size = map?.getSize();
    if (!map || !size) return;
    map.renderSync();
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = size[0];
    exportCanvas.height = size[1];
    const context = exportCanvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#e5e7eb";
    context.fillRect(0, 0, size[0], size[1]);
    map.getViewport().querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return;
      context.globalAlpha = Number(canvas.parentElement?.style.opacity || 1);
      context.drawImage(canvas, 0, 0);
    });
    context.globalAlpha = 1;
    const link = document.createElement("a");
    link.download = `weather-outlook-${region.toLowerCase()}-day-${selectedDay}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  };

  if (!countryData || !stateData || !quebecData) {
    return <div className="maplibre-canvas map-loading">Loading political map...</div>;
  }

  return <div ref={containerRef} className="maplibre-canvas openlayers-canvas"><button type="button" className="map-export-button" onClick={exportMapAsPng} title="Download map as PNG">Download PNG</button></div>;
}

export default function WeatherEditor() {
  const [shapes, setShapes] = useState<OutlookShape[]>([]);
  const [selectedDay, setSelectedDay] = useState<OutlookDay>(1);
  const [region, setRegion] = useState<MapRegion>("USA");
  const [hazard, setHazard] = useState<Hazard>("Severe Thunderstorms");
  const [category, setCategory] = useState<RiskCategory>("Slight");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [countryData, setCountryData] = useState<GeoJsonCollection | null>(null);
  const [stateData, setStateData] = useState<GeoJsonCollection | null>(null);
  const [quebecData, setQuebecData] = useState<GeoJsonCollection | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => { setUser(nextUser); setAuthReady(true); });
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!db) { setDataError("Connect Firebase to load and publish outlooks."); setLoading(false); return; }
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Firestore request timed out.")), 8000);
      });
      try {
        const snapshot = await Promise.race([getDocs(query(collection(db, "spc-outlooks"), orderBy("createdAt", "asc"))), timeout]);
        const results = snapshot.docs.map((doc) => {
          const data = doc.data() as Partial<OutlookShape>;
          return {
            id: doc.id,
            day: data.day ?? 1,
            hazard: data.hazard ?? "Severe Thunderstorms",
            category: data.category ?? "General Thunder",
            points: data.points ?? [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } satisfies OutlookShape;
        });
        setShapes(results);
      } catch (error) { console.error("Could not load SPC outlooks:", error); setDataError("Firestore could not load outlooks."); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  useEffect(() => {
    const loadMapData = async () => {
      try {
        const [countriesResponse, statesResponse, quebecResponse] = await Promise.all([fetch(US_COUNTRIES_GEOJSON), fetch(US_STATES_GEOJSON), fetch(QUEBEC_GEOJSON)]);
        if (!countriesResponse.ok || !statesResponse.ok || !quebecResponse.ok) throw new Error("Map boundary data could not be loaded.");
        const [countries, states, quebec] = await Promise.all([countriesResponse.json(), statesResponse.json(), quebecResponse.json()]) as [GeoJsonCollection, GeoJsonCollection, GeoJsonCollection];
        setCountryData(countries);
        setStateData(states);
        setQuebecData(quebec);
      } catch (error) {
        console.error("Could not load map boundaries:", error);
      }
    };
    void loadMapData();
  }, []);

  const canEdit = Boolean(db) && (!auth || Boolean(user));
  const summary = useMemo(() => `${shapes.filter((shape) => shape.day === selectedDay && shape.hazard === hazard).length} areas plotted`, [hazard, selectedDay, shapes]);
  const savedPolygonData = useMemo(() => polygonCollection(shapes
    .filter((shape) => shape.day === selectedDay && shape.hazard === hazard && shape.points.length > 2)
    .map((shape) => polygonFeature(shape.points, riskMeta[shape.category].color, riskMeta[shape.category].ink, 0.5))), [hazard, selectedDay, shapes]);

  const saveShape = async (shape: OutlookShape) => {
    if (!canEdit || !db) return;
    const clean = { ...shape, day: selectedDay, hazard, category, points: shape.points };
    try {
      const ref = await addDoc(collection(db, "spc-outlooks"), { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setShapes((current) => [...current, { ...clean, id: ref.id }]);
      setDraft([]); setDrawing(false);
    } catch (error) { console.error("Could not save SPC outlook:", error); setDataError("Firestore could not save this outlook."); }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); if (!auth) return;
    try { setAuthError(""); await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to sign in."); }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
  };

  return <main className="page-shell">
    <header className="forecast-header">
      <div><p className="eyebrow">SPC outlook workstation</p><h1>Severe Weather Drawing Desk</h1></div>
      <div className="forecast-badge"><span className="live-dot" /> NOAA / SPC style editor</div>
    </header>

    {auth && !user && authReady ? <form className="auth-card" onSubmit={login}><h2>Editor access</h2><p>Sign in to publish outlook shapes.</p><input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} /><input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />{authError && <span className="auth-error">{authError}</span>}<button type="submit" className="tool-button active">Sign in</button><Link className="auth-link" href="/register">Create an editor account</Link></form> : null}
    {auth && !user && authReady ? null : <div className="map-shell">
      <aside className="editor-rail">
        {auth && user ? <div className="rail-user"><span className="rail-user-label">Signed in as</span><strong>{user.email}</strong><button type="button" className="rail-signout" onClick={() => void logout()}>Sign out</button></div> : null}
        <div className="rail-heading"><span className="section-kicker">Outlook period</span><strong>Valid forecast</strong></div>
        <div className="day-tabs">{([1, 2, 3] as OutlookDay[]).map((day) => <button key={day} type="button" className={selectedDay === day ? "day-tab active" : "day-tab"} onClick={() => { setSelectedDay(day); setDraft([]); }}><span>DAY</span>{day}</button>)}</div>
        <div className="rail-heading category-heading"><span className="section-kicker">Map region</span><strong>Forecast area</strong></div>
        <div className="region-tabs">{(["USA", "Quebec"] as MapRegion[]).map((item) => <button key={item} type="button" className={region === item ? "region-tab active" : "region-tab"} onClick={() => { setRegion(item); setDraft([]); }}>{item}</button>)}</div>
        <div className="rail-heading category-heading"><span className="section-kicker">Outlook type</span><strong>Hazard</strong></div>
        <div className="hazard-tabs">{hazards.map((item) => <button key={item.value} type="button" className={hazard === item.value ? "hazard-tab active" : "hazard-tab"} onClick={() => { setHazard(item.value); setDraft([]); }}><span>{item.short}</span>{item.value === "Severe Thunderstorms" ? "Severe" : item.value}</button>)}</div>
        <div className="rail-heading category-heading"><span className="section-kicker">Risk category</span><strong>Convective probability</strong></div>
        <div className="category-list">{(Object.keys(riskMeta) as RiskCategory[]).map((item) => <button key={item} type="button" className={category === item ? "category-button active" : "category-button"} style={{ "--category-color": riskMeta[item].color, "--category-ink": riskMeta[item].ink } as React.CSSProperties} onClick={() => setCategory(item)}><span className="category-swatch" />{item}<small>{riskMeta[item].short}</small></button>)}</div>
        <div className="rail-actions"><button type="button" className={drawing ? "tool-button active" : "tool-button"} onClick={() => { setDrawing(!drawing); setDraft([]); }}>{drawing ? "Stop drawing" : "Draw polygon"}</button><button type="button" className="tool-button quiet" onClick={() => setDraft([])}>Clear draft</button></div>
        <div className="rail-status"><span className="status-mark" />{dataError || (drawing ? "Click map to add vertices" : "Ready for edits")}<strong>{summary} · {hazard}</strong></div>
      </aside>
      <div className="maplibre-map">
        <PoliticalMap
          key={`${region}-${countryData ? "ready" : "loading"}-${stateData ? "ready" : "loading"}-${quebecData ? "ready" : "loading"}`}
          region={region}
          selectedDay={selectedDay}
          countryData={countryData}
          stateData={stateData}
          quebecData={quebecData}
          savedPolygonData={savedPolygonData}
          draft={draft}
          category={category}
          onMapClick={(point) => { if (drawing) setDraft([...draft, point]); }}
        />
      </div>
      {draft.length > 2 && <button className="floating-save" type="button" onClick={() => void saveShape({ day: selectedDay, hazard, category, points: draft })}>Save Polygon</button>}
      {loading ? <div className="map-data-status">Loading saved outlooks...</div> : null}
      <div className="map-stamp"><span>SPC DRAWING DESK</span><strong>DAY {selectedDay} / {hazard.toUpperCase()}</strong></div>
    </div>}
  </main>;
}
