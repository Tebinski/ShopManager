import { useState, useEffect, useRef } from "react";
import { STORAGE_KEY, SHARED } from "../constants/index.js";

export function useStorage() {
  const [loaded,      setLoaded]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState("saved");
  const [initialData, setInitialData] = useState(null);
  const storageOk = useRef(false); // false | "artifacts" | "local"
  const saveTimer = useRef(null);

  useEffect(() => {
    async function load() {
      try { if (window.storage && typeof window.storage.get === "function") storageOk.current = "artifacts"; } catch (_) {}

      if (storageOk.current === "artifacts") {
        try {
          const r = await window.storage.get(STORAGE_KEY, SHARED);
          if (r?.value) setInitialData(JSON.parse(r.value));
        } catch (_) {}
        setLoaded(true);
        return;
      }

      // localStorage fallback
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setInitialData(JSON.parse(saved));
        storageOk.current = "local";
      } catch (_) {}
      setLoaded(true);
    }
    load();
  }, []);

  function persist(data) {
    if (!storageOk.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        if (storageOk.current === "artifacts") {
          await window.storage.set(STORAGE_KEY, JSON.stringify(data), SHARED);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        setSaveStatus("saved");
      } catch (_) {
        setSaveStatus("nostorage");
      }
    }, 700);
  }

  return { loaded, saveStatus, persist, initialData };
}
