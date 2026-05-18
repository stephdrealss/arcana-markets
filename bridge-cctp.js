const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

// CCTP Domain IDs
const CHAIN_CONFIG = {
  'ETH-SEPOLIA': { domain: 0, blockchain: 'ETH-SEPOLIA', name: 'Ethereum Sepolia' },
  'BASE-SEPOLIA': { domain: 6, blockchain: 'BASE-SEPOLIA', name: 'Base Sepolia' },
  'ARB-SEPOLIA': { domain: 3, blockchain: 'ARB-SEPOLIA', name: 'Arbitrum Sepolia' },
  'AVAX-FUJI': { domain: 1, blockchain: 'AVAX-FUJI', name: 'Avalanche Fuji' },
};

const ARC_DOMAIN = 26;
const ARC_BLOCKCHAIN = 'ARC-TESTNET';

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

async function getOrCreateWallet(userId, blockchain) {
  // Check existing wallets on this blockchain
  const res = await fetch(
    `https://api.circle.com/v1/w3s/wallets?refId=${encodeURIComponent(userId)}&blockchain=${blockchain}&pageSize=10`,
    { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
  );
  const data = await res.json();
  const existing = data?.data?.wallets?.[0];
  if (existing?.address) return existing;

  // Create new wallet on this blockchain
  const cipherText1 = await getEntitySecretCipherText();
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

  const cipherText2 = await getEntitySecretCipherText();
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

async function executeCircleTx(walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const cipherText = await getEntitySecretCipherText();
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

async function waitForTx(txId, maxWait = 60000) {
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

async function pollAttestation(txHash, sourceDomain, maxWait = 120000) {
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
      if (ready) return { message: ready.message, attestation: ready.attestation };
    } catch {}
  }
  throw new Error('Attestation timed out — USDC will arrive on Arc shortly');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, arcWalletId, sourceChain, amount } = req.body;
  if (!userId || !arcWalletId || !sourceChain || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const chainConfig = CHAIN_CONFIG[sourceChain];
  if (!chainConfig) {
    return res.status(400).json({ error: 'Unsupported source chain' });
  }

  try {
    // Step 1 — Get or create source chain wallet
    const sourceWallet = await getOrCreateWallet(userId, chainConfig.blockchain);
    const sourceWalletId = sourceWallet.id;
    const sourceAddress = sourceWallet.address;

    // Step 2 — Check USDC balance on source chain
    const balRes = await fetch(
      `https://api.circle.com/v1/w3s/wallets/${sourceWalletId}/balances`,
      { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
    );
    const balData = await balRes.json();
    const balances = balData?.data?.tokenBalances || [];
    const usdcBalance = balances.find(b => b.token?.symbol === 'USDC');
    const availableBalance = parseFloat(usdcBalance?.amount || '0');
    const requestedAmount = parseFloat(amount);

    if (availableBalance < requestedAmount) {
      return res.status(200).json({
        step: 'fund_required',
        sourceAddress,
        sourceChain,
        availableBalance,
        requestedAmount,
        message: `Fund your ${chainConfig.name} wallet with USDC first`,
        faucetUrl: 'https://faucet.circle.com'
      });
    }

    // CCTP TokenMessengerV2 address (same on all testnets)
    const TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
    const USDC_AMOUNT = String(Math.round(requestedAmount * 1e6));

    // Get Arc wallet address for minting destination
    const arcWalletRes = await fetch(
      `https://api.circle.com/v1/w3s/wallets/${arcWalletId}`,
      { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
    );
    const arcWalletData = await arcWalletRes.json();
    const arcAddress = arcWalletData?.data?.wallet?.address;
    if (!arcAddress) throw new Error('Could not get Arc wallet address');

    // Pad Arc address to bytes32 for CCTP
    const mintRecipient = '0x' + arcAddress.slice(2).padStart(64, '0');

    // Step 3 — Approve USDC spend on source chain
    const USDC_ADDRESSES = {
      'ETH-SEPOLIA': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      'ARB-SEPOLIA': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      'AVAX-FUJI': '0x5425890298aed601595a70AB815c96711a31Bc65',
    };
    const usdcAddress = USDC_ADDRESSES[sourceChain];

    const approveTxId = await executeCircleTx(
      sourceWalletId,
      usdcAddress,
      'approve(address,uint256)',
      [TOKEN_MESSENGER, USDC_AMOUNT]
    );
    await waitForTx(approveTxId);

    // Step 4 — Burn USDC via CCTP depositForBurn
    const burnTxId = await executeCircleTx(
      sourceWalletId,
      TOKEN_MESSENGER,
      'depositForBurn(uint256,uint32,bytes32,address,bytes,uint256,uint256)',
      [USDC_AMOUNT, String(ARC_DOMAIN), mintRecipient, usdcAddress, '0x', '0', '0']
    );
    const burnResult = await waitForTx(burnTxId);
    const burnTxHash = burnResult.txHash;

    // Step 5 — Poll for attestation
    let attestationResult = null;
    try {
      attestationResult = await pollAttestation(burnTxHash, chainConfig.domain);
    } catch (e) {
      // Attestation takes time — return burn hash so user knows it's in progress
      return res.status(200).json({
        step: 'pending_attestation',
        burnTxHash,
        sourceChain,
        amount: requestedAmount,
        message: 'USDC burned on source chain. Waiting for Circle attestation — USDC will arrive on Arc Testnet within 5-10 minutes.',
      });
    }

    return res.status(200).json({
      step: 'complete',
      burnTxHash,
      sourceChain,
      amount: requestedAmount,
      message: `${requestedAmount} USDC bridged to Arc Testnet successfully!`,
      attestation: attestationResult?.attestation,
    });

  } catch (e) {
    console.error('bridge-cctp error:', e.message);
    return res.status(500).json({ error: e.message || 'Bridge failed' });
  }
};
