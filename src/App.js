import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
// ── CONTRACT CONFIG ───────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x443a47eF1025e047879b1BA08c94e6dedB354D54";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ARC_CHAIN_ID = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.network";
// ── STORAGE HELPERS ───────────────────────────────────────────────────────────
const LS = {
 get: (key, fallback = null) => {
 try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
 catch { return fallback; }
 },
 set: (key, val) => {
 try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
 },
};
// ── CONTRACT ABI ──────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
 "function buyShares(uint256 _marketId, bool _isYes, uint256 _usdcAmount) external",
 "function createMarket(string memory _title, string memory _category, uint256 _endTime) external",
 "function markets(uint256) external view returns (uint256 id, string title, string category, uint256 endTime, bool resolved, bool outcome, uint256 yesShares, uint256 noShares, uint256 totalVolume)",
 "function marketCount() external view returns (uint256)",
 "function getMarketOdds(uint256 _marketId) external view returns (uint256 yesOdds, uint256 noOdds)",
 "event SharesBought(address indexed buyer, uint256 indexed marketId, bool isYes, uint256 usdcAmount, uint256 shares)",
 "event MarketResolved(uint256 indexed marketId, bool outcome)",
];
const USDC_ABI = [
 "function approve(address spender, uint256 amount) external returns (bool)",
 "function balanceOf(address account) external view returns (uint256)",
];
// ── GET USDC BALANCE ──────────────────────────────────────────────────────────
async function getUsdcBalance(addr) {
 try {
 const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
 const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
 const bal = await usdc.balanceOf(addr);
 return (Number(bal) / 1e6).toFixed(2);
 } catch (e) { return "0.00"; }
}
// ── REAL HISTORICAL SEED DATA (from CSV export 2026-04-11) ───────────────────
const HISTORICAL_TRANSFERS = [
 { txHash: "0x682d9da0a0abef4fcfc069dbc20bc4e8cb8ba1ff85ee8a9e258870a3e29f975a", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:46" },
 { txHash: "0xee119901cdeff23e230e5186170fbf784c1fc813c88a4e1d5184680b8f63e18c", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:47" },
 { txHash: "0xa8df27b4bc9668dd34a3d89cfcd9bdefebb6bfab8cae87f177911a27f16655c4", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:47" },
 { txHash: "0xbfa2a59d928edd3d3876400f2185a3db694251bc605a901141e86374adb0e649", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:48" },
 { txHash: "0x2ead1460b0410b41f2fb2cf6c3015683b25f58555a6a03f5c186eb9dbd10d3d1", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:49" },
 { txHash: "0x25bca1f5105f435181740be1a73b9c066804b2a58ba2ddc573f1ec1cfa6affc1", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:49" },
 { txHash: "0x0d895e9e6744dd7aa2887f2b867ea24890ce25a272e1996c9d9bd2b37cc60bd0", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:49" },
 { txHash: "0xae242df5620b130104de1c8cd8d343966266087b61ac8d07571856ec37d1f4f4", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:50" },
 { txHash: "0x0e151fc190c5c0b28c6739b3a5b78f622c6358e1f8005f215ff7da9a50592e19", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:51" },
 { txHash: "0x5bbfe306f4a1f4653aae8f7a2b28b601f0a425588ac151e892175147d69ce501", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:52" },
 { txHash: "0xd31085a36c7f62074538dc38ac17dd35aa57fb40a487293b76714210863ed45e", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:52" },
 { txHash: "0x57fa89e3f6fd4561df52f8f8ecf6c74c3df962b31afc113a36789bcc13690d88", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:53" },
 { txHash: "0xe81e54e1487a9ff391903bfffb740566d353cc7494237fa6d15acb65a3e49818", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:54" },
 { txHash: "0x2bdeb2242f3a6e147b835e694dd375bd086119d42928a9cbfaaa5e0784e84eba", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:54" },
 { txHash: "0xbd69da1c13e976432a472e12554c8d52bad7c8e7028d5475981751dc7f8ea425", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:55" },
 { txHash: "0x6b91dba05d88e697e7ef20aa82905e0422a098b18c029be1ff447428b6f775cc", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:55" },
 { txHash: "0x7eb8bbf8fad67d8ce03c5695cdfc287d5cd23e4e5869181e3c9b7ba34310883d", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:56" },
 { txHash: "0xbfd45b5738aa14ddf851d9837a03e9bca933874e86377a2e976793d249a6ba28", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:57" },
 { txHash: "0x31a7f6b795176381b0acac0b33df92a670060f5564f74f9a91245f0bf2486bf8", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 15:57" },
 { txHash: "0x91fe460b65ea1e166d1595e4c1a5642b339f5aeedfb9997f5a366f0ccacb869e", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 0.50, time: "2026-04-10 15:58" },
 { txHash: "0xc28284ffa4e98df0c5f57fc38cbacc94035067a53ce6b19ed5f3eac4c58a8159", from: "0xf298633A60b4354fb112d46eF7CA70ABe572145b", usdc: 20.00, time: "2026-04-10 16:12" },
 { txHash: "0x51b4d67bf1e15c06f8db3dc084a01b6209b08aad5dbf4b2c574b40ca39be98f9", from: "0xf298633A60b4354fb112d46eF7CA70ABe572145b", usdc: 20.00, time: "2026-04-10 16:13" },
 { txHash: "0x55c9b9ed9990cf956127d6b27ead99e7f929307d169efc974821b977ef73a0f7", from: "0xf298633A60b4354fb112d46eF7CA70ABe572145b", usdc: 20.00, time: "2026-04-10 16:14" },
 { txHash: "0xedfbbd48220ca3a4c3b63ca3b3ea25086a3d77139e83d2eaf373a96f187055d6", from: "0xB1455c5960db2ccC45805E3aDAFd49e70Eda5e8d", usdc: 0.10, time: "2026-04-10 18:57" },
 { txHash: "0xadb7e0c23ab26b35070794737c450eaa8ca922f9433e98393e6c92947ffe6e66", from: "0xB1455c5960db2ccC45805E3aDAFd49e70Eda5e8d", usdc: 0.10, time: "2026-04-10 19:00" },
 { txHash: "0x074c4b37b7d10a131bfc2a2dd3c8fd1200f3505b4294e0453a5dc3330b63e3c7", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 20:21" },
 { txHash: "0xa792baf9e2f23a4873fb39d0932d9353faf2d4fa7827795a5938f6ddf434b9c9", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 20:21" },
 { txHash: "0xe6266ff346eb857d106d0ff34fade974e6f607a042224c4968b1903d33abf0f6", from: "0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187", usdc: 1.00, time: "2026-04-10 20:22" },
 { txHash: "0x1563064838679260860cc4681979afb42a9a836a4753377b35f3052e43b33ddd", from: "0x15705dEcfbdDD1ed1Ee80B4C5c927A23f5E338B0", usdc: 5.00, time: "2026-04-10 20:39" },
 { txHash: "0x04a483a4eb3c21926079887af474e1ab21042476a8f3ae9b29a2da5df7136388", from: "0xD9B5549437B54E20F019e2721D2bD550F89C7984", usdc: 20.00, time: "2026-04-10 20:39" },
 { txHash: "0x91c7e3eda97748551aa827a66e8d01b76f55cf16cc7423a239de03272e103953", from: "0x15705dEcfbdDD1ed1Ee80B4C5c927A23f5E338B0", usdc: 5.00, time: "2026-04-10 20:39" },
 { txHash: "0xaeec948e095221c8158da95cc9dcf3f2af266172707330bc198ed90c44c8aff5", from: "0xD9B5549437B54E20F019e2721D2bD550F89C7984", usdc: 20.00, time: "2026-04-10 20:40" },
 { txHash: "0xc4c056a6802f0fde435167217630c4516ef0acdf4509f21b1f6841d3a96d5cb5", from: "0xD9B5549437B54E20F019e2721D2bD550F89C7984", usdc: 20.00, time: "2026-04-10 20:40" },
 { txHash: "0x5583c4d319121f81367859a72247b3b40c3124a82cd1efce7ecf21bb7e2af245", from: "0xD9B5549437B54E20F019e2721D2bD550F89C7984", usdc: 20.00, time: "2026-04-10 20:42" },
 { txHash: "0x876c0ffec72f6fd884feced1401885ffe8384288092e98eb79f4591ebb68771c", from: "0xEc7605762b9CE996988505C273d6f45C5e9135B6", usdc: 5.00, time: "2026-04-10 22:00" },
 { txHash: "0x686fc818006413bc4fa55008789d51c4d3dae8f5fe9b922c1406be7176691d1c", from: "0x15705dEcfbdDD1ed1Ee80B4C5c927A23f5E338B0", usdc: 5.00, time: "2026-04-11 03:00" },
 { txHash: "0xd91869259d5e968c8b24776dcdfdd757d6abcf9e460208145cbbbf9ad2940fc1", from: "0xa7A39168ae12f655AaA8200b6bB3f31645586C94", usdc: 5.00, time: "2026-04-11 04:23" },
 { txHash: "0xb2244f655e9e884086323232b28d7e91b872c06c0ef16c416ba7779a1fbab26f", from: "0xD5a089235BF8C6cf008b414c8853273D6eA07191", usdc: 5.00, time: "2026-04-11 07:10" },
 { txHash: "0x55eaa7ff6141cc9f60a38f43c443935449062d6fedcd11b3f016a0e8facd2a33", from: "0xc01d5b2bC697Bfdb76E43501f7795BeDF78B1d74", usdc: 5.00, time: "2026-04-11 09:51" },
 { txHash: "0x884e3ed6757b9c0d0606bfaf9606fbc7ec2cd8ac49b54c8c1686d877de2ad9bf", from: "0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9", usdc: 1.00, time: "2026-04-11 11:23" },
 { txHash: "0x074e6ae727dd53d3a257c188bdc1dc57884827f3440e4a37773935ae0ba7ce77", from: "0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9", usdc: 0.10, time: "2026-04-11 12:39" },
];
// ── BUILD LEADERBOARD FROM SEED + NEW TRADES ──────────────────────────────────
function buildLeaderboard(extraTrades = []) {
 const all = [...HISTORICAL_TRANSFERS, ...extraTrades];
 const byAddr = {};
 for (const t of all) {
 const key = t.from.toLowerCase();
 if (!byAddr[key]) byAddr[key] = { fullAddr: t.from, volume: 0, trades: 0 };
 byAddr[key].volume += t.usdc;
 byAddr[key].trades += 1;
 }
 return Object.values(byAddr)
 .sort((a, b) => b.volume - a.volume)
 .map((row, i) => ({
 rank: i + 1,
 addr: `${row.fullAddr.slice(0, 6)}...${row.fullAddr.slice(-4)}`,
 fullAddr: row.fullAddr,
 volume: row.volume.toFixed(2),
 trades: row.trades,
 badge: i === 0 ? " " : i === 1 ? " " : i === 2 ? " " : "",
 }));
}
// ── BUILD STATS FROM SEED + NEW TRADES ───────────────────────────────────────
function buildStats(extraTrades = []) {
 const all = [...HISTORICAL_TRANSFERS, ...extraTrades];
 const totalVolume = all.reduce((s, t) => s + t.usdc, 0);
 const uniqueTraders = new Set(all.map(t => t.from.toLowerCase())).size;
 return {
 totalVolume: totalVolume >= 1000
 ? `$${(totalVolume / 1000).toFixed(1)}K`
 : `$${totalVolume.toFixed(2)}`,
 traderCount: `${uniqueTraders}`,
 openMarkets: `${ALL_MARKETS.length}`,
 };
}
// ── FETCH WALLET ACTIVITY FROM ARCSCAN API ────────────────────────────────────
async function fetchWalletTradeHistory(walletAddr) {
 const addrLower = walletAddr.toLowerCase();
 // First: filter historical seed for this wallet instantly
 const fromSeed = HISTORICAL_TRANSFERS
 .filter(t => t.from.toLowerCase() === addrLower)
 .map(t => ({
 market: "Trade on Arcana Markets",
 side: "—",
 amt: t.usdc.toFixed(2),
 txHash: t.txHash,
 time: t.time,
 fromSeed: true,
 }));
 // Then: try ArcScan Blockscout API for any newer trades
 try {
 const url = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&filter=to&limit=50`;
 const res = await fetch(url);
 if (!res.ok) throw new Error("API error");
 const data = await res.json();
 const items = data.items || [];
 const newTrades = items
 .filter(item => item.from?.hash?.toLowerCase() === addrLower)
 .filter(item => !fromSeed.find(s => s.txHash === item.tx_hash))
 .map(item => ({
 market: "Trade on Arcana Markets",
 side: "—",
 amt: (Number(item.total?.value || 0) / 1e6).toFixed(2),
 txHash: item.tx_hash,
 time: item.timestamp?.slice(0, 16).replace("T", " ") || "on-chain",
 fromSeed: false,
 }));
 return [...newTrades, ...fromSeed];
 } catch (e) {
 // API blocked or failed — return seed data only
 return fromSeed.length > 0 ? fromSeed : null;
 }
}
// ── FETCH LEADERBOARD: SEED + LIVE NEW TRADES ─────────────────────────────────
async function fetchLeaderboardData() {
 try {
 const url = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&limit=50`;
 const res = await fetch(url);
 if (!res.ok) throw new Error("API error");
 const data = await res.json();
 const items = data.items || [];
 // Only keep transfers INTO the contract (trades), exclude seed hashes already known
 const seedHashes = new Set(HISTORICAL_TRANSFERS.map(t => t.txHash));
 const newTrades = items
 .filter(item => item.to?.hash?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase())
 .filter(item => !seedHashes.has(item.tx_hash))
 .map(item => ({
 from: item.from?.hash || "",
 usdc: Number(item.total?.value || 0) / 1e6,
 txHash: item.tx_hash,
 time: item.timestamp?.slice(0, 16).replace("T", " ") || "",
 }));
 return buildLeaderboard(newTrades);
 } catch (e) {
 // Fallback: build from seed only — still 100% real data
 return buildLeaderboard([]);
 }
}
// ── FETCH REAL STATS ──────────────────────────────────────────────────────────
async function fetchContractStats() {
 try {
 const url = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&limit=50`;
 const res = await fetch(url);
 if (!res.ok) throw new Error("API error");
 const data = await res.json();
 const items = data.items || [];
 const seedHashes = new Set(HISTORICAL_TRANSFERS.map(t => t.txHash));
 const newTrades = items
 .filter(item => item.to?.hash?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase())
 .filter(item => !seedHashes.has(item.tx_hash))
 .map(item => ({
 from: item.from?.hash || "",
 usdc: Number(item.total?.value || 0) / 1e6,
 txHash: item.tx_hash,
 time: "",
 }));
 return buildStats(newTrades);
 } catch (e) {
 return buildStats([]);
 }
}
// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = {
 light: {
 bg: "#F5F4EF", surface: "#FFFFFF", surfaceAlt: "#EEEDE8", surfaceHov: "#F0EFE9",
 text: "#0A0A14", textMuted: "#5A5A72", textLight: "#9CA3AF",
 blue: "#0057FF", blueDim: "#EEF3FF", blueBorder: "rgba(0,87,255,0.2)",
 navy: "#0A0A14", border: "#E5E4DF", borderStrong: "#C9C8C3",
 green: "#16A34A", greenBg: "#F0FDF4", greenBorder: "rgba(22,163,74,0.35)",
 red: "#DC2626", redBg: "#FEF2F2", redBorder: "rgba(220,38,38,0.35)",
 amber: "#D97706", amberBg: "rgba(217,119,6,0.1)",
 navBg: "rgba(245,244,239,0.95)", tickerBg: "#0057FF", tickerText: "rgba(255,255,255,0.9)",
 shadow: "0 1px 4px rgba(0,0,0,0.07)", shadowHov: "0 6px 20px rgba(0,87,255,0.1)",
 cardBorder: "#E5E4DF", cardBorderHov: "#0057FF",
 winBg: "#F0FDF4", winText: "#16A34A",
 lossBg: "#FEF2F2", lossText: "#DC2626",
 },
 dark: {
 bg: "#07061A", surface: "#0F0D22", surfaceAlt: "#15122E", surfaceHov: "#1A1735",
 text: "#E8E8F0", textMuted: "#8B8BA8", textLight: "#5A5A72",
 blue: "#3B82F6", blueDim: "rgba(59,130,246,0.1)", blueBorder: "rgba(59,130,246,0.25)",
 navy: "#1A1735", border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.15)",
 green: "#22C55E", greenBg: "rgba(34,197,94,0.1)", greenBorder: "rgba(34,197,94,0.35)",
 red: "#F87171", redBg: "rgba(248,113,113,0.08)", redBorder: "rgba(248,113,113,0.3)",
 amber: "#FB923C", amberBg: "rgba(251,146,60,0.1)",
 navBg: "rgba(7,6,26,0.94)", tickerBg: "#1A1735", tickerText: "rgba(255,255,255,0.8)",
 shadow: "0 1px 4px rgba(0,0,0,0.3)", shadowHov: "0 6px 24px rgba(59,130,246,0.15)",
 cardBorder: "rgba(255,255,255,0.07)", cardBorderHov: "#3B82F6",
 winBg: "rgba(34,197,94,0.1)", winText: "#22C55E",
 lossBg: "rgba(248,113,113,0.08)", lossText: "#F87171",
 },
};
const ALL_MARKETS = [
 { id: 26, title: "OpenAI releases GPT-5 in 2026?", cat: "Tech & AI", yes: 0.77, chg: +0.05, vol: "6,400,000", ends: "Dec 31 2026" },
 { id: 2, title: "BTC hits $120K before July 2026?", cat: "Crypto", yes: 0.61, chg: +0.04, vol: "8,412,000", ends: "Jul 1 2026" },
 { id: 3, title: "ETH flips BTC market cap in 2026?", cat: "Crypto", yes: 0.12, chg: -0.03, vol: "3,201,000", ends: "Dec 31 2026" },
 { id: 4, title: "Spot SOL ETF approved in 2026?", cat: "Crypto", yes: 0.38, chg: +0.06, vol: "2,870,500", ends: "Dec 31 2026" },
 { id: 5, title: "USDC market cap exceeds $100B in 2026?", cat: "Crypto", yes: 0.47, chg: +0.02, vol: "1,540,000", ends: "Dec 31 2026" },
 { id: 6, title: "Arc Network mainnet launches Q2 2026?", cat: "Arc", yes: 0.72, chg: +0.08, vol: "4,100,000", ends: "Jun 30 2026", trending: true },
 { id: 7, title: "Arc TVL surpasses $500M by end of 2026?", cat: "Arc", yes: 0.44, chg: +0.03, vol: "2,300,000", ends: "Dec 31 2026" },
 { id: 8, title: "Arc-native DEX launches with $10M+ TVL?", cat: "Arc", yes: 0.58, chg: +0.05, vol: "1,800,000", ends: "Dec 31 2026" },
 { id: 9, title: "Arc Architects Program reaches 5K members?", cat: "Arc", yes: 0.66, chg: +0.07, vol: "980,000", ends: "Dec 31 2026", hot: true },
 { id: 10, title: "Real Madrid wins 2025-26 Champions League?", cat: "Sports", yes: 0.31, chg: -0.04, vol: "5,200,000", ends: "Jun 1 2026" },
 { id: 11, title: "Golden State Warriors make 2026 NBA Playoffs?", cat: "Sports", yes: 0.22, chg: -0.08, vol: "3,100,000", ends: "Apr 15 2026" },
 { id: 12, title: "Canelo Alvarez wins next fight by KO?", cat: "Sports", yes: 0.54, chg: +0.03, vol: "1,700,000", ends: "Sep 30 2026" },
 { id: 13, title: "Lewis Hamilton wins a race in 2026 F1 season?", cat: "Sports", yes: 0.48, chg: +0.05, vol: "2,400,000", ends: "Nov 30 2026" },
 { id: 14, title: "Tiger Woods plays in 2026 Masters?", cat: "Sports", yes: 0.19, chg: -0.06, vol: "4,200,000", ends: "Apr 12 2026" },
 { id: 15, title: "Lionel Messi retires before end of 2026?", cat: "Sports", yes: 0.08, chg: -0.01, vol: "2,900,000", ends: "Dec 31 2026" },
 { id: 24, title: "US passes comprehensive crypto legislation?", cat: "Politics", yes: 0.41, chg: +0.03, vol: "6,700,000", ends: "Dec 31 2026" },
 { id: 29, title: "G7 nation adopts a CBDC by end of 2026?", cat: "Politics", yes: 0.27, chg: -0.02, vol: "3,800,000", ends: "Dec 31 2026" },
 { id: 30, title: "UK snap election called before end of 2026?", cat: "Politics", yes: 0.14, chg: -0.04, vol: "2,100,000", ends: "Dec 31 2026" },
 { id: 31, title: "Trump approval rating above 50% before midterms?", cat: "Politics", yes: 0.33, chg: +0.02, vol: "7,400,000", ends: "Nov 3 2026" },
 { id: 25, title: "Fed cuts rates twice before August 2026?", cat: "Macro", yes: 0.23, chg: -0.07, vol: "5,900,000", ends: "Aug 1 2026" },
 { id: 32, title: "S&P 500 hits all-time high above 6,500 in 2026?", cat: "Macro", yes: 0.55, chg: +0.04, vol: "4,300,000", ends: "Dec 31 2026" },
 { id: 33, title: "US enters recession in 2026?", cat: "Macro", yes: 0.31, chg: +0.06, vol: "5,100,000", ends: "Dec 31 2026" },
 { id: 34, title: "Gold hits $3,500/oz before end of 2026?", cat: "Macro", yes: 0.62, chg: +0.09, vol: "3,600,000", ends: "Dec 31 2026", hot: true },
 { id: 35, title: "Apple Vision Pro 2 announced in 2026?", cat: "Tech & AI", yes: 0.43, chg: -0.02, vol: "2,200,000", ends: "Dec 31 2026" },
 { id: 36, title: "AI-generated content banned on a major platform?", cat: "Tech & AI", yes: 0.18, chg: -0.05, vol: "3,400,000", ends: "Dec 31 2026" },
 { id: 37, title: "Elon Musk's xAI surpasses $100B valuation?", cat: "Tech & AI", yes: 0.52, chg: +0.06, vol: "4,100,000", ends: "Dec 31 2026" },
 { id: 27, title: "Taylor Swift announces new album before June 2026?", cat: "Culture", yes: 0.34, chg: -0.03, vol: "5,800,000", ends: "Jun 1 2026" },
 { id: 38, title: "Netflix gains more than 20M subscribers in Q1?", cat: "Culture", yes: 0.61, chg: +0.04, vol: "2,700,000", ends: "Apr 30 2026" },
 { id: 39, title: "A Marvel film tops $2B at the box office in 2026?", cat: "Culture", yes: 0.39, chg: -0.02, vol: "3,100,000", ends: "Dec 31 2026" },
 { id: 40, title: "NASA Artemis Moon landing happens before 2027?", cat: "Science", yes: 0.17, chg: -0.08, vol: "4,500,000", ends: "Dec 31 2026" },
 { id: 41, title: "A lab-grown meat product hits major US grocery chain?", cat: "Science", yes: 0.29, chg: +0.03, vol: "1,900,000", ends: "Dec 31 2026" },
 { id: 28, title: "Global average temp sets new record high in 2026?", cat: "Science", yes: 0.71, chg: +0.05, vol: "2,600,000", ends: "Dec 31 2026" },
 { id: 42, title: "Quantum computer breaks RSA-2048 encryption?", cat: "Science", yes: 0.09, chg: -0.02, vol: "1,400,000", ends: "Dec 31 2026" },
];
const CATS = ["All", "Trending", "Crypto", "Arc", "Sports", "Politics", "Macro", "Tech & AI", "Culture", "Science"];
const TOP_MOVERS = [...ALL_MARKETS].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
const pct = v => Math.round(v * 100);
// ── SPARK LINE ────────────────────────────────────────────────────────────────
function Spark({ prob, up, col }) {
 const pts = Array.from({ length: 10 }, (_, i) =>
 Math.max(4, Math.min(64, prob * 54 + 10 + Math.sin(i * 1.8 + prob * 3) * 10))
 );
 const d = pts.map((y, i) => `${i === 0 ? "M" : "L"}${(i / 9) * 80},${68 - y}`).join(" ");
 const uid = `sk${Math.round(prob * 100)}${up ? 1 : 0}`;
 return (
 <svg width="64" height="24" viewBox="0 0 80 68" style={{ flexShrink: 0 }}>
 <defs>
 <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={col} stopOpacity="0.3" />
 <stop offset="100%" stopColor={col} stopOpacity="0" />
 </linearGradient>
 </defs>
 <path d={d + ` L80,68 L0,68 Z`} fill={`url(#${uid})`} />
 <path d={d} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
 </svg>
 );
}
// ── PORTFOLIO ─────────────────────────────────────────────────────────────────
function Portfolio({ t, account, positions, tradeResults }) {
 if (!account) return (
 <div style={{ textAlign: "center", padding: "80px 20px" }}>
 <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
 <p style={{ fontSize: 15, color: t.textMuted }}>Connect your wallet to see your portfolio</p>
 </div>
 );
 if (positions.length === 0) return (
 <div style={{ textAlign: "center", padding: "80px 20px" }}>
 <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
 <p style={{ fontSize: 15, color: t.textMuted }}>No positions yet. Place your first trade!</p>
 </div>
 );
 const total = positions.reduce((s, p) => s + parseFloat(p.amt), 0);
 const wins = tradeResults.filter(r => r.won).length;
 const losses = tradeResults.filter(r => r.won === false).length;
 const totalWinnings = tradeResults.filter(r => r.won).reduce((s, r) => s + parseFloat(r.payout || 0), 0);
 return (
 <div style={{ padding: "32px 0" }}>
 <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 24 }}>Your Portfolio</h2>
 <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
 {[
 ["Total Invested", `$${total.toFixed(2)} USDC`],
 ["Open Positions", positions.length],
 ["Wins", wins > 0 ? ` ${wins}` : wins],
 ["Losses", losses > 0 ? ` ${losses}` : losses],
 ["Total Winnings", `$${totalWinnings.toFixed(2)}`],
 ].map(([l, v]) => (
 <div key={l} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "16px 20px", minWidth: 140 }}>
 <div style={{ fontSize: 11, color: t.textLight, fontFamily: "monospace", marginBottom: 4 }}>{l}</div>
 <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: t.text }}>{v}</div>
 </div>
 ))}
 </div>
 {/* Trade Results */}
 {tradeResults.length > 0 && (
 <div style={{ marginBottom: 24 }}>
 <div style={{ fontSize: 11, fontFamily: "monospace", color: t.textMuted, letterSpacing: 2, marginBottom: 12 }}>RESOLVED TRADES</div>
 <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
 {tradeResults.map((r, i) => (
 <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: i < tradeResults.length - 1 ? `1px solid ${t.border}` : "none" }}>
 <span style={{ fontSize: 16 }}>{r.won ? " " : " "}</span>
 <p style={{ fontSize: 13, color: t.text, fontWeight: 600, margin: 0, flex: 1 }}>{r.market}</p>
 <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: r.side === "YES" ? t.green : t.red }}>{r.side}</span>
 <span style={{ fontSize: 12, fontFamily: "monospace", color: r.won ? t.green : t.red, fontWeight: 700 }}>
 {r.won ? `+$${parseFloat(r.payout || 0).toFixed(2)}` : `-$${parseFloat(r.amt || 0).toFixed(2)}`}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 {/* Open Positions */}
 <div style={{ fontSize: 11, fontFamily: "monospace", color: t.textMuted, letterSpacing: 2, marginBottom: 12 }}>OPEN POSITIONS</div>
 <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
 {positions.map((p, i) => (
 <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: i < positions.length - 1 ? `1px solid ${t.border}` : "none" }}>
 <p style={{ fontSize: 13, color: t.text, fontWeight: 600, margin: 0, flex: 1 }}>{p.market}</p>
 <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: p.side === "YES" ? t.green : t.red }}>{p.side}</span>
 <span style={{ fontSize: 12, fontFamily: "monospace", color: t.text, minWidth: 80 }}>${p.amt} USDC</span>
 <a href={`https://testnet.arcscan.app/tx/${p.txHash}`} target="_blank" rel="noreferer"
 style={{ fontSize: 10, color: t.blue, fontFamily: "monospace", textDecoration: "none" }}>↗ TX</a>
 </div>
 ))}
 </div>
 </div>
 );
}
// ── LEADERBOARD ───────────────────────────────────────────────────────────────
function Leaderboard({ t, account, newTrades = [] }) {
 const [data, setData] = useState(() => LS.get("arcana_leaderboard", null) || buildLeaderboard([]));
 const [loading, setLoading] = useState(false);
 const [lastFetched, setLastFetched] = useState(() => LS.get("arcana_leaderboard_ts", 0));
 const load = useCallback(async (force = false) => {
 const stale = Date.now() - lastFetched > 5 * 60 * 1000; // 5 min cache
 if (!force && !stale && data) return;
 setLoading(true);
 const result = await fetchLeaderboardData();
 if (result) {
 // Merge live API result with any session new trades not yet in API
 const apiHashes = new Set(result.map(r => r.fullAddr));
 setData(result);
 LS.set("arcana_leaderboard", result);
 const ts = Date.now();
 setLastFetched(ts);
 LS.set("arcana_leaderboard_ts", ts);
 }
 setLoading(false);
 }, [data, lastFetched]);
 useEffect(() => { load(); }, []);
 // Merge: seed data + any new session trades not yet reflected
 const rows = React.useMemo(() => {
 const base = data || buildLeaderboard([]);
 if (!newTrades || newTrades.length === 0) return base;
 return buildLeaderboard(newTrades);
 }, [data, newTrades]);
 return (
 <div style={{ padding: "32px 0" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>Leaderboard</h2>
 <button onClick={() => load(true)} disabled={loading}
 style={{ padding: "6px 14px", background: t.blueDim, border: `1px solid ${t.blueBorder}`, borderRadius: 8, color: t.blue, fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
 {loading ? "SYNCING..." : "↻ REFRESH"}
 </button>
 </div>
 <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>
 Top traders by real on-chain volume · {rows.length > 0 ? `${rows.length} traders` : "Loading..."}
 </p>
 {loading && rows.length === 0 && (
 <div style={{ textAlign: "center", padding: "60px 20px", color: t.textMuted, fontSize: 13, fontFamily: "monospace" }}>
 Fetching on-chain data...
 </div>
 )}
 {rows.length > 0 && (
 <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
 {rows.map(row => (
 <div key={row.rank} style={{
 display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
 borderBottom: row.rank < rows.length ? `1px solid ${t.border}` : "none",
 background: account && row.fullAddr?.toLowerCase() === account?.toLowerCase() ? t.blueDim : "transparent",
 }}>
 <span style={{ fontSize: 14, width: 24, textAlign: "center" }}>{row.badge || `#${row.rank}`}</span>
 <span style={{ flex: 1, fontSize: 13, fontFamily: "monospace", color: t.text }}>
 {row.addr}
 {account && row.fullAddr?.toLowerCase() === account?.toLowerCase() && (
 <span style={{ marginLeft: 8, fontSize: 10, color: t.blue, background: t.blueDim, padding: "2px 6px", borderRadius: 4 }}>YOU</span>
 )}
 </span>
 <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: t.green }}>${parseFloat(row.volume).toLocaleString()}</span>
 <span style={{ fontSize: 12, color: t.textMuted, minWidth: 70, textAlign: "right" }}>{row.trades} trades</span>
 </div>
 ))}
 </div>
 )}
 {!loading && rows.length === 0 && (
 <div style={{ textAlign: "center", padding: "60px 20px", color: t.textMuted, fontSize: 13, fontFamily: "monospace" }}>
 No trades found on-chain yet.
 </div>
 )}
 </div>
 );
}
// ── ACTIVITY ──────────────────────────────────────────────────────────────────
function Activity({ t, account, userActivity, onRefresh, loading }) {
 if (!account) return (
 <div style={{ padding: "32px 0" }}>
 <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 6 }}>Activity</h2>
 <div style={{ textAlign: "center", padding: "60px 20px", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12 }}>
 <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
 <p style={{ fontSize: 14, color: t.textMuted }}>Connect wallet to see your trade history</p>
 </div>
 </div>
 );
 if (userActivity.length === 0 && !loading) return (
 <div style={{ padding: "32px 0" }}>
 <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 6 }}>Activity</h2>
 <div style={{ textAlign: "center", padding: "60px 20px", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12 }}>
 <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
 <p style={{ fontSize: 14, color: t.textMuted }}>No trades yet. Place your first trade!</p>
 </div>
 </div>
 );
 return (
 <div style={{ padding: "32px 0" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>Activity</h2>
 <button onClick={onRefresh} disabled={loading}
 style={{ padding: "6px 14px", background: t.blueDim, border: `1px solid ${t.blueBorder}`, borderRadius: 8, color: t.blue, fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
 {loading ? "SYNCING..." : "↻ REFRESH"}
 </button>
 </div>
 <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>
 Your real on-chain trades · All devices · {userActivity.length} records
 </p>
 {loading && userActivity.length === 0 && (
 <div style={{ textAlign: "center", padding: "60px 20px", color: t.textMuted, fontSize: 13, fontFamily: "monospace" }}>
 Fetching trade history from Arc...
 </div>
 )}
 {userActivity.length > 0 && (
 <div style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
 {userActivity.map((row, i) => (
 <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: i < userActivity.length - 1 ? `1px solid ${t.border}` : "none" }}>
 <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: row.side === "YES" ? t.green : t.red, minWidth: 28 }}>{row.side}</span>
 <span style={{ flex: 1, fontSize: 13, color: t.text }}>{row.market}</span>
 <span style={{ fontSize: 12, fontFamily: "monospace", color: t.text }}>${row.amt} USDC</span>
 {row.blockNumber && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: "monospace" }}>#{row.blockNumber}</span>}
 <a href={`https://testnet.arcscan.app/tx/${row.txHash}`} target="_blank" rel="noreferer"
 style={{ fontSize: 10, color: t.blue, fontFamily: "monospace", textDecoration: "none" }}>↗ TX</a>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
// ── GRID CARD ─────────────────────────────────────────────────────────────────
function GridCard({ m, onTrade, t, livePrice }) {
 const [hov, setHov] = useState(false);
 const yes = pct(m.yes), no = 100 - yes, up = m.chg >= 0, sparkCol = up ? t.green : t.red;
 return (
 <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
 style={{ background: t.surface, border: `1.5px solid ${hov ? t.cardBorderHov : t.cardBorder}`, borderRadius: 12, display: "flex", flexDirection: "column", cursor: "pointer", transition: "all 0.18s", boxShadow: hov ? t.shadowHov : t.shadow }}>
 <div style={{ height: 3, background: hov ? t.blue : t.border, transition: "background 0.2s" }} />
 <div style={{ padding: "15px 17px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <div style={{ width: 36, height: 36, borderRadius: 8, background: t.blueDim, border: `1px solid ${t.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
 <span style={{ fontSize: 15 }}>◈</span>
 </div>
 <span style={{ fontSize: 10, fontWeight: 700, color: t.blue, background: t.blueDim, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace" }}>{m.cat}</span>
 </div>
 <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
 {m.hot && <span style={{ fontSize: 9, fontWeight: 700, color: t.amber, background: t.amberBg, padding: "2px 5px", borderRadius: 4 }}> HOT</span>}
 {m.trending && <span style={{ fontSize: 9, fontWeight: 700, color: t.green, background: t.greenBg, padding: "2px 5px", borderRadius: 4 }}>↑ TREND</span>}
 </div>
 </div>
 {livePrice && <div style={{ background: t.blueDim, border: `1px solid ${t.blueBorder}`, borderRadius: 6, padding: "4px 8px", fontSize: 10, color: t.blue, fontFamily: "monospace" }}>{livePrice}</div>}
 <p style={{ fontSize: 14, color: t.text, lineHeight: 1.5, margin: 0, fontWeight: 600, flex: 1 }}>{m.title}</p>
 <div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
 <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
 <span style={{ fontSize: 30, fontWeight: 800, color: t.text, lineHeight: 1, fontFamily: "monospace" }}>{yes}</span>
 <span style={{ fontSize: 12, color: t.textMuted, fontFamily: "monospace" }}>% chance</span>
 </div>
 <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
 <Spark prob={m.yes} up={up} col={sparkCol} />
 <span style={{ fontSize: 12, fontWeight: 700, color: sparkCol, fontFamily: "monospace" }}>{up ? "+" : ""}{Math.round(m.chg * 100)}%</span>
 </div>
 </div>
 <div style={{ height: 5, borderRadius: 3, background: t.surfaceAlt, overflow: "hidden" }}>
 <div style={{ width: `${yes}%`, height: "100%", background: `linear-gradient(90deg, ${t.green}, ${t.blue})`, borderRadius: 3 }} />
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
 <span style={{ fontSize: 11, color: t.blue, fontFamily: "monospace", fontWeight: 600 }}>YES {yes}¢</span>
 <span style={{ fontSize: 11, color: t.textLight, fontFamily: "monospace" }}>NO {no}¢</span>
 </div>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
 <div><div style={{ fontSize: 11, color: t.textLight, fontFamily: "monospace" }}>Vol</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: t.text }}>${m.vol}</div></div>
 <div><div style={{ fontSize: 11, color: t.textLight, fontFamily: "monospace" }}>Ends</div><div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: t.text }}>{m.ends}</div></div>
 </div>
 <div style={{ display: "flex", gap: 8 }}>
 {[["YES", yes, t.green, t.greenBg, t.greenBorder], ["NO", no, t.red, t.redBg, t.redBorder]].map(([lbl, odds, col, bg, border]) => {
 const mEndDate = new Date((m.ends || "") + (/20\d\d/.test(m.ends || "") ? "" : " 2026"));
 const mEnded = !isNaN(mEndDate.getTime()) && mEndDate < new Date();
 return (
 <button key={lbl} onClick={e => { e.stopPropagation(); if (!mEnded) onTrade(m, lbl); }}
 style={{ flex: 1, padding: "9px 0", background: bg, border: `1.5px solid ${border}`, borderRadius: 8, color: col, fontSize: 12, fontWeight: 700, cursor: mEnded ? "not-allowed" : "pointer", opacity: mEnded ? 0.5 : 1, fontFamily: "monospace" }}>
 {mEnded ? "CLOSED" : `${lbl} ${odds}¢`}
 </button>
 );
 })}
 </div>
 </div>
 </div>
 );
}
// ── TRADE MODAL ───────────────────────────────────────────────────────────────
function TradeModal({ m, initSide, onClose, t, account, usdcBalance, onPositionAdded, onActivityAdded }) {
 const [side, setSide] = useState(initSide || "YES");
 const [amt, setAmt] = useState("20");
 const [done, setDone] = useState(false);
 const [loading, setLoading] = useState(false);
 const [loadingMsg, setLoadingMsg] = useState("");
 const [error, setError] = useState("");
 const [txHash, setTxHash] = useState("");
 if (!m) return null;
 const now = new Date();
 const endsStr = m.ends || "";
 const hasYear = /20\d\d/.test(endsStr);
 const endDate = new Date(hasYear ? endsStr : endsStr + " 2026");
 const isMarketEnded = !isNaN(endDate.getTime()) && endDate < now;
 const prob = side === "YES" ? m.yes : 1 - m.yes;
 const cents = Math.round(prob * 100);
 const shares = amt ? (parseFloat(amt) / prob).toFixed(2) : "0.00";
 const payout = parseFloat(shares).toFixed(2);
 const profit = amt ? (parseFloat(payout) - parseFloat(amt)).toFixed(2) : "0.00";
 const isYes = side === "YES";
 const switchToArc = async () => {
 try {
 await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] });
 } catch (e) {
 try {
 await window.ethereum.request({
 method: "wallet_addEthereumChain", params: [{
 chainId: ARC_CHAIN_ID, chainName: "Arc Testnet",
 nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
 rpcUrls: [ARC_RPC], blockExplorerUrls: ["https://testnet.arcscan.app"],
 }]
 });
 } catch (addErr) { console.log("Network already exists"); }
 }
 };
 const placeOrder = async () => {
 if (!account) { setError("Connect your wallet first!"); return; }
 if (!amt || parseFloat(amt) <= 0) { setError("Enter a valid amount"); return; }
 if (parseFloat(usdcBalance) < parseFloat(amt)) { setError(`Insufficient USDC. You have ${usdcBalance}`); return; }
 setLoading(true); setError("");
 try {
 setLoadingMsg("Switching to Arc Testnet...");
 await switchToArc();
 const provider = new ethers.providers.Web3Provider(window.ethereum);
 const signer = provider.getSigner();
 const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
 const arcanaContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
 const usdcAmt = ethers.utils.parseUnits(parseFloat(amt).toFixed(6), 6);
 setLoadingMsg("Step 1/2: Approve USDC spend in wallet...");
 const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, usdcAmt);
 setLoadingMsg("Waiting for approval confirmation...");
 await approveTx.wait();
 setLoadingMsg("Step 2/2: Place your trade in wallet...");
 const tradeTx = await arcanaContract.buyShares(m.id, isYes, usdcAmt);
 setLoadingMsg("Confirming on Arc...");
 const receipt = await tradeTx.wait();
 if (receipt.status === 0) throw new Error("Trade failed on-chain.");
 setTxHash(tradeTx.hash);
 const tradeRecord = { market: m.title, marketId: m.id, side, amt, shares, payout, profit, txHash: tradeTx.hash };
 onPositionAdded(tradeRecord);
 onActivityAdded({ ...tradeRecord, time: "just now" });
 setDone(true);
 } catch (err) {
 console.error(err);
 if (err.code === 4001 || err.message?.includes("rejected") || err.message?.includes("user rejected"))
 setError("Transaction cancelled.");
 else setError(err.message || "Transaction failed. Please try again.");
 }
 setLoading(false);
 };
 return (
 <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 0 0" }}>
 <div onClick={e => e.stopPropagation()} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
 <div style={{ height: 3, background: isMarketEnded ? t.amber : t.blue, borderRadius: "16px 16px 0 0" }} />
 <div style={{ padding: "20px" }}>
 {isMarketEnded ? (
 <div style={{ textAlign: "center", padding: "16px 0" }}>
 <div style={{ fontSize: 40, marginBottom: 12 }}> </div>
 <h3 style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 8 }}>Market Closed</h3>
 <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 16 }}>This market has ended and is pending resolution.</p>
 <button onClick={onClose} style={{ width: "100%", padding: "12px", background: t.blue, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Close</button>
 </div>
 ) : done ? (
 <div style={{ textAlign: "center", padding: "8px 0" }}>
 <div style={{ width: 54, height: 54, borderRadius: "50%", background: t.greenBg, border: `2px solid ${t.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}> </div>
 <h3 style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8 }}>Trade Confirmed!</h3>
 <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 16 }}>Your trade is live on Arc. If your outcome is correct, you win <strong style={{ color: t.green }}>${payout}</strong>.</p>
 <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, textAlign: "left" }}>
 {[["Market", m.title.slice(0, 30) + "…"], ["Side", `${side} @ ${cents}¢`], ["Amount", `$${amt} USDC`], ["Potential Payout", `$${payout}`]].map(([k, v]) => (
 <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
 <span style={{ fontSize: 12, color: t.textMuted, fontFamily: "monospace" }}>{k}</span>
 <span style={{ fontSize: 12, color: t.blue, fontFamily: "monospace", fontWeight: 700 }}>{v}</span>
 </div>
 ))}
 </div>
 <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferer"
 style={{ display: "block", textAlign: "center", fontSize: 12, color: t.blue, fontFamily: "monospace", textDecoration: "none", marginBottom: 12 }}>↗ View on ArcScan</a>
 <button onClick={onClose} style={{ width: "100%", padding: "10px", background: t.blue, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Done</button>
 </div>
 ) : (
 <>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
 <p style={{ fontSize: 13, color: t.text, lineHeight: 1.4, margin: 0, fontWeight: 600, flex: 1, paddingRight: 12 }}>{m.title}</p>
 <button onClick={onClose} style={{ background: "none", border: "none", color: t.textMuted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
 </div>
 {account && <div style={{ background: t.greenBg, border: `1px solid ${t.greenBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: t.green, fontFamily: "monospace" }}>Balance: ${usdcBalance} USDC</div>}
 {!account && <div style={{ background: t.amberBg, border: `1px solid ${t.amber}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: t.amber, fontFamily: "monospace" }}>⚠ Connect wallet to trade</div>}
 {error && <div style={{ background: t.redBg, border: `1px solid ${t.redBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: t.red, fontFamily: "monospace" }}>{error}</div>}
 {loading && <div style={{ background: t.blueDim, border: `1px solid ${t.blueBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: t.blue, fontFamily: "monospace" }}> {loadingMsg}</div>}
 <div style={{ display: "flex", background: t.bg, borderRadius: 10, padding: 4, marginBottom: 14 }}>
 {["YES", "NO"].map(s => (
 <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: side === s ? (s === "YES" ? t.green : t.red) : "transparent", color: side === s ? "#fff" : t.textMuted, fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all 0.15s" }}>{s}</button>
 ))}
 </div>
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 11, color: t.textMuted, fontFamily: "monospace", letterSpacing: 1, display: "block", marginBottom: 6 }}>AMOUNT</label>
 <div style={{ display: "flex", alignItems: "center", background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 10 }}>
 <span style={{ padding: "12px 12px", color: t.textMuted, fontFamily: "monospace", fontSize: 13 }}>$</span>
 <input type="number" value={amt} onChange={e => setAmt(e.target.value)} style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.text, fontSize: 16, fontFamily: "monospace", fontWeight: 700, padding: "12px 0" }} />
 <span style={{ padding: "12px 14px", color: t.textMuted, fontFamily: "monospace", fontSize: 12 }}>USDC</span>
 </div>
 <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
 {["5", "10", "25", "50", "100"].map(v => (
 <button key={v} onClick={() => setAmt(v)} style={{ flex: 1, padding: "6px 0", background: amt === v ? t.blue : t.bg, border: `1px solid ${amt === v ? t.blue : t.border}`, borderRadius: 6, color: amt === v ? "#fff" : t.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>${v}</button>
 ))}
 </div>
 </div>
 <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
 {[["Avg price", `${cents}¢`], ["Shares", shares], ["Potential payout", `$${payout}`], ["Potential profit", `+$${profit}`]].map(([k, v]) => (
 <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
 <span style={{ fontSize: 12, color: t.textMuted, fontFamily: "monospace" }}>{k}</span>
 <span style={{ fontSize: 12, color: t.text, fontFamily: "monospace", fontWeight: 700 }}>{v}</span>
 </div>
 ))}
 </div>
 <button onClick={placeOrder} disabled={loading}
 style={{ width: "100%", padding: "14px", background: t.blue, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, fontFamily: "monospace", letterSpacing: 0.5 }}>
 {loading ? " PROCESSING..." : `PLACE ${side} ORDER ON ARC`}
 </button>
 <p style={{ textAlign: "center", fontSize: 11, color: t.textLight, fontFamily: "monospace", marginTop: 10 }}>Trades settle on Arc Testnet · USDC</p>
 </>
 )}
 </div>
 </div>
 </div>
 );
}
// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function ArcanaMarkets() {
 // ── THEME: persisted ──
 const [dark, setDark] = useState(() => LS.get("arcana_theme", false));
 // ── NAV STATE ──
 const [page, setPage] = useState("Markets");
 const [cat, setCat] = useState("All");
 const [q, setQ] = useState("");
 const [viewMode, setViewMode] = useState("grid");
 const [sort, setSort] = useState("volume");
 const [active, setActive] = useState(null);
 const [tradeSide, setTradeSide] = useState(null);
 // ── WALLET ──
 const [account, setAccount] = useState(null);
 const [usdcBalance, setUsdcBalance] = useState("0.00");
 // ── POSITIONS: persisted per wallet ──
 const [positions, setPositions] = useState([]);
 // ── TRADE RESULTS: persisted per wallet ──
 const [tradeResults, setTradeResults] = useState([]);
 // ── ACTIVITY: fetched from chain + cached ──
 const [userActivity, setUserActivity] = useState([]);
 const [activityLoading, setActivityLoading] = useState(false);
 // ── STATS: seeded from real CSV data, updated live ──
 const [stats, setStats] = useState(() => LS.get("arcana_stats", buildStats([])));
 // ── LIVE PRICES ──
 const [livePrices, setLivePrices] = useState({});
 const [tickIdx, setTickIdx] = useState(0);
 const t = dark ? THEMES.dark : THEMES.light;
 // ── PERSIST THEME ──
 const toggleTheme = () => {
 const next = !dark;
 setDark(next);
 LS.set("arcana_theme", next);
 };
 // ── LOAD WALLET-SPECIFIC DATA ──
 const loadWalletData = useCallback((addr) => {
 if (!addr) return;
 const key = addr.toLowerCase();
 const savedPositions = LS.get(`arcana_positions_${key}`, []);
 const savedResults = LS.get(`arcana_results_${key}`, []);
 setPositions(savedPositions);
 setTradeResults(savedResults);
 // Load cached activity first, then refresh from chain
 const cachedActivity = LS.get(`arcana_activity_${key}`, []);
 setUserActivity(cachedActivity);
 refreshChainActivity(addr);
 }, []);
 // ── REFRESH ACTIVITY FROM CHAIN ──
 const refreshChainActivity = useCallback(async (addr) => {
 if (!addr) return;
 setActivityLoading(true);
 const result = await fetchWalletTradeHistory(addr);
 if (result !== null) {
 // Merge: on-chain as source of truth, but keep any session-only entries
 const onChainHashes = new Set(result.map(r => r.txHash));
 const sessionOnly = userActivity.filter(a => !a.txHash || !onChainHashes.has(a.txHash) && a.time === "just now");
 const merged = [...result, ...sessionOnly];
 setUserActivity(merged);
 LS.set(`arcana_activity_${addr.toLowerCase()}`, merged);
 }
 setActivityLoading(false);
 }, [userActivity]);
 // ── REFRESH BALANCE ──
 const refreshBal = async (addr) => {
 const b = await getUsdcBalance(addr);
 setUsdcBalance(b);
 };
 // ── CONNECT WALLET ──
 const connectWallet = async () => {
 if (!window.ethereum) { alert("No EVM wallet found! Install MetaMask."); return; }
 try {
 const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
 const addr = accounts[0];
 setAccount(addr);
 refreshBal(addr);
 loadWalletData(addr);
 } catch (e) { console.error(e); }
 };
 const disconnectWallet = () => {
 setAccount(null);
 setUsdcBalance("0.00");
 setPositions([]);
 setTradeResults([]);
 setUserActivity([]);
 };
 // ── AUTO-CONNECT ON MOUNT ──
 useEffect(() => {
 if (window.ethereum) {
 window.ethereum.request({ method: "eth_accounts" }).then(async accs => {
 if (accs.length > 0) {
 setAccount(accs[0]);
 refreshBal(accs[0]);
 loadWalletData(accs[0]);
 }
 });
 window.ethereum.on("accountsChanged", async accs => {
 const addr = accs[0] || null;
 setAccount(addr);
 if (addr) { refreshBal(addr); loadWalletData(addr); }
 else { setUsdcBalance("0.00"); setPositions([]); setTradeResults([]); setUserActivity([]); }
 });
 }
 }, []);
 // ── FETCH REAL STATS ON MOUNT ──
 useEffect(() => {
 const loadStats = async () => {
 const result = await fetchContractStats();
 if (result) {
 setStats(result);
 LS.set("arcana_stats", result);
 }
 };
 loadStats();
 }, []);
 // ── LIVE PRICES ──
 useEffect(() => {
 const fetchPrices = async () => {
 try {
 const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true");
 const data = await res.json();
 setLivePrices({
 bitcoin: { price: data.bitcoin?.usd, change: data.bitcoin?.usd_24h_change },
 ethereum: { price: data.ethereum?.usd, change: data.ethereum?.usd_24h_change },
 solana: { price: data.solana?.usd, change: data.solana?.usd_24h_change },
 });
 } catch (e) {}
 };
 fetchPrices();
 const iv = setInterval(fetchPrices, 30000);
 return () => clearInterval(iv);
 }, []);
 useEffect(() => {
 const timer = setInterval(() => setTickIdx(i => (i + 1) % ALL_MARKETS.length), 3500);
 return () => clearInterval(timer);
 }, []);
 // ── ADD POSITION (persisted) ──
 const addPosition = useCallback((trade) => {
 if (!account) return;
 const key = account.toLowerCase();
 setPositions(prev => {
 const next = [trade, ...prev];
 LS.set(`arcana_positions_${key}`, next);
 return next;
 });
 }, [account]);
 // ── NEW TRADES (session): used to update leaderboard + stats live ──
 const [newTrades, setNewTrades] = useState(() => LS.get("arcana_new_trades", []));
 // ── ADD ACTIVITY (persisted) ──
 const addActivity = useCallback((trade) => {
 if (!account) return;
 const key = account.toLowerCase();
 setUserActivity(prev => {
 const next = [trade, ...prev];
 LS.set(`arcana_activity_${key}`, next);
 return next;
 });
 // Track as new trade for leaderboard + stats auto-update
 const lbEntry = { from: account, usdc: parseFloat(trade.amt), txHash: trade.txHash, time: new Date().toISOString() };
 setNewTrades(prev => {
 const next = [lbEntry, ...prev];
 LS.set("arcana_new_trades", next);
 return next;
 });
 }, [account]);
 const open = (m, s) => { setActive(m); setTradeSide(s || null); };
 const filtered = ALL_MARKETS.filter(m =>
 cat === "Trending" ? m.trending :
 cat === "All" ? true :
 m.cat === cat
 ).filter(m => !q || m.title.toLowerCase().includes(q.toLowerCase()));
 const tick = ALL_MARKETS[tickIdx];
 return (
 <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
 <style>{`
 @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
 * { box-sizing: border-box; margin: 0; padding: 0; }
 .card { transition: all 0.18s; }
 @media (max-width: 640px) {
 .nav-links { display: none !important; }
 .hero-stats { flex-direction: column !important; }
 .top-movers { grid-template-columns: 1fr 1fr !important; }
 .markets-grid { grid-template-columns: 1fr !important; }
 .filter-row { flex-direction: column !important; }
 .filter-search { width: 100% !important; }
 .footer-banner { flex-direction: column !important; }
 .nav-right { gap: 6px !important; }
 .usdc-badge { display: none !important; }
 }
 @media (max-width: 480px) {
 .hero-title { font-size: 28px !important; }
 .top-movers { grid-template-columns: 1fr !important; }
 }
 `}</style>
 {/* NAV */}
 <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.navBg, backdropFilter: "blur(12px)", borderBottom: `1px solid ${t.border}` }}>
 <div style={{ maxWidth: 1380, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 16, height: 56 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, cursor: "pointer" }} onClick={() => setPage("Markets")}>
 <div style={{ width: 30, height: 30, borderRadius: 7, background: t.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
 <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>◈</span>
 </div>
 <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: t.text }}>arcana</span>
 <span style={{ fontSize: 9, background: t.blueDim, color: t.blue, border: `1px solid ${t.blueBorder}`, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", fontWeight: 700 }}>TESTNET</span>
 </div>
 <div className="nav-links" style={{ display: "flex", gap: 1, overflowX: "auto", flex: 1 }}>
 {["Markets", "Portfolio", "Leaderboard", "Activity"].map(n => (
 <button key={n} onClick={() => setPage(n)}
 style={{ padding: "6px 14px", background: page === n ? t.blueDim : "none", border: "none", borderRadius: 8, color: page === n ? t.blue : t.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
 {n}{n === "Portfolio" && positions.length > 0 ? ` (${positions.length})` : ""}
 </button>
 ))}
 </div>
 <div className="nav-right" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
 {account && <div className="usdc-badge" style={{ padding: "6px 12px", background: t.greenBg, border: `1px solid ${t.greenBorder}`, borderRadius: 8, fontSize: 12, color: t.green, fontFamily: "monospace", fontWeight: 700 }}>${usdcBalance} USDC</div>}
 <button onClick={toggleTheme} style={{ position: "relative", width: 52, height: 28, borderRadius: 14, background: dark ? "#3B82F6" : "#E5E7EB", border: "none", cursor: "pointer", transition: "background 0.3s", padding: 0, flexShrink: 0 }}>
 <div style={{ position: "absolute", top: 3, left: dark ? 26 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.3s", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
 {dark ? " " : " "}
 </div>
 </button>
 {account ? (
 <button onClick={disconnectWallet} style={{ padding: "7px 16px", background: t.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>
 ◈ {account.slice(0, 6)}...{account.slice(-4)} ✕
 </button>
 ) : (
 <button onClick={connectWallet} style={{ padding: "7px 16px", background: t.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
 Connect Wallet
 </button>
 )}
 </div>
 </div>
 </nav>
 {/* TICKER */}
 <div style={{ background: t.tickerBg, padding: "7px 20px" }}>
 <div style={{ maxWidth: 1380, margin: "0 auto", display: "flex", alignItems: "center", gap: 20, overflowX: "auto" }}>
 <span style={{ fontSize: 10, fontFamily: "monospace", color: t.tickerText, letterSpacing: 2, flexShrink: 0, opacity: 0.6 }}>LIVE</span>
 {["bitcoin", "ethereum", "solana"].map(coin => {
 const data = livePrices[coin];
 const sym = coin === "bitcoin" ? "BTC" : coin === "ethereum" ? "ETH" : "SOL";
 const up = (data?.change || 0) >= 0;
 return (
 <span key={coin} style={{ fontSize: 11, fontFamily: "monospace", color: t.tickerText, flexShrink: 0, opacity: 0.9 }}>
 {sym} {data ? `$${data.price?.toLocaleString()}` : "—"} <span style={{ color: up ? "#4ade80" : "#f87171" }}>{data ? `${up ? "+" : ""}${data.change?.toFixed(2)}%` : ""}</span>
 </span>
 );
 })}
 <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", margin: "0 4px" }}>·</span>
 <span style={{ fontSize: 11, fontFamily: "monospace", color: t.tickerText, opacity: 0.7, flexShrink: 0 }}>
 {tick?.title.slice(0, 40)}… <span style={{ color: "#4ade80" }}>{pct(tick?.yes)}%</span>
 </span>
 </div>
 </div>
 <div style={{ maxWidth: 1380, margin: "0 auto", padding: "0 20px 60px" }}>
 {page === "Portfolio" && <Portfolio t={t} account={account} positions={positions} tradeResults={tradeResults} />}
 {page === "Leaderboard" && <Leaderboard t={t} account={account} newTrades={newTrades} />}
 {page === "Activity" && <Activity t={t} account={account} userActivity={userActivity} onRefresh={() => refreshChainActivity(account)} loading={activityLoading} />}
 {page === "Markets" && (
 <>
 <div style={{ padding: "44px 0 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
 <div>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.blueDim, border: `1px solid ${t.blueBorder}`, borderRadius: 6, padding: "4px 10px", marginBottom: 12 }}>
 <span style={{ fontSize: 10, fontWeight: 700, color: t.blue, fontFamily: "monospace", letterSpacing: 1 }}>◈ ARC TESTNET · LIVE</span>
 </div>
 <h1 className="hero-title" style={{ fontSize: "clamp(26px,4vw,46px)", fontWeight: 800, letterSpacing: -1.5, color: t.text, lineHeight: 1.1, marginBottom: 10 }}>
 Predict.<br />Trade.<br />Win USDC.
 </h1>
 <p style={{ fontSize: 15, color: t.textMuted, maxWidth: 500, lineHeight: 1.65 }}>
 {ALL_MARKETS.length} markets · Real USDC · Built on Arc Network
 </p>
 </div>
 <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }} className="hero-stats">
 {[
 [stats.totalVolume, "Total Volume"],
 [stats.openMarkets, "Open Markets"],
 [stats.traderCount, "Traders"],
 ].map(([v, l]) => (
 <div key={l} style={{ textAlign: "center", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "16px 24px" }}>
 <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: t.blue }}>{v}</div>
 <div style={{ fontSize: 11, color: t.textMuted, fontFamily: "monospace" }}>{l}</div>
 </div>
 ))}
 </div>
 </div>
 {/* TOP MOVERS */}
 <div style={{ marginBottom: 32 }}>
 <div style={{ fontSize: 11, fontFamily: "monospace", color: t.textMuted, letterSpacing: 2, marginBottom: 12 }}>TOP MOVERS</div>
 <div className="top-movers" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
 {TOP_MOVERS.map(m => {
 const up = m.chg >= 0;
 return (
 <div key={m.id} onClick={() => open(m)} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s" }}
 onMouseEnter={e => e.currentTarget.style.borderColor = t.blue}
 onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
 <div style={{ flex: 1 }}>
 <p style={{ fontSize: 12, color: t.text, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{m.title.slice(0, 30)}…</p>
 <span style={{ fontSize: 11, fontFamily: "monospace", color: t.textMuted }}>{pct(m.yes)}%</span>
 </div>
 <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: up ? t.green : t.red }}>{up ? "+" : ""}{Math.round(m.chg * 100)}%</span>
 </div>
 );
 })}
 </div>
 </div>
 {/* FILTERS */}
 <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }} className="filter-row">
 <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
 {CATS.map(c => (
 <button key={c} onClick={() => setCat(c)}
 style={{ padding: "6px 13px", background: cat === c ? t.blue : t.surface, border: `1px solid ${cat === c ? t.blue : t.border}`, borderRadius: 20, color: cat === c ? "#fff" : t.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</button>
 ))}
 </div>
 <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
 <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." className="filter-search"
 style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "7px 12px", color: t.text, fontSize: 13, outline: "none", width: 160 }} />
 <select value={sort} onChange={e => setSort(e.target.value)}
 style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "7px 10px", color: t.text, fontSize: 12, cursor: "pointer" }}>
 <option value="volume">By Volume</option>
 <option value="newest">Newest</option>
 </select>
 </div>
 </div>
 <div style={{ marginBottom: 16, fontSize: 12, color: t.textMuted, fontFamily: "monospace" }}>{filtered.length} markets</div>
 <div className="markets-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
 {filtered.map(m => (
 <div key={m.id} className="card">
 <GridCard m={m} onTrade={open} t={t}
 livePrice={
 m.cat === "Crypto" && m.title.includes("BTC") && livePrices.bitcoin ? `BTC $${livePrices.bitcoin.price?.toLocaleString()}` :
 m.cat === "Crypto" && m.title.includes("ETH") && livePrices.ethereum ? `ETH $${livePrices.ethereum.price?.toLocaleString()}` :
 null
 }
 />
 </div>
 ))}
 </div>
 {filtered.length === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: t.textMuted }}>No markets found</div>}
 {/* FOOTER BANNER */}
 <div style={{ marginTop: 52, background: t.navy, borderRadius: 16, padding: "30px 34px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }} className="footer-banner">
 <div style={{ width: 48, height: 48, borderRadius: 12, background: t.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>◈</div>
 <div style={{ flex: 1 }}>
 <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 5, color: "#fff" }}>Powered by Arc Network</h3>
 <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Every prediction trade settles on-chain with real USDC.</p>
 </div>
 <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
 {[["0x3600...0000", "USDC"], ["0x4cef52", "Chain ID"], ["< 1s", "Finality"], ["USDC", "Gas Token"]].map(([v, l]) => (
 <div key={l} style={{ textAlign: "center" }}>
 <div style={{ fontSize: 12, fontFamily: "monospace", color: "#fff", fontWeight: 700 }}>{v}</div>
 <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{l}</div>
 </div>
 ))}
 </div>
 </div>
 </>
 )}
 </div>
 <footer style={{ borderTop: `1px solid ${t.border}`, padding: 20, textAlign: "center", background: t.bg }}>
 <p style={{ fontSize: 11, fontFamily: "monospace", color: t.textLight }}>✦ ARCANA.MARKETS · ARC TESTNET · {CONTRACT_ADDRESS.slice(0, 10)}…</p>
 </footer>
 {active && (
 <TradeModal
 m={active}
 initSide={tradeSide}
 onClose={() => { setActive(null); setTradeSide(null); }}
 t={t}
 account={account}
 usdcBalance={usdcBalance}
 onPositionAdded={addPosition}
 onActivityAdded={addActivity}
 />
 )}
 </div>
 );
}