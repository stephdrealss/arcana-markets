const crypto = require('crypto');

const OTP_SECRET = process.env.OTP_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing fields" });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    const payload = `${email}:${otp}:${expires}`;
    const hmac = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}:${hmac}`).toString('base64');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Arcana Markets <noreply@arcanamarkets.xyz>',
        to: email,
        subject: 'Your Arcana Markets login code',
        html: `<h2>Your login code</h2><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p><p>Expires in 10 minutes.</p>`
      })
    });

    return res.status(200).json({ success: true, token });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to send code" });
  }
};
