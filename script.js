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
/* -----------------------------
   用語モーダル：辞書＆イベント
----------------------------- */
const GLOSSARY = {
  "軽減税率": {
    title: "軽減税率（8%）",
    desc: "生活必需品等の負担を和らげる目的で、標準10%ではなく8%を適用する制度（2019年10月導入）。",
    points: [
      "対象：飲食料品（酒類を除く）・定期購読の新聞（週2回以上発行）",
      "外食・酒類は対象外（テイクアウトは対象）",
      "適用判定は品目・提供形態で変わる（例：コンビニのイートインは10%）"
    ],
    links: [
      { label: "国税庁：軽減税率の制度概要（英語）", url: "https://www.nta.go.jp/english/taxes/consumption_tax/01.htm" }
    ]
  },
  "インボイス": {
    title: "インボイス（適格請求書等保存方式）",
    desc: "仕入税額控除の適用要件として、一定の記載事項を満たす請求書（適格請求書）が必要になる制度。2023年10月1日開始。",
    points: [
      "記載要件：登録番号、適用税率ごとの対価、消費税額等",
      "発行できるのは「適格請求書発行事業者」（登録制）",
      "受け取る側はインボイス保存で仕入税額控除が可能"
    ],
    links: [
      { label: "国税庁：インボイス制度（英語PDF）", url: "https://www.nta.go.jp/english/taxes/consumption_tax/pdf/2023/simplified_04.pdf" }
    ]
  },
  "仕入税額控除": {
    title: "仕入税額控除",
    desc: "事業者が仕入で支払った消費税を、売上にかかる消費税から差し引ける仕組み。二重課税の回避が目的。",
    points: [
      "帳簿及びインボイス（適格請求書）の保存が要件",
      "免税事業者からの仕入は原則控除不可（経過措置あり）",
      "課税売上割合が95%未満だと按分計算が必要になる場合あり"
    ],
    links: [
      { label: "国税庁：消費税の基礎（英語）", url: "https://www.nta.go.jp/english/taxes/consumption_tax/01.htm" }
    ]
  },
  "免税事業者": {
    title: "免税事業者",
    desc: "基準期間の課税売上高が1,000万円以下等の要件を満たし、消費税の納税義務が免除される事業者。",
    points: [
      "インボイス発行を希望するなら登録して課税事業者になる必要",
      "免税のままだと仕入税額控除の対象外となる取引先がある",
      "課税事業者選択届出で任意に課税事業者になることも可能"
    ],
    links: [
      { label: "財務省：消費税の仕組み（英語）", url: "https://www.mof.go.jp/english/policy/tax_policy/consumption_tax/index.html" }
    ]
  },
  "適格請求書発行事業者": {
    title: "適格請求書発行事業者",
    desc: "インボイス（適格請求書）を発行できる登録事業者。登録番号が付与され、国税庁の公表サイトで確認できる。",
    points: [
      "登録は税務署への申請が必要（原則、課税事業者）",
      "取引先が仕入税額控除を行うためにインボイスが必要",
      "登録番号は請求書等に記載する義務あり"
    ],
    links: [
      { label: "国税庁：インボイス制度（英語PDF）", url: "https://www.nta.go.jp/english/taxes/consumption_tax/pdf/2023/simplified_04.pdf" }
    ]
  }
};

// 開閉制御
const modal = document.getElementById("glossary-modal");
const titleEl = document.getElementById("glossary-title");
const descEl = document.getElementById("glossary-desc");
const pointsEl = document.getElementById("glossary-points");
const linksEl = document.getElementById("glossary-links");
let lastFocused = null;

function openModal(payload){
  if (!modal) return;
  titleEl.textContent = payload.title || "用語";
  descEl.textContent = payload.desc || "";
  pointsEl.innerHTML = (payload.points || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  linksEl.innerHTML = (payload.links || []).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${escapeHtml(x.label)}</a>`).join(" / ");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  // フォーカス管理
  lastFocused = document.activeElement;
  modal.querySelector(".modal__close")?.focus();
}
function closeModal(){
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (lastFocused) lastFocused.focus();
}
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.matches(".term")){
    const key = t.getAttribute("data-term");
    const payload = GLOSSARY[key];
    if (payload) openModal(payload);
  }
  if (t.matches("[data-close]")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

