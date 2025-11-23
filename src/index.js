// src/index.js
import { parseHTML } from 'linkedom';

const NYAA_BASE = 'https://nyaa.si';

function extractEpisode(title) {
  const patterns = [
    /S\d{1,2}E(\d{1,4})/i,
    /-\s*(\d{1,4})\s*[\[(]/,
    /episode\s*(\d{1,4})/i,
    /(\d{1,4})\s+$/i
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

function extractResolution(title) {
  const match = title.match(/(480|720|1080|2160|4K)p/i);
  return match ? (match[1] === '4K' ? '2160p' : match[1] + 'p') : 'unknown';
}

function extractGroup(title) {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1] : 'Unknown';
}

function isEnglishAnime(row) {
  const img = row.querySelector('td img');
  return img?.getAttribute('src')?.includes('/1_2.png') ?? false;
}

export async function search(query, filters = {}) {
  const results = [];
  try {
    const url = `${NYAA_BASE}/?f=0&c=1_2&q=${encodeURIComponent(query)}&s=seeders&o=desc`;
    const res = await fetch(url);
    const html = await res.text();
    const { document } = parseHTML(html);

    const rows = document.querySelectorAll('tbody tr');
    if (!rows) return results;

    for (const row of rows) {
      if (!isEnglishAnime(row)) continue;

      // 🔥 FIX: Nyaa no longer uses colspan="2"
      // Title is in the second <td>
      const titleCell = row.querySelectorAll('td')[1];
      const titleEl = titleCell?.querySelector('a:not([class])');
      const title = titleEl?.textContent?.trim();
      if (!title) continue;

      const magnetEl = row.querySelector('a[href^="magnet"]');
      const magnet = magnetEl?.getAttribute('href');
      if (!magnet) continue;

      const episode = extractEpisode(title);
      const resolution = extractResolution(title);
      const group = extractGroup(title);

      if (filters.resolution && resolution !== filters.resolution) continue;

      const tds = row.querySelectorAll('td');
      const size = tds[3]?.textContent?.trim() || '';
      const seeders = parseInt(tds[5]?.textContent?.trim() || '0', 10);
      const leechers = parseInt(tds[6]?.textContent?.trim() || '0', 10);

      const id = magnet.split('&')[0].replace('magnet:?xt=urn:btih:', '').toLowerCase();

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
        type: 'anime'
      });
    }
  } catch (err) {
    console.error('Nyaa search error:', err);
  }

  const resPriority = { '1080p': 3, '720p': 2, '480p': 1, 'unknown': 0 };
  results.sort((a, b) => {
    if (b.seeders !== a.seeders) return b.seeders - a.seeders;
    return (resPriority[b.resolution] || 0) - (resPriority[a.resolution] || 0);
  });

  return results; // Always an array!
}

export async function stream(id) {
  return {
    sources: [{ type: 'magnet', url: `magnet:?xt=urn:btih:${id}` }]
  };
}
