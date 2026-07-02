/**
 * Fetch today's FIFA World Cup 2026 fixtures from API-Sports and create
 * on-chain prediction markets on the ArcanaMarkets contract.
 *
 * Primary path  : Circle Developer Controlled Wallet (entity secret required)
 * Fallback path : ethers.js direct RPC (ADMIN_PRIVATE_KEY required)
 *
 * Usage:
 *   npx ts-node --skip-project scripts/createWorldCupMarkets.ts
 *
 * Required env vars in .env.local:
 *   CIRCLE_API_KEY           – Circle developer API key
 *   CIRCLE_ENTITY_SECRET     – 32-byte hex entity secret (registered in Circle dashboard)
 *   CIRCLE_AGENT_WALLET_ID   – (optional) skip wallet lookup, use this wallet directly
 *   ADMIN_PRIVATE_KEY        – (fallback) private key for an admin of the contract
 */

import * as crypto from "crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// ── Config ────────────────────────────────────────────────────────────────────

const CIRCLE_API_KEY   = process.env.CIRCLE_API_KEY ?? "";
const ENTITY_SECRET    = process.env.CIRCLE_ENTITY_SECRET ?? "";
const ADMIN_PK         = process.env.ADMIN_PRIVATE_KEY ?? "";
const SPORTS_API_KEY   = "40d401329899ef48045c6660a77573f9";
const CONTRACT         = "0x443a47eF1025e047879b1BA08c94e6dedB354D54";
const BLOCKCHAIN       = "ARC-TESTNET";
const CIRCLE_BASE      = "https://api.circle.com/v1/w3s";
const ARC_RPC          = "https://rpc.testnet.arc.network";
const WC_LEAGUE_ID     = 1;   // API-Sports league ID for FIFA World Cup

const CONTRACT_ABI = [
  "function createMarket(string memory _title, string memory _category, uint256 _endTime) external",
  "function marketCount() external view returns (uint256)",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Fixture {
  fixture: { id: number; date: string; status: { short: string } };
  league:  { id: number; name: string; round: string };
  teams:   { home: { name: string }; away: { name: string } };
}

interface MarketResult {
  title:   string;
  state:   string;
  txHash:  string | null;
  error?:  string;
  via?:    "circle" | "ethers";
}

// ── API-Sports ────────────────────────────────────────────────────────────────

async function fetchTodayFixtures(): Promise<Fixture[]> {
  const today = new Date().toISOString().slice(0, 10);
  // Omit league/season params — server-side filtering is unreliable for WC 2026
  const url   = `https://v3.football.api-sports.io/fixtures?date=${today}`;
  console.log(`[fixtures] GET ${url}`);
  const res  = await fetch(url, { headers: { "x-apisports-key": SPORTS_API_KEY } });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`API-Sports error ${res.status}: ${JSON.stringify(data)}`);
  const all: Fixture[]      = data.response ?? [];
  const fixtures: Fixture[] = all.filter((f) => f.league.id === WC_LEAGUE_ID);
  console.log(`[fixtures] ${fixtures.length} World Cup match(es) on ${today} (from ${all.length} total)`);
  return fixtures;
}

// ── Circle helpers ────────────────────────────────────────────────────────────

async function getCipherText(): Promise<string> {
  const res  = await fetch(`${CIRCLE_BASE}/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const data = (await res.json()) as any;
  return crypto
    .publicEncrypt(
      { key: data.data.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(ENTITY_SECRET, "hex"),
    )
    .toString("base64");
}

async function findOrCreateCircleWallet(): Promise<{ id: string; address: string }> {
  const envId = process.env.CIRCLE_AGENT_WALLET_ID;
  if (envId) {
    const res  = await fetch(`${CIRCLE_BASE}/wallets/${envId}`, {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
    });
    const data = (await res.json()) as any;
    const w    = data?.data?.wallet;
    if (w?.id) {
      console.log(`[circle] reusing wallet ${w.id} (${w.address}) on ${w.blockchain}`);
      return { id: w.id, address: w.address };
    }
  }

  // Search for an existing ARC-TESTNET wallet
  const listRes  = await fetch(`${CIRCLE_BASE}/wallets?blockchain=${BLOCKCHAIN}&pageSize=10`, {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const listData = (await listRes.json()) as any;
  const existing = (listData?.data?.wallets ?? []).find(
    (w: any) => w.blockchain === BLOCKCHAIN && w.state === "LIVE",
  );
  if (existing) {
    console.log(`[circle] found ${existing.id} (${existing.address}) on ${BLOCKCHAIN}`);
    return { id: existing.id, address: existing.address };
  }

  // Create a new wallet set + wallet
  console.log(`[circle] creating new wallet on ${BLOCKCHAIN} ...`);
  const ct1    = await getCipherText();
  const wsRes  = await fetch(`${CIRCLE_BASE}/developer/walletSets`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ idempotencyKey: crypto.randomUUID(), entitySecretCiphertext: ct1, name: "Arcana Admin" }),
  });
  const wsData     = (await wsRes.json()) as any;
  const walletSetId = wsData?.data?.walletSet?.id;
  if (!walletSetId) throw new Error(`Wallet-set failed: ${JSON.stringify(wsData)}`);

  const ct2  = await getCipherText();
  const wRes = await fetch(`${CIRCLE_BASE}/developer/wallets`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      idempotencyKey:         crypto.randomUUID(),
      entitySecretCiphertext: ct2,
      walletSetId,
      blockchains:            [BLOCKCHAIN],
      count:                  1,
      metadata:               [{ name: "Arcana Admin", refId: "arcana-admin" }],
    }),
  });
  const wData  = (await wRes.json()) as any;
  const wallet = wData?.data?.wallets?.[0];
  if (!wallet?.id) throw new Error(`Wallet creation failed: ${JSON.stringify(wData)}`);
  console.log(`[circle] created ${wallet.id} (${wallet.address}) — set CIRCLE_AGENT_WALLET_ID=${wallet.id}`);
  return { id: wallet.id, address: wallet.address };
}

async function circleCreateMarket(
  walletId: string,
  title:    string,
  category: string,
  endTime:  number,
): Promise<string> {
  const ct  = await getCipherText();
  const res = await fetch(`${CIRCLE_BASE}/developer/transactions/contractExecution`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      idempotencyKey:         crypto.randomUUID(),
      entitySecretCiphertext: ct,
      walletId,
      blockchain:             BLOCKCHAIN,
      contractAddress:        CONTRACT,
      abiFunctionSignature:   "createMarket(string,string,uint256)",
      abiParameters:          [title, category, endTime.toString()],
      feeLevel:               "LOW",
    }),
  });
  const data = (await res.json()) as any;
  const txId = data?.data?.id;
  if (!txId) throw new Error(JSON.stringify(data));
  return txId;
}

async function waitForCircleTx(txId: string, maxMs = 90_000): Promise<{ state: string; txHash: string | null }> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res  = await fetch(`${CIRCLE_BASE}/transactions/${txId}`, {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
    });
    const data = (await res.json()) as any;
    const tx   = data?.data?.transaction;
    const state: string = tx?.state ?? "UNKNOWN";
    process.stdout.write(`    polling ${txId}: ${state}\n`);
    if (state === "COMPLETE")                              return { state, txHash: tx.txHash ?? null };
    if (["FAILED","CANCELLED","DENIED"].includes(state))  return { state, txHash: tx.txHash ?? null };
  }
  return { state: "TIMEOUT", txHash: null };
}

// ── Ethers.js fallback ────────────────────────────────────────────────────────

async function ethersCreateMarket(
  title:    string,
  category: string,
  endTime:  number,
): Promise<{ txHash: string }> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC);
  const wallet   = new ethers.Wallet(ADMIN_PK, provider);
  const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, wallet);
  const tx       = await (contract.createMarket as any)(title, category, endTime, { gasLimit: 400_000 });
  await tx.wait();
  return { txHash: tx.hash as string };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const hasCircle = CIRCLE_API_KEY && ENTITY_SECRET;
  const hasEthers = !!ADMIN_PK;

  if (!hasCircle && !hasEthers) {
    throw new Error(
      "No credentials found.\n" +
      "  Set CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env.local for Circle wallet path, OR\n" +
      "  Set ADMIN_PRIVATE_KEY in .env.local for direct ethers.js path.",
    );
  }

  // ── 1. Fetch today's fixtures ─────────────────────────────────────────────
  const fixtures = await fetchTodayFixtures();
  if (fixtures.length === 0) {
    console.log("No World Cup fixtures today — nothing to create.");
    return;
  }

  // ── 2. (Circle path) resolve wallet ──────────────────────────────────────
  let circleWalletId: string | null = null;
  let useCircle                     = false;

  if (hasCircle) {
    try {
      const { id } = await findOrCreateCircleWallet();
      circleWalletId = id;
      useCircle      = true;
    } catch (e: any) {
      console.warn(`[circle] wallet lookup failed: ${e.message} — will try ethers fallback`);
    }
  }

  // ── 3. Create a market per fixture ────────────────────────────────────────
  const nowSec  = Math.floor(Date.now() / 1000);
  const results: MarketResult[] = [];

  for (const f of fixtures) {
    const home    = f.teams.home.name;
    const away    = f.teams.away.name;
    const round   = f.league.round;
    const kickoff = Math.floor(new Date(f.fixture.date).getTime() / 1000);
    // End time: kick-off so trading stops when the match starts; +1h fallback for already-started games
    const endTime = kickoff > nowSec ? kickoff : nowSec + 3_600;
    const title   = `Will ${home} beat ${away}? FIFA World Cup 2026 – ${round}`;

    console.log(`\n[market] ${title}`);
    console.log(`         kick-off: ${f.fixture.date} | endTime: ${new Date(endTime * 1000).toISOString()}`);

    // ── Circle path ──────────────────────────────────────────────────────
    if (useCircle && circleWalletId) {
      try {
        const txId   = await circleCreateMarket(circleWalletId, title, "Sports", endTime);
        console.log(`         [circle] submitted txId=${txId}`);
        const status = await waitForCircleTx(txId);
        console.log(`         [circle] ${status.state} | txHash: ${status.txHash ?? "—"}`);
        results.push({ title, state: status.state, txHash: status.txHash, via: "circle" });
        continue;
      } catch (e: any) {
        console.warn(`         [circle] failed: ${e.message}`);
        if (!hasEthers) {
          results.push({ title, state: "ERROR", txHash: null, error: `Circle: ${e.message}`, via: "circle" });
          continue;
        }
        console.log(`         [circle] falling back to ethers.js ...`);
      }
    }

    // ── Ethers.js fallback ───────────────────────────────────────────────
    if (hasEthers) {
      try {
        const { txHash } = await ethersCreateMarket(title, "Sports", endTime);
        console.log(`         [ethers] COMPLETE | txHash: ${txHash}`);
        results.push({ title, state: "COMPLETE", txHash, via: "ethers" });
      } catch (e: any) {
        console.error(`         [ethers] failed: ${e.message}`);
        results.push({ title, state: "ERROR", txHash: null, error: `Ethers: ${e.message}`, via: "ethers" });
      }
    } else {
      results.push({
        title,
        state: "SKIPPED",
        txHash: null,
        error: "Circle entity secret rejected; set ADMIN_PRIVATE_KEY for ethers fallback",
      });
    }
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log(" Summary");
  console.log("════════════════════════════════════════════════════════");
  for (const r of results) {
    const icon = r.state === "COMPLETE" ? "✓" : r.state === "ERROR" ? "✗" : "~";
    const via  = r.via ? ` [${r.via}]` : "";
    const info = r.txHash ? ` ${r.txHash}` : r.error ? ` — ${r.error}` : "";
    console.log(`${icon} ${r.state}${via}  ${r.title}${info}`);
  }
  const ok     = results.filter((r) => r.state === "COMPLETE").length;
  const failed = results.filter((r) => r.state !== "COMPLETE").length;
  console.log(`\n${ok}/${results.length} markets created successfully, ${failed} not created.`);

  if (results.some((r) => r.state !== "COMPLETE" && !ADMIN_PK)) {
    console.log("\n[hint] To enable direct ethers.js signing, add to .env.local:");
    console.log("        ADMIN_PRIVATE_KEY=<private key for an admin of the contract>");
    console.log("        Admins: 0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9");
    console.log("                0x89f9EAeF8CfF2fAfE0664b5944AD3197A74588Bf");
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e.message ?? e);
  process.exit(1);
});
