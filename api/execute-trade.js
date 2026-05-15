const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

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

  const { walletId, contractAddress, abiFunctionSignature, abiParameters } = req.body;
  if (!walletId || !contractAddress || !abiFunctionSignature) {
    return res.status(400).json({ error: "Missing required fields", got: { walletId: !!walletId, contractAddress: !!contractAddress, abiFunctionSignature: !!abiFunctionSignature } });
  }

  try {
    const [cipherText, balRes] = await Promise.all([
      getEntitySecretCipherText(),
      fetch(`https://api.circle.com/v1/w3s/wallets/${walletId}/balances`, {
        headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
      })
    ]);
    const balData = await balRes.json();
    console.log("Circle wallet balances:", JSON.stringify(balData));

    const circleBody = {
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: cipherText,
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters: (abiParameters || []).map(String),
      gasLimit: "300000", maxFee: "1", priorityFee: "1",
    };
    console.log("Sending to Circle:", JSON.stringify({ ...circleBody, entitySecretCiphertext: "[redacted]" }));

    const result = await fetch("https://api.circle.com/v1/w3s/developer/transactions/contractExecution", {
      method: "POST",
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(circleBody)
    });
    const data = await result.json();
    console.log("Circle response:", JSON.stringify(data));

    if (!result.ok) {
      return res.status(result.status).json({
        error: data?.message || "Circle API error",
        code: data?.code,
        errors: data?.errors,
        circleError: data,
        walletBalances: balData?.data?.tokenBalances || balData
      });
    }
    const txHash = data?.data?.transaction?.txHash || data?.data?.id || null;
    return res.status(200).json({ success: true, txHash, raw: data });
  } catch (e) {
    console.error("execute-trade error:", e.message, e.stack);
    return res.status(500).json({ error: e.message || "Transaction failed" });
  }
};
