"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LatLngExpression } from "leaflet";
import { MapContainer, Polygon, TileLayer, useMapEvents } from "react-leaflet";
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

function DrawLayer({ hazard, category, drawing, draft, setDraft, onSave, canEdit, day }: {
  hazard: Hazard; category: RiskCategory; drawing: boolean; draft: [number, number][]; setDraft: (points: [number, number][]) => void;
  onSave: (shape: OutlookShape) => Promise<void>; canEdit: boolean; day: OutlookDay;
}) {
  useMapEvents({ click(event) {
    if (canEdit && drawing) setDraft([...draft, [event.latlng.lat, event.latlng.lng]]);
  } });

  return <>
    {draft.length > 1 && <Polygon positions={draft as LatLngExpression[]} pathOptions={{ color: riskMeta[category].ink, fillColor: riskMeta[category].color, fillOpacity: 0.52, weight: 2, dashArray: "6 5" }} />}
    {draft.length > 2 && <button className="floating-save" type="button" onClick={() => void onSave({ day, hazard, category, points: draft })}>Save Polygon</button>}
  </>;
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
      <MapContainer center={[38.5, -96]} zoom={4} minZoom={3} maxZoom={8} scrollWheelZoom className="leaflet-map" attributionControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {shapes.filter((shape) => shape.day === selectedDay && shape.hazard === hazard && shape.points.length > 2).map((shape) => <Polygon key={shape.id ?? shape.points.length} positions={shape.points as LatLngExpression[]} pathOptions={{ color: riskMeta[shape.category].ink, fillColor: riskMeta[shape.category].color, fillOpacity: 0.5, weight: 2 }} />)}
        <DrawLayer hazard={hazard} category={category} drawing={drawing} draft={draft} setDraft={setDraft} onSave={saveShape} canEdit={canEdit} day={selectedDay} />
      </MapContainer>
      {loading ? <div className="map-data-status">Loading saved outlooks...</div> : null}
      <div className="map-stamp"><span>SPC DRAWING DESK</span><strong>DAY {selectedDay} / {hazard.toUpperCase()}</strong></div>
    </div>}
  </main>;
}
