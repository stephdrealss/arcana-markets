// POST /api/create-wc-markets-today
// Fetches today's FIFA World Cup 2026 fixtures from API-Sports and creates
// a prediction market for each one on the ArcanaMarkets contract.
//
// Required Vercel env vars:
//   ADMIN_PRIVATE_KEY   — private key of a contract admin
//   SPORTS_API_KEY      — API-Sports key (has hardcoded fallback)

const { ethers } = require('ethers');

const RPC              = 'https://rpc.testnet.arc.network';
const CONTRACT_ADDRESS = '0x443a47eF1025e047879b1BA08c94e6dedB354D54';
const WC_LEAGUE_ID     = 1;
const SPORTS_API_KEY   = process.env.SPORTS_API_KEY || '40d401329899ef48045c6660a77573f9';

const ABI = [
  'function createMarket(string memory _title, string memory _category, uint256 _endTime) external',
  'function marketCount() external view returns (uint256)',
];

async function fetchTodayWCFixtures() {
  const today = new Date().toISOString().slice(0, 10);
  const url   = `https://v3.football.api-sports.io/fixtures?date=${today}`;
  const res   = await fetch(url, { headers: { 'x-apisports-key': SPORTS_API_KEY } });
  const data  = await res.json();
  if (!res.ok) throw new Error(`API-Sports ${res.status}: ${JSON.stringify(data)}`);
  return (data.response || []).filter((f) => f.league.id === WC_LEAGUE_ID);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    return res.status(500).json({
      error: 'ADMIN_PRIVATE_KEY env var not set. Add the private key for one of the contract admins:\n  0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9\n  0x89f9EAeF8CfF2fAfE0664b5944AD3197A74588Bf',
    });
  }

  try {
    const fixtures = await fetchTodayWCFixtures();
    if (fixtures.length === 0) {
      return res.status(200).json({ success: true, message: 'No World Cup fixtures today.', markets: [] });
    }

    const provider   = new ethers.providers.JsonRpcProvider(RPC);
    const wallet     = new ethers.Wallet(pk, provider);
    const contract   = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    const startCount = Number(await contract.marketCount());
    const nowSec     = Math.floor(Date.now() / 1000);

    const results = [];
    for (const f of fixtures) {
      const home    = f.teams.home.name;
      const away    = f.teams.away.name;
      const round   = f.league.round;
      const kickoff = Math.floor(new Date(f.fixture.date).getTime() / 1000);
      // End time = kick-off; fallback +1h for matches already underway
      const endTime = kickoff > nowSec ? kickoff : nowSec + 3600;
      const title   = `Will ${home} beat ${away}? FIFA World Cup 2026 – ${round}`;

      try {
        const tx      = await contract.createMarket(title, 'Sports', endTime, { gasLimit: 400000 });
        const receipt = await tx.wait();
        results.push({ title, txHash: tx.hash, ok: receipt.status === 1, endTime });
      } catch (e) {
        results.push({ title, error: e.reason || e.message?.slice(0, 120), endTime });
      }
    }

    const endCount = Number(await contract.marketCount());

    return res.status(200).json({
      success:    true,
      date:       new Date().toISOString().slice(0, 10),
      startCount,
      endCount,
      marketsCreated: endCount - startCount,
      results,
    });
  } catch (e) {
    console.error('create-wc-markets-today error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
