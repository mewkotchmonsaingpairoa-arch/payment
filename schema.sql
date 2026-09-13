-- ═══════════════════════════════════════════════════════════════
-- PocketBloom — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension (already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TRANSACTIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('income','expense')),
  title       TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category    TEXT        NOT NULL,
  date        DATE        NOT NULL,
  note        TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INSTALLMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.installments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  months       INTEGER     NOT NULL CHECK (months > 0),
  paid_count   INTEGER     NOT NULL DEFAULT 0 CHECK (paid_count >= 0),
  start_month  TEXT        NOT NULL,   -- format: YYYY-MM
  category     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  date        DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_transactions_updated_at') THEN
    CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_installments_updated_at') THEN
    CREATE TRIGGER trg_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_notes_updated_at') THEN
    CREATE TRIGGER trg_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes         ENABLE ROW LEVEL SECURITY;

-- Transactions policies
CREATE POLICY "Users read own transactions"   ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- Installments policies
CREATE POLICY "Users read own installments"   ON public.installments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own installments" ON public.installments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own installments" ON public.installments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own installments" ON public.installments FOR DELETE USING (auth.uid() = user_id);

-- Notes policies
CREATE POLICY "Users read own notes"   ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notes" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notes" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notes" ON public.notes FOR DELETE USING (auth.uid() = user_id);

-- ─── INDEXES ─────────────────────────────────────────────────
-- (user_id, date DESC) รองรับทุก query ตามเดือนด้วย range scan
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_installments_user      ON public.installments(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user             ON public.notes(user_id, created_at DESC);

-- ─── REALTIME ─────────────────────────────────────────────────
-- Enable Realtime for these tables in Supabase Dashboard:
-- Table Editor → <table> → Realtime (toggle ON)
-- Or run:
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.installments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

