/**
 * One-off: cancel the two unresolvable "FIFA Club World Cup 2026" markets
 * (ids 77, 78 — that event doesn't exist) and create the 9 curated
 * World Cup 2026 markets with explicit UMA-safe resolution criteria.
 *
 * Primary path  : Circle Developer Controlled Wallet (CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET)
 * Fallback path : ethers.js direct RPC (ADMIN_PRIVATE_KEY)
 *
 * Usage: node scripts/seedWorldCup2026.js
 *
 * Required env vars in .env.local:
 *   CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, (optional) CIRCLE_AGENT_WALLET_ID
 *   or ADMIN_PRIVATE_KEY as a fallback
 */

const crypto = require('crypto');
const fs = require('fs');
const { ethers } = require('ethers');

// ── Load .env.local manually (no dotenv dependency needed) ──────────────────
for (const rawLine of fs.readFileSync(__dirname + '/../.env.local', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  let val = line.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const ENTITY_SECRET  = process.env.CIRCLE_ENTITY_SECRET || '';
const ADMIN_PK       = process.env.ADMIN_PRIVATE_KEY || '';
const CONTRACT       = '0x44c5445C01f1A0FD5D7AA661776327Ac11872889';
const BLOCKCHAIN     = 'ARC-TESTNET';
const CIRCLE_BASE    = 'https://api.circle.com/v1/w3s';
const ARC_RPC        = 'https://rpc.testnet.arc.network';

const CONTRACT_ABI = [
  'function createMarket(string memory _title, string memory _category, uint256 _endTime) external',
  'function cancelMarket(uint256 _marketId) external',
  'function marketCount() external view returns (uint256)',
];

// ── Markets to cancel (unresolvable — event doesn't exist) ──────────────────
// None on this contract: 77/78 were on the old v1 contract and stay there.
const CANCEL_IDS = [];

// ── Markets to create ────────────────────────────────────────────────────────
const CRITERIA_MATCH = 'Beat = advancing by any means, incl. penalties. Void + full refund if match not played. Resolves per official FIFA result.';
const CRITERIA_TOURNEY = 'Resolves after the Jul 19 2026 final, per official FIFA result. Void + full refund if the tournament is not completed as scheduled.';

const NEW_MARKETS = [
  { title: 'Will Portugal beat Croatia in the Round of 32?',     category: 'Sports', closeTime: '2026-07-02T19:00:00-04:00', criteria: CRITERIA_MATCH },
  { title: 'Will Argentina beat Cape Verde in the Round of 32?', category: 'Sports', closeTime: '2026-07-03T18:00:00-04:00', criteria: CRITERIA_MATCH },
  { title: 'Will Australia beat Egypt in the Round of 32?',      category: 'Sports', closeTime: '2026-07-03T14:00:00-04:00', criteria: CRITERIA_MATCH },
  { title: 'Will Colombia beat Ghana in the Round of 32?',       category: 'Sports', closeTime: '2026-07-03T21:30:00-04:00', criteria: CRITERIA_MATCH },
  { title: 'Will the USA beat Belgium in the Round of 16?',      category: 'Sports', closeTime: '2026-07-06T12:00:00-04:00', criteria: CRITERIA_MATCH + ' Kickoff time assumed pending confirmation.' },
  { title: 'Will Mexico beat England in the Round of 16?',       category: 'Sports', closeTime: '2026-07-06T12:00:00-04:00', criteria: CRITERIA_MATCH + ' Kickoff time assumed pending confirmation.' },
  { title: 'Will Argentina win the FIFA World Cup 2026?',        category: 'Sports', closeTime: '2026-07-19T15:00:00-04:00', criteria: CRITERIA_TOURNEY },
  { title: 'Will France reach the World Cup 2026 final?',        category: 'Sports', closeTime: '2026-07-19T15:00:00-04:00', criteria: CRITERIA_TOURNEY },
  { title: 'Will Messi win the World Cup 2026 Golden Boot?',     category: 'Sports', closeTime: '2026-07-19T15:00:00-04:00', criteria: 'Per the official FIFA Golden Boot award. ' + CRITERIA_TOURNEY },
];

// ── Circle helpers ────────────────────────────────────────────────────────────
async function getCipherText() {
  const res = await fetch(`${CIRCLE_BASE}/config/entity/publicKey`, { headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` } });
  const data = await res.json();
  return crypto.publicEncrypt(
    { key: data.data.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(ENTITY_SECRET, 'hex'),
  ).toString('base64');
}

async function findCircleWallet() {
  const envId = process.env.CIRCLE_AGENT_WALLET_ID;
  if (envId) {
    const res = await fetch(`${CIRCLE_BASE}/wallets/${envId}`, { headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` } });
    const data = await res.json();
    if (data?.data?.wallet?.id) return data.data.wallet;
  }
  const res = await fetch(`${CIRCLE_BASE}/wallets?blockchain=${BLOCKCHAIN}&pageSize=10`, { headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` } });
  const data = await res.json();
  const found = (data?.data?.wallets ?? []).find(w => w.blockchain === BLOCKCHAIN && w.state === 'LIVE');
  if (!found) throw new Error('No ARC-TESTNET Circle wallet found');
  return found;
}

async function circleExec(walletId, contractExecArgs) {
  const ct = await getCipherText();
  const res = await fetch(`${CIRCLE_BASE}/developer/transactions/contractExecution`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct, walletId, blockchain: BLOCKCHAIN, contractAddress: CONTRACT, feeLevel: 'LOW', ...contractExecArgs }),
  });
  const data = await res.json();
  const txId = data?.data?.id;
  if (!txId) throw new Error(JSON.stringify(data));
  return txId;
}

async function waitForCircleTx(txId, maxMs = 90000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${CIRCLE_BASE}/transactions/${txId}`, { headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` } });
    const data = await res.json();
    const tx = data?.data?.transaction;
    const state = tx?.state ?? 'UNKNOWN';
    console.log(`    polling ${txId}: ${state}`);
    if (state === 'COMPLETE' || ['FAILED', 'CANCELLED', 'DENIED'].includes(state)) return { state, txHash: tx?.txHash ?? null };
  }
  return { state: 'TIMEOUT', txHash: null };
}

function getEthersProvider() {
  return new (ethers.providers ? ethers.providers.JsonRpcProvider : ethers.JsonRpcProvider)(ARC_RPC);
}

async function ethersExec(fnName, args) {
  const provider = getEthersProvider();
  const wallet = new ethers.Wallet(ADMIN_PK, provider);
  const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, wallet);
  const tx = await contract[fnName](...args, { gasLimit: 400000 });
  await tx.wait();
  return tx.hash;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const hasCircle = CIRCLE_API_KEY && ENTITY_SECRET;
  const hasEthers = !!ADMIN_PK;
  if (!hasCircle && !hasEthers) throw new Error('No credentials: need CIRCLE_API_KEY+CIRCLE_ENTITY_SECRET or ADMIN_PRIVATE_KEY');

  let circleWalletId = null;
  if (hasCircle) {
    const w = await findCircleWallet();
    circleWalletId = w.id;
    console.log(`[circle] using wallet ${w.id} (${w.address})`);
  }

  const provider = getEthersProvider();
  const readContract = new ethers.Contract(CONTRACT, CONTRACT_ABI, provider);
  const startCount = Number(await readContract.marketCount());
  console.log(`[chain] marketCount before = ${startCount}`);

  const results = { cancelled: [], created: [] };

  // ── 1. Cancel the two unresolvable Club World Cup markets ─────────────────
  for (const id of CANCEL_IDS) {
    console.log(`\n[cancel] market #${id}`);
    try {
      if (hasCircle) {
        const txId = await circleExec(circleWalletId, { abiFunctionSignature: 'cancelMarket(uint256)', abiParameters: [String(id)] });
        const status = await waitForCircleTx(txId);
        results.cancelled.push({ id, ...status });
      } else {
        const txHash = await ethersExec('cancelMarket', [id]);
        results.cancelled.push({ id, state: 'COMPLETE', txHash });
      }
    } catch (e) {
      console.error(`  failed: ${e.message}`);
      results.cancelled.push({ id, state: 'ERROR', error: e.message });
    }
  }

  // ── 2. Create the 9 new markets ────────────────────────────────────────────
  for (const m of NEW_MARKETS) {
    const endTime = Math.floor(new Date(m.closeTime).getTime() / 1000);
    console.log(`\n[create] ${m.title}`);
    console.log(`         closes: ${m.closeTime} | endTime: ${endTime}`);
    try {
      if (hasCircle) {
        const txId = await circleExec(circleWalletId, { abiFunctionSignature: 'createMarket(string,string,uint256)', abiParameters: [m.title, m.category, endTime.toString()] });
        const status = await waitForCircleTx(txId);
        results.created.push({ title: m.title, ...status });
      } else {
        const txHash = await ethersExec('createMarket', [m.title, m.category, endTime]);
        results.created.push({ title: m.title, state: 'COMPLETE', txHash });
      }
    } catch (e) {
      console.error(`  failed: ${e.message}`);
      results.created.push({ title: m.title, state: 'ERROR', error: e.message });
    }
  }

  const endCount = Number(await readContract.marketCount());
  console.log(`\n[chain] marketCount after = ${endCount} (created ${endCount - startCount})`);

  console.log('\n════════════════════════════════════════');
  console.log('Cancelled:', JSON.stringify(results.cancelled, null, 2));
  console.log('Created:', JSON.stringify(results.created, null, 2));
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
