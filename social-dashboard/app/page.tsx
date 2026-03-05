import { flattenPosts, getEnrichedForReport, getReport, listReportArchives, postKey } from "@/lib/reddit";

type Props = {
  searchParams: Promise<{ q?: string; sub?: string; us?: string; view?: string; file?: string }>;
};

const TRACKING_KEYWORDS = ["pillowcase causing breakouts","bedding hygiene for acne","acne prone skin bedding","laundry residue acne","washyourpillowcase","how to wash silk pillowcase","how often wash pillowcases","germaphobia","disinfect pillow","disposable pillowcase","towel on pillow for acne","t-shirt on pillow","skincarediyhygiene","pillowcase","bedding","breakout","acne","silk pillowcase","disposable"].map((k)=>k.toLowerCase());

function fmtTime(ts?: number) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function highlightHtml(input: string, terms: string[]) {
  if (!input) return "";
  const validTerms = terms.filter((t) => t && t.length >= 3);
  if (!validTerms.length) return input;
  const pattern = new RegExp(`(${validTerms.map(escapeRegExp).join("|")})`, "gi");
  return input.replace(pattern, `<mark style="background:#fff59d;padding:0 2px;">$1</mark>`);
}
function isRelated(text: string) {
  const t = text.toLowerCase();
  const acneSignal = /(acne|breakout|pimple|comedone|zit|여드름|트러블)/.test(t);
  const contactSignal = /(pillow|pillowcase|bedding|sheet|linen|sleep surface|베개|침구|커버)/.test(t);
  const altSignal = /(disposable pillowcase|towel on pillow|t-shirt on pillow|silk pillowcase)/.test(t);
  const compulsionSignal = /(germaphobia|disinfect pillow|germ.*pillow)/.test(t);
  return (acneSignal && contactSignal) || altSignal || compulsionSignal;
}

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const sub = (sp.sub ?? "all").toLowerCase();
  const us = (sp.us ?? "all").toLowerCase();
  const view = (sp.view ?? "ko").toLowerCase();
  const file = sp.file;

  const archives = listReportArchives();
  const selected = getReport(file);
  if (!selected) return <main style={{ padding: 24 }}>리포트 JSON이 없습니다. (data/reddit)</main>;

  const enriched = getEnrichedForReport(selected.fileName);
  const allPosts = flattenPosts(selected.report);
  const subreddits = Array.from(new Set(allPosts.map((p) => p.subreddit))).sort();

  const filtered = allPosts.filter((p) => {
    const text = `${p.title} ${p.selftext ?? ""}`.toLowerCase();
    if (!isRelated(text)) return false;
    if (sub !== "all" && p.subreddit.toLowerCase() !== sub) return false;
    if (us === "yes" && !p.us_likely) return false;
    if (us === "no" && p.us_likely) return false;
    if (q && !text.includes(q)) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => ((b.ups ?? 0) * 0.4 + (b.comments ?? 0) * 0.6) - ((a.ups ?? 0) * 0.4 + (a.comments ?? 0) * 0.6));
  const highlightTerms = Array.from(new Set([...TRACKING_KEYWORDS, ...(q ? [q] : [])]));

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <h1>Reddit Social Dashboard</h1>
      <p style={{ marginTop: 8, color: "#666" }}>selected: <b>{selected.fileName}</b> · generated_at: {selected.report.generated_at ?? "-"}</p>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, marginTop: 14 }}>
        <aside style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, height: "fit-content", position: "sticky", top: 12 }}>
          <b>아카이브</b>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {archives.map((a) => {
              const active = a.fileName === selected.fileName;
              return (
                <a key={a.fileName} href={`/?file=${encodeURIComponent(a.fileName)}&view=${view}`} style={{ padding: "6px 8px", borderRadius: 8, background: active ? "#eef3ff" : "transparent", border: active ? "1px solid #b8c7ff" : "1px solid transparent" }}>
                  {a.date}
                </a>
              );
            })}
          </div>
        </aside>

        <section>
          <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="keyword..." style={{ padding: "8px 10px", minWidth: 260 }} />
            <input type="hidden" name="file" value={selected.fileName} />
            <select name="sub" defaultValue={sp.sub ?? "all"} style={{ padding: "8px 10px" }}>
              <option value="all">all subreddits</option>
              {subreddits.map((s) => <option key={s} value={s}>r/{s}</option>)}
            </select>
            <select name="us" defaultValue={sp.us ?? "all"} style={{ padding: "8px 10px" }}>
              <option value="all">US all</option><option value="yes">US-likely only</option><option value="no">non-US/unknown</option>
            </select>
            <select name="view" defaultValue={view} style={{ padding: "8px 10px" }}>
              <option value="ko">한글 우선</option><option value="en">영문 우선</option><option value="both">한/영 함께</option>
            </select>
            <button type="submit" style={{ padding: "8px 12px" }}>적용</button>
          </form>

          <p style={{ marginTop: 12 }}>총 {sorted.length} posts</p>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {sorted.map((p, idx) => {
              const ex = enriched.get(postKey(p));
              const titleKo = ex?.title_ko || p.title;
              const bodyKo = ex?.body_ko || p.selftext || "[No body text]";
              const titleEn = p.title;
              const bodyEn = p.selftext || "[No body text]";
              const cats = ex?.categories ?? [];
              const notes = ex?.insight_notes ?? [];

              return (
                <article key={`${p.subreddit}-${p.id ?? idx}`} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, color: "#666" }}>r/{p.subreddit} · ups {p.ups ?? 0} · comments {p.comments ?? 0} · {fmtTime(p.created_utc)} · US-likely {String(Boolean(p.us_likely))}</div>
                  {ex?.image_url && <img src={ex.image_url} alt={p.title} style={{ marginTop: 10, maxWidth: "100%", borderRadius: 8, border: "1px solid #eee" }} />}

                  <div style={{ marginTop: 10, background: "#f7f9ff", border: "1px solid #dbe4ff", borderRadius: 8, padding: 10 }}>
                    <b>인사이트 노트 (LLM)</b>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {cats.length ? cats.map((c, i) => <span key={i} style={{ fontSize: 12, border: "1px solid #b8c7ff", borderRadius: 999, padding: "2px 8px", background: "#eef3ff" }}>{c}</span>) : <span style={{ fontSize: 12, color: "#666" }}>LLM 인사이트 미생성</span>}
                    </div>
                    {ex?.situation_note && <p style={{ marginTop: 8 }}><b>상황 이해:</b> {ex.situation_note}</p>}
                    {ex?.comment_note && <p style={{ marginTop: 6 }}><b>댓글 맥락:</b> {ex.comment_note}</p>}
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>{notes.length ? notes.map((n, i) => <li key={i}>{n}</li>) : <li>LLM 인사이트 생성 후 표시됩니다.</li>}</ul>
                  </div>

                  <h3 style={{ marginTop: 10 }}><a href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}><span dangerouslySetInnerHTML={{ __html: highlightHtml(view === "en" ? titleEn : titleKo, highlightTerms) }} /></a></h3>
                  {view !== "en" && <p style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: highlightHtml(bodyKo, highlightTerms) }} />}
                  {view !== "ko" && <p style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#444" }} dangerouslySetInnerHTML={{ __html: highlightHtml(bodyEn, highlightTerms) }} />}

                  <div style={{ marginTop: 10, borderTop: "1px dashed #ddd", paddingTop: 10 }}>
                    <b>주요 댓글 원문 (Top comments)</b>
                    <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                      {(p.debate_top3 ?? []).length ? (
                        (p.debate_top3 ?? []).map((c, i) => <li key={i} style={{ marginBottom: 6 }}>{c}</li>)
                      ) : (
                        <li>[댓글 데이터 없음]</li>
                      )}
                    </ul>
                    <p style={{ marginTop: 8 }}>brands: {(p.brand_mentions ?? []).join(", ") || "none"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
