const { createCircleWalletsAdapter } = require('@circle-fin/adapter-circle-wallets');
const { AppKit } = require('@circle-fin/app-kit');
const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const CHAIN_CONFIG = {
  'ETH-SEPOLIA': { blockchain: 'ETH-SEPOLIA', bridgeChain: 'Ethereum_Sepolia', name: 'Ethereum Sepolia' },
  'BASE-SEPOLIA': { blockchain: 'BASE-SEPOLIA', bridgeChain: 'Base_Sepolia', name: 'Base Sepolia' },
  'AVAX-FUJI': { blockchain: 'AVAX-FUJI', bridgeChain: 'Avalanche_Fuji', name: 'Avalanche Fuji' },
};

async function getOrCreateWallet(userId, blockchain) {
  const res = await fetch(
    `https://api.circle.com/v1/w3s/wallets?refId=${encodeURIComponent(userId)}&blockchain=${blockchain}&pageSize=10`,
    { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
  );
  const data = await res.json();
  const existing = data?.data?.wallets?.[0];
  if (existing?.address) return existing;

  // Create entity secret ciphertext
  const pkRes = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
  });
  const pkData = await pkRes.json();
  const publicKey = pkData.data.publicKey;
  const crypto2 = require('crypto');
  const encrypted = crypto2.publicEncrypt(
    { key: publicKey, padding: crypto2.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(ENTITY_SECRET, 'hex')
  );
  const cipherText1 = encrypted.toString('base64');

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
  if (!walletSetId) throw new Error('Failed to create wallet set');

  const pkRes2 = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
  });
  const pkData2 = await pkRes2.json();
  const encrypted2 = crypto2.publicEncrypt(
    { key: pkData2.data.publicKey, padding: crypto2.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(ENTITY_SECRET, 'hex')
  );
  const cipherText2 = encrypted2.toString('base64');

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
  if (!wallet?.address) throw new Error('Failed to create wallet');
  return wallet;
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
    // Get or create source chain wallet
    const sourceWallet = await getOrCreateWallet(userId, chainConfig.blockchain);
    const sourceWalletId = sourceWallet.id;
    const sourceAddress = sourceWallet.address;

    // Check balance
    const balRes = await fetch(
      `https://api.circle.com/v1/w3s/wallets/${sourceWalletId}/balances`,
      { headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` } }
    );
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

    // Use Circle's official App Kit with Circle Wallets adapter
    const adapter = createCircleWalletsAdapter({
      apiKey: CIRCLE_API_KEY,
      entitySecret: ENTITY_SECRET,
    });

    const kit = new AppKit();

    const result = await kit.bridge({
      from: {
        adapter,
        chain: chainConfig.bridgeChain,
        address: sourceAddress,
      },
      to: {
        adapter,
        chain: 'Arc_Testnet',
        address: arcAddress,
      },
      amount: String(requested),
    });

    const burnStep = result?.steps?.find(s => s.name === 'burn');
    const mintStep = result?.steps?.find(s => s.name === 'mint');

    return res.status(200).json({
      step: 'complete',
      success: true,
      sourceChain,
      amount: requested,
      sourceAddress,
      burnTxHash: burnStep?.txHash || '',
      mintTxHash: mintStep?.txHash || '',
      burnExplorerUrl: burnStep?.explorerUrl || '',
      mintExplorerUrl: mintStep?.explorerUrl || '',
      message: `${requested} USDC bridged from ${chainConfig.name} to Arc Testnet!`,
      result,
    });

  } catch (e) {
    console.error('bridge-cctp error:', e.message);
    return res.status(500).json({ error: e.message || 'Bridge failed' });
  }
};
