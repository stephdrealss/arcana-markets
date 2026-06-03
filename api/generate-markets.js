const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CIRCLE_AGENT_WALLET_ID = process.env.CIRCLE_AGENT_WALLET_ID;
// Hardcoded fallback so the key works even before the env var is deployed
const SPORTS_API_KEY = process.env.SPORTS_API_KEY || '40d401329899ef48045c6660a77573f9';

const DEFAULT_BLOCKCHAIN = 'MATIC-AMOY';
const MARKET_TREASURY = '0xb505c4ad888c05bc8c6f2bf237f57f2b1a11a0d2';
const BET_AMOUNT = '0.01';

const USDC_BY_CHAIN = {
  'ETH-SEPOLIA':  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'MATIC-AMOY':   '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  'AVAX-FUJI':    '0x5425890298aed601595a70AB815c96711a31Bc65',
  'ARB-SEPOLIA':  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'OP-SEPOLIA':   '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  'ARC-TESTNET':  '0x3600000000000000000000000000000000000000',
};

const EXPLORER_BY_CHAIN = {
  'ETH-SEPOLIA':  'https://sepolia.etherscan.io/tx',
  'BASE-SEPOLIA': 'https://sepolia.basescan.org/tx',
  'MATIC-AMOY':   'https://amoy.polygonscan.com/tx',
  'AVAX-FUJI':    'https://testnet.snowtrace.io/tx',
  'ARB-SEPOLIA':  'https://sepolia.arbiscan.io/tx',
  'OP-SEPOLIA':   'https://sepolia-optimism.etherscan.io/tx',
  'ARC-TESTNET':  'https://testnet.arcscan.app/tx',
};

const SPORTS_HEADERS = { 'x-apisports-key': SPORTS_API_KEY };

function getHardcodedMarkets() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  const endDateStr = endDate.toISOString().split('T')[0];

  return [
    {
      id: 'market_1',
      question: 'Will England win the FIFA World Cup 2026?',
      category: 'sports',
      headline: 'England · FIFA World Cup 2026',
      aiPrediction: 'NO',
      confidence: 72,
      betAmount: BET_AMOUNT,
      reasoning: 'England have strong contenders but historically struggle in major tournaments despite recent form improvements.',
      endDate: endDateStr,
    },
    {
      id: 'market_2',
      question: 'Will Brazil beat Argentina in the FIFA World Cup 2026?',
      category: 'sports',
      headline: 'Brazil vs Argentina · FIFA World Cup 2026',
      aiPrediction: 'YES',
      confidence: 58,
      betAmount: BET_AMOUNT,
      reasoning: 'Brazil have historically dominated head-to-head matchups with Argentina in World Cup play.',
      endDate: endDateStr,
    },
    {
      id: 'market_3',
      question: 'Will France reach the FIFA World Cup 2026 final?',
      category: 'sports',
      headline: 'France · FIFA World Cup 2026',
      aiPrediction: 'YES',
      confidence: 65,
      betAmount: BET_AMOUNT,
      reasoning: 'France are among the top favourites with a star-studded squad and recent World Cup experience.',
      endDate: endDateStr,
    },
    {
      id: 'market_4',
      question: 'Will Manchester City win the FIFA Club World Cup 2026?',
      category: 'sports',
      headline: 'Manchester City · FIFA Club World Cup 2026 (starts Jun 15)',
      aiPrediction: 'YES',
      confidence: 60,
      betAmount: BET_AMOUNT,
      reasoning: 'Man City enter as one of the strongest European clubs with a deep and balanced squad.',
      endDate: endDateStr,
    },
    {
      id: 'market_5',
      question: 'Will Real Madrid beat Chelsea in the FIFA Club World Cup 2026?',
      category: 'sports',
      headline: 'Real Madrid vs Chelsea · FIFA Club World Cup 2026 (starts Jun 15)',
      aiPrediction: 'YES',
      confidence: 68,
      betAmount: BET_AMOUNT,
      reasoning: 'Real Madrid have superior Champions League pedigree and tournament experience over Chelsea.',
      endDate: endDateStr,
    },
    {
      id: 'market_6',
      question: 'Will Bitcoin hit $150,000 before ' + endDateStr + '?',
      category: 'crypto',
      headline: 'Bitcoin · $150K Target',
      aiPrediction: 'YES',
      confidence: 55,
      betAmount: BET_AMOUNT,
      reasoning: 'Bitcoin is trading well above previous cycle highs with strong institutional demand driving momentum.',
      endDate: endDateStr,
    },
    {
      id: 'market_7',
      question: 'Will Ethereum reach $10,000 before ' + endDateStr + '?',
      category: 'crypto',
      headline: 'Ethereum · $10K Target',
      aiPrediction: 'NO',
      confidence: 62,
      betAmount: BET_AMOUNT,
      reasoning: 'ETH faces headwinds from competing L1s and the $10K target would require a significant supply-side shift.',
      endDate: endDateStr,
    },
  ];
}

async function getCipherText() {
  const res = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const data = await res.json();
  const encrypted = crypto.publicEncrypt(
    { key: data.data.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(ENTITY_SECRET, 'hex')
  );
  return encrypted.toString('base64');
}

async function getOrCreateAgentWallet() {
  if (CIRCLE_AGENT_WALLET_ID) {
    const res = await fetch(`https://api.circle.com/v1/w3s/wallets/${CIRCLE_AGENT_WALLET_ID}`, {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
    });
    const data = await res.json();
    const wallet = data?.data?.wallet;
    if (!wallet?.id) throw new Error(`Could not fetch wallet ${CIRCLE_AGENT_WALLET_ID}: ${JSON.stringify(data)}`);
    return { wallet, isNew: false };
  }

  const ct1 = await getCipherText();
  const wsRes = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct1, name: 'Arcana Markets Agent' }),
  });
  const wsData = await wsRes.json();
  const walletSetId = wsData?.data?.walletSet?.id;
  if (!walletSetId) throw new Error(`Wallet set creation failed: ${JSON.stringify(wsData)}`);

  const ct2 = await getCipherText();
  const walletRes = await fetch('https://api.circle.com/v1/w3s/developer/wallets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: ct2,
      walletSetId,
      blockchains: [DEFAULT_BLOCKCHAIN],
      count: 1,
      metadata: [{ name: 'Arcana Markets Agent', refId: 'arcana-agent' }],
    }),
  });
  const walletData = await walletRes.json();
  const wallet = walletData?.data?.wallets?.[0];
  if (!wallet?.id) throw new Error(`Wallet creation failed: ${JSON.stringify(walletData)}`);

  console.log(`[generate-markets] New agent wallet created — save this ID as CIRCLE_AGENT_WALLET_ID=${wallet.id}`);
  return { wallet, isNew: true };
}

async function requestTestnetTokens(address) {
  try {
    const res = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockchain: DEFAULT_BLOCKCHAIN, address, usdc: true, native: true }),
    });
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function placeBet(walletId, blockchain, market) {
  const usdcAddress = USDC_BY_CHAIN[blockchain];
  if (!usdcAddress) throw new Error(`No USDC address known for chain ${blockchain}`);
  const ct = await getCipherText();
  const res = await fetch('https://api.circle.com/v1/w3s/developer/transactions/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: ct,
      walletId,
      tokenAddress: usdcAddress,
      blockchain,
      destinationAddress: MARKET_TREASURY,
      amounts: [market.betAmount],
      feeLevel: 'LOW',
      refId: `bet-${market.id}-${market.aiPrediction}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return data?.data?.id;
}

async function waitForTx(txId, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
    });
    const data = await res.json();
    const tx = data?.data?.transaction;
    if (tx?.state === 'COMPLETE') return { state: 'COMPLETE', txHash: tx.txHash };
    if (['FAILED', 'CANCELLED', 'DENIED'].includes(tx?.state)) {
      return { state: tx.state, txHash: tx.txHash, failed: true };
    }
  }
  return { state: 'PENDING', txHash: null };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!CIRCLE_API_KEY || !ENTITY_SECRET) {
    return res.status(500).json({ error: 'CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET env vars are required' });
  }

  try {
    // Step 1 — Build curated markets (FIFA WC 2026, Club WC 2026, Crypto)
    const markets = getHardcodedMarkets();

    // Step 2 — Reuse existing agent wallet or create a new one
    const { wallet: agentWallet, isNew } = await getOrCreateAgentWallet();

    // Step 3 — Request testnet tokens only for brand-new wallets
    const faucetResult = isNew ? await requestTestnetTokens(agentWallet.address) : null;

    const walletBlockchain = agentWallet.blockchain || DEFAULT_BLOCKCHAIN;
    const explorerBase = EXPLORER_BY_CHAIN[walletBlockchain] || 'https://amoy.polygonscan.com/tx';

    // Step 5 — Place USDC bets for each market
    const marketResults = [];
    for (const market of markets) {
      let betResult;
      try {
        const txId = await placeBet(agentWallet.id, walletBlockchain, market);
        const txStatus = await waitForTx(txId);
        betResult = {
          txId,
          txHash: txStatus.txHash,
          state: txStatus.state,
          failed: txStatus.failed || false,
          explorerUrl: txStatus.txHash ? `${explorerBase}/${txStatus.txHash}` : null,
        };
      } catch (e) {
        betResult = { error: e.message, state: 'ERROR', failed: true };
      }
      marketResults.push({ ...market, bet: betResult });
    }

    return res.status(200).json({
      success: true,
      agentWallet: {
        id: agentWallet.id,
        address: agentWallet.address,
        blockchain: walletBlockchain,
        isNew,
        faucetRequested: !!faucetResult,
        fundWalletUrl: 'https://faucet.circle.com',
      },
      marketsData: {
        marketsGenerated: marketResults.length,
        sources: ['FIFA World Cup 2026', 'FIFA Club World Cup 2026', 'Crypto'],
        endDate: markets[0]?.endDate || null,
      },
      markets: marketResults,
      summary: {
        total: marketResults.length,
        betsPlaced: marketResults.filter(m => m.bet?.state === 'COMPLETE').length,
        betsPending: marketResults.filter(m => m.bet?.state === 'PENDING').length,
        betsFailed: marketResults.filter(m => m.bet?.failed).length,
        totalUsdcBet: `${(marketResults.length * parseFloat(BET_AMOUNT)).toFixed(2)} USDC`,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('generate-markets error:', e.message);
    return res.status(500).json({ error: e.message || 'Market generation failed' });
  }
};
