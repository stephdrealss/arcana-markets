/**
 * deployAll.ts — Arc Testnet deployment via Circle Programmable Wallet API
 *
 * Deploys in order:
 *   1.  UMA infrastructure  (Timer, Finder, IdentifierWhitelist, AddressWhitelist,
 *                            Store, TestnetERC20/ARCT, MockOracleAncillary, OptimisticOracleV2)
 *   2.  Wire Finder         (7 Finder.changeImplementationAddress + whitelist txs)
 *   3.  Mint ARCT           (allocateTo wallet address)
 *   4.  EventBasedPredictionMarket
 *   5.  Initialize market   (approve + initializeMarket)
 *   6.  PredictionMarketAMM
 *   7.  Seed AMM            (approve + initialize)
 *   8.  Write outputs       (.env.local + deployments/arc-testnet-deployment.json)
 *
 * Every phase is checkpointed to deployments/arc-testnet-checkpoint.json.
 * Re-running resumes from the last completed phase — no contracts are redeployed.
 *
 * Prerequisites:
 *   npm run compile          — builds artifacts/ for our two Solidity contracts
 *   Node >= 18               — requires built-in fetch
 *
 * Required env vars (never commit these):
 *   CIRCLE_API_KEY           — Circle developer API key
 *   CIRCLE_ENTITY_SECRET     — 64-char hex entity secret, NO 0x prefix
 *
 * Deployer wallet (hardcoded):
 *   2558e243-4a68-5e34-9492-cb0803b72634
 *
 * Run:
 *   npm run deploy:circle
 */

import * as crypto from "crypto";
import * as fs     from "fs";
import * as path   from "path";
import { ethers }  from "ethers";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WALLET_ID         = "2558e243-4a68-5e34-9492-cb0803b72634";
const CIRCLE_BASE       = "https://api.circle.com/v1/w3s";
const ARC_RPC           = "https://rpc.testnet.arc.network";
const EXPLORER          = "https://testnet.arcscan.app";
const POLL_INTERVAL_MS  = 3_000;
const POLL_TIMEOUT_MS   = 10 * 60 * 1_000; // 10 min

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — edit before running
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  market: {
    pairName:       "BTC100K",
    question:       "Will Bitcoin exceed $100,000 before June 1, 2026?",
    // Seconds a proposed price sits undisputed before settling.
    // 60 = fast testnet cycle.  Use 7200 (2 h) for production.
    liveness:       60,
    proposerReward: ethers.parseEther("10"),   // 10 ARCT — paid to OO proposer
    proposerBond:   ethers.parseEther("100"),  // 100 ARCT — slashed if proposal is wrong
  },
  collateral: {
    name:           "Arc Test Token",
    symbol:         "ARCT",
    decimals:       18,
    mintToDeployer: ethers.parseEther("100000"), // 100 000 ARCT for testing
  },
  amm: {
    feeBps:        200,                         // 2 % trading fee
    seedLiquidity: ethers.parseEther("1000"),   // 1 000 ARCT seeded into both reserves
  },
  oo: {
    defaultLiveness: 7200, // global OO default liveness in seconds
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UMA artifact loader — pulls pre-compiled JSON from @uma/core
// ─────────────────────────────────────────────────────────────────────────────

interface Artifact { abi: unknown[]; bytecode: string }

function loadUmaArtifact(p: string): Artifact {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const a = require(`@uma/core/artifacts/contracts/${p}`);
  return { abi: a.abi as unknown[], bytecode: a.bytecode as string };
}

const UMA = {
  Timer:               loadUmaArtifact("common/implementation/Timer.sol/Timer.json"),
  Finder:              loadUmaArtifact("data-verification-mechanism/implementation/Finder.sol/Finder.json"),
  IdentifierWhitelist: loadUmaArtifact("data-verification-mechanism/implementation/IdentifierWhitelist.sol/IdentifierWhitelist.json"),
  AddressWhitelist:    loadUmaArtifact("common/implementation/AddressWhitelist.sol/AddressWhitelist.json"),
  Store:               loadUmaArtifact("data-verification-mechanism/implementation/Store.sol/Store.json"),
  TestnetERC20:        loadUmaArtifact("common/implementation/TestnetERC20.sol/TestnetERC20.json"),
  MockOracleAncillary: loadUmaArtifact("data-verification-mechanism/test/MockOracleAncillary.sol/MockOracleAncillary.json"),
  OptimisticOracleV2:  loadUmaArtifact("optimistic-oracle-v2/implementation/OptimisticOracleV2.sol/OptimisticOracleV2.json"),
};

// Load our compiled contracts (require npm run compile first)
function loadLocalArtifact(contractName: string): Artifact {
  const p = path.resolve(
    __dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`,
  );
  if (!fs.existsSync(p)) {
    throw new Error(
      `Compiled artifact not found: ${p}\n` +
      `Run "npm run compile" before deploying.`,
    );
  }
  const a = JSON.parse(fs.readFileSync(p, "utf-8")) as Artifact;
  return { abi: a.abi, bytecode: a.bytecode };
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

interface InfraAddresses {
  timer: string; finder: string; identifierWhitelist: string;
  addressWhitelist: string; store: string; arct: string;
  mockOracle: string; ooV2: string;
}

interface Checkpoint {
  walletId:        string;
  walletAddress?:  string;
  infra?:          InfraAddresses;
  wiringDone?:     true;
  mintDone?:       true;
  market?:         { address: string; longToken: string; shortToken: string };
  marketInitDone?: true;
  amm?:            { address: string };
  ammSeedDone?:    true;
}

const DEPLOY_DIR      = path.resolve(__dirname, "../deployments");
const CHECKPOINT_FILE = path.join(DEPLOY_DIR, "arc-testnet-checkpoint.json");

function loadCheckpoint(): Checkpoint | null {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8")) as Checkpoint; }
  catch { return null; }
}

function saveCheckpoint(cp: Checkpoint): void {
  if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Circle API context + entity secret encryption
// ─────────────────────────────────────────────────────────────────────────────

interface Ctx {
  apiKey:       string;
  entitySecret: string; // raw 64-char hex, no 0x
  publicKey:    string; // Circle RSA public key PEM, fetched once at startup
}

/**
 * Generate a fresh RSA-OAEP-SHA256 ciphertext of the entity secret.
 * Circle requires a new ciphertext per API call to prevent replay attacks.
 */
function mkCiphertext(ctx: Ctx): string {
  const plain = Buffer.from(ctx.entitySecret, "hex");
  return crypto
    .publicEncrypt(
      { key: ctx.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      plain,
    )
    .toString("base64");
}

async function circlePost<T>(ctx: Ctx, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${CIRCLE_BASE}${endpoint}`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${ctx.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      idempotencyKey:         crypto.randomUUID(),
      entitySecretCiphertext: mkCiphertext(ctx),
      ...body,
    }),
  });

  const json = await res.json() as { data?: T; code?: number; message?: string; errors?: unknown };
  if (!res.ok) {
    throw new Error(
      `Circle POST ${endpoint} → HTTP ${res.status}\n` +
      `  code   : ${json.code ?? "n/a"}\n` +
      `  message: ${json.message ?? JSON.stringify(json)}`,
    );
  }
  return json.data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction polling
// ─────────────────────────────────────────────────────────────────────────────

interface TxInfo {
  state:            string;
  txHash?:          string;
  contractAddress?: string;
}

const TERMINAL_FAIL = new Set(["FAILED", "CANCELLED", "DENIED"]);

async function pollTx(ctx: Ctx, txId: string, label: string): Promise<TxInfo> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let dots = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res  = await fetch(`${CIRCLE_BASE}/transactions/${txId}`, {
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
    });
    const json = await res.json() as { data: { transaction: TxInfo & { id: string } } };
    const tx   = json.data.transaction;

    dots = (dots + 1) % 4;
    process.stdout.write(`\r  [${label}] ${tx.state}${"...".slice(0, dots).padEnd(3)}`);

    if (tx.state === "CONFIRMED") {
      process.stdout.write("\n");
      if (tx.txHash) console.log(`       tx: ${EXPLORER}/tx/${tx.txHash}`);
      return tx;
    }
    if (TERMINAL_FAIL.has(tx.state)) {
      process.stdout.write("\n");
      throw new Error(`Transaction ${txId} for "${label}": ${tx.state}`);
    }
  }

  throw new Error(
    `Transaction ${txId} for "${label}" timed out after ${POLL_TIMEOUT_MS / 60_000} minutes`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deploy + execute helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ABI-encode constructor arguments and append them to the creation bytecode.
 * This is the standard EVM format — Circle's contractDeployment endpoint
 * accepts a complete bytecode blob (creation code + encoded constructor args).
 */
function buildDeployBytecode(artifact: Artifact, args: unknown[]): string {
  if (!args.length) return artifact.bytecode;

  const ctor = (artifact.abi as Array<{ type: string; inputs?: unknown[] }>)
    .find(x => x.type === "constructor");

  if (!ctor?.inputs?.length) return artifact.bytecode;

  // ethers.Interface used only for ABI encoding — no provider or signer needed.
  const iface   = new ethers.Interface([ctor as Parameters<typeof ethers.Interface>[0]]);
  const encoded = iface.encodeDeploy(args).slice(2); // strip 0x
  return artifact.bytecode + encoded;
}

async function deployContract(
  ctx:      Ctx,
  label:    string,
  artifact: Artifact,
  args:     unknown[],
): Promise<string> {
  console.log(`\n  [→] Deploying ${label}...`);
  const bytecode = buildDeployBytecode(artifact, args);

  // POST /v1/w3s/developer/transactions/contractDeployment
  // Response: { data: { id: string, state: string } }
  const data = await circlePost<{ id: string }>(
    ctx,
    "/developer/transactions/contractDeployment",
    { walletId: WALLET_ID, bytecode, feeLevel: "HIGH" },
  );

  const tx = await pollTx(ctx, data.id, label);

  if (!tx.contractAddress) {
    throw new Error(
      `Circle confirmed tx for "${label}" but returned no contractAddress.\n` +
      `Check tx ${data.id} on ${EXPLORER}`,
    );
  }

  console.log(`       → ${tx.contractAddress}  (${EXPLORER}/address/${tx.contractAddress})`);
  return tx.contractAddress;
}

/**
 * Call a write function on an already-deployed contract.
 *
 * funcSig    — Solidity function signature, e.g. "approve(address,uint256)"
 * params     — all argument values as strings:
 *               address  → "0x..."
 *               uint256  → decimal string e.g. "1000000000000000000"
 *               bytes32  → 0x-prefixed 32-byte hex (use ethers.encodeBytes32String)
 *               bool     → "true" | "false"
 */
async function execContract(
  ctx:      Ctx,
  label:    string,
  address:  string,
  funcSig:  string,
  params:   string[],
): Promise<void> {
  console.log(`\n  [→] ${label}`);

  // POST /v1/w3s/developer/transactions/contractExecution
  const data = await circlePost<{ id: string }>(
    ctx,
    "/developer/transactions/contractExecution",
    {
      walletId:             WALLET_ID,
      contractAddress:      address,
      abiFunctionSignature: funcSig,
      abiParameters:        params,
      feeLevel:             "HIGH",
    },
  );

  await pollTx(ctx, data.id, label);
}

// ─────────────────────────────────────────────────────────────────────────────
// View-call helper (read-only, no Circle API needed — uses public RPC)
// ─────────────────────────────────────────────────────────────────────────────

async function viewCall<T>(
  contractAddress: string,
  funcSig: string,
  retries = 8,
  delayMs = 2_500,
): Promise<T> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC);
  const iface    = new ethers.Interface([`function ${funcSig} view returns (address)`]);

  for (let i = 0; i < retries; i++) {
    try {
      const name   = funcSig.split("(")[0];
      const result = await provider.call({ to: contractAddress, data: iface.encodeFunctionData(name) });
      return iface.decodeFunctionResult(name, result)[0] as T;
    } catch (e: unknown) {
      if (i === retries - 1) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("BAD_DATA") && !msg.includes("could not decode") && !msg.includes("CALL_EXCEPTION")) throw e;
      console.log(`    (RPC propagation delay, retry ${i + 1}/${retries} in ${delayMs / 1000}s...)`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

// ─────────────────────────────────────────────────────────────────────────────
// Output writers
// ─────────────────────────────────────────────────────────────────────────────

function writeEnvLocal(vars: Record<string, string>): void {
  const envPath = path.resolve(__dirname, "../.env.local");
  const existing: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) existing[m[1].trim()] = m[2].trim();
    }
  }
  Object.assign(existing, vars);
  fs.writeFileSync(
    envPath,
    Object.entries(existing).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
  );
}

function divider(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 52 - title.length))}\n`);
}
function skipPhase(title: string) {
  console.log(`── ${title} (already done — skipping)\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {

  // ── Environment validation ────────────────────────────────────────────────

  const apiKey       = process.env.CIRCLE_API_KEY?.trim();
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();

  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is not set.\n" +
      "Export it in your shell:\n" +
      "  export CIRCLE_API_KEY=your_key_here",
    );
  }
  if (!entitySecret) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET is not set.\n" +
      "Export it in your shell:\n" +
      "  export CIRCLE_ENTITY_SECRET=your_64_hex_char_secret",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(entitySecret)) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET must be exactly 64 hexadecimal characters (32 bytes).\n" +
      "Do not include a 0x prefix.",
    );
  }

  // ── Fetch Circle RSA public key ───────────────────────────────────────────
  // Used to encrypt the entity secret fresh on every API call.

  process.stdout.write("  Fetching Circle RSA public key... ");
  const pkRes = await fetch(`${CIRCLE_BASE}/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!pkRes.ok) {
    throw new Error(`Could not fetch Circle public key: HTTP ${pkRes.status} — check CIRCLE_API_KEY`);
  }
  const { data: { publicKey } } = await pkRes.json() as { data: { publicKey: string } };
  console.log("ok");

  const ctx: Ctx = { apiKey, entitySecret, publicKey };

  // ── Fetch wallet info ─────────────────────────────────────────────────────

  process.stdout.write("  Fetching wallet info... ");
  const wRes = await fetch(`${CIRCLE_BASE}/wallets/${WALLET_ID}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!wRes.ok) {
    throw new Error(`Could not fetch wallet ${WALLET_ID}: HTTP ${wRes.status}`);
  }
  const { data: { wallet } } = await wRes.json() as {
    data: { wallet: { id: string; address: string; blockchain: string; state: string } }
  };
  console.log("ok");

  if (wallet.state !== "LIVE") {
    throw new Error(`Wallet state is "${wallet.state}" — expected "LIVE". Check the Circle dashboard.`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("  Arc Testnet — Circle Programmable Wallet Deployment");
  console.log("═".repeat(60));
  console.log(`
  Wallet ID  : ${wallet.id}
  Address    : ${wallet.address}
  Blockchain : ${wallet.blockchain}
  State      : ${wallet.state}
  Explorer   : ${EXPLORER}
`);

  // ── Checkpoint ────────────────────────────────────────────────────────────

  const cp: Checkpoint = loadCheckpoint() ?? { walletId: WALLET_ID, walletAddress: wallet.address };

  if (cp.walletId !== WALLET_ID) {
    throw new Error(
      `Checkpoint belongs to wallet ${cp.walletId} but this script targets ${WALLET_ID}.\n` +
      `Delete deployments/arc-testnet-checkpoint.json to start fresh.`,
    );
  }

  // bytes32 values for Finder registration keys (right-padded, 0x-prefixed)
  const b32 = (s: string): string => ethers.encodeBytes32String(s);

  // ── Phase 1: UMA infrastructure ───────────────────────────────────────────

  if (!cp.infra) {
    divider("Phase 1: Deploy UMA infrastructure (8 contracts)");

    const timerAddr  = await deployContract(ctx, "Timer",               UMA.Timer,               []);
    const finderAddr = await deployContract(ctx, "Finder",              UMA.Finder,              []);
    const iwAddr     = await deployContract(ctx, "IdentifierWhitelist", UMA.IdentifierWhitelist, []);
    const awAddr     = await deployContract(ctx, "AddressWhitelist",    UMA.AddressWhitelist,    []);

    // Store(FixedPoint.Unsigned finalFee, FixedPoint.Unsigned weeklyDelayFee, address timer)
    // FixedPoint.Unsigned = struct { uint256 rawValue } — encoded as a one-element tuple
    const storeAddr  = await deployContract(ctx, "Store", UMA.Store, [{ rawValue: 0n }, { rawValue: 0n }, timerAddr]);

    const arctAddr   = await deployContract(
      ctx, "TestnetERC20 (ARCT)", UMA.TestnetERC20,
      [CONFIG.collateral.name, CONFIG.collateral.symbol, CONFIG.collateral.decimals],
    );
    const mockOracleAddr = await deployContract(ctx, "MockOracleAncillary", UMA.MockOracleAncillary, [finderAddr, timerAddr]);
    const ooV2Addr       = await deployContract(ctx, "OptimisticOracleV2",  UMA.OptimisticOracleV2,  [CONFIG.oo.defaultLiveness, finderAddr, timerAddr]);

    cp.infra = {
      timer: timerAddr, finder: finderAddr, identifierWhitelist: iwAddr,
      addressWhitelist: awAddr, store: storeAddr, arct: arctAddr,
      mockOracle: mockOracleAddr, ooV2: ooV2Addr,
    };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 1 complete\n");
  } else {
    skipPhase("Phase 1: UMA infrastructure");
    for (const [k, v] of Object.entries(cp.infra)) {
      console.log(`  ${k.padEnd(22)}: ${v}`);
    }
  }

  const {
    timer: timerAddr, finder: finderAddr,
    identifierWhitelist: iwAddr, addressWhitelist: awAddr,
    store: storeAddr, arct: arctAddr,
    mockOracle: mockOracleAddr, ooV2: ooV2Addr,
  } = cp.infra!;

  // ── Phase 2: Wire Finder ──────────────────────────────────────────────────
  // Register all supporting contracts in the Finder and whitelist the
  // identifier + collateral token that EventBasedPredictionMarket checks
  // in its constructor.

  if (!cp.wiringDone) {
    divider("Phase 2: Wire Finder (7 transactions)");

    await execContract(ctx, "Finder ← IdentifierWhitelist", finderAddr,
      "changeImplementationAddress(bytes32,address)", [b32("IdentifierWhitelist"), iwAddr]);

    await execContract(ctx, "Finder ← CollateralWhitelist", finderAddr,
      "changeImplementationAddress(bytes32,address)", [b32("CollateralWhitelist"), awAddr]);

    await execContract(ctx, "Finder ← Store", finderAddr,
      "changeImplementationAddress(bytes32,address)", [b32("Store"), storeAddr]);

    await execContract(ctx, "Finder ← Oracle (MockOracleAncillary)", finderAddr,
      "changeImplementationAddress(bytes32,address)", [b32("Oracle"), mockOracleAddr]);

    await execContract(ctx, "Finder ← OptimisticOracleV2", finderAddr,
      "changeImplementationAddress(bytes32,address)", [b32("OptimisticOracleV2"), ooV2Addr]);

    await execContract(ctx, "Whitelist identifier YES_OR_NO_QUERY", iwAddr,
      "addSupportedIdentifier(bytes32)", [b32("YES_OR_NO_QUERY")]);

    await execContract(ctx, "Whitelist ARCT as collateral", awAddr,
      "addToWhitelist(address)", [arctAddr]);

    cp.wiringDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 2 complete\n");
  } else {
    skipPhase("Phase 2: Finder wiring");
  }

  // ── Phase 3: Mint ARCT ────────────────────────────────────────────────────

  if (!cp.mintDone) {
    divider("Phase 3: Mint ARCT to Circle wallet");

    await execContract(
      ctx,
      `Mint ${ethers.formatEther(CONFIG.collateral.mintToDeployer)} ARCT → ${wallet.address}`,
      arctAddr,
      "allocateTo(address,uint256)",
      [wallet.address, CONFIG.collateral.mintToDeployer.toString()],
    );

    cp.mintDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 3 complete\n");
  } else {
    skipPhase("Phase 3: ARCT mint");
  }

  // ── Phase 4: Deploy EventBasedPredictionMarket ────────────────────────────

  if (!cp.market) {
    divider("Phase 4: Deploy EventBasedPredictionMarket");

    console.log(`  Question : "${CONFIG.market.question}"`);
    console.log(`  Pair     : ${CONFIG.market.pairName}`);
    console.log(`  Liveness : ${CONFIG.market.liveness}s`);
    console.log(`  Reward   : ${ethers.formatEther(CONFIG.market.proposerReward)} ARCT`);
    console.log(`  Bond     : ${ethers.formatEther(CONFIG.market.proposerBond)} ARCT`);

    const artifact = loadLocalArtifact("EventBasedPredictionMarket");

    // customAncillaryData is bytes memory — encode question as UTF-8 bytes
    const ancillaryData = ethers.toUtf8Bytes(CONFIG.market.question);

    const marketAddr = await deployContract(
      ctx, "EventBasedPredictionMarket", artifact,
      [
        CONFIG.market.pairName,
        arctAddr,
        ancillaryData,
        finderAddr,
        timerAddr,
        CONFIG.market.proposerReward,
        CONFIG.market.liveness,
        CONFIG.market.proposerBond,
      ],
    );

    // Read long/short token addresses via public Arc Testnet RPC (no private key needed)
    console.log("  Reading long/short token addresses from deployed contract...");
    const longTokenAddr  = await viewCall<string>(marketAddr, "longToken()");
    const shortTokenAddr = await viewCall<string>(marketAddr, "shortToken()");

    console.log(`\n  Long  token (YES/PLT): ${longTokenAddr}`);
    console.log(`  Short token (NO/PST) : ${shortTokenAddr}`);

    cp.market = { address: marketAddr, longToken: longTokenAddr, shortToken: shortTokenAddr };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 4 complete\n");
  } else {
    skipPhase("Phase 4: EventBasedPredictionMarket");
    console.log(`  Market     : ${cp.market.address}`);
    console.log(`  Long token : ${cp.market.longToken}`);
    console.log(`  Short token: ${cp.market.shortToken}`);
  }

  const marketAddr = cp.market!.address;

  // ── Phase 5: Initialize market ────────────────────────────────────────────
  // Pulls proposerReward from the wallet and submits a live OO price request.

  if (!cp.marketInitDone) {
    divider("Phase 5: Initialize market (approve + initializeMarket)");

    await execContract(
      ctx,
      `Approve ${ethers.formatEther(CONFIG.market.proposerReward)} ARCT → market`,
      arctAddr, "approve(address,uint256)",
      [marketAddr, CONFIG.market.proposerReward.toString()],
    );

    await execContract(ctx, "initializeMarket()", marketAddr, "initializeMarket()", []);

    cp.marketInitDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 5 complete — OO price request is live\n");
  } else {
    skipPhase("Phase 5: Market initialization");
  }

  // ── Phase 6: Deploy PredictionMarketAMM ───────────────────────────────────

  if (!cp.amm) {
    divider("Phase 6: Deploy PredictionMarketAMM");

    console.log(`  Fee : ${CONFIG.amm.feeBps} bps (${CONFIG.amm.feeBps / 100}%)`);

    const ammArtifact = loadLocalArtifact("PredictionMarketAMM");
    const ammAddr     = await deployContract(
      ctx, "PredictionMarketAMM", ammArtifact, [marketAddr, CONFIG.amm.feeBps],
    );

    cp.amm = { address: ammAddr };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 6 complete\n");
  } else {
    skipPhase(`Phase 6: PredictionMarketAMM (${cp.amm.address})`);
  }

  const ammAddr = cp.amm!.address;

  // ── Phase 7: Seed AMM ─────────────────────────────────────────────────────

  if (!cp.ammSeedDone) {
    divider("Phase 7: Seed AMM with initial liquidity");

    console.log(`  Seed : ${ethers.formatEther(CONFIG.amm.seedLiquidity)} ARCT`);

    await execContract(
      ctx,
      `Approve ${ethers.formatEther(CONFIG.amm.seedLiquidity)} ARCT → AMM`,
      arctAddr, "approve(address,uint256)",
      [ammAddr, CONFIG.amm.seedLiquidity.toString()],
    );

    await execContract(
      ctx,
      `AMM.initialize(${ethers.formatEther(CONFIG.amm.seedLiquidity)} ARCT)`,
      ammAddr, "initialize(uint256)",
      [CONFIG.amm.seedLiquidity.toString()],
    );

    cp.ammSeedDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 7 complete\n");
  } else {
    skipPhase("Phase 7: AMM seed");
  }

  // ── Phase 8: Write outputs ────────────────────────────────────────────────

  divider("Phase 8: Write deployment outputs");

  writeEnvLocal({
    NEXT_PUBLIC_TIMER_ADDRESS:       timerAddr,
    NEXT_PUBLIC_FINDER_ADDRESS:      finderAddr,
    NEXT_PUBLIC_IW_ADDRESS:          iwAddr,
    NEXT_PUBLIC_AW_ADDRESS:          awAddr,
    NEXT_PUBLIC_STORE_ADDRESS:       storeAddr,
    NEXT_PUBLIC_ARCT_ADDRESS:        arctAddr,
    NEXT_PUBLIC_MOCK_ORACLE_ADDRESS: mockOracleAddr,
    NEXT_PUBLIC_OO_V2_ADDRESS:       ooV2Addr,
    NEXT_PUBLIC_MARKET_ADDRESS:      marketAddr,
    NEXT_PUBLIC_AMM_ADDRESS:         ammAddr,
  });
  console.log("  .env.local updated");

  if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  const jsonOut = path.join(DEPLOY_DIR, "arc-testnet-deployment.json");
  fs.writeFileSync(jsonOut, JSON.stringify({
    network:       "arcTestnet",
    chainId:       5042002,
    walletId:      WALLET_ID,
    walletAddress: wallet.address,
    deployedAt:    new Date().toISOString(),
    contracts: {
      Timer:                      timerAddr,
      Finder:                     finderAddr,
      IdentifierWhitelist:        iwAddr,
      AddressWhitelist:           awAddr,
      Store:                      storeAddr,
      MockOracleAncillary:        mockOracleAddr,
      OptimisticOracleV2:         ooV2Addr,
      ARCT:                       arctAddr,
      LongToken:                  cp.market!.longToken,
      ShortToken:                 cp.market!.shortToken,
      EventBasedPredictionMarket: marketAddr,
      PredictionMarketAMM:        ammAddr,
    },
    marketConfig: {
      pairName:       CONFIG.market.pairName,
      question:       CONFIG.market.question,
      liveness:       CONFIG.market.liveness,
      proposerReward: ethers.formatEther(CONFIG.market.proposerReward) + " ARCT",
      proposerBond:   ethers.formatEther(CONFIG.market.proposerBond)   + " ARCT",
      ammFeeBps:      CONFIG.amm.feeBps,
      seedLiquidity:  ethers.formatEther(CONFIG.amm.seedLiquidity)     + " ARCT",
    },
  }, null, 2));
  console.log(`  ${jsonOut}`);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log("  Deployment complete");
  console.log("═".repeat(60));
  console.log(`
  UMA Infrastructure
    Timer               : ${timerAddr}
    Finder              : ${finderAddr}
    IdentifierWhitelist : ${iwAddr}
    AddressWhitelist    : ${awAddr}
    Store               : ${storeAddr}
    MockOracleAncillary : ${mockOracleAddr}
    OptimisticOracleV2  : ${ooV2Addr}

  Tokens
    ARCT (collateral)   : ${arctAddr}
    Long  token (PLT)   : ${cp.market!.longToken}
    Short token (PST)   : ${cp.market!.shortToken}

  Application
    PredictionMarket    : ${marketAddr}
    AMM                 : ${ammAddr}

  Explorer
    ${EXPLORER}/address/${marketAddr}

  Next steps
    1.  npm run dev                 — start the frontend
    2.  Propose a resolution price  — OO liveness is ${CONFIG.market.liveness}s
    3.  After liveness, call settle() on the market contract
`);
}

main().catch(err => {
  console.error("\n  DEPLOYMENT FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
