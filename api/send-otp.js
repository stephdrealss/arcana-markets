const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OTP_SECRET = process.env.OTP_SECRET;

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function createToken(email, otp) {
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `${email}:${otp}:${expires}`;
  const hmac = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body;
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });

  const otp = generateOTP();
  const token = createToken(email, otp);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Arcana Markets <hello@arcanamarkets.xyz>",
        to: [email],
        subject: "Your Arcana Markets verification code",
        html: `
          <div style="font-family:monospace;max-width:400px;margin:0 auto;padding:40px 20px;background:#07061A;color:#E8E8F0;border-radius:16px;">
            <h2 style="color:#4F8EF7;margin-bottom:8px;">◈ Arcana Markets</h2>
            <p style="color:#8B8BA8;margin-bottom:24px;">Your verification code:</p>
            <div style="font-size:48px;font-weight:800;letter-spacing:12px;color:#fff;background:#15122E;padding:20px;border-radius:12px;text-align:center;margin-bottom:24px;">${otp}</div>
            <p style="color:#8B8BA8;font-size:12px;">Expires in 10 minutes. Do not share this code.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send email");
    }

    return res.status(200).json({ success: true, token });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to send email" });
  }
};
