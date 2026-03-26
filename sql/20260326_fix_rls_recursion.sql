-- ============================================================
-- FIX: RLS infinite recursion on conversation_members
-- Problem: conv_members_select policy references conversation_members
--          itself, causing infinite loop → 500 errors
-- Solution: SECURITY DEFINER function bypasses RLS for inner check
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Create helper function (SECURITY DEFINER = bypasses RLS)
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id AND user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION is_director(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = uid AND role = 'director'
  );
$$;

-- ============================================================
-- 2. DROP all broken policies
-- ============================================================
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;
DROP POLICY IF EXISTS "conversations_delete" ON conversations;
DROP POLICY IF EXISTS "conversations_service" ON conversations;

DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;
DROP POLICY IF EXISTS "messages_service" ON messages;

DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_update" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_delete" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_service" ON conversation_members;

-- ============================================================
-- 3. CONVERSATIONS — fixed policies (no recursion)
-- ============================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated
  USING (is_conversation_member(id, auth.uid()) OR is_director(auth.uid()));

CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_director(auth.uid()));

CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_director(auth.uid()));

CREATE POLICY "conversations_service" ON conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 4. MESSAGES — fixed policies
-- ============================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
  USING (is_conversation_member(conversation_id, auth.uid()) OR is_director(auth.uid()));

CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_member(conversation_id, auth.uid())
  );

CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_director(auth.uid()));

CREATE POLICY "messages_service" ON messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 5. CONVERSATION_MEMBERS — fixed policies
-- ============================================================
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

-- SELECT: use SECURITY DEFINER function (no self-reference!)
CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT TO authenticated
  USING (is_conversation_member(conversation_id, auth.uid()) OR is_director(auth.uid()));

-- INSERT: conversation creator, director, or self-join
CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    OR is_director(auth.uid())
    OR user_id = auth.uid()
  );

-- UPDATE: own row or director
CREATE POLICY "conv_members_update" ON conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_director(auth.uid()));

-- DELETE: self-leave, conversation creator kick, or director
CREATE POLICY "conv_members_delete" ON conversation_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    OR is_director(auth.uid())
  );

CREATE POLICY "conv_members_service" ON conversation_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Done! No more recursion — all queries use SECURITY DEFINER functions
-- ============================================================
