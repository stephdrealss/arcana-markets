const RESEND_API_KEY = "re_AicCHXLU_67aRkjF1841toB5hiqGEHD7v";
const CIRCLE_API_KEY = "TEST_API_KEY:8ef90e770e91ce1e32a3d92046ad4632:3f9e81424edda70841181ffe200d10ba";

const otpStore = global.otpStore || (global.otpStore = {});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Arcana Markets <onboarding@resend.dev>",
        to: [email],
        subject: "Your Arcana Markets verification code",
        html: `
          <div style="font-family:monospace;max-width:400px;margin:0 auto;padding:40px 20px;background:#07061A;color:#E8E8F0;border-radius:16px;">
            <h2 style="color:#4F8EF7;margin-bottom:8px;">◈ Arcana Markets</h2>
            <p style="color:#8B8BA8;margin-bottom:24px;">Your verification code:</p>
            <div style="font-size:48px;font-weight:800;letter-spacing:12px;color:#fff;background:#15122E;padding:20px;border-radius:12px;text-align:center;margin-bottom:24px;">${otp}</div>
            <p style="color:#8B8BA8;font-size:12px;">Expires in 10 minutes. Do not share this code.</p>
            <p style="color:#8B8BA8;font-size:11px;margin-top:16px;">Powered by Circle · Arc Testnet</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send email");
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to send email" });
  }
};
