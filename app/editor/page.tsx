"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";
import WeatherEditor from "../weather-editor";

export default function ProtectedEditorPage() {
  const router = useRouter();

  useEffect(() => {
    if (!auth) {
      router.replace("/public");
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.replace("/public");
      }
    });

    return () => unsubscribe();
  }, [router]);

  return <WeatherEditor mode="editor" />;
}
