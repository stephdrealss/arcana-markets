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
  if (!walletId || !contractAddress || !abiFunctionSignature)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const entitySecretCipherText = await getEntitySecretCipherText();

    const txRes = await fetch("https://api.circle.com/v1/w3s/developer/transactions/contractExecution", {
      method: "POST",
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters: abiParameters || [],
        feeLevel: "MEDIUM",
        entitySecretCipherText
      })
    });

    const txData = await txRes.json();
    if (!txRes.ok) throw new Error(txData?.message || JSON.stringify(txData));

    const transactionId = txData?.data?.id;
    if (!transactionId) throw new Error("No transaction ID: " + JSON.stringify(txData));

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.circle.com/v1/w3s/transactions/${transactionId}`, {
        headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
      });
      const statusData = await statusRes.json();
      const tx = statusData?.data?.transaction;
      if (tx?.txHash) return res.status(200).json({ success: true, txHash: tx.txHash });
      if (tx?.state === 'FAILED' || tx?.state === 'CANCELLED')
        throw new Error("Transaction failed: " + (tx.errorReason || tx.state));
    }
    throw new Error("Timed out waiting for confirmation");
  } catch (e) {
    return res.status(500).json({ error: e.message || "Transaction failed" });
  }
};
