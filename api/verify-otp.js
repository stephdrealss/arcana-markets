const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const OTP_SECRET = process.env.OTP_SECRET;

function verifyToken(token, email, otp) {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const lastColon = decoded.lastIndexOf(':');
    const hmac = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const parts = payload.split(':');
    const expires = parts[parts.length - 1];
    const storedOtp = parts[parts.length - 2];
    const storedEmail = parts.slice(0, parts.length - 2).join(':');
    if (storedEmail !== email || storedOtp !== otp) return false;
    if (Date.now() > parseInt(expires)) return false;
    const expectedHmac = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch { return false; }
}

async function getEntitySecretCipherText() {
  const res = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
  });
  const data = await res.json();
  const publicKey = data.data.publicKey;
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(ENTITY_SECRET, 'hex')
  );
  return encrypted.toString('base64');
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, otp, token } = req.body;
  if (!email || !otp || !token) return res.status(400).json({ error: "Missing fields" });

  if (!verifyToken(token, email, otp)) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }

  try {
    const userId = "arcana_" + email.replace(/[^a-zA-Z0-9]/g, "_");

    await fetch("https://api.circle.com/v1/w3s/users", {
      method: "POST",
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });

    const walletsRes = await fetch(`https://api.circle.com/v1/w3s/wallets?userId=${userId}`, {
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
    });
    const walletsData = await walletsRes.json();
    const existingWallet = walletsData?.data?.wallets?.[0];
    if (existingWallet?.address) {
      return res.status(200).json({ success: true, walletAddress: existingWallet.address, walletId: existingWallet.id, userId });
    }

    const cipherText1 = await getEntitySecretCipherText();
    const wsRes = await fetch("https://api.circle.com/v1/w3s/developer/walletSets", {
      method: "POST",
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCipherText: cipherText1, name: "Arcana Markets" })
    });
    const wsData = await wsRes.json();
    const walletSetId = wsData?.data?.walletSet?.id;
    if (!walletSetId) throw new Error("Failed to create wallet set: " + JSON.stringify(wsData));

    const cipherText2 = await getEntitySecretCipherText();
    const walletRes = await fetch("https://api.circle.com/v1/w3s/developer/wallets", {
      method: "POST",
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        entitySecretCipherText: cipherText2,
        walletSetId,
        blockchains: ["ARC-TESTNET"],
        count: 1,
        metadata: [{ name: `Arcana-${email}`, refId: userId }]
      })
    });
    const walletData = await walletRes.json();
    const createdWallet = walletData?.data?.wallets?.[0];
    const walletAddress = createdWallet?.address;
    const walletId = createdWallet?.id;
    if (!walletAddress) throw new Error("Wallet creation failed: " + JSON.stringify(walletData));

    return res.status(200).json({ success: true, walletAddress, walletId, userId });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Wallet creation failed" });
  }
};
