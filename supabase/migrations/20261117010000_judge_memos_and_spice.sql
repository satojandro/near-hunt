-- Add full human-grade Judge Memo, peer comparison, and founder "spice" columns
ALTER TABLE public.project_evaluations
  ADD COLUMN IF NOT EXISTS judge_memo TEXT,
  ADD COLUMN IF NOT EXISTS peer_comparison TEXT,
  ADD COLUMN IF NOT EXISTS human_spice TEXT,
  ADD COLUMN IF NOT EXISTS human_score_override NUMERIC(3, 2);
