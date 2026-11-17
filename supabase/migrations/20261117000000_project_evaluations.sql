-- Enable pgvector extension for semantic similarity & clustering
CREATE EXTENSION IF NOT EXISTS vector;

-- Structured AI Judge scorecards + embeddings for NEAR Hackathon projects
CREATE TABLE IF NOT EXISTS public.project_evaluations (
  project_id                  TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  submitted_track             TEXT,
  best_fit_track              TEXT,

  -- Fast filter columns (mirrors screening_gate & stack_and_primitives)
  gate_pass                   BOOLEAN NOT NULL DEFAULT false,
  primitive_integration_depth TEXT,
  near_primitives             TEXT[] NOT NULL DEFAULT '{}',
  tech_stack                  TEXT[] NOT NULL DEFAULT '{}',
  similarity_cluster          TEXT,

  -- Pre-computed weighted score (0.00 - 5.00) for fast ranking
  weighted_score              NUMERIC(3, 2),

  -- Full JSON scorecard from the Reader agent
  scorecard                   JSONB NOT NULL,

  -- Vector embedding of `embedding_text` (1536 dims; adjust if using another model)
  embedding                   vector(1536),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for track ranking, primitive filtering, and cosine similarity search
CREATE INDEX IF NOT EXISTS idx_proj_track_score
  ON public.project_evaluations (best_fit_track, gate_pass, weighted_score DESC);

CREATE INDEX IF NOT EXISTS idx_proj_primitives_gin
  ON public.project_evaluations USING GIN (near_primitives);

CREATE INDEX IF NOT EXISTS idx_proj_stack_gin
  ON public.project_evaluations USING GIN (tech_stack);

CREATE INDEX IF NOT EXISTS idx_proj_embedding_hnsw
  ON public.project_evaluations USING hnsw (embedding vector_cosine_ops);

-- Helper RPC for semantic similarity search from Supabase client / API routes
CREATE OR REPLACE FUNCTION public.match_projects(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  filter_track TEXT DEFAULT NULL,
  require_gate_pass BOOLEAN DEFAULT true
)
RETURNS TABLE (
  project_id TEXT,
  name TEXT,
  best_fit_track TEXT,
  weighted_score NUMERIC,
  one_line_thesis TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.project_id,
    p.name,
    p.best_fit_track,
    p.weighted_score,
    p.scorecard->'judge_notes'->>'one_line_thesis' AS one_line_thesis,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.project_evaluations p
  WHERE (NOT require_gate_pass OR p.gate_pass = true)
    AND (filter_track IS NULL OR p.best_fit_track = filter_track)
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;
