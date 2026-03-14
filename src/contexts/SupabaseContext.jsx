import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const SupabaseCtx = createContext(null);

export function SupabaseProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen auth state
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const init = async () => {
      // Handle OAuth hash tokens (implicit flow)
      const hash = window.location.hash.substring(1);
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { data } = await supabase.auth.setSession({ access_token, refresh_token });
          window.history.replaceState({}, "", window.location.pathname);
          if (data?.session) {
            setSession(data.session);
            fetchProfile(data.session.user.id);
            setLoading(false);
            return;
          }
        }
      }

      // Normal session check
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
      // Update email if missing (for existing profiles created before email was saved)
      if (!data.email) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await supabase.from("profiles").update({ email: user.email }).eq("id", uid);
          data.email = user.email;
        }
      }
      setProfile(data);
      return;
    }

    // Auto-create profile for OAuth users (Google, etc.)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
      const { data: newProfile } = await supabase.from("profiles").upsert({
        id: uid,
        display_name: name,
        email: user.email || null,
      }, { onConflict: "id" }).select().single();
      if (newProfile) setProfile(newProfile);
    }
  };

  // Sign up
  const signUp = useCallback(async (email, password, displayName, legacyId) => {
    if (!supabase) return { error: "Supabase chưa được cấu hình" };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const { error: pErr } = await supabase.from("profiles").insert({
        id: data.user.id,
        display_name: displayName || email.split("@")[0],
        legacy_id: legacyId || null,
      });
      if (pErr) return { error: pErr.message };
      await fetchProfile(data.user.id);
    }
    return { data };
  }, []);

  // Sign in
  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: "Supabase chưa được cấu hình" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { data };
  }, []);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: "Supabase chưa được cấu hình" };
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    return { data };
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = {
    supabase,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    isConnected: !!session,
  };

  return <SupabaseCtx.Provider value={value}>{children}</SupabaseCtx.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseCtx);
  if (!ctx) throw new Error("useSupabase must be inside SupabaseProvider");
  return ctx;
}
