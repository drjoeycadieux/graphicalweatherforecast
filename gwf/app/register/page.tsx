"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";

export default function RegisterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) {
      setError("Firebase is not configured. Add the Firebase environment values first.");
      return;
    }
    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setError("");
      await createUserWithEmailAndPassword(auth, email, password);
      setCreated(true);
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : "Unable to create the account.");
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-brand"><span className="brand-mark">N</span><span>North American Desk</span></div>
      {authReady && user && !created ? (
        <section className="auth-card auth-card-centered"><span className="section-kicker">Already signed in</span><h1>Editor account active</h1><p>You are signed in as {user.email}.</p><Link className="tool-button active auth-button-link" href="/">Open drawing desk</Link></section>
      ) : created ? (
        <section className="auth-card auth-card-centered"><span className="section-kicker">Registration complete</span><h1>Account ready</h1><p>Your Firebase editor account has been created successfully.</p><Link className="tool-button active auth-button-link" href="/">Continue to drawing desk</Link></section>
      ) : (
        <form className="auth-card auth-card-centered" onSubmit={register}>
          <span className="section-kicker">Editor registration</span>
          <h1>Create your account</h1>
          <p>Register with Firebase to publish Canada and USA outlook areas.</p>
          <label htmlFor="register-email">Email address</label>
          <input id="register-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="register-password">Password</label>
          <input id="register-password" type="password" autoComplete="new-password" required minLength={6} placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="register-confirmation">Confirm password</label>
          <input id="register-confirmation" type="password" autoComplete="new-password" required minLength={6} placeholder="Enter password again" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          {error ? <span className="auth-error">{error}</span> : null}
          <button type="submit" className="tool-button active">Create account</button>
          <Link className="auth-link" href="/">Already have an account? Sign in</Link>
        </form>
      )}
    </main>
  );
}
