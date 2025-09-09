

export default async function handler(req, res) {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) return res.status(200).json({ error: "ESTAT_APP_ID が未設定です" });

  const { statsDataId, startPosition = "", limit = "" } = req.query || {};
  if (!statsDataId) return res.status(200).json({ error: "statsDataId を指定してください" });

  const api = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData");
  api.searchParams.set("appId", appId);
  api.searchParams.set("statsDataId", statsDataId);
  if (startPosition) api.searchParams.set("startPosition", startPosition);
  if (limit) api.searchParams.set("limit", limit);

  try {
    const r = await fetch(api);
    if (!r.ok) throw new Error(`e-Stat ${r.status}`);
    const j = await r.json();
    res.setHeader("cache-control","s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(j);
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
