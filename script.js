// 最終更新（ページ読み込み時にJSTで）
const setUpdated = () => {
  const el = document.getElementById("page-updated");
  if (el) el.textContent = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
};
setUpdated();

/* -----------------------------
   国会会議録 API（キー不要）
----------------------------- */
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
  } catch {
    out.textContent = "取得に失敗しました。時間をおいて再試行してください。";
  }
});

/* -----------------------------
   ニュース（/api/news → GDELT）
----------------------------- */
async function loadNews() {
  const info = document.getElementById("news-updated");
  const wrap = document.getElementById("news");
  if (!info || !wrap) return;
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
      const d = a.seendate ? toJST(a.seendate) : "";
      return `<div class="news-card">
        <a href="${u}" target="_blank" rel="noopener">${t}</a>
        <div class="mini muted">${s || "source"} / ${d}</div>
      </div>`;
    }).join("");
    info.textContent = `最終更新：${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;
  } catch {
    wrap.innerHTML = `<div class="muted">取得に失敗しました。</div>`;
    info.textContent = "更新失敗";
  }
}
function toJST(yyyymmddhhmmss){
  const y = yyyymmddhhmmss.slice(0,4);
  const mo = yyyymmddhhmmss.slice(4,6);
  const d = yyyymmddhhmmss.slice(6,8);
  const hh = yyyymmddhhmmss.slice(8,10);
  const mm = yyyymmddhhmmss.slice(10,12);
  const ss = yyyymmddhhmmss.slice(12,14);
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
  return dt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
loadNews();

/* -----------------------------
  /* -----------------------------
   e-Stat（/api/estat → 最新値＋簡易グラフ）
----------------------------- */
const estatBtn = document.getElementById("estat-btn");
const estatInput = document.getElementById("estat-id");
const estatLatest = document.getElementById("estat-latest");
const estatMeta = document.getElementById("estat-latest-meta");
const estatChartEl = document.getElementById("estat-chart");
const currentTableEl = document.getElementById("current-table");

estatBtn?.addEventListener("click", () => {
  const id = (estatInput?.value || "").trim();
  if (!id) {
    alert("statsDataId を入力してください。例：C0020050213000");
    return;
  }
  fetchEstat(id);
});

async function fetchEstat(statsDataId){
  setStatLoading(true);
  currentTableEl.textContent = statsDataId;
  try {
    // 件数が多い表に備えて limit を多めに
    const r = await fetch(`/api/estat?statsDataId=${encodeURIComponent(statsDataId)}&limit=50000`);
    const j = await r.json();
    if (j.error) throw new Error(j.error);

    const sd = j?.GET_STATS_DATA?.STATISTICAL_DATA;
    const title = sd?.TABLE_INF?.TITLE || "—";
    const values = sd?.DATA_INF?.VALUE;
    if (!Array.isArray(values) || !values.length) {
      fail(`データが見つかりません（${title}）`);
      return;
    }

    // 1) 時間キーを自動推定（@time, @timeCode, @time, @time_code などを探索）
    const sample = values[0];
    const timeKey = Object.keys(sample).find(k => /^@?time/i.test(k)) 
                 || Object.keys(sample).find(k => /time/i.test(k))
                 || null;

    // 2) 単位を取得（TABLE_INF や CLASS_INF にあることが多い）
    const unit =
      sd?.TABLE_INF?.NOTE?.[0]?.char ||                 // 備考に入る場合
      (sd?.CLASS_INF?.CLASS_OBJ || [])
        .find(c => (c?.["@id"] || "").toLowerCase() === "unit")
        ?.CLASS?.[0]?.["@name"] ||
      "";

    // 3) シリーズ成形（time が無い場合は連番）
    let series = values.map((v, i) => ({
      t: (timeKey && (v[timeKey] || v[String(timeKey)])) ?? i, // ラベル
      v: toNum(v["$"])
    }))
    .filter(x => Number.isFinite(x.v))
    .sort((a,b) => String(a.t).localeCompare(String(b.t)));

    if (!series.length) {
      // 値が文字列（"-" 等）だけで弾かれた場合はエラー表示
      fail(`数値の抽出に失敗しました（${title}）。別の表IDで試すか、抽出ロジック調整が必要です。`);
      console.debug("e-Stat raw sample:", sample);
      return;
    }

    // 最新値
    const latest = series[series.length - 1];
    estatLatest.textContent = latest.v.toLocaleString("ja-JP");
    estatMeta.textContent = `${latest.t} 時点（${title}${unit ? " / 単位: " + unit : ""}）`;

    // グラフ描画
    drawLine(estatChartEl, series);
  } catch (e) {
    fail("取得に失敗しました。表ID・環境変数・ネットワークを確認してください。");
    console.error(e);
  } finally {
    setStatLoading(false);
  }
}

function toNum(x){
  if (x == null) return NaN;
  // 1,234 や 1,234.5、"-" などに対応
  const s = String(x).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function setStatLoading(isLoading){
  estatBtn.disabled = isLoading;
  estatBtn.textContent = isLoading ? "取得中…" : "取得";
}
function fail(msg){
  estatLatest.textContent = "—";
  estatMeta.textContent = msg;
  drawLine(estatChartEl, []);
}

/* 依存なしの簡易ライン描画（そのまま） */
function drawLine(canvas, series){
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = "#2a2f47";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W-1, H-1);

  if (!series || !series.length) return;

  const padding = { l: 40, r: 12, t: 12, b: 28 };
  const innerW = W - padding.l - padding.r;
  const innerH = H - padding.t - padding.b;

  const xs = series.map(d => d.t);
  const ys = series.map(d => d.v);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = (maxY - minY) || 1;

  ctx.strokeStyle = "#2a2f47";
  ctx.fillStyle = "#a8b0d6";
  ctx.font = "12px system-ui, -apple-system, 'Noto Sans JP', sans-serif";
  for (let i=0;i<=4;i++){
    const y = padding.t + (innerH * i / 4);
    ctx.beginPath(); ctx.moveTo(padding.l, y); ctx.lineTo(W - padding.r, y); ctx.stroke();
    const val = maxY - (spanY * i / 4);
    ctx.fillText(formatNum(val), 6, y + 4);
  }
  const xIdx = [0, Math.floor(xs.length/2), xs.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  xIdx.forEach(idx => {
    const x = padding.l + innerW * (idx / (xs.length - 1 || 1));
    ctx.fillText(String(xs[idx]), x - 12, H - 8);
  });

  ctx.beginPath();
  for (let i=0;i<series.length;i++){
    const px = padding.l + innerW * (i / (series.length - 1 || 1));
    const py = padding.t + innerH * (1 - (series[i].v - minY) / spanY);
    if (i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineWidth = 2; ctx.strokeStyle = "#9cffd0"; ctx.stroke();

  const lastX = padding.l + innerW;
  const lastY = padding.t + innerH * (1 - (ys[ys.length-1] - minY) / spanY);
  ctx.fillStyle = "#9cffd0"; ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI*2); ctx.fill();
}
function formatNum(n){
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString("ja-JP");
}
