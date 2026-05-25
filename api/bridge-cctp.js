const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const CHAIN_CONFIG = {
  'ETH-SEPOLIA': { blockchain: 'ETH-SEPOLIA', bridgeChain: 'Ethereum_Sepolia', name: 'Ethereum Sepolia' },
  'BASE-SEPOLIA': { blockchain: 'BASE-SEPOLIA', bridgeChain: 'Base_Sepolia', name: 'Base Sepolia' },
  'AVAX-FUJI': { blockchain: 'AVAX-FUJI', bridgeChain: 'Avalanche_Fuji', name: 'Avalanche Fuji' },
};

async function getCipherText() {
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

async function getOrCreateWallet(userId, blockchain) {
  const res = await fetch(
    `https://api.circle.com/v1/w3s/wallets?refId=${encodeURIComponent(userId)}&blockchain=${blockchain}&pageSize=10`,
    { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
  );
  const data = await res.json();
  const existing = data?.data?.wallets?.[0];
  if (existing?.address) return existing;

  const cipherText1 = await getCipherText();
  const wsRes = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: cipherText1,
      name: `Arcana Bridge - ${blockchain}`
    })
  });
  const wsData = await wsRes.json();
  const walletSetId = wsData?.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set: ' + JSON.stringify(wsData));

  const cipherText2 = await getCipherText();
  const walletRes = await fetch('https://api.circle.com/v1/w3s/developer/wallets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: cipherText2,
      walletSetId,
      blockchains: [blockchain],
      count: 1,
      metadata: [{ name: `Arcana-Bridge-${blockchain}`, refId: userId }]
    })
  });
  const walletData = await walletRes.json();
  const wallet = walletData?.data?.wallets?.[0];
  if (!wallet?.address) throw new Error('Failed to create wallet: ' + JSON.stringify(walletData));
  return wallet;
}

async function executeTx(walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const cipherText = await getCipherText();
  const body = {
    idempotencyKey: crypto.randomUUID(),
    entitySecretCiphertext: cipherText,
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters: (abiParameters || []).map(String),
    feeLevel: 'LOW',
  };
  const res = await fetch('https://api.circle.com/v1/w3s/developer/transactions/contractExecution', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Circle API error');
  return data?.data?.id;
}

async function waitForTx(txId, maxWait = 55000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
      headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
    });
    const data = await res.json();
    const state = data?.data?.transaction?.state;
    const txHash = data?.data?.transaction?.txHash;
    if (state === 'COMPLETE') return { success: true, txHash };
    if (state === 'FAILED') throw new Error(data?.data?.transaction?.errorDetails || 'Transaction failed');
  }
  throw new Error('Transaction timed out');
}

async function pollAttestation(txHash, sourceDomain, maxWait = 55000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(
        `https://iris-api-sandbox.circle.com/v2/messages/${sourceDomain}?transactionHash=${txHash}`
      );
      const data = await res.json();
      const messages = data?.messages || [];
      const ready = messages.find(m => m.status === 'complete');
      if (ready) return ready;
    } catch {}
  }
  return null;
}

const USDC_ADDRESSES = {
  'ETH-SEPOLIA': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'BASE-SEPOLIA': '0x036CbD53842c542663
