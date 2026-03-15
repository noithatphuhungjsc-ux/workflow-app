/* ================================================================
   useOffline — Connectivity detection + mutation queue
   Queues failed API mutations when offline, replays when back online
   ================================================================ */
import { useState, useEffect, useCallback, useRef } from "react";

const QUEUE_KEY = "wf_offline_queue";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(() => loadQueue().length);
  const [syncing, setSyncing] = useState(false);
  const replayingRef = useRef(false);

  // Listen for online/offline events
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Enqueue a failed mutation
  const enqueue = useCallback((mutation) => {
    // mutation: { url, method, body, timestamp }
    const q = loadQueue();
    q.push({ ...mutation, timestamp: Date.now(), id: Date.now() + Math.random() });
    saveQueue(q);
    setQueueSize(q.length);
  }, []);

  // Replay queued mutations
  const replay = useCallback(async () => {
    if (replayingRef.current) return;
    const q = loadQueue();
    if (q.length === 0) return;

    replayingRef.current = true;
    setSyncing(true);
    const failed = [];

    for (const mutation of q) {
      try {
        const res = await fetch(mutation.url, {
          method: mutation.method || "POST",
          headers: mutation.headers || { "Content-Type": "application/json" },
          body: mutation.body ? (typeof mutation.body === "string" ? mutation.body : JSON.stringify(mutation.body)) : undefined,
        });
        if (!res.ok && res.status >= 500) {
          failed.push(mutation); // server error — retry later
        }
        // 4xx errors are dropped (won't succeed on retry)
      } catch {
        failed.push(mutation); // network error — retry later
      }
    }

    saveQueue(failed);
    setQueueSize(failed.length);
    setSyncing(false);
    replayingRef.current = false;
  }, []);

  // Auto-replay when coming back online
  useEffect(() => {
    if (isOnline) replay();
  }, [isOnline, replay]);

  // Wrapper for fetch that auto-queues on failure
  const offlineFetch = useCallback(async (url, options = {}) => {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      // Network error — queue if it's a mutation (POST/PUT/PATCH/DELETE)
      const method = (options.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        enqueue({
          url,
          method,
          headers: options.headers,
          body: options.body,
        });
      }
      throw err;
    }
  }, [enqueue]);

  const clearQueue = useCallback(() => {
    saveQueue([]);
    setQueueSize(0);
  }, []);

  return { isOnline, queueSize, syncing, enqueue, replay, offlineFetch, clearQueue };
}
