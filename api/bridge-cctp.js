const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const { BridgeKit } = require('@circle-fin/bridge-kit');
const { CircleWalletsAdapter } = require('@circle-fin/adapter-circle-wallets');
const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const CHAIN_CONFIG = {
  'ETH-SEPOLIA': { blockchain: 'ETH-SEPOLIA', bridgeChain: 'Ethereum_Sepolia', name: 'Ethereum Sepolia' },
  'BASE-SEPOLIA': { blockchain: 'BASE-SEPOLIA', bridgeChain: 'Base_Sepolia', name: 'Base Sepolia' },
  'AVAX-FUJI': { blockchain: 'AVAX-FUJI', bridgeChain: 'Avalanche_Fuji', name: 'Avalanche Fuji' },
};

async function getOrCreateSourceWallet(client, userId, blockchain) {
  // Check for existing wallet on this blockchain
  const existing = await client.listWallets({
    refId: userId,
    blockchain,
    pageSize: 10,
  });
  const wallet = existing?.data?.wallets?.[0];
  if (wallet?.address) return wallet;

  // Create wallet set
  const wsRes = await client.createWalletSet({
    idempotencyKey: crypto.randomUUID(),
    name: `Arcana Bridge - ${blockchain}`,
  });
  const walletSetId = wsRes?.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set');

  // Create wallet
  const walletRes = await client.createWallets({
    idempotencyKey: crypto.randomUUID(),
    walletSetId,
    blockchains: [blockchain],
    count: 1,
    metadata: [{ name: `Arcana-Bridge-${blockchain}`, refId: userId }],
  });
  const newWallet = walletRes?.data?.wallets?.[0];
  if (!newWallet?.address) throw new Error('Failed to create wallet');
  return newWallet;
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
  if (!chainConfig) {
    return res.status(400).json({ error: 'Unsupported source chain' });
  }

  try {
    // Initialize Circle client
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
      entitySecret: ENTITY_SECRET,
    });

    // Get or create source chain wallet
    const sourceWallet = await getOrCreateSourceWallet(client, userId, chainConfig.blockchain);
    const sourceWalletId = sourceWallet.id;
    const sourceAddress = sourceWallet.address;

    // Check USDC balance on source chain
    const balRes = await client.getWalletTokenBalance({ id: sourceWalletId });
    const balances = balRes?.data?.tokenBalances || [];
    const usdcBalance = balances.find(b => b.token?.symbol === 'USDC');
    const available = parseFloat(usdcBalance?.amount || '0');
    const requested = parseFloat(amount);

    // If insufficient balance, return wallet address for funding
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

    // Initialize Bridge Kit with Circle Wallets adapter
    const adapter = new CircleWalletsAdapter({
      apiKey: CIRCLE_API_KEY,
      entitySecret: ENTITY_SECRET,
    });

    const kit = new BridgeKit({ adapter });

    // Execute real CCTP bridge
    const result = await kit.bridge({
      from: {
        chain: chainConfig.bridgeChain,
        address: sourceAddress,
        walletId: sourceWalletId,
      },
      to: {
        chain: 'Arc_Testnet',
        address: arcAddress,
        walletId: arcWalletId,
      },
      amount: String(requested),
    });

    return res.status(200).json({
      step: 'complete',
      success: true,
      sourceChain,
      amount: requested,
      sourceAddress,
      txHash: result?.steps?.find(s => s.name === 'burn')?.txHash || '',
      message: `${requested} USDC bridged from ${chainConfig.name} to Arc Testnet successfully!`,
      result,
    });

  } catch (e) {
    console.error('bridge-cctp error:', e.message);
    return res.status(500).json({ error: e.message || 'Bridge failed' });
  }
};
