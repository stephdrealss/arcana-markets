const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { walletId } = req.query;
  if (!walletId) return res.status(400).json({ error: "Missing walletId" });

  try {
    const r = await fetch(`https://api.circle.com/v1/w3s/wallets/${walletId}/balances`, {
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
