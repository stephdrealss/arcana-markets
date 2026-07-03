// POST /api/create-markets
// Requires ADMIN_PRIVATE_KEY env var (owner: 0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9)
// Creates the 5 curated World Cup / Crypto markets with a 30-day endTime.

const { ethers } = require('ethers');

const RPC              = 'https://rpc.testnet.arc.network';
const CONTRACT_ADDRESS = '0x443a47eF1025e047879b1BA08c94e6dedB354D54';

const ABI = [
  'function createMarket(string memory _title, string memory _category, uint256 _endTime) external',
  'function marketCount() external view returns (uint256)',
];

const MARKETS = [
  { title: 'Will England win FIFA World Cup 2026?',                     category: 'Sports' },
  { title: 'Will Brazil beat Argentina in FIFA World Cup 2026?',        category: 'Sports' },
  { title: 'Will Bitcoin hit $150,000 by end of 2026?',                 category: 'Crypto' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    return res.status(500).json({
      error: 'ADMIN_PRIVATE_KEY env var not set. Add it to Vercel for owner 0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9',
    });
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const wallet   = new ethers.Wallet(pk, provider);

    if (wallet.address.toLowerCase() !== '0x3b4a7deb1274a6f802f45455c6a3998a1d8384d9') {
      return res.status(403).json({ error: `Key is for ${wallet.address}, not the contract owner` });
    }

    const contract  = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    const endTime   = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const startCount = Number(await contract.marketCount());

    const results = [];
    for (const m of MARKETS) {
      try {
        const tx      = await contract.createMarket(m.title, m.category, endTime, { gasLimit: 400000 });
        const receipt = await tx.wait();
        results.push({ title: m.title, txHash: tx.hash, ok: receipt.status === 1 });
      } catch (e) {
        results.push({ title: m.title, error: e.reason || e.message?.slice(0, 100) });
      }
    }

    const endCount = Number(await contract.marketCount());
    const newIds   = Array.from({ length: endCount - startCount }, (_, i) => startCount + 1 + i);

    return res.status(200).json({
      success: true,
      startCount,
      endCount,
      newIds,
      endDate: new Date(endTime * 1000).toISOString().slice(0, 10),
      results,
    });
  } catch (e) {
    console.error('create-markets error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
