// Vercel Edge/Node どちらでも動きます（Node推奨）
// GDELT 2.0 DOC API を叩いてシンプルな JSON に整形
export default async function handler(req, res) {
  try {
    const { query = '( "consumption tax" OR 消費税 ) sourcecountry:JP', max = '8' } = req.query || {};
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${encodeURIComponent(max)}&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GDELT error ${r.status}`);
    const j = await r.json();
    const articles = (j?.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      seendate: a.seendate, // UTC YYYYMMDDHHMMSS
      source: a.sourceUrl || a.domain
    }));
    res.setHeader("cache-control", "s-maxage=600, stale-while-revalidate=3600"); // 10分キャッシュ
    res.status(200).json({ ok: true, articles });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
}
