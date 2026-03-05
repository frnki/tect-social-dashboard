import fs from "node:fs";
import path from "node:path";

export type RedditPost = {
  id?: string;
  title: string;
  url: string;
  ups?: number;
  comments?: number;
  created_utc?: number;
  selftext?: string;
  us_likely?: boolean;
  debate_top3?: string[];
  brand_mentions?: string[];
  subreddit: string;
};

type RedditReport = {
  generated_at?: string;
  subreddits?: Record<string, Omit<RedditPost, "subreddit">[]>;
};

export type EnrichedRow = {
  key: string;
  title_ko?: string;
  body_ko?: string;
  image_url?: string;
  categories?: string[];
  insight_notes?: string[];
  situation_note?: string;
  comment_note?: string;
};

const REPORT_DIR = path.resolve(process.cwd(), "data/reddit");

function listBaseReportFiles(): string[] {
  if (!fs.existsSync(REPORT_DIR)) return [];
  return fs
    .readdirSync(REPORT_DIR)
    .filter((f) => /^reddit_daily_report_.*\.json$/.test(f) && !f.includes("_translated") && !f.includes("_enriched"))
    .sort((a, b) => fs.statSync(path.join(REPORT_DIR, b)).mtimeMs - fs.statSync(path.join(REPORT_DIR, a)).mtimeMs);
}

export function listReportArchives(): Array<{ fileName: string; date: string }> {
  return listBaseReportFiles().slice(0, 3).map((fileName) => {
    const m = fileName.match(/reddit_daily_report_(\d{4}-\d{2}-\d{2})\.json/);
    return { fileName, date: m?.[1] ?? fileName };
  });
}

export function getReport(fileName?: string): { fileName: string; report: RedditReport } | null {
  const files = listBaseReportFiles();
  if (!files.length) return null;
  const target = fileName && files.includes(fileName) ? fileName : files[0];
  const raw = fs.readFileSync(path.join(REPORT_DIR, target), "utf-8");
  return { fileName: target, report: JSON.parse(raw) as RedditReport };
}

export function getEnrichedForReport(fileName: string): Map<string, EnrichedRow> {
  const enrichedName = fileName.replace(/\.json$/, "_enriched.json");
  const full = path.join(REPORT_DIR, enrichedName);
  const map = new Map<string, EnrichedRow>();
  if (!fs.existsSync(full)) return map;

  const obj = JSON.parse(fs.readFileSync(full, "utf-8")) as
    | EnrichedRow[]
    | { subreddits?: Record<string, Array<Record<string, unknown>>> };

  if (Array.isArray(obj)) {
    for (const r of obj) map.set(r.key, r);
    return map;
  }

  for (const posts of Object.values(obj.subreddits ?? {})) {
    for (const p of posts) {
      const key = String((p.key as string) ?? "");
      if (!key) continue;
      map.set(key, {
        key,
        title_ko: (p.title_ko as string) ?? undefined,
        body_ko: (p.body_ko as string) ?? undefined,
        image_url: (p.image_url as string) ?? undefined,
        categories: (p.categories as string[]) ?? undefined,
        insight_notes: (p.insight_notes as string[]) ?? undefined,
        situation_note: (p.situation_note as string) ?? undefined,
        comment_note: (p.comment_note as string) ?? undefined,
      });
    }
  }

  return map;
}

export function flattenPosts(report: RedditReport): RedditPost[] {
  const rows: RedditPost[] = [];
  for (const [subreddit, posts] of Object.entries(report.subreddits ?? {})) {
    for (const p of posts) rows.push({ ...p, subreddit });
  }
  return rows;
}

export function postKey(p: RedditPost): string {
  return `${p.subreddit}:${p.id ?? p.url}`;
}
