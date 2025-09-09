export default async function handler(req, res) {
  const hasKey = Boolean(process.env.ESTAT_APP_ID);
  return res.status(200).json({ ok: true, hasKey });
}
