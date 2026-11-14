import type { MetadataRoute } from 'next';
import { getProjects } from '@/lib/projects';

const SITE = 'https://nearhunt.xyz';

// Read on request, like every data page: the build fetches nothing from mainnet. The project list
// behind it is cached for 60 s (lib/projects.ts).
export const dynamic = 'force-dynamic';

/**
 * /sitemap.xml (NH-116): the fixed pages and one entry per listed project. Hidden projects are
 * absent because `getProjects()` already drops them. Account pages (/u/…) are left out on
 * purpose: they are views of other people's accounts, not content to advertise.
 *
 * If the indexer cannot be read the sitemap still answers, with the fixed pages only, rather than
 * a 500 a crawler would remember.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE}/open-data`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE}/SKILL.md`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE}/comment-policy`, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${SITE}/support`, changeFrequency: 'monthly', priority: 0.3 },
  ];
  try {
    const { items } = await getProjects();
    return [
      ...fixed,
      ...items.map((p) => {
        const modified = p.updated_at ? new Date(p.updated_at) : null;
        return {
          url: `${SITE}/p/${encodeURIComponent(p.submission_id)}`,
          ...(modified && !Number.isNaN(modified.getTime()) ? { lastModified: modified } : {}),
          changeFrequency: 'daily' as const,
          priority: 0.7,
        };
      }),
    ];
  } catch {
    return fixed;
  }
}
