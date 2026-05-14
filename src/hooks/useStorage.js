import { useState, useEffect, useRef } from "react";
import { STORAGE_KEY, SHARED } from "../constants/index.js";

export function useStorage() {
  const [loaded,      setLoaded]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState("saved");
  const [initialData, setInitialData] = useState(null);
  const storageOk = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    async function load() {
      try { if (window.storage && typeof window.storage.get === "function") storageOk.current = true; } catch (_) {}
      if (!storageOk.current) { setSaveStatus("nostorage"); setLoaded(true); return; }
      try {
        const r = await window.storage.get(STORAGE_KEY, SHARED);
        if (r?.value) setInitialData(JSON.parse(r.value));
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
        await window.storage.set(STORAGE_KEY, JSON.stringify(data), SHARED);
        setSaveStatus("saved");
      } catch (_) {
        setSaveStatus("nostorage");
      }
    }, 700);
  }

  return { loaded, saveStatus, persist, initialData };
}
