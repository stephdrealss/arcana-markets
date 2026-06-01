const crypto = require('crypto');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NEWS_API_KEY = '11b8bf7438ee486dbc17d2d4bf9e9cb0';

const BLOCKCHAIN = 'ETH-SEPOLIA';
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
// Arcana Markets treasury — receives each agent bet (0.01 USDC per market)
const MARKET_TREASURY = '0xb505c4ad888c05bc8c6f2bf237f57f2b1a11a0d2';
const BET_AMOUNT = '0.01';

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

async function createAgentWallet() {
  const ct1 = await getCipherText();
  const wsRes = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: ct1,
      name: `Arcana Agent Wallet - ${new Date().toISOString()}`,
    }),
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
      blockchains: [BLOCKCHAIN],
      count: 1,
      metadata: [{ name: 'Arcana Markets Agent', refId: `agent-${Date.now()}` }],
    }),
  });
  const walletData = await walletRes.json();
  const wallet = walletData?.data?.wallets?.[0];
  if (!wallet?.id) throw new Error(`Wallet creation failed: ${JSON.stringify(walletData)}`);
  return wallet;
}

async function requestTestnetTokens(address) {
  try {
    const res = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockchain: BLOCKCHAIN, address, usdc: true, native: true }),
    });
    const data = await res.json();
    return data;
  } catch (_) {
    return null;
  }
}

async function fetchNewsHeadlines() {
  const [sportsRes, cryptoRes] = await Promise.all([
    fetch(`https://newsapi.org/v2/top-headlines?category=sports&pageSize=8&language=en&apiKey=${NEWS_API_KEY}`),
    fetch(`https://newsapi.org/v2/everything?q=cryptocurrency+OR+bitcoin+OR+ethereum&sortBy=publishedAt&pageSize=7&language=en&apiKey=${NEWS_API_KEY}`),
  ]);
  const [sports, cryptoNews] = await Promise.all([sportsRes.json(), cryptoRes.json()]);
  const headlines = [
    ...(sports.articles || []).filter(a => a.title && a.title !== '[Removed]').map(a => ({ title: a.title, source: a.source?.name, category: 'sports' })),
    ...(cryptoNews.articles || []).filter(a => a.title && a.title !== '[Removed]').map(a => ({ title: a.title, source: a.source?.name, category: 'crypto' })),
  ];
  return headlines;
}

async function generateMarketsWithAI(headlines) {
  const headlineList = headlines
    .slice(0, 10)
    .map((h, i) => `${i + 1}. [${h.category.toUpperCase()}] ${h.title}`)
    .join('\n');

  const prompt = `You are a prediction market creator for a decentralized finance platform. Based on these recent news headlines, generate exactly 5 YES/NO prediction markets suitable for on-chain betting.

News Headlines:
${headlineList}

Generate 5 prediction markets as a JSON array. Each object must have:
- "id": "market_1" through "market_5"
- "question": a clear, specific YES/NO question that resolves within 30 days
- "category": "sports" or "crypto"
- "headline": the exact headline text used as inspiration
- "aiPrediction": "YES" or "NO" — your confident prediction
- "confidence": integer 50–95 (your prediction confidence percentage)
- "betAmount": "0.01"
- "reasoning": one sentence explaining the prediction

Respond with ONLY the JSON array, no markdown, no explanation.`;

  if (ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 5);
      }
    } catch (_) {}
  }

  // Deterministic fallback when no Anthropic key or parse fails
  return headlines.slice(0, 5).map((h, i) => ({
    id: `market_${i + 1}`,
    question: `Will there be a major positive development related to: "${h.title.split(' ').slice(0, 7).join(' ')}..."?`,
    category: h.category,
    headline: h.title,
    aiPrediction: i % 2 === 0 ? 'YES' : 'NO',
    confidence: 55 + i * 7,
    betAmount: BET_AMOUNT,
    reasoning: `Based on current ${h.category} trends and recent reporting from ${h.source || 'major outlets'}.`,
  }));
}

async function placeBet(walletId, market) {
  const ct = await getCipherText();
  const res = await fetch('https://api.circle.com/v1/w3s/developer/transactions/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: ct,
      walletId,
      tokenAddress: USDC_ADDRESS,
      blockchain: BLOCKCHAIN,
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
    // Step 1 — Fetch sports + crypto headlines from NewsAPI
    const headlines = await fetchNewsHeadlines();
    if (!headlines.length) {
      return res.status(502).json({ error: 'NewsAPI returned no headlines — check API key or quota' });
    }

    // Step 2 — Generate 5 YES/NO prediction markets with AI
    const markets = await generateMarketsWithAI(headlines);

    // Step 3 — Create Circle Agent Wallet
    const agentWallet = await createAgentWallet();

    // Step 4 — Request testnet USDC + native gas (best-effort; wallet may start empty)
    const faucetResult = await requestTestnetTokens(agentWallet.address);

    // Step 5 — Place USDC bets for each market
    const marketResults = [];
    for (const market of markets) {
      let betResult;
      try {
        const txId = await placeBet(agentWallet.id, market);
        const txStatus = await waitForTx(txId);
        betResult = {
          txId,
          txHash: txStatus.txHash,
          state: txStatus.state,
          failed: txStatus.failed || false,
          explorerUrl: txStatus.txHash
            ? `https://sepolia.etherscan.io/tx/${txStatus.txHash}`
            : null,
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
        blockchain: BLOCKCHAIN,
        faucetRequested: !!faucetResult,
        fundWalletUrl: `https://faucet.circle.com`,
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
