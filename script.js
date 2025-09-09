// 最終更新表示
document.getElementById("page-updated").textContent =
  new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

// ■ 会議録API（フロント直叩き：キー不要）
const searchBtn = document.getElementById("search");
searchBtn?.addEventListener("click", async () => {
  const kw = document.getElementById("kw").value.trim();
  const out = document.getElementById("speeches");
  if (!kw) { out.textContent = "キーワードを入力してください。"; return; }
  out.textContent = "検索中…";
  try {
    const url = `https://kokkai.ndl.go.jp/api/speech?recordPacking=json&maximumRecords=3&any=${encodeURIComponent(kw)}`;
    const res = await fetch(url);
    const data = await res.json();
    const list = (data?.["@graph"]?.[0]?.speechRecord) || [];
    if (!list.length) { out.textContent = "最近の該当発言が見つかりませんでした。"; return; }
    out.innerHTML = list.map(rec => {
      const s = rec.speech || {};
      const m = rec.meeting || {};
      const who = s.speaker || s.speakerRole || "発言者";
      const date = m.date || "";
      const mtg = m.name || "";
      const text = (s.speech || "").replace(/\s+/g, " ").slice(0, 160) + "…";
      const link = s.speechURL || "#";
      return `<div><div><strong>${who}</strong>｜${mtg}（${date}）</div>
        <div style="margin-top:6px">${text}</div>
        <a href="${link}" target="_blank" rel="noopener">全文を読む</a></div>`;
    }).join("");
  } catch (e) {
    out.textContent = "取得に失敗しました。時間をおいて再試行してください。";
  }
});

// ■ ニュース（自前API /api/news 経由：キー不要）
async function loadNews() {
  const info = document.getElementById("news-updated");
  const wrap = document.getElementById("news");
  info.textContent = "更新中…";
  wrap.innerHTML = "";
  try {
    const r = await fetch("/api/news?query=%28%22consumption%20tax%22%20OR%20%E6%B6%88%E8%B2%BB%E7%A8%8E%29%20sourcecountry%3AJP&max=8");
    const j = await r.json();
    const items = j.articles || [];
    if (!items.length) { wrap.innerHTML = `<div class="muted">該当ニュースがありません。</div>`; return; }
    wrap.innerHTML = items.map(a => {
      const t = a.title || "No title";
      const u = a.url || "#";
      const s = (a.source || "").replace(/^https?:\/\/(www\.)?/,"").slice(0,60);
      const d = a.seendate ? new Date(a.seendate).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";
      return `<div class="news-card">
        <a href="${u}" target="_blank" rel="noopener">${t}</a>
        <div class="mini muted">${s || "source"} / ${d}</div>
      </div>`;
    }).join("");
    info.textContent = `最終更新：${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;
  } catch (e) {
    wrap.innerHTML = `<div class="muted">取得に失敗しました。</div>`;
    info.textContent = "更新失敗";
  }
}
loadNews();

// ■ e-Stat（自前API /api/estat 経由：鍵はサーバ側）
const estatBtn = document.getElementById("estat-btn");
estatBtn?.addEventListener("click", async () => {
  const id = document.getElementById("estat-id").value.trim();
  const out = document.getElementById("estat-out");
  if (!id) { out.textContent = "statsDataId を入力してください。"; return; }
  out.textContent = "取得中…";
  try {
    const r = await fetch(`/api/estat?statsDataId=${encodeURIComponent(id)}`);
    const j = await r.json();
    if (j.error) { out.textContent = `エラー: ${j.error}`; return; }
    // ここでは先頭のタイトルと期間だけを抜粋して表示
    const tableTitle = j.GET_STATS_DATA?.STATISTICAL_DATA?.TABLE_INF?.TITLE || "(no title)";
    const term = j.GET_STATS_DATA?.STATISTICAL_DATA?.TABLE_INF?.CYCLE || "";
    out.textContent = `表タイトル: ${tableTitle}\n集計周期: ${term}\n→ コンソールで raw を確認`;
    console.log("e-Stat raw:", j);
  } catch(e) {
    out.textContent = "取得に失敗しました。環境変数（ESTAT_APP_ID）設定を確認してください。";
  }
});
