"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { type User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type OutlookDay = 1 | 2 | 3;
type Hazard = "Severe Thunderstorms" | "Tornado" | "Wind" | "Hail";
type RiskCategory = "General Thunder" | "Marginal" | "Slight" | "Enhanced" | "Moderate" | "High";
type OutlookShape = { id?: string; day: OutlookDay; hazard: Hazard; category: RiskCategory; points: [number, number][]; createdAt?: unknown; updatedAt?: unknown };

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

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

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

const polygonFillLayer = {
  id: "outlook-fill",
  type: "fill" as const,
  paint: { "fill-color": ["get", "fill"] as unknown as string, "fill-opacity": ["get", "opacity"] as unknown as number },
};

const polygonOutlineLayer = {
  id: "outlook-outline",
  type: "line" as const,
  paint: { "line-color": ["get", "outline"] as unknown as string, "line-width": 2 },
};

function DraftPolygon({ draft, category }: { draft: [number, number][]; category: RiskCategory }) {
  if (draft.length < 2) return null;
  const data = polygonCollection([polygonFeature(draft, riskMeta[category].color, riskMeta[category].ink, 0.52)]);
  return <Source id="draft-outlook" type="geojson" data={data}>
    <Layer {...polygonFillLayer} id="draft-fill" />
    <Layer {...polygonOutlineLayer} id="draft-outline" paint={{ "line-color": riskMeta[category].ink, "line-width": 2, "line-dasharray": [3, 3] }} />
  </Source>;
}

export default function WeatherEditor() {
  const [shapes, setShapes] = useState<OutlookShape[]>([]);
  const [selectedDay, setSelectedDay] = useState<OutlookDay>(1);
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

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => { setUser(nextUser); setAuthReady(true); });
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!db) { setDataError("Connect Firebase to load and publish outlooks."); setLoading(false); return; }
      try {
        const snapshot = await getDocs(query(collection(db, "spc-outlooks"), orderBy("createdAt", "asc")));
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
        <div className="rail-heading category-heading"><span className="section-kicker">Outlook type</span><strong>Hazard</strong></div>
        <div className="hazard-tabs">{hazards.map((item) => <button key={item.value} type="button" className={hazard === item.value ? "hazard-tab active" : "hazard-tab"} onClick={() => { setHazard(item.value); setDraft([]); }}><span>{item.short}</span>{item.value === "Severe Thunderstorms" ? "Severe" : item.value}</button>)}</div>
        <div className="rail-heading category-heading"><span className="section-kicker">Risk category</span><strong>Convective probability</strong></div>
        <div className="category-list">{(Object.keys(riskMeta) as RiskCategory[]).map((item) => <button key={item} type="button" className={category === item ? "category-button active" : "category-button"} style={{ "--category-color": riskMeta[item].color, "--category-ink": riskMeta[item].ink } as React.CSSProperties} onClick={() => setCategory(item)}><span className="category-swatch" />{item}<small>{riskMeta[item].short}</small></button>)}</div>
        <div className="rail-actions"><button type="button" className={drawing ? "tool-button active" : "tool-button"} onClick={() => { setDrawing(!drawing); setDraft([]); }}>{drawing ? "Stop drawing" : "Draw polygon"}</button><button type="button" className="tool-button quiet" onClick={() => setDraft([])}>Clear draft</button></div>
        <div className="rail-status"><span className="status-mark" />{dataError || (drawing ? "Click map to add vertices" : "Ready for edits")}<strong>{summary} · {hazard}</strong></div>
      </aside>
      <div className="maplibre-map">
        <Map
          initialViewState={{ longitude: -96, latitude: 38.5, zoom: 4 }}
          minZoom={3}
          maxZoom={8}
          mapStyle={OPENFREEMAP_STYLE}
          onClick={(event: MapLayerMouseEvent) => {
            if (canEdit && drawing) setDraft([...draft, [event.lngLat.lat, event.lngLat.lng]]);
          }}
        >
          <NavigationControl position="top-right" />
          <Source id="saved-outlooks" type="geojson" data={savedPolygonData}>
            <Layer {...polygonFillLayer} />
            <Layer {...polygonOutlineLayer} />
          </Source>
          <DraftPolygon draft={draft} category={category} />
        </Map>
      </div>
      {draft.length > 2 && <button className="floating-save" type="button" onClick={() => void saveShape({ day: selectedDay, hazard, category, points: draft })}>Save Polygon</button>}
      {loading ? <div className="map-data-status">Loading saved outlooks...</div> : null}
      <div className="map-stamp"><span>SPC DRAWING DESK</span><strong>DAY {selectedDay} / {hazard.toUpperCase()}</strong></div>
    </div>}
  </main>;
}
