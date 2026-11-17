-- Judge scores, memos and peer comparisons are private working data (NH-124). Turn on row level
-- security with no policies, so the public anon and authenticated roles can read and write
-- nothing through the Data API. The service role used by scripts/judge-ingest.mjs and
-- scripts/picks-export.mjs bypasses RLS and keeps working.
ALTER TABLE public.project_evaluations ENABLE ROW LEVEL SECURITY;

-- match_projects runs as its caller (SECURITY INVOKER), so it is covered too; drop the public grant
-- anyway so the function is not callable by anon even if a policy is added later.
REVOKE EXECUTE ON FUNCTION public.match_projects(vector, INT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
