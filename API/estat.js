export default async function handler(req, res) {
  res.status(200).json({ ok: true, hasKey: Boolean(process.env.ESTAT_APP_ID) });
}
