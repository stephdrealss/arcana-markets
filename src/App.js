import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
// ── CONTRACT CONFIG ───────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = '0x443a47eF1025e047879b1BA08c94e6dedB354D54';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const ARC_CHAIN_ID = '0x4cef52';
const ARC_RPC = 'https://rpc.testnet.arc.network';
// ── CONTRACT ABI ──────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
  'function buyShares(uint256 _marketId, bool _isYes, uint256 _usdcAmount) external',
  'function createMarket(string memory _title, string memory _category, uint256 _endTime) external returns (uint256)',
  'function markets(uint256) external view returns (uint256 id, string title, string category, uint256 yesPool, uint256 noPool, uint256 endTime, bool resolved, bool cancelled)',
  'function marketCount() external view returns (uint256)',
];
const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];
// ── GET USDC BALANCE ──────────────────────────────────────────────────────────
async function getUsdcBalance(addr) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    const bal = await usdc.balanceOf(addr);
    return (Number(bal) / 1e6).toFixed(2);
  } catch (e) {
    return '0.00';
  }
}
// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: '#F5F4EF',
    surface: '#FFFFFF',
    surfaceAlt: '#EEEDE8',
    surfaceHov: '#F0EFE9',
    text: '#0A0A14',
    textMuted: '#5A5A72',
    textLight: '#9CA3AF',
    blue: '#0057FF',
    blueDim: '#EEF3FF',
    blueBorder: 'rgba(0,87,255,0.2)',
    navy: '#0A0A14',
    border: '#E5E4DF',
    borderStrong: '#C9C8C3',
    green: '#16A34A',
    greenBg: '#F0FDF4',
    greenBorder: 'rgba(22,163,74,0.35)',
    red: '#DC2626',
    redBg: '#FEF2F2',
    redBorder: 'rgba(220,38,38,0.35)',
    amber: '#D97706',
    amberBg: 'rgba(217,119,6,0.1)',
    navBg: 'rgba(245,244,239,0.95)',
    tickerBg: '#0057FF',
    tickerText: 'rgba(255,255,255,0.9)',
    shadow: '0 1px 4px rgba(0,0,0,0.07)',
    shadowHov: '0 6px 20px rgba(0,87,255,0.1)',
    cardBorder: '#E5E4DF',
    cardBorderHov: '#0057FF',
  },
  dark: {
    bg: '#07061A',
    surface: '#0F0D22',
    surfaceAlt: '#15122E',
    surfaceHov: '#1A1735',
    text: '#E8E8F0',
    textMuted: '#8B8BA8',
    textLight: '#5A5A72',
    blue: '#3B82F6',
    blueDim: 'rgba(59,130,246,0.1)',
    blueBorder: 'rgba(59,130,246,0.25)',
    navy: '#1A1735',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.15)',
    green: '#22C55E',
    greenBg: 'rgba(34,197,94,0.1)',
    greenBorder: 'rgba(34,197,94,0.35)',
    red: '#F87171',
    redBg: 'rgba(248,113,113,0.08)',
    redBorder: 'rgba(248,113,113,0.3)',
    amber: '#FB923C',
    amberBg: 'rgba(251,146,60,0.1)',
    navBg: 'rgba(7,6,26,0.94)',
    tickerBg: '#1A1735',
    tickerText: 'rgba(255,255,255,0.8)',
    shadow: '0 1px 4px rgba(0,0,0,0.3)',
    shadowHov: '0 6px 24px rgba(59,130,246,0.15)',
    cardBorder: 'rgba(255,255,255,0.07)',
    cardBorderHov: '#3B82F6',
  },
};
const ALL_MARKETS = [
  {
    id: 26,
    title: 'OpenAI releases GPT-5 in 2026?',
    cat: 'Tech & AI',
    yes: 0.77,
    chg: +0.05,
    vol: '6,400,000',
    ends: 'Dec 31 2026',
    hot: true,
    trending: true,
  },
  {
    id: 2,
    title: 'BTC hits $120K before July 2026?',
    cat: 'Crypto',
    yes: 0.61,
    chg: +0.04,
    vol: '8,412,000',
    ends: 'Jul 1 2026',
    hot: true,
  },
  {
    id: 3,
    title: 'ETH flips BTC market cap in 2026?',
    cat: 'Crypto',
    yes: 0.12,
    chg: -0.03,
    vol: '3,201,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 4,
    title: 'Spot SOL ETF approved in 2026?',
    cat: 'Crypto',
    yes: 0.38,
    chg: +0.06,
    vol: '2,870,500',
    ends: 'Dec 31 2026',
  },
  {
    id: 5,
    title: 'USDC market cap exceeds $100B in 2026?',
    cat: 'Crypto',
    yes: 0.47,
    chg: +0.02,
    vol: '1,950,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 6,
    title: 'Arc Network mainnet launches Q2 2026?',
    cat: 'Arc',
    yes: 0.72,
    chg: +0.08,
    vol: '4,100,000',
    ends: 'Jun 30 2026',
    hot: true,
    trending: true,
  },
  {
    id: 7,
    title: 'Arc TVL surpasses $500M by end of 2026?',
    cat: 'Arc',
    yes: 0.44,
    chg: +0.03,
    vol: '2,300,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 8,
    title: 'Arc-native DEX launches with $10M+ TVL?',
    cat: 'Arc',
    yes: 0.58,
    chg: +0.05,
    vol: '1,800,000',
    ends: 'Dec 31 2026',
    trending: true,
  },
  {
    id: 9,
    title: 'Arc Architects Program reaches 5K members?',
    cat: 'Arc',
    yes: 0.66,
    chg: +0.07,
    vol: '990,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 10,
    title: 'Real Madrid wins 2025-26 Champions League?',
    cat: 'Sports',
    yes: 0.31,
    chg: -0.04,
    vol: '5,670,000',
    ends: 'May 31 2026',
    hot: true,
  },
  {
    id: 11,
    title: 'Golden State Warriors make 2026 NBA Playoffs?',
    cat: 'Sports',
    yes: 0.22,
    chg: -0.02,
    vol: '2,100,000',
    ends: 'Apr 30 2026',
  },
  {
    id: 12,
    title: 'Canelo Alvarez wins next fight by KO?',
    cat: 'Sports',
    yes: 0.54,
    chg: +0.03,
    vol: '1,450,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 13,
    title: 'Lewis Hamilton wins a race in 2026 F1 season?',
    cat: 'Sports',
    yes: 0.48,
    chg: +0.02,
    vol: '3,450,000',
    ends: 'Nov 30 2026',
    hot: true,
  },
  {
    id: 14,
    title: 'Tiger Woods plays in 2026 Masters?',
    cat: 'Sports',
    yes: 0.19,
    chg: -0.06,
    vol: '4,200,000',
    ends: 'Apr 13 2026',
  },
  {
    id: 15,
    title: 'Lionel Messi retires before end of 2026?',
    cat: 'Sports',
    yes: 0.08,
    chg: -0.01,
    vol: '1,890,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 24,
    title: 'US passes comprehensive crypto legislation?',
    cat: 'Politics',
    yes: 0.41,
    chg: +0.03,
    vol: '6,700,000',
    ends: 'Dec 31 2026',
    trending: true,
  },
  {
    id: 29,
    title: 'G7 nation adopts a CBDC by end of 2026?',
    cat: 'Politics',
    yes: 0.27,
    chg: -0.02,
    vol: '3,200,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 30,
    title: 'UK snap election called before end of 2026?',
    cat: 'Politics',
    yes: 0.14,
    chg: -0.01,
    vol: '1,100,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 31,
    title: 'Trump approval rating above 50% before midterms?',
    cat: 'Politics',
    yes: 0.33,
    chg: +0.01,
    vol: '7,800,000',
    ends: 'Nov 3 2026',
  },
  {
    id: 25,
    title: 'Fed cuts rates twice before August 2026?',
    cat: 'Macro',
    yes: 0.23,
    chg: -0.07,
    vol: '5,400,000',
    ends: 'Aug 1 2026',
    hot: true,
  },
  {
    id: 32,
    title: 'S&P 500 hits all-time high above 6,500 in 2026?',
    cat: 'Macro',
    yes: 0.55,
    chg: +0.09,
    vol: '4,560,000',
    ends: 'Dec 31 2026',
    trending: true,
  },
  {
    id: 33,
    title: 'US enters recession in 2026?',
    cat: 'Macro',
    yes: 0.31,
    chg: +0.06,
    vol: '5,100,000',
    ends: 'Dec 31 2026',
    hot: true,
    trending: true,
  },
  {
    id: 34,
    title: 'Gold hits $3,500/oz before end of 2026?',
    cat: 'Macro',
    yes: 0.62,
    chg: +0.09,
    vol: '3,870,000',
    ends: 'Dec 31 2026',
    hot: true,
    trending: true,
  },
  {
    id: 35,
    title: 'Apple Vision Pro 2 announced in 2026?',
    cat: 'Tech & AI',
    yes: 0.43,
    chg: -0.02,
    vol: '2,100,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 36,
    title: 'AI-generated content banned on a major platform?',
    cat: 'Tech & AI',
    yes: 0.18,
    chg: -0.04,
    vol: '1,650,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 37,
    title: "Elon Musk's xAI surpasses $100B valuation?",
    cat: 'Tech & AI',
    yes: 0.52,
    chg: +0.06,
    vol: '3,300,000',
    ends: 'Dec 31 2026',
    trending: true,
  },
  {
    id: 27,
    title: 'Taylor Swift announces new album before June 2026?',
    cat: 'Culture',
    yes: 0.34,
    chg: +0.02,
    vol: '2,890,000',
    ends: 'Jun 1 2026',
  },
  {
    id: 38,
    title: 'Netflix gains more than 20M subscribers in Q1?',
    cat: 'Culture',
    yes: 0.61,
    chg: +0.03,
    vol: '1,200,000',
    ends: 'Apr 1 2026',
  },
  {
    id: 39,
    title: 'A Marvel film tops $2B at the box office in 2026?',
    cat: 'Culture',
    yes: 0.39,
    chg: -0.02,
    vol: '2,450,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 40,
    title: 'NASA Artemis Moon landing happens before 2027?',
    cat: 'Science',
    yes: 0.17,
    chg: -0.05,
    vol: '3,100,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 41,
    title: 'A lab-grown meat product hits major US grocery chain?',
    cat: 'Science',
    yes: 0.29,
    chg: +0.04,
    vol: '1,780,000',
    ends: 'Dec 31 2026',
  },
  {
    id: 28,
    title: 'Global average temp sets new record high in 2026?',
    cat: 'Science',
    yes: 0.71,
    chg: +0.08,
    vol: '2,900,000',
    ends: 'Dec 31 2026',
    trending: true,
  },
  {
    id: 42,
    title: 'Quantum computer breaks RSA-2048 encryption?',
    cat: 'Science',
    yes: 0.09,
    chg: -0.01,
    vol: '1,430,000',
    ends: 'Dec 31 2026',
  },
];
const CATS = [
  'All',
  'Trending',
  'Crypto',
  'Arc',
  'Sports',
  'Politics',
  'Macro',
  'Tech & AI',
  'Culture',
  'Science',
];
const TOP_MOVERS = [...ALL_MARKETS]
  .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
  .slice(0, 4);
const pct = (v) => Math.round(v * 100);
function Spark({ prob, up, col }) {
  const pts = Array.from({ length: 10 }, (_, i) =>
    Math.max(
      4,
      Math.min(64, prob * 54 + 10 + Math.sin(i * 1.8 + (up ? 0 : Math.PI)) * 8)
    )
  );
  const d = pts
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${(i / 9) * 80},${68 - y}`)
    .join(' ');
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
      <path
        d={d}
        fill="none"
        stroke={col}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Portfolio({ t, account, positions }) {
  if (!account)
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
        <p style={{ color: t.textMuted }}>
          Connect your wallet to view portfolio
        </p>
      </div>
    );
  if (positions.length === 0)
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
        <p style={{ color: t.textMuted }}>
          No positions yet. Place your first trade!
        </p>
      </div>
    );
  const total = positions.reduce((s, p) => s + parseFloat(p.amt), 0);
  return (
    <div style={{ padding: '32px 0' }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: t.text,
          marginBottom: 24,
        }}
      >
        Your Portfolio
      </h2>
      <div
        style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}
      >
        {[
          ['Total Invested', `$${total.toFixed(2)} USDC`],
          ['Open Positions', positions.length],
          ['Win Rate', '—'],
        ].map(([l, v]) => (
          <div
            key={l}
            style={{
              background: t.surface,
              border: `1.5px solid ${t.border}`,
              borderRadius: 12,
              padding: '16px 20px',
              minWidth: 140,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: t.textLight,
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              {l}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                fontFamily: 'monospace',
                color: t.text,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {positions.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: t.text,
                fontWeight: 600,
                margin: 0,
                flex: 1,
              }}
            >
              {p.market}
            </p>
            <span
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 700,
                color: p.side === 'YES' ? t.green : t.red,
              }}
            >
              {p.side}
            </span>
            <span
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: t.text,
                minWidth: 80,
              }}
            >
              ${p.amt} USDC
            </span>
            <a
              href={`https://testnet.arcscan.app/tx/${p.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: t.blue }}
            >
              View →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
function Leaderboard({ t }) {
  const data = [
    {
      rank: 1,
      addr: '0xSteph...8a3F',
      pnl: '+$12,840',
      trades: 47,
      winRate: '74%',
      badge: ' ',
    },
    {
      rank: 2,
      addr: '0xArc...9B2c',
      pnl: '+$8,210',
      trades: 31,
      winRate: '68%',
      badge: ' ',
    },
    {
      rank: 3,
      addr: '0xDefi...4E7a',
      pnl: '+$5,640',
      trades: 28,
      winRate: '64%',
      badge: ' ',
    },
    {
      rank: 4,
      addr: '0xAlpha...3F1b',
      pnl: '+$3,920',
      trades: 22,
      winRate: '59%',
      badge: '',
    },
    {
      rank: 5,
      addr: '0xMoon...7D2e',
      pnl: '+$2,180',
      trades: 19,
      winRate: '55%',
      badge: '',
    },
  ];
  return (
    <div style={{ padding: '32px 0' }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: t.text,
          marginBottom: 6,
        }}
      >
        Leaderboard
      </h2>
      <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>
        Top traders on Arcana Markets
      </p>
      <div
        style={{
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {data.map((row) => (
          <div
            key={row.rank}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <span style={{ fontSize: 14, width: 24, textAlign: 'center' }}>
              {row.badge || `#${row.rank}`}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: 'monospace',
                color: t.text,
              }}
            >
              {row.addr}
            </span>
            <span
              style={{
                fontSize: 13,
                fontFamily: 'monospace',
                fontWeight: 700,
                color: t.green,
              }}
            >
              {row.pnl}
            </span>
            <span
              style={{
                fontSize: 12,
                color: t.textMuted,
                minWidth: 60,
                textAlign: 'right',
              }}
            >
              {row.winRate} WR
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Activity({ t, userActivity }) {
  if (userActivity.length === 0)
    return (
      <div style={{ padding: '32px 0' }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: t.text,
            marginBottom: 6,
          }}
        >
          Activity
        </h2>
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: t.surface,
            border: `1.5px solid ${t.border}`,
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}> </div>
          <p style={{ fontSize: 14, color: t.textMuted }}>
            No trades yet. Place your first trade!
          </p>
        </div>
      </div>
    );
  return (
    <div style={{ padding: '32px 0' }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: t.text,
          marginBottom: 6,
        }}
      >
        Activity
      </h2>
      <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>
        Your real on-chain trades
      </p>
      <div
        style={{
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {userActivity.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 700,
                color: row.side === 'YES' ? t.green : t.red,
              }}
            >
              {row.side}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: t.text }}>
              {row.market}
            </span>
            <span
              style={{ fontSize: 12, fontFamily: 'monospace', color: t.text }}
            >
              ${row.amt} USDC
            </span>
            <span style={{ fontSize: 11, color: t.textMuted }}>{row.time}</span>
            <a
              href={`https://testnet.arcscan.app/tx/${row.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: t.blue }}
            >
              View →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
function GridCard({ m, onTrade, t, livePrice }) {
  const [hov, setHov] = useState(false);
  const yes = pct(m.yes),
    no = 100 - yes,
    up = m.chg >= 0,
    sparkCol = up ? t.green : t.red;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: t.surface,
        border: `1.5px solid ${hov ? t.cardBorderHov : t.cardBorder}`,
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'all 0.18s',
        boxShadow: hov ? t.shadowHov : t.shadow,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={() => onTrade(m, null)}
    >
      <div
        style={{
          height: 3,
          background: hov ? t.blue : t.border,
          transition: 'background 0.2s',
        }}
      />
      <div
        style={{
          padding: '15px 17px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: t.blueDim,
                border: `1px solid ${t.blueBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 15 }}>◈</span>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: t.blue,
                background: t.blueDim,
                padding: '2px 7px',
                borderRadius: 20,
                border: `1px solid ${t.blueBorder}`,
              }}
            >
              {m.cat}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {m.hot && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: t.amber,
                  background: t.amberBg,
                  padding: '2px 6px',
                  borderRadius: 10,
                }}
              >
                HOT
              </span>
            )}
            {m.trending && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: t.green,
                  background: t.greenBg,
                  padding: '2px 6px',
                  borderRadius: 10,
                }}
              >
                +TRENDING
              </span>
            )}
          </div>
        </div>
        {livePrice && (
          <div
            style={{
              background: t.blueDim,
              border: `1px solid ${t.blueBorder}`,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'monospace',
              color: t.blue,
            }}
          >
            Live: ${livePrice.price?.toLocaleString()}{' '}
            <span style={{ color: livePrice.change >= 0 ? t.green : t.red }}>
              {livePrice.change >= 0 ? '+' : ''}
              {livePrice.change?.toFixed(1)}%
            </span>
          </div>
        )}
        <p
          style={{
            fontSize: 14,
            color: t.text,
            lineHeight: 1.5,
            margin: 0,
            fontWeight: 600,
            flex: 1,
          }}
        >
          {m.title}
        </p>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  color: t.text,
                  lineHeight: 1,
                  fontFamily: 'monospace',
                }}
              >
                {yes}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: t.textMuted,
                  fontFamily: 'monospace',
                }}
              >
                % chance
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Spark prob={m.yes} up={up} col={sparkCol} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: sparkCol,
                  fontFamily: 'monospace',
                }}
              >
                {up ? '+' : ''}
                {Math.round(m.chg * 100)}%
              </span>
            </div>
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 3,
              background: t.surfaceAlt,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${yes}%`,
                background: t.blue,
                borderRadius: 3,
                transition: 'width 0.5s',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: t.blue,
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              YES {yes}¢
            </span>
            <span
              style={{
                fontSize: 11,
                color: t.textLight,
                fontFamily: 'monospace',
              }}
            >
              NO {no}¢
            </span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: t.textLight,
                fontFamily: 'monospace',
              }}
            >
              Vol
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: t.text,
              }}
            >
              ${m.vol}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: t.textLight,
                fontFamily: 'monospace',
              }}
            >
              Ends
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: t.text,
              }}
            >
              {m.ends}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['YES', yes, t.green, t.greenBg, t.greenBorder],
            ['NO', no, t.red, t.redBg, t.redBorder],
          ].map(([lbl, val, col, bg, border]) => {
            const mEndDate = new Date(
              (m.ends || '') + (/20\d\d/.test(m.ends || '') ? '' : ' 2026')
            );
            const mEnded = !isNaN(mEndDate.getTime()) && mEndDate < new Date();
            return (
              <button
                key={lbl}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!mEnded) onTrade(m, lbl);
                }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  background: mEnded ? t.surfaceAlt : bg,
                  border: `1.5px solid ${mEnded ? t.border : border}`,
                  color: mEnded ? t.textLight : col,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: mEnded ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s',
                }}
              >
                {mEnded ? 'ENDED' : lbl + ' ' + val + '¢'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function TradeModal({
  m,
  initSide,
  onClose,
  t,
  account,
  usdcBalance,
  onPositionAdded,
  onActivityAdded,
}) {
  const [side, setSide] = useState(initSide || 'YES');
  const [amt, setAmt] = useState('20');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  if (!m) return null;
  // Check if market has ended
  const now = new Date();
  const endsStr = m.ends || '';
  const hasYear = /20\d\d/.test(endsStr);
  const endDate = new Date(hasYear ? endsStr : endsStr + ' 2026');
  const isMarketEnded = !isNaN(endDate.getTime()) && endDate < now;
  const prob = side === 'YES' ? m.yes : 1 - m.yes;
  const cents = Math.round(prob * 100);
  const shares = amt ? (parseFloat(amt) / prob).toFixed(2) : '0.00';
  const payout = parseFloat(shares).toFixed(2);
  const profit = amt
    ? (parseFloat(payout) - parseFloat(amt)).toFixed(2)
    : '0.00';
  const isYes = side === 'YES';
  const switchToArc = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID }],
      });
    } catch (e) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARC_CHAIN_ID,
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              rpcUrls: [ARC_RPC],
              blockExplorerUrls: ['https://testnet.arcscan.app'],
            },
          ],
        });
      } catch (addErr) {
        console.log('Network already exists, continuing...');
      }
    }
  };
  const placeOrder = async () => {
    if (!account) {
      setError('Connect your wallet first!');
      return;
    }
    if (!amt || parseFloat(amt) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (parseFloat(usdcBalance) < parseFloat(amt)) {
      setError(`Insufficient USDC. You have ${usdcBalance} USDC`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setLoadingMsg('Switching to Arc Testnet...');
      await switchToArc();
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const arcanaContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );
      const usdcAmt = ethers.utils.parseUnits(parseFloat(amt).toFixed(6), 6);
      // Step 1: Approve USDC
      setLoadingMsg('Step 1/2: Approve USDC spend in wallet...');
      const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, usdcAmt);
      setLoadingMsg('Waiting for approval confirmation...');
      await approveTx.wait();
      // Step 2: Buy Shares
      setLoadingMsg('Step 2/2: Place your trade in wallet...');
      const tradeTx = await arcanaContract.buyShares(m.id, isYes, usdcAmt);
      setLoadingMsg('Confirming on Arc...');
      const receipt = await tradeTx.wait();
      if (receipt.status === 0)
        throw new Error(
          'Trade failed on-chain. The market may need to be created first.'
        );
      setTxHash(tradeTx.hash);
      onPositionAdded({ market: m.title, side, amt, txHash: tradeTx.hash });
      onActivityAdded({
        market: m.title,
        side,
        amt,
        time: 'just now',
        txHash: tradeTx.hash,
      });
      setDone(true);
    } catch (err) {
      console.error(err);
      if (
        err.code === 4001 ||
        err.message?.includes('rejected') ||
        err.message?.includes('user rejected')
      )
        setError('You rejected the transaction.');
      else setError(err.message || 'Transaction failed. Please try again.');
    }
    setLoading(false);
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 420,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            height: 3,
            background: isMarketEnded ? t.amber : t.blue,
            borderRadius: '16px 16px 0 0',
          }}
        />
        <div style={{ padding: '20px' }}>
          {isMarketEnded ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}> </div>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: t.text,
                  marginBottom: 8,
                }}
              >
                Market Closed
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: t.textMuted,
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                This market has ended and is no longer accepting trades.
              </p>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: t.blue,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          ) : done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: t.greenBg,
                  border: `2px solid ${t.green}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  margin: '0 auto 16px',
                }}
              >
                ✓
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: t.text,
                  marginBottom: 8,
                }}
              >
                Trade Confirmed!
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: t.textMuted,
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                Your position has been placed on Arc Testnet.
              </p>
              <div
                style={{
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 16,
                  textAlign: 'left',
                }}
              >
                {[
                  ['Market', m.title.slice(0, 30) + '…'],
                  ['Side', `${side} @ ${cents}¢`],
                  ['Amount', `$${amt} USDC`],
                  ['Shares', shares],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: t.textMuted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {k}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: t.blue,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <a
                href={`https://testnet.arcscan.app/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block',
                  padding: '10px',
                  background: t.blueDim,
                  color: t.blue,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 10,
                  textDecoration: 'none',
                }}
              >
                View on ArcScan →
              </a>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: t.blue,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: t.text,
                    lineHeight: 1.4,
                    margin: 0,
                    fontWeight: 600,
                    flex: 1,
                    paddingRight: 12,
                  }}
                >
                  {m.title}
                </p>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: t.textMuted,
                    cursor: 'pointer',
                    fontSize: 20,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              {account && (
                <div
                  style={{
                    background: t.greenBg,
                    border: `1px solid ${t.greenBorder}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: t.green,
                    marginBottom: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  YOUR USDC BALANCE: {usdcBalance} USDC
                </div>
              )}
              {!account && (
                <div
                  style={{
                    background: t.amberBg,
                    border: `1px solid ${t.amber}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: t.amber,
                    marginBottom: 12,
                  }}
                >
                  Connect wallet to trade
                </div>
              )}
              {error && (
                <div
                  style={{
                    background: t.redBg,
                    border: `1px solid ${t.redBorder}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: t.red,
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}
              {loading && (
                <div
                  style={{
                    background: t.blueDim,
                    border: `1px solid ${t.blueBorder}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: t.blue,
                    marginBottom: 12,
                  }}
                >
                  {' '}
                  {loadingMsg}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  background: t.bg,
                  borderRadius: 10,
                  padding: 4,
                  marginBottom: 16,
                }}
              >
                {['YES', 'NO'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 7,
                      background:
                        side === s
                          ? s === 'YES'
                            ? t.green
                            : t.red
                          : 'transparent',
                      border: 'none',
                      color: side === s ? '#fff' : t.textMuted,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: t.textMuted,
                    fontFamily: 'monospace',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  AMOUNT (USDC)
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: t.bg,
                    border: `1.5px solid ${t.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      padding: '12px 12px',
                      color: t.textMuted,
                      fontFamily: 'monospace',
                      fontSize: 14,
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: t.text,
                      fontSize: 16,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      outline: 'none',
                      padding: '12px 0',
                    }}
                  />
                  <span
                    style={{
                      padding: '12px 14px',
                      color: t.textMuted,
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    USDC
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {['5', '10', '25', '50', '100'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmt(v)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        background: t.surfaceAlt,
                        border: `1px solid ${t.border}`,
                        borderRadius: 6,
                        color: t.textMuted,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                      }}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
              <div
                style={{
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 14,
                }}
              >
                {[
                  ['Avg price', `${cents}¢`],
                  ['Shares', shares],
                  ['Potential profit', `+$${profit}`],
                  ['Max payout', `$${payout}`],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: t.textMuted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {k}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: t.text,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={placeOrder}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? t.surfaceAlt : t.blue,
                  color: loading ? t.textMuted : '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  letterSpacing: 0.5,
                  transition: 'all 0.2s',
                }}
              >
                {loading ? ' PROCESSING...' : `PLACE ${side} ORDER ON ARC`}
              </button>
              <p
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  color: t.textLight,
                  fontFamily: 'monospace',
                  marginTop: 8,
                }}
              >
                Real USDC · Arc Testnet · Chain ID 5042002
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default function ArcanaMarkets() {
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState('Markets');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('volume');
  const [active, setActive] = useState(null);
  const [tradeSide, setTradeSide] = useState(null);
  const [account, setAccount] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState('0.00');
  const [tickIdx, setTickIdx] = useState(0);
  const [positions, setPositions] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const t = dark ? THEMES.dark : THEMES.light;
  const refreshBal = async (addr) => {
    const b = await getUsdcBalance(addr);
    setUsdcBalance(b);
  };
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('No EVM wallet found! Install MetaMask.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      setAccount(accounts[0]);
      refreshBal(accounts[0]);
    } catch (e) {
      console.error(e);
    }
  };
  const disconnectWallet = () => {
    setAccount(null);
    setUsdcBalance('0.00');
  };
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(async (accs) => {
        if (accs.length > 0) {
          setAccount(accs[0]);
          refreshBal(accs[0]);
        }
      });
      window.ethereum.on('accountsChanged', async (accs) => {
        setAccount(accs[0] || null);
        if (accs[0]) refreshBal(accs[0]);
        else setUsdcBalance('0.00');
      });
    }
  }, []);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
        );
        const data = await res.json();
        setLivePrices({
          bitcoin: {
            price: data.bitcoin?.usd,
            change: data.bitcoin?.usd_24h_change,
          },
          ethereum: {
            price: data.ethereum?.usd,
            change: data.ethereum?.usd_24h_change,
          },
          solana: {
            price: data.solana?.usd,
            change: data.solana?.usd_24h_change,
          },
        });
      } catch (e) {}
    };
    fetch_();
    const iv = setInterval(fetch_, 30000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const timer = setInterval(
      () => setTickIdx((i) => (i + 1) % ALL_MARKETS.length),
      3500
    );
    return () => clearInterval(timer);
  }, []);
  const open = (m, s) => {
    setActive(m);
    setTradeSide(s || null);
  };
  const filtered = ALL_MARKETS.filter((m) =>
    cat === 'Trending' ? m.trending : cat === 'All' ? true : m.cat === cat
  ).filter((m) => m.title.toLowerCase().includes(q.toLowerCase()));
  const tick = ALL_MARKETS[tickIdx];
  return (
    <div
      style={{
        minHeight: '100vh',
        background: t.bg,
        color: t.text,
        fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <style>{`
 @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
 * { box-sizing: border-box; margin: 0; padding: 0; }
 .card { transition: all 0.18s; }
 @media (max-width: 640px) {
 .nav-links { display: none !important; }
 .hero-stats { flex-direction: column !important; }
 .top-movers { grid-template-columns: 1fr 1fr !important; }
 .markets-grid { grid-template-columns: 1fr !important; }
 .filter-row { flex-direction: column !important; }
 .filter-search { width: 100% !important; }
 .ticker { overflow-x: auto; }
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
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: t.navBg,
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1380,
            margin: '0 auto',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            height: 56,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onClick={() => setPage('Markets')}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: t.blue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>
                ◈
              </span>
            </div>
            <span
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: -0.5,
                color: t.text,
              }}
            >
              arcana
            </span>
            <span
              style={{
                fontSize: 9,
                background: t.blueDim,
                color: t.blue,
                border: `1px solid ${t.blueBorder}`,
                padding: '2px 6px',
                borderRadius: 6,
                fontWeight: 700,
              }}
            >
              BETA
            </span>
          </div>
          <div
            className="nav-links"
            style={{ display: 'flex', gap: 1, overflowX: 'auto', flex: 1 }}
          >
            {['Markets', 'Portfolio', 'Leaderboard', 'Activity'].map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                style={{
                  padding: '6px 14px',
                  background: page === n ? t.blueDim : 'transparent',
                  border: 'none',
                  color: page === n ? t.blue : t.textMuted,
                  fontWeight: page === n ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                {n}
                {n === 'Portfolio' && positions.length > 0
                  ? ` (${positions.length})`
                  : ''}
              </button>
            ))}
          </div>
          <div
            className="nav-right"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {account && (
              <div
                className="usdc-badge"
                style={{
                  padding: '6px 12px',
                  background: t.greenBg,
                  border: `1px solid ${t.greenBorder}`,
                  borderRadius: 20,
                  fontSize: 12,
                  color: t.green,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              >
                {usdcBalance} USDC
              </div>
            )}
            {/* DARK/LIGHT TOGGLE */}
            <button
              onClick={() => setDark(!dark)}
              style={{
                position: 'relative',
                width: 52,
                height: 28,
                borderRadius: 14,
                background: dark ? '#3B82F6' : '#E5E7EB',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.3s',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 3,
                  left: dark ? 26 : 3,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                }}
              >
                {dark ? ' ' : ' '}
              </div>
            </button>
            {account ? (
              <button
                onClick={disconnectWallet}
                style={{
                  padding: '7px 16px',
                  background: t.blue,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ◈ {account.slice(0, 6)}...{account.slice(-4)} ✕
              </button>
            ) : (
              <button
                onClick={connectWallet}
                style={{
                  padding: '7px 16px',
                  background: t.blue,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>
      {/* TICKER */}
      <div style={{ background: t.tickerBg, padding: '7px 20px' }}>
        <div
          style={{
            maxWidth: 1380,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            overflowX: 'auto',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              color: t.tickerText,
              letterSpacing: 2,
              flexShrink: 0,
              opacity: 0.7,
            }}
          >
            LIVE
          </span>
          {['bitcoin', 'ethereum', 'solana'].map((coin) => {
            const data = livePrices[coin];
            const sym =
              coin === 'bitcoin' ? 'BTC' : coin === 'ethereum' ? 'ETH' : 'SOL';
            return data ? (
              <span
                key={coin}
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: t.tickerText,
                  flexShrink: 0,
                }}
              >
                {sym} ${data.price?.toLocaleString()}{' '}
                <span
                  style={{ color: data.change >= 0 ? '#86efac' : '#fca5a5' }}
                >
                  {data.change >= 0 ? '+' : ''}
                  {data.change?.toFixed(2)}%
                </span>
              </span>
            ) : null;
          })}
          <span
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.4)',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            ◈ {tick?.title.slice(0, 40)}… {pct(tick?.yes || 0)}%
          </span>
        </div>
      </div>
      <div style={{ maxWidth: 1380, margin: '0 auto', padding: '0 20px 60px' }}>
        {page === 'Portfolio' && (
          <Portfolio t={t} account={account} positions={positions} />
        )}
        {page === 'Leaderboard' && <Leaderboard t={t} />}
        {page === 'Activity' && <Activity t={t} userActivity={userActivity} />}
        {page === 'Markets' && (
          <>
            <div
              style={{
                padding: '44px 0 32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                gap: 20,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: t.blueDim,
                    border: `1px solid ${t.blueBorder}`,
                    borderRadius: 20,
                    padding: '4px 12px',
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: t.blue,
                      fontFamily: 'monospace',
                      letterSpacing: 1,
                    }}
                  >
                    ARC NETWORK TESTNET
                  </span>
                </div>
                <h1
                  style={{
                    fontSize: 'clamp(26px,4vw,46px)',
                    fontWeight: 800,
                    letterSpacing: -1.5,
                    color: t.text,
                    lineHeight: 1.1,
                    marginBottom: 8,
                  }}
                >
                  Arcana Markets
                </h1>
                <p
                  style={{
                    fontSize: 15,
                    color: t.textMuted,
                    maxWidth: 500,
                    lineHeight: 1.65,
                  }}
                >
                  {ALL_MARKETS.length} prediction markets. Trade YES or NO with
                  USDC on Arc's EVM testnet.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  ['$48.2M', 'Total Volume'],
                  [`${ALL_MARKETS.length}`, 'Open Markets'],
                  ['34.8K', 'Traders'],
                ].map(([v, l]) => (
                  <div
                    key={l}
                    style={{
                      textAlign: 'center',
                      background: t.surface,
                      border: `1.5px solid ${t.border}`,
                      borderRadius: 12,
                      padding: '12px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: t.blue,
                      }}
                    >
                      {v}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: t.textMuted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {l}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* TOP MOVERS */}
            <div style={{ marginBottom: 32 }}>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: t.textMuted,
                  letterSpacing: 2,
                  marginBottom: 12,
                }}
              >
                TOP MOVERS
              </div>
              <div
                className="top-movers"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))',
                  gap: 8,
                }}
              >
                {TOP_MOVERS.map((m) => {
                  const up = m.chg >= 0;
                  return (
                    <div
                      key={m.id}
                      onClick={() => open(m, null)}
                      style={{
                        background: t.surface,
                        border: `1.5px solid ${t.border}`,
                        borderRadius: 10,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            fontSize: 12,
                            color: t.text,
                            fontWeight: 600,
                            margin: 0,
                            lineHeight: 1.3,
                          }}
                        >
                          {m.title.slice(0, 35)}…
                        </p>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: t.textMuted,
                          }}
                        >
                          {pct(m.yes)}% YES
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: up ? t.green : t.red,
                        }}
                      >
                        {up ? '+' : ''}
                        {Math.round(m.chg * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* FILTERS */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 20,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{ display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' }}
              >
                {CATS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    style={{
                      padding: '6px 13px',
                      borderRadius: 20,
                      background: cat === c ? t.blue : 'transparent',
                      border: `1.5px solid ${cat === c ? t.blue : t.border}`,
                      color: cat === c ? '#fff' : t.textMuted,
                      fontSize: 12,
                      fontWeight: cat === c ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search..."
                  style={{
                    padding: '8px 14px',
                    background: t.surface,
                    border: `1.5px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.text,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none',
                    width: 160,
                  }}
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  style={{
                    background: t.surface,
                    border: `1.5px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.text,
                    fontSize: 12,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="volume">By Volume</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>
            <div
              style={{
                marginBottom: 16,
                fontSize: 12,
                color: t.textMuted,
                fontFamily: 'monospace',
              }}
            >
              Showing{' '}
              <span style={{ color: t.blue, fontWeight: 700 }}>
                {filtered.length}
              </span>{' '}
              of {ALL_MARKETS.length} markets
            </div>
            <div
              className="markets-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(285px,1fr))',
                gap: 16,
              }}
            >
              {filtered.map((m) => (
                <div key={m.id} className="card">
                  <GridCard
                    m={m}
                    onTrade={open}
                    t={t}
                    livePrice={
                      m.cat === 'Crypto'
                        ? livePrices[
                            m.title.includes('BTC')
                              ? 'bitcoin'
                              : m.title.includes('ETH')
                              ? 'ethereum'
                              : m.title.includes('SOL')
                              ? 'solana'
                              : null
                          ]
                        : null
                    }
                  />
                </div>
              ))}
            </div>
            {filtered.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '60px 0',
                  color: t.textLight,
                  fontFamily: 'monospace',
                }}
              >
                No markets match your search.
              </div>
            )}
            {/* FOOTER BANNER */}
            <div
              style={{
                marginTop: 52,
                background: t.navy,
                borderRadius: 16,
                padding: '30px 34px',
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: t.blue,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>
                  ◈
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    marginBottom: 5,
                    color: '#fff',
                  }}
                >
                  Powered by Arc Network
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.6,
                  }}
                >
                  Every prediction settles on Arc's EVM L1 — USDC-native gas,
                  sub-second finality. Contract:{' '}
                  <span
                    style={{
                      fontFamily: 'monospace',
                      color: 'rgba(100,170,255,0.9)',
                    }}
                  >
                    {CONTRACT_ADDRESS.slice(0, 10)}...
                    {CONTRACT_ADDRESS.slice(-6)}
                  </span>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[
                  ['0x3600...0000', 'USDC'],
                  ['26', 'Chain ID'],
                  ['< 1s', 'Finality'],
                  ['USDC', 'Gas Token'],
                ].map(([v, k]) => (
                  <div key={k} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: 'rgba(100,170,255,0.9)',
                        fontWeight: 700,
                      }}
                    >
                      {v}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: 'rgba(255,255,255,0.35)',
                        marginTop: 2,
                      }}
                    >
                      {k}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <footer
        style={{
          borderTop: `1px solid ${t.border}`,
          padding: 20,
          textAlign: 'center',
          background: t.bg,
        }}
      >
        <p
          style={{ fontSize: 11, fontFamily: 'monospace', color: t.textLight }}
        >
          ✦ ARCANA.MARKETS · {ALL_MARKETS.length} Markets · Arc Testnet ·
          Contract: {CONTRACT_ADDRESS.slice(0, 10)}...
        </p>
      </footer>
      {active && (
        <TradeModal
          m={active}
          initSide={tradeSide}
          onClose={() => {
            setActive(null);
            setTradeSide(null);
          }}
          t={t}
          account={account}
          usdcBalance={usdcBalance}
          onPositionAdded={(pos) => {
            setPositions((prev) => [...prev, pos]);
            refreshBal(account);
          }}
          onActivityAdded={(act) => setUserActivity((prev) => [act, ...prev])}
        />
      )}
    </div>
  );
}
