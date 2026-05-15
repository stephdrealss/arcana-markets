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

async function executeCircleTx(walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const cipherText = await getEntitySecretCipherText();
  const body = {
    idempotencyKey: crypto.randomUUID(),
    entitySecretCiphertext: cipherText,
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters: (abiParameters || []).map(String),
    feeLevel: "LOW",
  };
  const res = await fetch("https://api.circle.com/v1/w3s/developer/transactions/contractExecution", {
    method: "POST",
    headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Circle API error");
  return data?.data?.id;
}

async function waitForTx(txId, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
      headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
    });
    const data = await res.json();
    const state = data?.data?.transaction?.state;
    const txHash = data?.data?.transaction?.txHash;
    if (state === "COMPLETE") return { success: true, txHash };
    if (state === "FAILED") {
      const reason = data?.data?.transaction?.errorDetails || "Transaction failed";
      throw new Error(reason);
    }
  }
  throw new Error("Transaction timed out");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { walletId, contractAddress, abiFunctionSignature, abiParameters } = req.body;
  if (!walletId || !contractAddress || !abiFunctionSignature) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const txId = await executeCircleTx(walletId, contractAddress, abiFunctionSignature, abiParameters);
    const result = await waitForTx(txId);
    return res.status(200).join({ success: true, txHash: result.txHash });
  } catch (e) {
    console.error("execute-trade error:", e.message);
    return res.status(400).json({ error: e.message || "Transaction failed" });
  }
};
