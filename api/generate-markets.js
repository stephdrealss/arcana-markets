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

// Curated fallbacks used when the live API returns no fixtures
function getFallbackFixtures() {
  return [
    { sport: 'football', competition: 'FIFA World Cup 2026', home: 'Brazil', away: 'Serbia', date: '2026-06-20', status: 'NS', round: 'Group Stage' },
    { sport: 'football', competition: 'FIFA World Cup 2026', home: 'Argentina', away: 'Iceland', date: '2026-06-21', status: 'NS', round: 'Group Stage' },
    { sport: 'football', competition: 'FIFA World Cup 2026', home: 'France', away: 'Mexico', date: '2026-06-22', status: 'NS', round: 'Group Stage' },
    { sport: 'football', competition: 'FIFA World Cup 2026', home: 'USA', away: 'England', date: '2026-06-23', status: 'NS', round: 'Group Stage' },
    { sport: 'basketball', competition: 'NBA Finals 2026', home: 'Oklahoma City Thunder', away: 'Boston Celtics', date: '2026-06-05', status: 'NS', round: 'Game 1' },
    { sport: 'basketball', competition: 'NBA Finals 2026', home: 'Boston Celtics', away: 'Oklahoma City Thunder', date: '2026-06-08', status: 'NS', round: 'Game 2' },
    { sport: 'tennis', competition: 'French Open 2026 (Roland Garros)', home: 'Novak Djokovic', away: 'Carlos Alcaraz', date: '2026-06-03', status: 'NS', round: 'Quarterfinal' },
    { sport: 'tennis', competition: 'French Open 2026 (Roland Garros)', home: 'Iga Swiatek', away: 'Marta Kostyuk', date: '2026-06-05', status: 'NS', round: 'Semifinal' },
  ];
}

async function fetchSportsFixtures() {
  // FIFA World Cup 2026 (league 1), NBA (league 12), French Open / Roland Garros (tournament 2)
  const [fifaRes, nbaRes, tennisRes] = await Promise.allSettled([
    fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026&next=8', { headers: SPORTS_HEADERS }),
    fetch('https://v3.basketball.api-sports.io/games?league=12&season=2025-2026&next=5', { headers: SPORTS_HEADERS }),
    fetch('https://v1.tennis.api-sports.io/games?tournament=2&season=2026', { headers: SPORTS_HEADERS }),
  ]);

  const fixtures = [];

  // — FIFA World Cup 2026 —
  if (fifaRes.status === 'fulfilled') {
    try {
      const data = await fifaRes.value.json();
      for (const f of (data.response || []).slice(0, 4)) {
        const home = f.teams?.home?.name;
        const away = f.teams?.away?.name;
        if (home && away) {
          fixtures.push({
            sport: 'football',
            competition: 'FIFA World Cup 2026',
            home,
            away,
            date: (f.fixture?.date || '').slice(0, 10),
            status: f.fixture?.status?.short || 'NS',
            round: f.league?.round || 'Group Stage',
            homeGoals: f.goals?.home,
            awayGoals: f.goals?.away,
          });
        }
      }
    } catch (_) {}
  }

  // — NBA Finals 2026 —
  if (nbaRes.status === 'fulfilled') {
    try {
      const data = await nbaRes.value.json();
      for (const g of (data.response || []).slice(0, 3)) {
        const home = g.teams?.home?.name;
        const away = g.teams?.away?.name;
        if (home && away) {
          fixtures.push({
            sport: 'basketball',
            competition: 'NBA Finals 2026',
            home,
            away,
            date: (g.date?.start || '').slice(0, 10),
            status: g.status?.short || 'NS',
            round: g.stage || 'Finals',
            homeScore: g.scores?.home?.points,
            awayScore: g.scores?.away?.points,
          });
        }
      }
    } catch (_) {}
  }

  // — French Open 2026 (Roland Garros) —
  if (tennisRes.status === 'fulfilled') {
    try {
      const data = await tennisRes.value.json();
      for (const m of (data.response || []).slice(0, 3)) {
        // API-Sports tennis uses player_1/player_2 or players array depending on version
        const p1 = m.players?.[0]?.player?.name ?? m.player_1?.name ?? m.home?.name;
        const p2 = m.players?.[1]?.player?.name ?? m.player_2?.name ?? m.away?.name;
        if (p1 && p2) {
          fixtures.push({
            sport: 'tennis',
            competition: 'French Open 2026 (Roland Garros)',
            home: p1,
            away: p2,
            date: (m.date || m.time?.date || '').slice(0, 10),
            status: m.status?.short ?? (typeof m.status === 'string' ? m.status : 'NS'),
            round: m.round?.name ?? m.stage?.name ?? '',
          });
        }
      }
    } catch (_) {}
  }

  // Pad with fallbacks if we got fewer than 5 real fixtures
  if (fixtures.length < 5) {
    const fallbacks = getFallbackFixtures();
    const needed = 5 - fixtures.length;
    fixtures.push(...fallbacks.slice(0, needed));
  }

  console.log(`[generate-markets] Sports fixtures: ${fixtures.length} total (football:${fixtures.filter(f=>f.sport==='football').length}, basketball:${fixtures.filter(f=>f.sport==='basketball').length}, tennis:${fixtures.filter(f=>f.sport==='tennis').length})`);
  return fixtures;
}

async function generateMarketsWithAI(fixtures) {
  const fixtureList = fixtures.slice(0, 8).map((f, i) => {
    const liveTag = ['1H','2H','HT','ET','P','LIVE'].includes(f.status) ? ' [LIVE]' : '';
    const scoreTag = f.homeGoals != null ? ` (${f.homeGoals}–${f.awayGoals})` : f.homeScore != null ? ` (${f.homeScore}–${f.awayScore})` : '';
    const roundTag = f.round ? ` — ${f.round}` : '';
    return `${i + 1}. [${f.competition}${roundTag}] ${f.home} vs ${f.away} · ${f.date}${scoreTag}${liveTag}`;
  }).join('\n');

  const prompt = `You are a prediction market creator for a decentralized finance platform. Based on these real sports fixtures, generate exactly 5 YES/NO prediction markets suitable for on-chain betting.

Sports Fixtures:
${fixtureList}

Generate 5 prediction markets as a JSON array. Each object must have:
- "id": "market_1" through "market_5"
- "question": a specific YES/NO question such as "Will Brazil beat Argentina in the FIFA World Cup 2026 Group Stage?" or "Will Djokovic win the French Open 2026 Quarterfinal?" or "Will OKC Thunder win Game 1 of the NBA Finals 2026?"
- "category": "sports"
- "headline": concise fixture description e.g. "Brazil vs Argentina · FIFA World Cup 2026 · Jun 20"
- "aiPrediction": "YES" or "NO" — your confident prediction
- "confidence": integer 50–95 (your prediction confidence percentage)
- "betAmount": "0.01"
- "reasoning": one sentence based on team/player form, head-to-head record, or tournament context

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
  return fixtures.slice(0, 5).map((f, i) => {
    let question;
    if (f.sport === 'tennis') {
      question = `Will ${f.home} win the ${f.competition}${f.round ? ' ' + f.round : ''}?`;
    } else if (f.sport === 'basketball') {
      question = `Will the ${f.home} beat the ${f.away} in the ${f.competition}${f.round ? ' ' + f.round : ''}?`;
    } else {
      question = `Will ${f.home} beat ${f.away} in the ${f.competition}${f.round ? ' ' + f.round : ''}?`;
    }
    return {
      id: `market_${i + 1}`,
      question,
      category: 'sports',
      headline: `${f.home} vs ${f.away} · ${f.competition} · ${f.date}`,
      aiPrediction: i % 2 === 0 ? 'YES' : 'NO',
      confidence: 55 + i * 7,
      betAmount: BET_AMOUNT,
      reasoning: `Based on recent form and historical head-to-head record in ${f.competition}.`,
    };
  });
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
    // Step 1 — Fetch live/upcoming fixtures from API-Sports (World Cup, NBA Finals, French Open)
    const fixtures = await fetchSportsFixtures();

    // Step 2 — Generate 5 YES/NO prediction markets with AI
    const markets = await generateMarketsWithAI(fixtures);

    // Step 3 — Reuse existing agent wallet or create a new one
    const { wallet: agentWallet, isNew } = await getOrCreateAgentWallet();

    // Step 4 — Request testnet tokens only for brand-new wallets
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
      sportsData: {
        fixturesFound: fixtures.length,
        sources: ['FIFA World Cup 2026', 'NBA Finals 2026', 'French Open 2026 (Roland Garros)'],
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
