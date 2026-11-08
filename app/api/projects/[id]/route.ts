import type { NextRequest } from 'next/server';
import { getVoters } from '@/lib/votes';
import { CACHE, toProject } from '@/lib/api.mjs';
import { handle, json, preflight, requireProject } from '../../_lib/respond';

/** `GET /api/projects/{id}` (NH-60): one project (no envelope), 404 when there is no live record. */
export const dynamic = 'force-dynamic';

export function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const project = await requireProject(id);
    const voters = await getVoters(project.submission_id);
    return json(toProject(project, voters.available ? voters.count : null), CACHE.projects);
  });
}

export const OPTIONS = preflight;
