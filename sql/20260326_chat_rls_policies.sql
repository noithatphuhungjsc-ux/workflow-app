-- ============================================================
-- MIGRATION: Chat RLS Policies
-- Add Row Level Security to conversations, messages, conversation_members
-- Run in Supabase Dashboard > SQL Editor
-- SAFE TO RE-RUN: drops existing policies before recreating
-- ============================================================

-- ============================================================
-- 1. CONVERSATIONS — RLS
-- ============================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;
DROP POLICY IF EXISTS "conversations_delete" ON conversations;
DROP POLICY IF EXISTS "conversations_service" ON conversations;

-- SELECT: only members can see conversations they belong to
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
    )
    -- Director can see all conversations
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- INSERT: any authenticated user can create a conversation
-- (group creation restricted client-side to director only)
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: creator or director only
CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- DELETE: creator or director only
CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- Service role bypass
CREATE POLICY "conversations_service" ON conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. MESSAGES — RLS
-- ============================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;
DROP POLICY IF EXISTS "messages_service" ON messages;

-- SELECT: only conversation members can read messages
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- INSERT: only conversation members can send messages
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- UPDATE: sender only (edit own message)
CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid());

-- DELETE: sender or director
CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- Service role bypass
CREATE POLICY "messages_service" ON messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. CONVERSATION_MEMBERS — RLS
-- ============================================================
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_delete" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_service" ON conversation_members;

-- SELECT: members can see who else is in their conversations
CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm2
      WHERE cm2.conversation_id = conversation_members.conversation_id
        AND cm2.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- INSERT: conversation creator or director can add members
-- Also allow self-insert for DM creation (where user is creating the conversation)
CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    -- Creator of the conversation can add members
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_members.conversation_id
        AND c.created_by = auth.uid()
    )
    -- Director can add members to any conversation
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
    -- User adding themselves (for DM acceptance, dept chat join)
    OR conversation_members.user_id = auth.uid()
  );

-- UPDATE: member can update own row (last_read_at), director can update any
CREATE POLICY "conv_members_update" ON conversation_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

DROP POLICY IF EXISTS "conv_members_update" ON conversation_members;
CREATE POLICY "conv_members_update" ON conversation_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- DELETE: self-remove (leave) or conversation creator/director (kick)
CREATE POLICY "conv_members_delete" ON conversation_members FOR DELETE TO authenticated
  USING (
    -- Leave: remove own membership
    user_id = auth.uid()
    -- Kick: conversation creator
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_members.conversation_id
        AND c.created_by = auth.uid()
    )
    -- Director can remove anyone
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director')
  );

-- Service role bypass
CREATE POLICY "conv_members_service" ON conversation_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Done! RLS is now active on all chat tables.
-- ============================================================
