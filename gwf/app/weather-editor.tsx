"use client";

import { useEffect, useMemo, useState } from "react";
import type { LatLngExpression } from "leaflet";
import { MapContainer, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type LineRisk = "Marginal" | "Slight" | "Enhanced" | "Moderate" | "High" | "Extreme";

type ForecastLine = {
  id?: string;
  kind: LineRisk;
  name: string;
  points: [number, number][];
  createdAt?: any;
  updatedAt?: any;
};

const riskColors: Record<LineRisk, string> = {
  Marginal: "#8ecf9a",
  Slight: "#f5d76e",
  Enhanced: "#f9a65a",
  Moderate: "#ea5a5a",
  High: "#b53a7a",
  Extreme: "#6b3d9f",
};

const canadaCenter: [number, number] = [56.13, -106.35];

const starterLine: ForecastLine = {
  kind: "Slight",
  name: "Demo Line",
  points: [
    [49.5, -123.1],
    [52.5, -116.7],
    [55.8, -109.6],
    [58.1, -101.8],
  ],
};

function MapDrawLayer({
  selectedKind,
  onSave,
  isDrawing,
  draft,
  setDraft,
  canEdit,
}: {
  selectedKind: LineRisk;
  onSave: (line: ForecastLine) => Promise<void>;
  isDrawing: boolean;
  draft: [number, number][];
  setDraft: (points: [number, number][]) => void;
  canEdit: boolean;
}) {
  useMapEvents({
    click(event) {
      if (!canEdit || !isDrawing) return;
      const point: [number, number] = [event.latlng.lat, event.latlng.lng];
      const next = [...draft, point];
      setDraft(next);
    },
  });

  return (
    <>
      {draft.length > 1 && (
        <Polyline
          positions={draft as LatLngExpression[]}
          pathOptions={{ color: riskColors[selectedKind], weight: 4, opacity: 0.95 }}
        />
      )}

      {draft.length > 1 && (
        <button
          className="floating-save"
          type="button"
          onClick={() => {
            if (draft.length < 2) return;
            void onSave({
              kind: selectedKind,
              name: `${selectedKind} Line`,
              points: draft,
            });
          }}
        >
          Save Line
        </button>
      )}
    </>
  );
}

export default function WeatherEditor() {
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [selectedKind, setSelectedKind] = useState<LineRisk>("Slight");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadLines = async () => {
      if (!db) {
        setLines([starterLine]);
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, "forecast-lines"), orderBy("createdAt", "asc"));
        const snapshot = await getDocs(q);
        const results = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ForecastLine) }));
        setLines(results.length ? results : [starterLine]);
      } catch (error) {
        console.error("Could not load forecast lines:", error);
        setLines([starterLine]);
      } finally {
        setLoading(false);
      }
    };

    loadLines();
  }, []);

  const canEdit = !auth || Boolean(user);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) return;

    try {
      setAuthError("");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setAuthError(message);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  const handleSaveLine = async (line: ForecastLine) => {
    const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clean = { ...line, points: line.points };

    if (!canEdit) return;

    setLines((prev) => [...prev, { ...clean, id: localId }]);
    setDraft([]);
    setIsDrawing(false);

    if (!db) return;

    try {
      const ref = await addDoc(collection(db, "forecast-lines"), {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setLines((prev) => prev.map((item) => (item.id === localId ? { ...clean, id: ref.id } : item)));
    } catch (error) {
      console.error("Could not save to Firestore:", error);
    }
  };

  const summary = useMemo(
    () => `${lines.length} forecast line${lines.length > 1 ? "s" : ""} in view`,
    [lines.length],
  );

  return (
    <main className="page-shell">
      {auth && !user && authReady ? (
        <form className="auth-card" onSubmit={handleLogin}>
          <h2>Editor access</h2>
          <p>Sign in to edit the forecast map.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {authError ? <span className="auth-error">{authError}</span> : null}
          <button type="submit" className="tool-button active">
            Sign in
          </button>
        </form>
      ) : null}

      {auth && user ? (
        <div className="map-user-badge">
          <span>{user.email}</span>
          <button type="button" className="tool-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      ) : null}

      {auth && !user && authReady ? null : (
        <div className="map-shell">
          <div className="action-bar">
            <button
              type="button"
              className={isDrawing ? "tool-button active" : "tool-button"}
              onClick={() => {
                if (!canEdit) return;
                setIsDrawing((value) => !value);
                setDraft([]);
              }}
            >
              {isDrawing ? "Stop Drawing" : "Start Drawing"}
            </button>
            <button type="button" className="tool-button" onClick={() => setDraft([])}>
              Clear Draft
            </button>
            <div className="toolbar">
              {(Object.keys(riskColors) as LineRisk[]).map((risk) => (
                <button
                  key={risk}
                  type="button"
                  className={selectedKind === risk ? "tool-button active" : "tool-button"}
                  style={{ borderColor: riskColors[risk] }}
                  onClick={() => setSelectedKind(risk)}
                >
                  {risk}
                </button>
              ))}
            </div>
            <span className="toolbar-status">{summary}</span>
          </div>

          {loading ? (
            <div className="map-loading">Loading editor…</div>
          ) : (
            <>
              <MapContainer
                center={canadaCenter}
                zoom={4}
                minZoom={3}
                maxZoom={8}
                scrollWheelZoom
                className="leaflet-map"
                attributionControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
                  attribution=""
                />

                {lines.map((line) => (
                  <Polyline
                    key={line.id ?? `${line.name}-${line.points.length}`}
                    positions={line.points as LatLngExpression[]}
                    pathOptions={{
                      color: riskColors[line.kind],
                      weight: line.kind === "Extreme" ? 6 : 4,
                      opacity: 0.95,
                    }}
                  />
                ))}

                <MapDrawLayer
                  selectedKind={selectedKind}
                  onSave={handleSaveLine}
                  isDrawing={isDrawing}
                  draft={draft}
                  setDraft={setDraft}
                  canEdit={canEdit}
                />
              </MapContainer>

              <div className="risk-legend" aria-label="Forecast line legend">
                {(Object.keys(riskColors) as LineRisk[]).map((risk) => (
                  <div key={risk} className="risk-legend-item">
                    <span className="swatch" style={{ background: riskColors[risk] }} />
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
