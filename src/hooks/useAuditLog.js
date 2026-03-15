/* ================================================================
   useAuditLog — Records user actions for accountability & debugging
   Stores locally + optionally syncs to cloud
   ================================================================ */
import { useCallback, useRef } from "react";
import { loadJSON, saveJSON } from "../services";

const AUDIT_KEY = "audit_log";
const MAX_ENTRIES = 500;

/**
 * Audit log entry shape:
 * { ts, action, actor, target, detail, ip? }
 *
 * Actions: task_create, task_update, task_delete, expense_create, expense_approve,
 *          expense_reject, settings_change, login, logout, role_change, industry_change
 */

export function useAuditLog(userId, displayName) {
  const batchRef = useRef([]);
  const timerRef = useRef(null);

  const flush = useCallback(() => {
    if (batchRef.current.length === 0) return;
    const existing = loadJSON(AUDIT_KEY, []);
    const merged = [...existing, ...batchRef.current].slice(-MAX_ENTRIES);
    saveJSON(AUDIT_KEY, merged);
    batchRef.current = [];
  }, []);

  const log = useCallback((action, target, detail) => {
    const entry = {
      ts: new Date().toISOString(),
      action,
      actor: displayName || userId || "unknown",
      actorId: userId,
      target: target || "",
      detail: detail || "",
    };
    batchRef.current.push(entry);

    // Debounce flush (write every 2s max)
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 2000);
  }, [userId, displayName, flush]);

  const getLog = useCallback((filter) => {
    const all = loadJSON(AUDIT_KEY, []);
    if (!filter) return all;
    return all.filter(e => {
      if (filter.action && e.action !== filter.action) return false;
      if (filter.actor && e.actor !== filter.actor) return false;
      if (filter.since && e.ts < filter.since) return false;
      return true;
    });
  }, []);

  const clearLog = useCallback(() => {
    saveJSON(AUDIT_KEY, []);
    batchRef.current = [];
  }, []);

  return { log, getLog, clearLog };
}
