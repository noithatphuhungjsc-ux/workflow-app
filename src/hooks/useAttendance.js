/* ================================================================
   useAttendance — Main hook for attendance state & actions
   Manages records, sites, summary, offline queue, realtime
   ================================================================ */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import * as svc from "../services/attendanceService";

const todayStr = () => new Date().toISOString().split("T")[0];

export default function useAttendance(userId, role) {
  const [records, setRecords] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [sites, setSites] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const mountedRef = useRef(true);

  const isDirector = role === "director";

  // ── Load today's records ──
  const loadToday = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await svc.getTodayRecords(userId);
      if (mountedRef.current) setTodayRecords(res.data || []);
    } catch (e) {
      console.warn("[ATT] Load today error:", e.message);
    }
  }, [userId]);

  // ── Load sites ──
  const loadSites = useCallback(async () => {
    try {
      const res = await svc.getSites();
      if (mountedRef.current) setSites(res.data || []);
    } catch (e) {
      console.warn("[ATT] Load sites error:", e.message);
    }
  }, []);

  // ── Load monthly summary ──
  const loadMonthlySummary = useCallback(async (year, month) => {
    if (!userId) return;
    try {
      const res = await svc.getMonthlySummary(userId, year, month);
      if (mountedRef.current) setMonthlySummary(res.data || []);
    } catch (e) {
      console.warn("[ATT] Load monthly error:", e.message);
    }
  }, [userId]);

  // ── Load requests (director) ──
  const loadRequests = useCallback(async (status = "pending") => {
    try {
      const res = await svc.getRequests(isDirector ? null : userId, status);
      if (mountedRef.current) setRequests(res.data || []);
    } catch (e) {
      console.warn("[ATT] Load requests error:", e.message);
    }
  }, [userId, isDirector]);

  // ── Initial load ──
  useEffect(() => {
    mountedRef.current = true;
    const init = async () => {
      setLoading(true);
      await Promise.all([loadToday(), loadSites()]);
      const now = new Date();
      await loadMonthlySummary(now.getFullYear(), now.getMonth() + 1);
      if (mountedRef.current) setLoading(false);
    };
    init();
    return () => { mountedRef.current = false; };
  }, [userId, loadToday, loadSites, loadMonthlySummary]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel("attendance-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, (payload) => {
        loadToday();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadToday]);

  // ── Online listener: sync offline queue ──
  useEffect(() => {
    const handleOnline = async () => {
      const queue = svc.getOfflineQueue();
      if (queue.length) {
        const result = await svc.syncOfflineQueue();
        if (result.synced > 0) loadToday();
      }
    };
    window.addEventListener("online", handleOnline);
    // Also try on mount
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, [loadToday]);

  // ── Derived state ──
  const todayCheckIn = todayRecords.find((r) => r.type === "check_in");
  const todayCheckOut = todayRecords.find((r) => r.type === "check_out");
  const hasCheckedIn = !!todayCheckIn;
  const hasCheckedOut = !!todayCheckOut;

  // ── Check-in action ──
  const doCheckIn = useCallback(
    async ({ lat, lng, accuracy, siteId, selfieUrl, qrToken, verificationMethod } = {}) => {
      if (checkingIn) return;
      setCheckingIn(true);
      setError(null);
      try {
        if (!navigator.onLine) {
          svc.addToOfflineQueue({
            userId,
            type: "check_in",
            lat, lng, accuracy, siteId, selfieUrl, qrToken,
            verificationMethod: verificationMethod || "offline",
            date: todayStr(),
          });
          setTodayRecords((prev) => [
            ...prev,
            { type: "check_in", timestamp: new Date().toISOString(), offline_queued: true },
          ]);
          return { ok: true, offline: true };
        }
        const result = await svc.checkIn({ userId, lat, lng, accuracy, siteId, selfieUrl, qrToken, verificationMethod });
        await loadToday();
        return result;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setCheckingIn(false);
      }
    },
    [userId, checkingIn, loadToday]
  );

  // ── Check-out action ──
  const doCheckOut = useCallback(
    async ({ lat, lng, accuracy, siteId, selfieUrl, qrToken, verificationMethod } = {}) => {
      if (checkingIn) return;
      setCheckingIn(true);
      setError(null);
      try {
        if (!navigator.onLine) {
          svc.addToOfflineQueue({
            userId,
            type: "check_out",
            lat, lng, accuracy, siteId, selfieUrl, qrToken,
            verificationMethod: verificationMethod || "offline",
            date: todayStr(),
          });
          setTodayRecords((prev) => [
            ...prev,
            { type: "check_out", timestamp: new Date().toISOString(), offline_queued: true },
          ]);
          return { ok: true, offline: true };
        }
        const result = await svc.checkOut({ userId, lat, lng, accuracy, siteId, selfieUrl, qrToken, verificationMethod });
        await loadToday();
        const now = new Date();
        await loadMonthlySummary(now.getFullYear(), now.getMonth() + 1);
        return result;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setCheckingIn(false);
      }
    },
    [userId, checkingIn, loadToday, loadMonthlySummary]
  );

  // ── Site management (director) ──
  const addSite = useCallback(async (site) => {
    const res = await svc.createSite(site);
    await loadSites();
    return res;
  }, [loadSites]);

  const editSite = useCallback(async (id, updates) => {
    const res = await svc.updateSite(id, updates);
    await loadSites();
    return res;
  }, [loadSites]);

  const removeSite = useCallback(async (id) => {
    const res = await svc.deleteSite(id);
    await loadSites();
    return res;
  }, [loadSites]);

  // ── Request management ──
  const submitRequest = useCallback(async (req) => {
    const res = await svc.createRequest({ ...req, userId });
    await loadRequests();
    return res;
  }, [userId, loadRequests]);

  const handleReview = useCallback(async (id, status) => {
    const res = await svc.reviewRequest(id, status, userId);
    await loadRequests();
    return res;
  }, [userId, loadRequests]);

  return {
    // State
    todayRecords,
    todayCheckIn,
    todayCheckOut,
    hasCheckedIn,
    hasCheckedOut,
    sites,
    monthlySummary,
    requests,
    loading,
    error,
    checkingIn,
    // Actions
    doCheckIn,
    doCheckOut,
    loadToday,
    loadSites,
    loadMonthlySummary,
    loadRequests,
    addSite,
    editSite,
    removeSite,
    submitRequest,
    handleReview,
    // Director
    isDirector,
    getAllEmployeeSummary: svc.getAllEmployeeSummary,
    getMonthlyReport: svc.getMonthlyReport,
  };
}
