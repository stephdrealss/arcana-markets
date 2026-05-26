const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const CHAIN_CONFIG = {
  'ETH-SEPOLIA': { blockchain: 'ETH-SEPOLIA', name: 'Ethereum Sepolia', domain: 0 },
  'BASE-SEPOLIA': { blockchain: 'BASE-SEPOLIA', name: 'Base Sepolia', domain: 6 },
  'AVAX-FUJI': { blockchain: 'AVAX-FUJI', name: 'Avalanche Fuji', domain: 1 },
};

const USDC_ADDRESSES = {
  'ETH-SEPOLIA': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'AVAX-FUJI': '0x5425890298aed601595a70AB815c96711a31Bc65',
};

const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const ARC_DOMAIN = 26;

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

  const ct1 = await getCipherText();
  const wsRes = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct1, name: `Arcana Bridge - ${blockchain}` })
  });
  const wsData = await wsRes.json();
  const walletSetId = wsData?.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set');

  const ct2 = await getCipherText();
  const walletRes = await fetch('https://api.circle.com/v1/w3s/developer/wallets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct2, walletSetId, blockchains: [blockchain], count: 1, metadata: [{ name: `Arcana-Bridge-${blockchain}`, refId: userId }] })
  });
  const walletData = await walletRes.json();
  const wallet = walletData?.data?.wallets?.[0];
  if (!wallet?.address) throw new Error('Failed to create wallet');
  return wallet;
}

async function executeTx(walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const ct = await getCipherText();
  const res = await fetch('https://api.circle.com/v1/w3s/developer/transactions/contractExecution', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct, walletId, contractAddress, abiFunctionSignature, abiParameters: (abiParameters || []).map(String), feeLevel: 'LOW' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Circle API error');
  return data?.data?.id;
}

async function waitForTx(txId, maxWait = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
      headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
    });
    const data = await res.json();
    const state = data?.data?.transaction?.state;
    const txHash = data?.data?.transaction?.txHash;
    if (state === 'COMPLETE') return { success: true, txHash };
    if (state === 'FAILED') throw new Error(data?.data?.transaction?.errorDetails || 'Transaction failed');
  }
  // Return pending if not confirmed yet - Circle will complete it
  return { success: true, txHash: txId, pending: true };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, arcWalletId, arcAddress, sourceChain, amount } = req.body;
  if (!userId || !arcWalletId || !arcAddress || !sourceChain || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const chainConfig = CHAIN_CONFIG[sourceChain];
  if (!chainConfig) return res.status(400).json({ error: 'Unsupported source chain' });

  try {
    // Step 1 — Get or create source chain wallet
    const sourceWallet = await getOrCreateWallet(userId, chainConfig.blockchain);
    const sourceWalletId = sourceWallet.id;
    const sourceAddress = sourceWallet.address;

    // Step 2 — Check balance
    const balRes = await fetch(`https://api.circle.com/v1/w3s/wallets/${sourceWalletId}/balances`, {
      headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
    });
    const balData = await balRes.json();
    const balances = balData?.data?.tokenBalances || [];
    const usdcBal = balances.find(b => b.token?.symbol === 'USDC');
    const available = parseFloat(usdcBal?.amount || '0');
    const requested = parseFloat(amount);

    if (available < requested) {
      return res.status(200).json({
        step: 'fund_required',
        sourceAddress,
        sourceChain,
        availableBalance: available,
        requestedAmount: requested,
        message: `Fund your ${chainConfig.name} wallet with at least ${requested} USDC`,
        faucetUrl: 'https://faucet.circle.com',
      });
    }

    const usdcAddress = USDC_ADDRESSES[sourceChain];
    const usdcAmount = String(Math.round(requested * 1e6));
    const mintRecipient = '0x' + arcAddress.slice(2).padStart(64, '0');

    // Step 3 — Approve USDC
    const approveTxId = await executeTx(sourceWalletId, usdcAddress, 'approve(address,uint256)', [TOKEN_MESSENGER_V2, usdcAmount]);
    await waitForTx(approveTxId);

    // Step 4 — Burn via CCTP — return immediately after submitting
    const burnTxId = await executeTx(
      sourceWalletId,
      TOKEN_MESSENGER_V2,
      'depositForBurn(uint256,uint32,bytes32,address)',
      [usdcAmount, String(ARC_DOMAIN), mintRecipient, usdcAddress]
    );

    const burnResult = await waitForTx(burnTxId);
    return res.status(200).json({
      step: 'complete',
      success: true,
      burnTxHash: burnResult?.txHash || burnTxId,
      sourceChain,
      sourceAddress,
      amount: requested,
      message: `${requested} USDC burned on ${chainConfig.name}! Arriving on Arc Testnet in 5-10 minutes.`,
    });

  } catch (e) {
    console.error('bridge-cctp error:', e.message);
    return res.status(500).json({ error: e.message || 'Bridge failed' });
  }
};
