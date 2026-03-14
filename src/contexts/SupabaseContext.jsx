import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const SupabaseCtx = createContext(null);

export function SupabaseProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const init = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (s) fetchProfile(s.user.id);
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) fetchProfile(s.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (uid) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (data) {
      setProfile(data);
      return;
    }

    // Auto-create profile if not exists
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
      const { data: created } = await supabase.from("profiles").upsert({
        id: uid, display_name: name,
      }, { onConflict: "id" }).select().single();
      if (created) setProfile(created);
    }
  };

  // Sign up (email + password)
  const signUp = useCallback(async (email, password, displayName) => {
    if (!supabase) return { error: "Supabase chưa được cấu hình" };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      try {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: displayName || email.split("@")[0],
        }, { onConflict: "id" });
      } catch {}
      await fetchProfile(data.user.id);
    }
    return { data };
  }, []);

  // Sign in (email + password)
  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: "Supabase chưa được cấu hình" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { data };
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    setProfile(null);
  }, []);

  const value = {
    supabase, session, profile, loading,
    signUp, signIn, signOut,
    isConnected: !!session,
  };

  return <SupabaseCtx.Provider value={value}>{children}</SupabaseCtx.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseCtx);
  if (!ctx) throw new Error("useSupabase must be inside SupabaseProvider");
  return ctx;
}
