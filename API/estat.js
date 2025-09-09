// e-Stat API キーを環境変数 ESTAT_APP_ID に設定して使います。
// Vercel Dashboard → Project → Settings → Environment Variables
export default async function handler(req, res) {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) {
    return res.status(200).json({ error: "ESTAT_APP_ID が未設定です（Vercel環境変数）" });
  }
  try {
    const statsDataId = req.query?.statsDataId;
    if (!statsDataId) return res.status(200).json({ error: "statsDataId を指定してください" });
    const api = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${encodeURIComponent(appId)}&statsDataId=${encodeURIComponent(statsDataId)}`;
    const r = await fetch(api);
    if (!r.ok) throw new Error(`e-Stat error ${r.status}`);
    const j = await r.json();
    res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400"); // 1時間
    res.status(200).json(j);
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
