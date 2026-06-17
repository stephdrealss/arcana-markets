/**
 * deployAll.ts — Full Arc Testnet deployment
 *
 * Deploys in order:
 *   1. UMA infrastructure  (Timer, Finder, IdentifierWhitelist, AddressWhitelist,
 *                           Store, TestnetERC20/ARCT, MockOracleAncillary, OptimisticOracleV2)
 *   2. Wire Finder         (7 registration + whitelist transactions)
 *   3. Mint ARCT           (test collateral for deployer)
 *   4. EventBasedPredictionMarket
 *   5. Initialize market   (submits OO price request)
 *   6. PredictionMarketAMM
 *   7. Seed AMM            (initial liquidity)
 *   8. Write outputs       (.env.local + deployments/arc-testnet-deployment.json)
 *
 * Checkpoint: progress is saved to deployments/arc-testnet-checkpoint.json after
 * every phase. Re-running the script resumes from the last completed phase —
 * no contracts are redeployed unnecessarily.
 *
 * Usage:
 *   npx hardhat run scripts/deployAll.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import * as fs   from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — edit these values before running
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  market: {
    // Short name — becomes the prefix of your Long/Short token names.
    pairName: "BTC100K",

    // The exact question the Optimistic Oracle will resolve.
    // Encoded as UTF-8 bytes and stored on-chain as customAncillaryData.
    question: "Will Bitcoin exceed $100,000 before June 1, 2026?",

    // How long (in seconds) a proposed resolution price sits open for dispute.
    // 60 s = fast testnet cycle.  Use 7200 (2 h) for production.
    liveness: 60,

    // Reward paid in ARCT to whoever proposes the resolution price to the OO.
    proposerReward: ethers.parseEther("10"),    // 10 ARCT

    // Bond the proposer must stake. Forfeited to the disputer if the proposal is wrong.
    proposerBond:   ethers.parseEther("100"),   // 100 ARCT
  },

  collateral: {
    name:     "Arc Test Token",
    symbol:   "ARCT",
    decimals: 18,

    // How much ARCT to mint to the deployer wallet for testing.
    mintToDeployer: ethers.parseEther("100000"), // 100 000 ARCT
  },

  amm: {
    feeBps:        200,                         // 200 = 2 % trading fee
    seedLiquidity: ethers.parseEther("1000"),   // 1 000 ARCT seeded into both reserves
  },

  oo: {
    // Global OO default liveness before the per-market override takes effect.
    defaultLiveness: 7200, // 2 h
  },
} as const;

const EXPLORER = "https://testnet.arcscan.app";

// ─────────────────────────────────────────────────────────────────────────────
// UMA artifact loader
// Pre-compiled JSON lives in @uma/core — we never need to recompile these.
// ─────────────────────────────────────────────────────────────────────────────

function loadUmaArtifact(p: string) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

interface InfraAddresses {
  timer:               string;
  finder:              string;
  identifierWhitelist: string;
  addressWhitelist:    string;
  store:               string;
  arct:                string;
  mockOracle:          string;
  ooV2:                string;
}

interface MarketAddresses {
  address:    string;
  longToken:  string;
  shortToken: string;
}

interface Checkpoint {
  deployer:       string;
  infra?:         InfraAddresses;
  wiringDone?:    true;
  mintDone?:      true;
  market?:        MarketAddresses;
  marketInitDone?: true;
  amm?:           { address: string };
  ammSeedDone?:   true;
}

const DEPLOY_DIR      = path.resolve(__dirname, "../deployments");
const CHECKPOINT_FILE = path.join(DEPLOY_DIR, "arc-testnet-checkpoint.json");

function loadCheckpoint(): Checkpoint | null {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8")) as Checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint): void {
  if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const txUrl   = (hash: string) => `${EXPLORER}/tx/${hash}`;
const addrUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

/** Deploy a contract from a pre-compiled artifact and return the instance. */
async function deployArtifact(
  label:    string,
  artifact: { abi: unknown[]; bytecode: string },
  args:     unknown[],
  signer:   ethers.Signer,
): Promise<ethers.Contract> {
  process.stdout.write(`  [→] ${label.padEnd(28)} `);
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  const receipt  = await contract.deploymentTransaction()!.wait();
  const addr     = await contract.getAddress();
  console.log(addr);
  if (receipt?.hash) console.log(`       ${txUrl(receipt.hash)}`);
  return contract as ethers.Contract;
}

/** Send a named transaction and wait for confirmation, printing the explorer link. */
async function send(
  label:   string,
  promise: Promise<ethers.ContractTransactionResponse>,
): Promise<void> {
  process.stdout.write(`  [→] ${label.padEnd(42)} `);
  const res     = await promise;
  const receipt = await res.wait();
  console.log(`✓  ${txUrl(receipt!.hash)}`);
}

/** Retry a read-only call to handle RPC propagation lag after deployment. */
async function retryView<T>(fn: () => Promise<T>, retries = 6, delayMs = 2500): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: unknown) {
      if (i === retries - 1) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("BAD_DATA") && !msg.includes("could not decode")) throw e;
      console.log(`    (RPC not ready, retry ${i + 1}/${retries} in ${delayMs / 1000}s...)`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

/** Cancel any stuck pending transactions by replacing them with 0-value self-sends. */
async function clearStuckTxs(signer: ethers.Signer & { address: string }): Promise<void> {
  const pending   = await ethers.provider.getTransactionCount(signer.address, "pending");
  const confirmed = await ethers.provider.getTransactionCount(signer.address, "latest");
  if (pending === confirmed) return;

  console.log(`  Clearing ${pending - confirmed} stuck pending tx(s)...`);
  const fee = await ethers.provider.getFeeData();
  for (let nonce = confirmed; nonce < pending; nonce++) {
    const t = await signer.sendTransaction({
      to:       signer.address,
      value:    0,
      nonce,
      gasPrice: (fee.gasPrice ?? 0n) * 2n,
    });
    await t.wait();
    console.log(`  Cleared nonce ${nonce} → ${txUrl(t.hash)}`);
  }
  console.log();
}

/** Merge new key=value pairs into .env.local, preserving existing entries. */
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

function divider(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 54 - title.length))}\n`);
}

function skip(title: string): void {
  console.log(`── ${title} (already done — skipping)\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {

  // ── Pre-flight ────────────────────────────────────────────────────────────

  const signers = await ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "No signer found.\n" +
      "Set PRIVATE_KEY in .env.local (64 hex chars, with or without 0x prefix).\n" +
      "Or export PRIVATE_KEY=<key> in your shell before running.",
    );
  }

  const [base]   = signers;
  const signer   = new ethers.NonceManager(base);      // auto-manages nonces
  const balance  = await ethers.provider.getBalance(base.address);
  const network  = await ethers.provider.getNetwork();

  console.log("\n" + "═".repeat(60));
  console.log("  Arc Testnet — Full UMA + Prediction Market Deployment");
  console.log("═".repeat(60));
  console.log(`\n  Deployer : ${base.address}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} (native gas token)`);
  console.log(`  Chain ID : ${network.chainId}`);
  console.log(`  RPC      : ${(ethers.provider as unknown as { connection?: { url: string } }).connection?.url ?? "hardhat provider"}`);
  console.log(`  Explorer : ${EXPLORER}\n`);

  if (balance === 0n) {
    throw new Error(
      "Deployer wallet has zero balance.\n" +
      "Fund it from https://faucet.circle.com/ before deploying.",
    );
  }
  if (balance < ethers.parseEther("0.05")) {
    console.warn(
      "  WARNING: Balance is below 0.05. You may run out of gas.\n" +
      "  Recommended: fund to at least 0.1 before proceeding.\n",
    );
  }

  await clearStuckTxs(base as ethers.Signer & { address: string });

  // Load or create checkpoint
  let cp: Checkpoint = loadCheckpoint() ?? { deployer: base.address };

  if (cp.deployer !== base.address) {
    throw new Error(
      `Checkpoint belongs to ${cp.deployer} but current key is ${base.address}.\n` +
      `To start fresh: delete deployments/arc-testnet-checkpoint.json`,
    );
  }

  const b32 = (s: string) => ethers.encodeBytes32String(s);

  // ── Phase 1: UMA infrastructure ───────────────────────────────────────────

  if (!cp.infra) {
    divider("Phase 1: Deploy UMA infrastructure");

    const timer  = await deployArtifact("Timer",               UMA.Timer,               [],                              signer);
    const finder = await deployArtifact("Finder",              UMA.Finder,              [],                              signer);
    const iw     = await deployArtifact("IdentifierWhitelist", UMA.IdentifierWhitelist, [],                              signer);
    const aw     = await deployArtifact("AddressWhitelist",    UMA.AddressWhitelist,    [],                              signer);

    // Store constructor: (FixedPoint.Unsigned finalFee, FixedPoint.Unsigned weeklyDelayFee, address timerAddress)
    // FixedPoint.Unsigned is a struct { uint256 rawValue } — pass as tuple [0]
    const store  = await deployArtifact("Store",               UMA.Store,
      [[0], [0], await timer.getAddress()], signer);

    const arct   = await deployArtifact("TestnetERC20 (ARCT)", UMA.TestnetERC20,
      [CONFIG.collateral.name, CONFIG.collateral.symbol, CONFIG.collateral.decimals], signer);

    const oracle = await deployArtifact("MockOracleAncillary", UMA.MockOracleAncillary,
      [await finder.getAddress(), await timer.getAddress()], signer);

    const oo     = await deployArtifact("OptimisticOracleV2",  UMA.OptimisticOracleV2,
      [CONFIG.oo.defaultLiveness, await finder.getAddress(), await timer.getAddress()], signer);

    cp.infra = {
      timer:               await timer.getAddress(),
      finder:              await finder.getAddress(),
      identifierWhitelist: await iw.getAddress(),
      addressWhitelist:    await aw.getAddress(),
      store:               await store.getAddress(),
      arct:                await arct.getAddress(),
      mockOracle:          await oracle.getAddress(),
      ooV2:                await oo.getAddress(),
    };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 1 complete\n");
  } else {
    skip("Phase 1: UMA infrastructure");
    for (const [k, v] of Object.entries(cp.infra)) {
      console.log(`  ${k.padEnd(22)}: ${v}`);
    }
    console.log();
  }

  const {
    timer: timerAddr, finder: finderAddr,
    identifierWhitelist: iwAddr, addressWhitelist: awAddr,
    store: storeAddr, arct: arctAddr,
    mockOracle: mockOracleAddr, ooV2: ooV2Addr,
  } = cp.infra!;

  // Bind contract instances to signer for remaining phases
  const finder = new ethers.Contract(finderAddr, UMA.Finder.abi,              signer);
  const iw     = new ethers.Contract(iwAddr,     UMA.IdentifierWhitelist.abi, signer);
  const aw     = new ethers.Contract(awAddr,     UMA.AddressWhitelist.abi,    signer);
  const arct   = new ethers.Contract(arctAddr,   UMA.TestnetERC20.abi,        signer);

  // ── Phase 2: Wire Finder ──────────────────────────────────────────────────

  if (!cp.wiringDone) {
    divider("Phase 2: Wire Finder");

    // Register all supporting contracts so the Finder can look them up by name.
    // The keys are the exact bytes32 identifiers UMA uses internally.
    await send("Finder ← IdentifierWhitelist",
      finder.getFunction("changeImplementationAddress")(b32("IdentifierWhitelist"), iwAddr));

    await send("Finder ← CollateralWhitelist",
      finder.getFunction("changeImplementationAddress")(b32("CollateralWhitelist"), awAddr));

    await send("Finder ← Store",
      finder.getFunction("changeImplementationAddress")(b32("Store"), storeAddr));

    await send("Finder ← Oracle (MockOracleAncillary)",
      finder.getFunction("changeImplementationAddress")(b32("Oracle"), mockOracleAddr));

    await send("Finder ← OptimisticOracleV2",
      finder.getFunction("changeImplementationAddress")(b32("OptimisticOracleV2"), ooV2Addr));

    // The EventBasedPredictionMarket constructor checks both of these on deploy.
    await send("Whitelist identifier  YES_OR_NO_QUERY",
      iw.getFunction("addSupportedIdentifier")(b32("YES_OR_NO_QUERY")));

    await send("Whitelist collateral  ARCT",
      aw.getFunction("addToWhitelist")(arctAddr));

    cp.wiringDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 2 complete\n");
  } else {
    skip("Phase 2: Finder wiring");
  }

  // ── Phase 3: Mint ARCT ────────────────────────────────────────────────────

  if (!cp.mintDone) {
    divider("Phase 3: Mint ARCT to deployer");

    await send(
      `allocateTo deployer ${ethers.formatEther(CONFIG.collateral.mintToDeployer)} ARCT`,
      arct.getFunction("allocateTo")(base.address, CONFIG.collateral.mintToDeployer),
    );

    cp.mintDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 3 complete\n");
  } else {
    skip("Phase 3: ARCT mint");
  }

  // ── Phase 4: Deploy EventBasedPredictionMarket ────────────────────────────

  if (!cp.market) {
    divider("Phase 4: Deploy EventBasedPredictionMarket");

    console.log(`  Market question : "${CONFIG.market.question}"`);
    console.log(`  Pair name       : ${CONFIG.market.pairName}`);
    console.log(`  Liveness        : ${CONFIG.market.liveness}s`);
    console.log(`  Proposer reward : ${ethers.formatEther(CONFIG.market.proposerReward)} ARCT`);
    console.log(`  Proposer bond   : ${ethers.formatEther(CONFIG.market.proposerBond)} ARCT\n`);

    const ancillaryData = ethers.toUtf8Bytes(CONFIG.market.question);
    const marketFactory = await ethers.getContractFactory("EventBasedPredictionMarket", signer);

    process.stdout.write(`  [→] ${"EventBasedPredictionMarket".padEnd(28)} `);
    const market  = await marketFactory.deploy(
      CONFIG.market.pairName,
      arctAddr,
      ancillaryData,
      finderAddr,
      timerAddr,
      CONFIG.market.proposerReward,
      CONFIG.market.liveness,
      CONFIG.market.proposerBond,
    );
    const receipt    = await market.deploymentTransaction()!.wait();
    const marketAddr = await market.getAddress();
    console.log(marketAddr);
    if (receipt?.hash) console.log(`       ${txUrl(receipt.hash)}`);

    // View calls on a freshly deployed contract can fail due to RPC propagation lag.
    const mc           = market.connect(base);
    const longTokenAddr  = await retryView(() => mc.getFunction("longToken")()  as Promise<string>);
    const shortTokenAddr = await retryView(() => mc.getFunction("shortToken")() as Promise<string>);

    console.log(`\n  Long  token (YES / PLT): ${longTokenAddr}`);
    console.log(`  Short token (NO  / PST): ${shortTokenAddr}`);

    cp.market = { address: marketAddr, longToken: longTokenAddr, shortToken: shortTokenAddr };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 4 complete\n");
  } else {
    skip("Phase 4: EventBasedPredictionMarket");
    console.log(`  Market     : ${cp.market.address}`);
    console.log(`  Long token : ${cp.market.longToken}`);
    console.log(`  Short token: ${cp.market.shortToken}\n`);
  }

  const marketAddr = cp.market!.address;

  // ── Phase 5: Initialize market ────────────────────────────────────────────

  if (!cp.marketInitDone) {
    divider("Phase 5: Initialize market (submit OO price request)");

    // The market pulls proposerReward from msg.sender when initializeMarket() is called.
    // Approve first, then initialize.
    const market = (await ethers.getContractFactory("EventBasedPredictionMarket", signer))
      .attach(marketAddr) as ethers.Contract;

    await send(
      `approve ${ethers.formatEther(CONFIG.market.proposerReward)} ARCT → market`,
      arct.getFunction("approve")(marketAddr, CONFIG.market.proposerReward),
    );

    await send(
      "initializeMarket()",
      market.getFunction("initializeMarket")(),
    );

    cp.marketInitDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 5 complete — OO price request is live\n");
  } else {
    skip("Phase 5: Market initialization");
  }

  // ── Phase 6: Deploy PredictionMarketAMM ───────────────────────────────────

  if (!cp.amm) {
    divider("Phase 6: Deploy PredictionMarketAMM");

    console.log(`  Fee : ${CONFIG.amm.feeBps} bps (${CONFIG.amm.feeBps / 100}%)\n`);

    const ammFactory = await ethers.getContractFactory("PredictionMarketAMM", signer);

    process.stdout.write(`  [→] ${"PredictionMarketAMM".padEnd(28)} `);
    const amm     = await ammFactory.deploy(marketAddr, CONFIG.amm.feeBps);
    const receipt = await amm.deploymentTransaction()!.wait();
    const ammAddr = await amm.getAddress();
    console.log(ammAddr);
    if (receipt?.hash) console.log(`       ${txUrl(receipt.hash)}`);

    cp.amm = { address: ammAddr };
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 6 complete\n");
  } else {
    skip(`Phase 6: PredictionMarketAMM (${cp.amm.address})`);
  }

  const ammAddr = cp.amm!.address;

  // ── Phase 7: Seed AMM ─────────────────────────────────────────────────────

  if (!cp.ammSeedDone) {
    divider("Phase 7: Seed AMM with initial liquidity");

    console.log(`  Seed : ${ethers.formatEther(CONFIG.amm.seedLiquidity)} ARCT\n`);

    const amm = (await ethers.getContractFactory("PredictionMarketAMM", signer))
      .attach(ammAddr) as ethers.Contract;

    await send(
      `approve ${ethers.formatEther(CONFIG.amm.seedLiquidity)} ARCT → AMM`,
      arct.getFunction("approve")(ammAddr, CONFIG.amm.seedLiquidity),
    );

    await send(
      `AMM.initialize(${ethers.formatEther(CONFIG.amm.seedLiquidity)})`,
      amm.getFunction("initialize")(CONFIG.amm.seedLiquidity),
    );

    cp.ammSeedDone = true;
    saveCheckpoint(cp);
    console.log("\n  ✓ Phase 7 complete\n");
  } else {
    skip("Phase 7: AMM seed");
  }

  // ── Phase 8: Write outputs ────────────────────────────────────────────────

  divider("Phase 8: Write deployment outputs");

  // .env.local — read by Next.js frontend and Hardhat config
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
  console.log(`  .env.local updated`);

  // deployments/arc-testnet-deployment.json — permanent record
  if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  const deploymentRecord = {
    network:    "arcTestnet",
    chainId:    Number(network.chainId),
    deployer:   base.address,
    deployedAt: new Date().toISOString(),
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
  };
  const jsonOut = path.join(DEPLOY_DIR, "arc-testnet-deployment.json");
  fs.writeFileSync(jsonOut, JSON.stringify(deploymentRecord, null, 2));
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
    ${addrUrl(marketAddr)}

  Next steps
    1.  npm run dev                  — start the frontend
    2.  Propose a resolution price   — OO liveness is ${CONFIG.market.liveness}s
    3.  After liveness, call settle() on the market contract
`);
}

main().catch(err => {
  console.error("\n  DEPLOYMENT FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
