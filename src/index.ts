import { parseHTML } from 'linkedom';

const NYAA_BASE = 'https://nyaa.si';

// Parse episode number robustly
function extractEpisode(title: string): number | null {
  const patterns = [
    /S\d{1,2}E(\d{1,4})/i,         // S01E08
    /\bE(\d{1,4})\b/i,             // E08 (with word boundaries)
    /-\s*(\d{1,4})\s*[\[(]/,      // - 08 [ or - 08 (
    /episode\s*(\d{1,4})/i,       // episode 8
    /(\d{1,4})\s*$/i,             // trailing number (last resort)
  ];

  for (const regex of patterns) {
    const match = title.match(regex);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 200) return num;
    }
  }
  return null;
}

// Extract resolution
function extractResolution(title: string): string {
  const resMatch = title.match(/(480|720|1080|2160|4K)p/i);
  if (!resMatch) return 'unknown';
  return resMatch[1] === '4K' ? '2160p' : resMatch[1] + 'p';
}

// Extract release group (e.g., [SubsPlease])
function extractGroup(title: string): string {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1] : 'Unknown';
}

// Only include English-translated anime (icon = 1_2.png)
function isEnglishAnime(row: any): boolean {
  const img = row.querySelector('td img');
  return img?.getAttribute('src')?.includes('/1_2.png') ?? false;
}

export const search = async (
  query: string,
  filters?: { resolution?: string }
) => {
  const url = `${NYAA_BASE}/?f=0&c=1_2&q=${encodeURIComponent(query)}&s=seeders&o=desc`;
  const res = await fetch(url);
  const html = await res.text();
  const { document } = parseHTML(html);

  const results: any[] = [];

  for (const row of Array.from(document.querySelectorAll('tbody tr'))) {
    if (!isEnglishAnime(row)) continue;

    const titleEl = row.querySelector('td[colspan="2"] a:not([class])');
    const title = titleEl?.textContent?.trim();
    if (!title) continue;

    const magnetEl = row.querySelector('a[href^="magnet"]');
    const magnet = magnetEl?.getAttribute('href');
    if (!magnet) continue;

    // Parse rich metadata
    const episode = extractEpisode(title);
    const resolution = extractResolution(title);
    const group = extractGroup(title);

    if (filters?.resolution && resolution !== filters.resolution) continue;

    const tds = row.querySelectorAll('td');
    const size = tds[3]?.textContent?.trim() || '';
    const seeders = parseInt(tds[5]?.textContent?.trim() || '0', 10);
    const leechers = parseInt(tds[6]?.textContent?.trim() || '0', 10);

    const id = magnet
      .split('&')[0]
      .replace('magnet:?xt=urn:btih:', '')
      .toLowerCase();

    results.push({
      id,
      title,
      episode,
      resolution,
      group,
      size,
      seeders,
      leechers,
      magnet,
      type: 'anime',
    });
  }

  // Sort: seeders (desc) → resolution (1080p > 720p > 480p)
  const resPriority: Record<string, number> = { '1080p': 3, '720p': 2, '480p': 1, 'unknown': 0 };
  results.sort((a, b) => {
    if (a.seeders !== b.seeders) return b.seeders - a.seeders;
    return (resPriority[b.resolution] || 0) - (resPriority[a.resolution] || 0);
  });

  return results;
};

export const stream = async (id: string) => {
  return {
    sources: [
      {
        type: 'magnet',
        url: `magnet:?xt=urn:btih:${id}`,
      },
    ],
  };
};
