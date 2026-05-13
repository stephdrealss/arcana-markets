import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { WalletModal, BridgePanel, UnifiedBalancePanel, ERC8183JobPanel } from './ArcanaIntegrations';

// ── CONTRACT CONFIG ───────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x443a47eF1025e047879b1BA08c94e6dedB354D54";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ARC_CHAIN_ID = "0x4cef52";
const ARC_RPC =
  "https://rpc.testnet.arc.network";

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
  "function markets(uint256) external view returns (uint256 id, string title, string category, uint256 yesPool, uint256 noPool, uint256 endTime, bool resolved, bool cancelled)",
  "function marketCount() external view returns (uint256)",
  "function getMarketOdds(uint256 _marketId) external view returns (uint256 yesOdds, uint256 noOdds)",
  "function resolveMarket(uint256 _marketId, bool _yesWon) external",
  "function claimWinnings(uint256 _marketId) external",
  "function cancelMarket(uint256 _marketId) external",
  "function refund(uint256 _marketId) external",
  "function yesShares(uint256, address) external view returns (uint256)",
  "function noShares(uint256, address) external view returns (uint256)",
  "function owner() external view returns (address)",
  "event SharesBought(address indexed buyer, uint256 indexed marketId, bool isYes, uint256 usdcAmount, uint256 shares)",
  "event MarketResolved(uint256 indexed marketId, bool yesWon)",
  "event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount)",
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

// ── ON-CHAIN MARKET DATA ──────────────────────────────────────────────────────
async function getOnChainMarket(marketId) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const m = await contract.markets(marketId);
    return {
      id: Number(m.id),
      yesPool: Number(m.yesPool) / 1e6,
      noPool: Number(m.noPool) / 1e6,
      endTime: Number(m.endTime),
      resolved: m.resolved,
      cancelled: m.cancelled,
    };
  } catch { return null; }
}

// ── GET USER SHARES ON-CHAIN ──────────────────────────────────────────────────
async function getUserShares(marketId, address) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const [yes, no] = await Promise.all([
      contract.yesShares(marketId, address),
      contract.noShares(marketId, address),
    ]);
    return { yes: Number(yes) / 1e6, no: Number(no) / 1e6 };
  } catch { return { yes: 0, no: 0 }; }
}

// ── GET CONTRACT OWNER ────────────────────────────────────────────────────────
async function getContractOwner() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    return await contract.owner();
  } catch { return null; }
}

// ── RESOLUTION STORE ──────────────────────────────────────────────────────────
// Contract emits MarketResolved(marketId, yesWon) but doesn't expose yesWon as a getter.
// We store it locally after admin resolves. In a future version this reads from event logs.
const RES_KEY = "arcana_resolutions_v2";
function getResolutions() { return LS.get(RES_KEY, {}); }
function saveResolution(marketId, yesWon) {
  const r = getResolutions();
  r[String(marketId)] = yesWon;
  LS.set(RES_KEY, r);
}

const MC={"M1":"Market #1","M16":"Market #16","M17":"Market #17","M18":"Market #18","M19":"Market #19","M20":"Market #20","M21":"Market #21","M22":"Market #22","M23":"Market #23","M26":"OpenAI releases GPT-5 in 2026?","M2":"BTC hits $120K before July 2026?","M3":"ETH flips BTC market cap in 2026?","M4":"Spot SOL ETF approved in 2026?","M5":"USDC market cap exceeds $100B in 2026?","M6":"Arc Network mainnet launches Q2 2026?","M7":"Arc TVL surpasses $500M by end of 2026?","M8":"Arc-native DEX launches with $10M+ TVL?","M9":"Arc Architects Program reaches 5K members?","M10":"Real Madrid wins 2025-26 Champions League?","M11":"Golden State Warriors make 2026 NBA Playoffs?","M12":"Canelo Alvarez wins next fight by KO?","M13":"Lewis Hamilton wins a race in 2026 F1 season?","M14":"Tiger Woods plays in 2026 Masters?","M15":"Lionel Messi retires before end of 2026?","M24":"US passes comprehensive crypto legislation?","M25":"Fed cuts rates twice before August 2026?","M27":"Taylor Swift announces new album before June 2026?","M28":"Global average temp sets new record high in 2026?","M29":"G7 nation adopts a CBDC by end of 2026?","M30":"UK snap election called before end of 2026?","M31":"Trump approval rating above 50% before midterms?","M32":"S&P 500 hits all-time high above 6,500 in 2026?","M33":"US enters recession in 2026?","M34":"Gold hits $3,500/oz before end of 2026?","M35":"Apple Vision Pro 2 announced in 2026?","M36":"AI-generated content banned on a major platform?","M37":"Elon Musk's xAI surpasses $100B valuation?","M38":"Netflix gains more than 20M subscribers in Q1?","M39":"A Marvel film tops $2B at the box office in 2026?","M40":"NASA Artemis Moon landing happens before 2027?","M41":"A lab-grown meat product hits major US grocery chain?","M42":"Quantum computer breaks RSA-2048 encryption?","M47":"Will BTC close above $80K in 3 days?","M60":"Will ETH close above $2,400 in 7 days?","M52":"Will SOL close above $90 in 7 days?","M53":"Will Arsenal reach the UCL Final?","M54":"Will Paris beat Bayern in the UCL Semi?","M55":"Will Trump sign a crypto bill before June?","M56":"Will Met Gala go viral for a crypto outfit?","M57":"Will Google announce new Gemini at I/O?","M58":"Will Cannes open with an AI-generated film?","M59":"Will BTC dominance stay above 55% in 24h?"};
const getMkt=c=>MC[c]||c;

const WH={
"0xc89598ee6d9b0891afbc7d397a6c6fb32e767991":[["M42","N","500.0","0x9184bfa2f54de6ea50712045ea5115d892491d5d64a72e7da7e15e852fcb925e","2026-04-15 10:17"],["M40","N","100.0","0x1d325a0bc256f36b4e431d85702763efbf010f5ee9a4970c11c364d97189d70f","2026-04-15 10:16"],["M35","Y","200.0","0xf55eca188c7310df7b48b1fab34c67fc6af13d1396bb1216a78ded5765781aac","2026-04-15 10:16"],["M31","Y","1000.0","0x70f2038b5ab01dc7975dad2913766f8c96a8503954acab199e278f1972c180c7","2026-04-15 10:15"],["M29","Y","100.0","0xf1dbfadaa29ba63b3019548fbdea3ef20137c53781bdbbfd87043ce330e3fa7e","2026-04-15 10:15"],["M10","Y","100.0","0x4b4fafce14db337379cc07b8b50cb6ec2eac44ff6707e2d406f051291ed99bc5","2026-04-15 10:14"],["M8","Y","100.0","0x7342a71411d8953f57f211cf63430e100a5ce1037cb8a7565f5853f6e716f562","2026-04-15 10:14"],["M7","Y","100.0","0x7d46561b2b7ce44e336de63aa2993a33412ffb0bcf3177ef097dbd6d26dcf62d","2026-04-15 10:13"],["M6","N","100.0","0x9caef27331ed5e8d4ea1edd4e5b7d66bdfeb00159ba44c276df1cc76d572998c","2026-04-15 10:13"],["M2","N","100.0","0xf4495a58565560797b48dbe402834b87fda674bb87b6680285c7b5eea60c209a","2026-04-15 10:12"],["M26","Y","100.0","0x354826957f4c64fd9008d13f91852a08936ab9228b3eb339d3950d17e13e6427","2026-04-15 10:12"],["M39","N","100.0","0x6f8837b792d90957059bdc7ba446ae4989fecba3797e12879e2d4222a7cbf903",""],["M27","N","100.0","0x62c71f0c2190d1b04d9d85144ac5fc56c877c8406df341e34ca4239ef5e14094",""],["M4","Y","100.0","0x0216f4017b32dfafa78ab4a931acb1589a1d5a2defc69d8f1e1d899f709fbd72",""]],
"0x10112d54a268c2db7f2b1d2789282c325795a219":[["M3","N","5.0","0xb4dc2e1eb536be20e7fbbe61be15b43492aefe6be6129194b257c55f6cbc0c92","2026-04-13 08:40"],["M15","N","5.0","0xc41f9a08ce7c1911ad206b97af599f6c329669d81e423bb80ba52b01fe12fe1c","2026-04-13 08:38"],["M2","N","5.0","0x630841e479adadc2eae94bdfedd91dac49cf1f0766ee2bbc0c0182bf3a48ef78","2026-04-13 08:36"],["M26","Y","5.0","0xa43d791471be114bb0528f64cf9eac679c86c582f3789cbb7297928f9cacff0c","2026-04-13 08:35"],["M34","Y","10.0","0x3ecbead5af473b9685a10fef7352f50d0b37690860d999fc63f7633a29990627","2026-04-07 19:30"],["M15","N","5.0","0x91042e1b0a57d91a5a4f30c662a6663a8a00f8f89636cb7233ba3f8d82cef689","2026-04-07 19:29"],["M6","Y","5.0","0x9d9332807117cb704fdf0bf74b69d64dcd3217382a25cb477548370c9dbd4f02","2026-04-07 19:28"],["M3","N","5.0","0xff4d25f9d3735e49ce7df95356b9f81b5330f456403ddb8f39795d945212d13a","2026-04-07 19:27"],["M2","N","20.0","0x52a2c71f1a6e59ebce3e40d101d317ba0daadcd936b55269d0b938238ab2a3f1","2026-04-07 19:26"],["M26","Y","5.0","0x2a97eaec2c0ec6a0995afda452d024a8a997e6a64e82719cc9b3f83b6cfebce1","2026-04-07 19:25"],["M34","Y","50.0","0x1c7b3279bc2ba0a35d0755df4cb0ee34fff8fd6ab424a9d3eae6d566031cdd7f",""],["M8","Y","20.0","0xced1886c8f38f5f4231952ee573bc4b18c21a45827b5f0f20faf7485b29100c8",""],["M7","Y","20.0","0xa2943276de767fb6b4d9fe53d41b6ed5f39f28f3f0b85cee4f5a9ff96886b3f2",""],["M6","Y","20.0","0x8f6ce380213902144e9dc2080f51836c36bb515476537e99535dfbb91f39a30f",""]],
"0x7877461b299dafe9ad49767ab98fa3deaeaa4482":[["M15","Y","20.0","0x7a45750681fea82c158853933a36c3686955c12d749801d743e9783743b0f605",""],["M3","Y","20.0","0x965294ea0c9c0605e9e2773e1c204fef5554465051a0adab3710724e5ab14ead",""]],
"0x35706ff1754f6291ccdb8ae6f29131b358a4d59b":[["M3","Y","1.0","0xe3983c0f05cc800be69be07ce3a220599fb08bc8a5cda7c20714aa7d2500b3a4",""],["M2","Y","5.0","0x915f1aceb34548ff3b146a898cf32ca22fe9b95eb0c4b174c90d07899971e65b",""],["M26","Y","10.0","0x5ffb29a90e09090a688d9f6f2f38e97217dea43a1a1d2e37828586cdfe17c8e1",""]],
"0x41dd064c20cfec06f22d49ee89c062ebf0da5017":[["M19","N","0.01","0x7b1dffa5741f928c5f7355dcf9fc9ea5a14107160997e7f735919517b4284ae5",""],["M8","Y","0.0","0x8af92846c9cfcde8ca184b0ed6bf8cebe605d2bf1640b9ba795cc6b103bed696",""],["M27","N","0.0","0x135dc4823eb53757afd560d02f1d96a0d7a56ed234e6795801daeb588bffe17f",""],["M16","Y","0.01","0xa2d713c001376470d1fff4ae84439d2c82026fac9b592a513972eb0307b7c146",""],["M6","N","0.01","0x402f7eaf392ef1a8cfc545515648ed18e22e107259a9270dd7dd469e4cbe6a49",""],["M31","N","0.0","0x1d948ace9cde04a1a2d84e52dfbc378e0246bd84717c247ce882c626b015625b",""],["M11","Y","0.02","0xf492a40992bbf7c1929a3d6965e504d2dd38ee13b51c974773d23856b4ed1701",""],["M29","Y","0.02","0xeb7b6716262c2aed0fa8688d68e80d2dd8e462a388cc59ec56d3812c1dbb268c",""],["M1","N","0.01","0xd7dfa8e9406c7070687e732eb2aa05d19ee3a38374b3e4082417149a90398635",""],["M20","N","0.01","0x41934d3bd56eff21932471c6de99985caaaceba0d5047ef35aff2e43d6e52b6a",""],["M36","Y","0.01","0x17188e37e331c32efad3e53b2a9388172db421062bcb95166f400d69ada5f791",""],["M33","N","0.01","0xcb86d77f9f62fbf3d8d5e842a81287df660974e7225104337c36881fe57fca63",""],["M34","N","0.01","0x419e86c549fb66d2d477f1dd710c413fd9bd6914a4a773bb8111fea13690af33",""],["M18","Y","0.01","0xd9a426a87f3606c7ec33d2f4f349d76e1ea6ac5303f5e329e74eb776ab63d171",""],["M14","N","0.02","0xd0eb4630f6e7d262c3840e6c5c315689374721d6de8ea0ef310c10c4e05f9e79",""],["M13","Y","0.0","0xc04d4a3b4259ef942c8c8e626afdaadd56beb98abe5006d3dddecdb0b0fcc0be",""],["M24","N","0.01","0x792e7b03432727fbc4c322bc78a49d5c7cc90544d4600cf23c3251f07ae7f8c4",""],["M3","N","0.01","0x3041e9f8513c4c9287fcaa8e5fb9494e97aaaf9381c34f475b2309aeb99c3ceb",""],["M39","N","0.01","0x9f38f60fc374d1a2e181255a2ee59f4109af22a3b938c35cde58be4a0105b310",""],["M35","Y","0.01","0x788bf6ff8143d18324d9861acd17f177f68f0893f1b5f37c9e7bfb2f64414b9d",""],["M10","N","0.02","0x7be80c966bd365011775f276279bd07fe48406697aa7ad69407321774eeeeacb",""],["M42","Y","0.01","0x29c8523b34ca1e5c8c40ccd46754b15a34c35aa079cc6d09eee88bceb4799b44",""],["M17","N","0.01","0x719d5d6ce5095da0337348ba279cc1a2d27cb5b0e7f5a33c67ac75bed4b6fbc7",""],["M9","Y","0.0","0xd6aaf945e6cae5c5af372f2f1121e32ac0f3413e521abe24e126d3b7594a24ee",""],["M32","Y","0.01","0xaa66aa7b7aa420a6bfac786d8859bf5748072bafab642c2ec3e82609c8405edf",""],["M15","N","0.01","0x6e8e63f3db85b11916e7e5b51c17f68c4504602a5094628e55036a49a70671cc",""],["M40","N","0.01","0xa7311caf8837b50c1fee805b426dca60713c7dee5975bc839c79fb2b6bbc5db8",""],["M22","Y","0.02","0x09a6f7e3120b74118b7530e23f57bd3ad387ab8fe35069c0dbfa1075796acc6b",""],["M28","N","0.0","0xe5835c55984c83c13b5ab61dbb5ff436c81edc8f62342df0c72fdfb126ac9359",""],["M5","N","0.01","0xd750bb8fd8b89caccc78e38d02c040d282b025be1fe14238af9405010673f662",""],["M41","N","0.01","0x9c7cf32add5893d9acf939cf253ef961ef4325312e3bc5b8e29a09400e4ce3c2",""],["M30","N","0.01","0x80c804624dc0a4f1b6b3cf57ebb77e919bff2647ad22dc2c13d99ca114a77bed",""],["M26","Y","0.01","0xcfaf10ad28176f2c18de7de237ea7a0e670bff9c409fff05ea39b90d637d7440",""],["M12","N","0.02","0xadf107b74c22296aa09e3e31794d1ae7190d6c5e9a10c6a789b2f33c6640c23e",""],["M21","N","0.0","0x00b18b4bd83a156e35817d6e358d49b9bcb659eedeb862170682102eeaa3eec2",""],["M4","N","0.01","0x66201b6886f156288f6a36e1fac373dd9161658b465f012fe5f4fa62684fc9b0",""],["M37","N","0.02","0xa0b0e564786b5a57d3ffe77d0fa3cf290fd05c14ab6624296b37eba004137c6a",""],["M2","Y","0.0","0x54b38df32156afe2fc11d9a586e2160e599d5a5e871e132464807641bb83774b",""],["M25","N","0.02","0xcfa90f3518db128b55b12e2951360514ab621e04f1764b89706bcb538fb171c7",""],["M7","N","0.01","0xce5cd7cc1e54f97205dfac629b364dfcdfe325656532989d54f6aa13b99c8a6b",""],["M23","Y","0.01","0x261b0964fe39fb544664fc1fd0c78b57846bfa1fb6027567b8730b31e45c6401",""]],
"0x1453141466d37193e27d5b82eb64b719290cd030":[["M25","N","0.02","0xbb54d84161e45fd487b24ce378502cd930e0652ded0f4520186ea2cd3e41cd68",""],["M18","N","0.02","0xb2f3b8ff8bd6291a6192d0321c75373c010601da44a60525874d13aa6be293aa",""],["M19","Y","0.0","0xa62888296de27db445d75ad16cf0b10ffca10c089bb914ef8fadc8d8dab56d86",""],["M41","Y","0.01","0x2ce7613c85e17c535764fdd57dfa8d77de700ffa09047c82e93ef83008f23fec",""],["M31","N","0.02","0x4de9cfdd707955bb85bb0423df1ee7ebab66d04415091e436c2fce9f2bfaf466",""],["M13","N","0.02","0x42371fd4d89ae758456c90b5993da3c8c71c62cef2b98417d2bcfc442cc5a956",""],["M27","N","0.01","0x728a687713a24b3220a1c7243d7bec669caa6e7ff9adbf246030d12e8335ca78",""],["M36","N","0.0","0x2d3bc10d97bf46863d55cde293c1a9f5fe3147c13105b680d8f104819f0b7a75",""],["M32","N","0.0","0xedc7cd3f7b759f72dd230fc88bf06baa78966e68b49aa77130dc2d9b544de7a5",""],["M14","N","0.0","0x6fec69bb33b23351b6bbe2fd86599737a1342ce3ef3104e9454de7ada9756fc2",""],["M42","N","0.0","0x1b1c43af44dd740af43ef48a99165ec8562712bf63c15149baf661c0ce8c36a3",""],["M37","Y","0.01","0x54754da7c789f8af8dde79544f13b36a98cf75f736be894d48020cf87949d585",""],["M16","N","0.01","0x14a65ba79ffc68162e4f47183b7bce0b33ec4ee078762b347e4d9ac6346b0301",""],["M39","Y","0.01","0xedbde06488926f2da843c8ea0e11cbceea012536d44007e7b4383695c91101db",""],["M30","Y","0.01","0xedb509e73e4d1109708568545394974f076c06f04508f44499f89bc10226bf67",""],["M33","Y","0.02","0xd97ada750ebbbfc090f9e6f0ae62e135aa625c8ee4b71d1654b3df010ec8e32f",""],["M24","Y","0.01","0xed50ec30a8f3a934994f0fbfd6593930b16a988b4dd674744e94f6a151930041",""],["M1","N","0.01","0xb2f52ca930f57dabe7bb16f1d6f1ab15885e3adb75129d8d7291853fe7ea4cc9",""],["M26","Y","0.01","0x8603102ac17a9bee606c4e6fe1a5e3b02afeb472706cc06cbec16dfede2d0c4a",""],["M5","N","0.02","0xf854b57d561186b6e8a105d3f2921a5c7dbecf4b21e9c41fefd30563f7ceb910",""],["M12","N","0.01","0xc7484a68917b0c6ce86e151859c9e0edefd3939b80911b9864b0c4a7f1cfb9c1",""],["M17","N","0.01","0xf2c093540b64cfec86b5307cfb1c5c6708faf01d28a4a89c3cb796f4cb13a9cf",""],["M20","Y","0.01","0x23663053cdc70eee410d00dcbd12c6836ab3df1f3d4d2c231da733dc1b97b1a1",""],["M28","Y","0.01","0x3140bc35b799cb5f12628ea3c6d2d9b9a0b3f604857e0d2b5674d944824297e6",""],["M15","Y","0.01","0xdeb5f8ab07d9d3f201dd0ecc11920536b28b33b6043805ab0a2e79be33ccd142",""],["M35","N","0.02","0xe2601f20b22516456c1c27eaea743147d23a2e9a77e47abfb101fbab76c3ad4d",""],["M7","Y","0.01","0x6387ec454a7ced6f9173398bfbac17c630f7a973a012c81f6ffec0f9e196a2e0",""],["M2","Y","0.01","0x5e04bce2a28a53e8b3d30506fd270b457d29876fd92a6b9fefc6a9cf5e3473e5",""],["M3","Y","0.01","0x60bbfdd148c40315ceb38035cf47565f28f99385a565057ef96b20284d8dae80",""],["M10","Y","0.01","0x89282e2c0f8dd21411deadfc3d06c206029357f25d29dab600d40ab79bbe8b75",""],["M23","N","0.02","0x1a0aa66c22b366c6a140f60c27335f17911477a39a252280d9e804aaae6cd59f",""],["M4","Y","0.01","0xb73351003a619d43cd4bf27765464f4466472e7972647e7b8d6a21ffa2dd775c",""],["M22","Y","0.01","0xd6321dcda3d7f8edacef35c594cdc62c30ce352ff960286756470286a278bc47",""],["M6","Y","0.02","0xf811be1f78b11effd2dfdeea2510ae6bbaf7bac448bf40b21b3dfa13dce4874b",""],["M34","N","0.02","0x4960da4bd0e90c1972e7278b026e3030519eaf8612cc8f32414c330b063387d4",""],["M11","N","0.02","0xdd6ef81a390560b1d2f7df8549ef68357e1145184ed79013bb38ab6cc135b2bd",""],["M40","Y","0.0","0x959291de97ca49f00343fc592d2b151d829f737128b85b224a1fad4aba0e6b5d",""],["M21","N","0.01","0x9c07ead0ba42eecb5e542d3d0c8627b226ad37036e5ff6ac2baad7a692477d85",""],["M8","N","0.02","0xab2277b1a6b930852b92dcb598488dcf83e16a628576ce23ca0eb8e1de166380",""],["M29","Y","0.0","0x2f0f248de7ef1103072c309b03297e9cb32a2a7e2d1a69b15486bf71611542cd",""],["M9","N","0.0","0xf7b01edc3a93b1f5b410a66bc80b949e2e5b92d03ea31ec930224f018f07d56c",""]],
};

const expandTrade=t=>({market:getMkt(t[0]),side:t[1]==='Y'?'YES':'NO',amt:t[2],txHash:t[3],time:t[4]});
const getWalletHistory=addr=>(WH[addr.toLowerCase()]||[]).map(expandTrade);

const AS=[
["0x15705dEcfbdDD1ed1Ee80B4C5c927A23f5E338B0","0x1570...38B0","0x258bb53c219e3889ab5d9e1aee49c7f657148b7c0d43121c266dbaf6d383fdba","2026-04-15 12:35","M4","Y",1.0],
["0x3EB9786eE90E2d20A0fAF42de565D3727a1843c9","0x3EB9...43c9","0xcd5e8453e2ce7819520266d73e6eb705ad5a1d778e5aad593800d6478625ff28","2026-04-15 10:39","M24","Y",1.0],
["0x3EB9786eE90E2d20A0fAF42de565D3727a1843c9","0x3EB9...43c9","0x1aeb19bdb57f7997051bf4b91cbbcc469e5d51c1ad63b941b254c60abcd373ee","2026-04-15 10:37","M10","N",2.0],
["0xC89598eE6d9B0891AFbc7d397a6C6fb32E767991","0xC895...7991","0x9184bfa2f54de6ea50712045ea5115d892491d5d64a72e7da7e15e852fcb925e","2026-04-15 10:17","M42","N",500.0],
["0xC89598eE6d9B0891AFbc7d397a6C6fb32E767991","0xC895...7991","0x70f2038b5ab01dc7975dad2913766f8c96a8503954acab199e278f1972c180c7","2026-04-15 10:15","M31","Y",1000.0],
["0x6776ec612BB40DE4913AfC26442d8246Bba34D9b","0x6776...4D9b","0x317e93becc8066d969d13324190414e83865557d7d05fd3f9d4660a6d49553e8","2026-04-14 16:37","M9","Y",100.0],
["0x6776ec612BB40DE4913AfC26442d8246Bba34D9b","0x6776...4D9b","0x6adddb634419ce2d5491cfed804631a3a0d21704f69fde58693788a3b4364503","2026-04-14 16:35","M6","Y",100.0],
["0xF2315E7c6671A3502A4548d619AF779eB222fB51","0xF231...fB51","0x1471d652a58692f8c41fe029f37b56552871f9769232354e42287cf65b715a91","2026-04-14 09:54","M35","Y",20.0],
["0xF2315E7c6671A3502A4548d619AF779eB222fB51","0xF231...fB51","0xd39457a841f232e2ff4b2693cb3c50998dc21afbbd4d7f5862be9bde8d229545","2026-04-14 09:52","M42","Y",20.0],
["0xA24689956Ea3Ae5E4ccEc37337B8B81Cf466ed43","0xA246...ed43","0xdf9eb9c1d6eaa9210649b37ca900668804fbc3c7f312313aec35bd70051caa30","2026-04-14 02:02","M31","N",0.0],
["0xA24689956Ea3Ae5E4ccEc37337B8B81Cf466ed43","0xA246...ed43","0x27e67e14a44e3692302ce0ea9ade88cfcf5fbb58f9f1025c3c8b8a5c5b043a38","2026-04-14 01:38","M7","Y",2.0],
["0x1E6b64e409DE69217E97150256DceCfB0A38b569","0x1E6b...b569","0xe8c00c9a20ebccacfb6ae54621de10ebebbd84ae526773bc2e152a0a8256d30d","2026-04-14 21:45","M9","Y",100.0],
["0xD9B5549437B54E20F019e2721D2bD550F89C7984","0xD9B5...7984","0x76de7d9cf786de0f2c17941040bcadb4cf24ad53320c4132914cca5c3d175e81","2026-04-14 18:17","M4","Y",25.0],
["0xD9B5549437B54E20F019e2721D2bD550F89C7984","0xD9B5...7984","0x826d43c2995f2af4c16a574d7508cfd464746314644529bc26a8be415f2c89ca","2026-04-14 18:14","M26","Y",20.0],
["0x7E6d8E211Ef6Ac0Dc973843c28A81667C737Dc76","0x7E6d...Dc76","0x8d273d18061eca67a3ead3874fb0c601f8682be31ca9b7d3b87616aa5a49adcc","2026-04-09 20:15","M7","Y",20.0],
["0x7E6d8E211Ef6Ac0Dc973843c28A81667C737Dc76","0x7E6d...Dc76","0xb515a7a669b3d00780321ad21e55fe78eaacc027a2af60e97278c52b74ea8154","2026-04-09 20:12","M2","Y",20.0],
["0xb112A6635c2974338F8657606E5d59BF312C1241","0xb112...1241","0x203652f7be2375b17ac16c7f4951dcc4584150dd6b280e601bbc5aaa4639a96d","2026-04-07 16:15","M42","N",100.0],
["0xb112A6635c2974338F8657606E5d59BF312C1241","0xb112...1241","0x070ce960df8eaa1fd66640043a93720ff1486a221b4f8960feab140c0137a935","2026-04-07 16:02","M26","Y",100.0],
["0x0F989af8111dDad7d64A1a33f8C6FF2cb199c5C8","0x0F98...c5C8","0x57fb034a5a2ac2fe71ea1bad3392080e3fbd8f999cdacfd1eb76f7d8accf54ac","2026-04-12 09:59","M8","Y",100.0],
["0x0F989af8111dDad7d64A1a33f8C6FF2cb199c5C8","0x0F98...c5C8","0x1cdfdce60b89d91ba2804d2cea263e8c0dc5719790ce36f29b4352cdfcbf8f15","2026-04-12 09:55","M4","Y",100.0],
["0xAe0790BdaC62aedcD7f973f6542221F05EB4d605","0xAe07...d605","0x25f827ad44268143164f763836d32ab5b3f314569ba444a7f3da44b6f34c8447","2026-04-10 04:16","M4","Y",20.0],
["0xEF9CD31e430B014f4A6D29FC2220e2234d46378D","0xEF9C...378D","0x11cb00e6b394b570817264ba5e08a52910a84837ec4151189ee454c9a27af184","2026-04-13 11:27","M2","N",20.0],
["0xEF9CD31e430B014f4A6D29FC2220e2234d46378D","0xEF9C...378D","0x68d8df06f3ae0efa52319898ec6cb09ba64d40af58dfebdf699ed34540139c04","2026-04-13 11:26","M26","Y",20.0],
["0x649dEeC975FC2f11a0920E47BAa2586173A7E676","0x649d...E676","0x2facb0f9b2ee98c7c6de9a538d8313b70ceb9be235e5d6d113e4a5a7b400a636","2026-04-14 13:34","M25","Y",20.0],
["0x649dEeC975FC2f11a0920E47BAa2586173A7E676","0x649d...E676","0xc01fbc6f2f6edfa0ea8192906fc2454fcc6123ec95d0b59f23b89d65b3bfafc6","2026-04-14 13:30","M26","Y",10.0],
];

const ACTIVITY_SEED=AS.map(r=>({from:r[0],shortAddr:r[1],txHash:r[2],time:r[3],market:getMkt(r[4]),side:r[4+1]==='Y'?'YES':'NO',usdc:r[6]}));

const LEADERBOARD_SEED=[
{rank:1,fullAddr:"0xa24689956ea3ae5e4ccec37337b8b81cf466ed43",addr:"0xa246...ed43",trades:301,badge:"🥇"},
{rank:2,fullAddr:"0x3b4a7deb1274a6f802f45455c6a3998a1d8384d9",addr:"0x3b4a...84d9",trades:59,badge:"🥈"},
{rank:3,fullAddr:"0x7aa7fEA8fbF112df0Cb6e5844440fB5752258187",addr:"0x7aa7...8187",trades:52,badge:"🥉"},
{rank:4,fullAddr:"0xf2315e7c6671a3502a4548d619af779eb222fb51",addr:"0xf231...fb51",trades:48,badge:""},
{rank:5,fullAddr:"0x41dd064c20cfec06f22d49ee89c062ebf0da5017",addr:"0x41dd...5017",trades:41,badge:""},
{rank:6,fullAddr:"0x1453141466d37193e27d5b82eb64b719290cd030",addr:"0x1453...d030",trades:41,badge:""},
{rank:7,fullAddr:"0x4e02c4291b74fd989db87d17026f77293f9cc6f2",addr:"0x4e02...c6f2",trades:41,badge:""},
{rank:8,fullAddr:"0x981f86ec118dc954fd1b22567e52aa9293bac784",addr:"0x981f...c784",trades:41,badge:""},
{rank:9,fullAddr:"0xf8c3e41400d09b49fec37bbd7880191191c284aa",addr:"0xf8c3...84aa",trades:41,badge:""},
{rank:10,fullAddr:"0xb3e7d84e5740c725a1e239aeef29cc8a79d835f1",addr:"0xb3e7...35f1",trades:41,badge:""},
{rank:11,fullAddr:"0x36e05c31972787098e841f018ecd97df2494fe36",addr:"0x36e0...fe36",trades:41,badge:""},
{rank:12,fullAddr:"0xd82c90bd1141a23ea7921f40782e6db076ce6966",addr:"0xd82c...6966",trades:41,badge:""},
{rank:13,fullAddr:"0xb112A6635c2974338F8657606E5d59BF312C1241",addr:"0xb112...1241",trades:32,badge:""},
{rank:14,fullAddr:"0xEF9CD31e430B014f4A6D29FC2220e2234d46378D",addr:"0xEF9C...378D",trades:24,badge:""},
{rank:15,fullAddr:"0x6776ec612BB40DE4913AfC26442d8246Bba34D9b",addr:"0x6776...4D9b",trades:15,badge:""},
{rank:16,fullAddr:"0xc89598ee6d9b0891afbc7d397a6c6fb32e767991",addr:"0xc895...7991",trades:14,badge:""},
{rank:17,fullAddr:"0x10112d54a268c2db7f2b1d2789282c325795a219",addr:"0x1011...a219",trades:14,badge:""},
{rank:18,fullAddr:"0xAe0790BdaC62aedcD7f973f6542221F05EB4d605",addr:"0xAe07...d605",trades:12,badge:""},
{rank:19,fullAddr:"0xD9B5549437B54E20F019e2721D2bD550F89C7984",addr:"0xD9B5...7984",trades:12,badge:""},
{rank:20,fullAddr:"0x649dEeC975FC2f11a0920E47BAa2586173A7E676",addr:"0x649d...E676",trades:10,badge:""},
];

const CHAIN_STATS={totalTrades:1798,uniqueTraders:289,totalVolume:14474.94};

const SHARES_BOUGHT_SIG="0x0631ac0888ff9f018415d62a5322af0d89414f3d2cbf8dad4bcf1dac49eb6a54";
const MARKET_ID_MAP={1:"Market #1",2:"BTC hits $120K before July 2026?",3:"ETH flips BTC market cap in 2026?",4:"Spot SOL ETF approved in 2026?",5:"USDC market cap exceeds $100B in 2026?",6:"Arc Network mainnet launches Q2 2026?",7:"Arc TVL surpasses $500M by end of 2026?",8:"Arc-native DEX launches with $10M+ TVL?",9:"Arc Architects Program reaches 5K members?",10:"Real Madrid wins 2025-26 Champions League?",11:"Golden State Warriors make 2026 NBA Playoffs?",12:"Canelo Alvarez wins next fight by KO?",13:"Lewis Hamilton wins a race in 2026 F1 season?",14:"Tiger Woods plays in 2026 Masters?",15:"Lionel Messi retires before end of 2026?",16:"Market #16",17:"Market #17",18:"Market #18",19:"Market #19",20:"Market #20",21:"Market #21",22:"Market #22",23:"Market #23",24:"US passes comprehensive crypto legislation?",25:"Fed cuts rates twice before August 2026?",26:"OpenAI releases GPT-5 in 2026?",27:"Taylor Swift announces new album before June 2026?",28:"Global average temp sets new record high in 2026?",29:"G7 nation adopts a CBDC by end of 2026?",30:"UK snap election called before end of 2026?",31:"Trump approval rating above 50% before midterms?",32:"S&P 500 hits all-time high above 6,500 in 2026?",33:"US enters recession in 2026?",34:"Gold hits $3,500/oz before end of 2026?",35:"Apple Vision Pro 2 announced in 2026?",36:"AI-generated content banned on a major platform?",37:"Elon Musk's xAI surpasses $100B valuation?",38:"Netflix gains more than 20M subscribers in Q1?",39:"A Marvel film tops $2B at the box office in 2026?",40:"NASA Artemis Moon landing happens before 2027?",41:"A lab-grown meat product hits major US grocery chain?",42:"Quantum computer breaks RSA-2048 encryption?",47:"Will BTC close above $80K in 3 days?",60:"Will ETH close above $2,400 in 7 days?",52:"Will SOL close above $90 in 7 days?",53:"Will Arsenal reach the UCL Final?",54:"Will Paris beat Bayern in the UCL Semi?",55:"Will Trump sign a crypto bill before June?",56:"Will Met Gala go viral for a crypto outfit?",57:"Will Google announce new Gemini at I/O?",58:"Will Cannes open with an AI-generated film?",59:"Will BTC dominance stay above 55% in 24h?"};

async function fetchLiveTrades() {
  const seedHashes = new Set(ACTIVITY_SEED.map(t => t.txHash));
  const allItems = [];
  try {
    // Fetch ALL pages
    let url = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/logs?topic0=${SHARES_BOUGHT_SIG}`;
    let pages = 0;
    while (url && pages < 10) {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const items = data.items || [];
      allItems.push(...items);
      url = data.next_page_params ? `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/logs?topic0=${SHARES_BOUGHT_SIG}&${new URLSearchParams(data.next_page_params)}` : null;
      pages++;
    }
    if (allItems.length > 0) {
      return allItems
        .filter(item => !seedHashes.has(item.transaction_hash))
        .map(item => {
          const marketId = item.topics?.[1] ? parseInt(item.topics[1], 16) : 0;
          const dataHex = (item.data || "").replace("0x","");
          const isYes = dataHex.length >= 64 ? parseInt(dataHex.slice(0,64),16) === 1 : true;
          const usdc = dataHex.length >= 128 ? Math.round(parseInt(dataHex.slice(64,128),16)/1e4)/100 : 0;
          const buyer = item.topics?.[2] ? "0x"+item.topics[2].slice(-40) : "";
          return {
            from: buyer,
            shortAddr: `${buyer.slice(0,6)}...${buyer.slice(-4)}`,
            txHash: item.transaction_hash,
            time: (item.timestamp||"").slice(0,16),
            market: MARKET_ID_MAP[marketId] || `Market #${marketId}`,
            side: isYes ? "YES" : "NO",
            usdc,
          };
        });
    }
  } catch(e) {}
  try {
    const url2 = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&filter=to`;
    const res2 = await fetch(url2);
    if (!res2.ok) throw new Error();
    const data2 = await res2.json();
    return (data2.items||[])
      .filter(item => !seedHashes.has(item.tx_hash))
      .map(item => ({
        from: item.from?.hash||"",
        shortAddr: `${(item.from?.hash||"").slice(0,6)}...${(item.from?.hash||"").slice(-4)}`,
        txHash: item.tx_hash,
        time: (item.timestamp||"").slice(0,16),
        market: "Trade on Arcana Markets",
        side: "",
        usdc: Math.round(Number(item.total?.value||0)/1e4)/100,
      }));
  } catch(e2) { return []; }
}

async function fetchWalletLiveHistory(walletAddr) {
  try {
    const url = `https://testnet.arcscan.app/api/v2/addresses/${walletAddr}/transactions?filter=to&smart_contract=${CONTRACT_ADDRESS}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const items = (data.items || []).filter(item => item.method === "buyShares" && item.status === "ok");
    const decoded = await Promise.all(items.map(async item => {
      try {
        const txRes = await fetch(`https://testnet.arcscan.app/api/v2/transactions/${item.hash}`);
        const txData = await txRes.json();
        const input = (txData.raw_input || txData.input || "").replace("0x","");
        if (input.length < 136) return null;
        const marketId = parseInt(input.slice(8,72),16);
        const isYes = parseInt(input.slice(72,136),16) === 1;
        const usdcRaw = parseInt(input.slice(136,200)||"0",16);
        return {
          market: MARKET_ID_MAP[marketId] || `Market #${marketId}`,
          marketId,
          side: isYes ? "YES" : "NO",
          amt: (usdcRaw/1e6).toFixed(2),
          txHash: item.hash,
          time: (item.timestamp||"").slice(0,16),
        };
      } catch { return null; }
    }));
    return decoded.filter(Boolean);
  } catch { return []; }
}

function buildLeaderboard(newTrades=[]) {
  const merged={};
  for(const row of LEADERBOARD_SEED) merged[row.fullAddr.toLowerCase()]={...row};
  for(const t of newTrades){
    const key=t.from.toLowerCase();
    if(merged[key]) merged[key].trades+=1;
    else merged[key]={rank:999,fullAddr:t.from,addr:`${t.from.slice(0,6)}...${t.from.slice(-4)}`,trades:1,badge:""};
  }
  return Object.values(merged).sort((a,b)=>b.trades-a.trades).map((row,i)=>({...row,rank:i+1,badge:i===0?"🥇":i===1?"🥈":i===2?"🥉":""}));
}

function buildStats(liveStats=null, newTrades=[]) {
  const base = liveStats || CHAIN_STATS;
  const extraVol=(newTrades||[]).reduce((s,t)=>s+(parseFloat(t.usdc)||0),0);
  const totalVol=base.totalVolume+extraVol;
  const displayVol=totalVol>=1000?`$${(totalVol/1000).toFixed(1)}K`:`$${totalVol.toFixed(0)}`;
  const traders=base.uniqueTraders+(newTrades||[]).reduce((s,t)=>{
    const already=LEADERBOARD_SEED.some(r=>r.fullAddr.toLowerCase()===(t.from||"").toLowerCase());
    return already?s:s+1;
  },0);
  return {totalVolume:displayVol,traderCount:`${traders}`,openMarkets:`${ALL_MARKETS.length}`};
}

async function fetchLiveStats() {
  try {
    const allAddrs = new Set();
    let allTrades = 0;
    let totalVolume = 0;
    // Fetch all tx pages
    let txUrl = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/transactions?filter=to`;
    let pages = 0;
    while (txUrl && pages < 20) {
      const res = await fetch(txUrl);
      if (!res.ok) break;
      const data = await res.json();
      const txs = (data.items||[]).filter(tx=>tx.status==="ok");
      txs.forEach(tx => { if(tx.from?.hash) allAddrs.add(tx.from.hash.toLowerCase()); });
      allTrades += txs.length;
      txUrl = data.next_page_params ? `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/transactions?filter=to&${new URLSearchParams(data.next_page_params)}` : null;
      pages++;
    }
    // Fetch all transfer pages for volume
    let volUrl = `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&filter=to`;
    pages = 0;
    while (volUrl && pages < 20) {
      const res = await fetch(volUrl);
      if (!res.ok) break;
      const data = await res.json();
      totalVolume += (data.items||[]).reduce((s,tx)=>s+(Number(tx.total?.value||0)/1e6),0);
      volUrl = data.next_page_params ? `https://testnet.arcscan.app/api/v2/addresses/${CONTRACT_ADDRESS}/token-transfers?token=${USDC_ADDRESS}&filter=to&${new URLSearchParams(data.next_page_params)}` : null;
      pages++;
    }
    return {
      totalTrades: Math.max(CHAIN_STATS.totalTrades, allTrades),
      uniqueTraders: Math.max(CHAIN_STATS.uniqueTraders, allAddrs.size),
      totalVolume: Math.max(CHAIN_STATS.totalVolume, totalVolume),
    };
  } catch { return CHAIN_STATS; }
}

const THEMES = {
  light: {
    bg:"#F5F4EF",surface:"#FFFFFF",surfaceAlt:"#EEEDE8",surfaceHov:"#F0EFE9",
    text:"#0A0A14",textMuted:"#5A5A72",textLight:"#9CA3AF",
    blue:"#0057FF",blueDim:"#EEF3FF",blueBorder:"rgba(0,87,255,0.2)",
    navy:"#0A0A14",border:"#E5E4DF",borderStrong:"#C9C8C3",
    green:"#16A34A",greenBg:"#F0FDF4",greenBorder:"rgba(22,163,74,0.35)",
    red:"#DC2626",redBg:"#FEF2F2",redBorder:"rgba(220,38,38,0.35)",
    amber:"#D97706",amberBg:"rgba(217,119,6,0.1)",
    purple:"#7C3AED",purpleBg:"rgba(124,58,237,0.08)",purpleBorder:"rgba(124,58,237,0.25)",
    navBg:"rgba(245,244,239,0.95)",tickerBg:"#0057FF",tickerText:"rgba(255,255,255,0.9)",
    shadow:"0 1px 4px rgba(0,0,0,0.07)",shadowHov:"0 6px 20px rgba(0,87,255,0.1)",
    cardBorder:"#E5E4DF",cardBorderHov:"#0057FF",
  },
  dark: {
    bg:"#07061A",surface:"#0F0D22",surfaceAlt:"#15122E",surfaceHov:"#1A1735",
    text:"#E8E8F0",textMuted:"#8B8BA8",textLight:"#5A5A72",
    blue:"#4F8EF7",blueDim:"rgba(79,142,247,0.12)",blueBorder:"rgba(79,142,247,0.3)",
    navy:"#1A1735",border:"rgba(255,255,255,0.08)",borderStrong:"rgba(255,255,255,0.15)",
    green:"#22C55E",greenBg:"rgba(34,197,94,0.1)",greenBorder:"rgba(34,197,94,0.35)",
    red:"#F87171",redBg:"rgba(248,113,113,0.08)",redBorder:"rgba(248,113,113,0.3)",
    amber:"#FB923C",amberBg:"rgba(251,146,60,0.1)",
    purple:"#A78BFA",purpleBg:"rgba(167,139,250,0.1)",purpleBorder:"rgba(167,139,250,0.25)",
    navBg:"rgba(7,6,26,0.94)",tickerBg:"#1A1735",tickerText:"rgba(255,255,255,0.8)",
    shadow:"0 1px 4px rgba(0,0,0,0.3)",shadowHov:"0 6px 24px rgba(59,130,246,0.15)",
    cardBorder:"rgba(255,255,255,0.07)",cardBorderHov:"#3B82F6",
  },
};

const ALL_MARKETS = [
  {id:26,title:"OpenAI releases GPT-5 in 2026?",cat:"Tech & AI",yes:0.77,chg:+0.05,vol:"6,400,000",ends:"Dec 31 2026"},
  {id:2,title:"BTC hits $120K before July 2026?",cat:"Crypto",yes:0.61,chg:+0.04,vol:"8,412,000",ends:"Jul 1 2026"},
  {id:3,title:"ETH flips BTC market cap in 2026?",cat:"Crypto",yes:0.12,chg:-0.03,vol:"3,201,000",ends:"Dec 31 2026"},
  {id:4,title:"Spot SOL ETF approved in 2026?",cat:"Crypto",yes:0.38,chg:+0.06,vol:"2,870,500",ends:"Dec 31 2026"},
  {id:5,title:"USDC market cap exceeds $100B in 2026?",cat:"Crypto",yes:0.47,chg:+0.02,vol:"1,540,000",ends:"Dec 31 2026"},
  {id:6,title:"Arc Network mainnet launches Q2 2026?",cat:"Arc",yes:0.72,chg:+0.08,vol:"4,100,000",ends:"Jun 30 2026",trending:true},
  {id:7,title:"Arc TVL surpasses $500M by end of 2026?",cat:"Arc",yes:0.44,chg:+0.03,vol:"2,300,000",ends:"Dec 31 2026"},
  {id:8,title:"Arc-native DEX launches with $10M+ TVL?",cat:"Arc",yes:0.58,chg:+0.05,vol:"1,800,000",ends:"Dec 31 2026"},
  {id:9,title:"Arc Architects Program reaches 5K members?",cat:"Arc",yes:0.66,chg:+0.07,vol:"980,000",ends:"Dec 31 2026",hot:true},
  {id:10,title:"Real Madrid wins 2025-26 Champions League?",cat:"Sports",yes:0.31,chg:-0.04,vol:"5,200,000",ends:"Jun 1 2026"},
  {id:11,title:"Golden State Warriors make 2026 NBA Playoffs?",cat:"Sports",yes:0.22,chg:-0.08,vol:"3,100,000",ends:"Apr 15 2026"},
  {id:12,title:"Canelo Alvarez wins next fight by KO?",cat:"Sports",yes:0.54,chg:+0.03,vol:"1,700,000",ends:"Sep 30 2026"},
  {id:13,title:"Lewis Hamilton wins a race in 2026 F1 season?",cat:"Sports",yes:0.48,chg:+0.05,vol:"2,400,000",ends:"Nov 30 2026"},
  {id:14,title:"Tiger Woods plays in 2026 Masters?",cat:"Sports",yes:0.19,chg:-0.06,vol:"4,200,000",ends:"Apr 12 2026"},
  {id:15,title:"Lionel Messi retires before end of 2026?",cat:"Sports",yes:0.08,chg:-0.01,vol:"2,900,000",ends:"Dec 31 2026"},
  {id:24,title:"US passes comprehensive crypto legislation?",cat:"Politics",yes:0.41,chg:+0.03,vol:"6,700,000",ends:"Dec 31 2026"},
  {id:29,title:"G7 nation adopts a CBDC by end of 2026?",cat:"Politics",yes:0.27,chg:-0.02,vol:"3,800,000",ends:"Dec 31 2026"},
  {id:30,title:"UK snap election called before end of 2026?",cat:"Politics",yes:0.14,chg:-0.04,vol:"2,100,000",ends:"Dec 31 2026"},
  {id:31,title:"Trump approval rating above 50% before midterms?",cat:"Politics",yes:0.33,chg:+0.02,vol:"7,400,000",ends:"Nov 3 2026"},
  {id:25,title:"Fed cuts rates twice before August 2026?",cat:"Macro",yes:0.23,chg:-0.07,vol:"5,900,000",ends:"Aug 1 2026"},
  {id:32,title:"S&P 500 hits all-time high above 6,500 in 2026?",cat:"Macro",yes:0.55,chg:+0.04,vol:"4,300,000",ends:"Dec 31 2026"},
  {id:33,title:"US enters recession in 2026?",cat:"Macro",yes:0.31,chg:+0.06,vol:"5,100,000",ends:"Dec 31 2026"},
  {id:34,title:"Gold hits $3,500/oz before end of 2026?",cat:"Macro",yes:0.62,chg:+0.09,vol:"3,600,000",ends:"Dec 31 2026",hot:true},
  {id:35,title:"Apple Vision Pro 2 announced in 2026?",cat:"Tech & AI",yes:0.43,chg:-0.02,vol:"2,200,000",ends:"Dec 31 2026"},
  {id:36,title:"AI-generated content banned on a major platform?",cat:"Tech & AI",yes:0.18,chg:-0.05,vol:"3,400,000",ends:"Dec 31 2026"},
  {id:37,title:"Elon Musk's xAI surpasses $100B valuation?",cat:"Tech & AI",yes:0.52,chg:+0.06,vol:"4,100,000",ends:"Dec 31 2026"},
  {id:27,title:"Taylor Swift announces new album before June 2026?",cat:"Culture",yes:0.34,chg:-0.03,vol:"5,800,000",ends:"Jun 1 2026"},
  {id:38,title:"Netflix gains more than 20M subscribers in Q1?",cat:"Culture",yes:0.61,chg:+0.04,vol:"2,700,000",ends:"Apr 30 2026"},
  {id:39,title:"A Marvel film tops $2B at the box office in 2026?",cat:"Culture",yes:0.39,chg:-0.02,vol:"3,100,000",ends:"Dec 31 2026"},
  {id:40,title:"NASA Artemis Moon landing happens before 2027?",cat:"Science",yes:0.17,chg:-0.08,vol:"4,500,000",ends:"Dec 31 2026"},
  {id:41,title:"A lab-grown meat product hits major US grocery chain?",cat:"Science",yes:0.29,chg:+0.03,vol:"1,900,000",ends:"Dec 31 2026"},
  {id:28,title:"Global average temp sets new record high in 2026?",cat:"Science",yes:0.71,chg:+0.05,vol:"2,600,000",ends:"Dec 31 2026"},
  {id:42,title:"Quantum computer breaks RSA-2048 encryption?",cat:"Science",yes:0.09,chg:-0.02,vol:"1,400,000",ends:"Dec 31 2026"},
  {id:47,title:"Will BTC close above $80K in 3 days?",cat:"Crypto",yes:0.58,chg:+0.06,vol:"1,240,000",ends:"Apr 28 2026",hot:true},
  {id:60,title:"Will ETH close above $2,400 in 7 days?",cat:"Crypto",yes:0.45,chg:+0.04,vol:"870,000",ends:"May 2 2026"},
  {id:52,title:"Will SOL close above $90 in 7 days?",cat:"Crypto",yes:0.51,chg:+0.03,vol:"640,000",ends:"May 2 2026"},
  {id:53,title:"Will Arsenal reach the UCL Final?",cat:"Sports",yes:0.39,chg:-0.05,vol:"2,100,000",ends:"May 7 2026"},
  {id:54,title:"Will Paris beat Bayern in the UCL Semi?",cat:"Sports",yes:0.47,chg:+0.02,vol:"1,870,000",ends:"May 7 2026"},
  {id:55,title:"Will Trump sign a crypto bill before June?",cat:"Politics",yes:0.31,chg:+0.04,vol:"3,400,000",ends:"May 31 2026",trending:true},
  {id:56,title:"Will Met Gala go viral for a crypto outfit?",cat:"Culture",yes:0.22,chg:-0.02,vol:"480,000",ends:"May 6 2026"},
  {id:57,title:"Will Google announce new Gemini at I/O?",cat:"Tech & AI",yes:0.82,chg:+0.07,vol:"1,560,000",ends:"May 22 2026",hot:true},
  {id:58,title:"Will Cannes open with an AI-generated film?",cat:"Culture",yes:0.18,chg:-0.03,vol:"320,000",ends:"May 13 2026"},
  {id:59,title:"Will BTC dominance stay above 55% in 24h?",cat:"Crypto",yes:0.71,chg:+0.05,vol:"760,000",ends:"Apr 26 2026",trending:true},
];

const CATS=["All","Trending","Crypto","Arc","Sports","Politics","Macro","Tech & AI","Culture","Science"];
const TOP_MOVERS=[...ALL_MARKETS].sort((a,b)=>Math.abs(b.chg)-Math.abs(a.chg)).slice(0,4);
const pct=v=>Math.round(v*100);

// ── SPARK LINE ────────────────────────────────────────────────────────────────
function Spark({prob,up,col}){
  const pts=Array.from({length:10},(_,i)=>Math.max(4,Math.min(64,prob*54+10+Math.sin(i*1.8+prob*3)*10)));
  const d=pts.map((y,i)=>`${i===0?"M":"L"}${(i/9)*80},${68-y}`).join(" ");
  const uid=`sk${Math.round(prob*100)}${up?1:0}`;
  return(
    <svg width="64" height="24" viewBox="0 0 80 68" style={{flexShrink:0}}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={d+` L80,68 L0,68 Z`} fill={`url(#${uid})`}/>
      <path d={d} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ── CLAIM BUTTON ──────────────────────────────────────────────────────────────
function ClaimButton({marketId,isRefund,t,onDone}){
  const [state,setState]=useState("idle");
  const [msg,setMsg]=useState("");

  const go=async()=>{
    setState("loading");
    setMsg("Switching to Arc...");
    try{
      const provider=new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("wallet_switchEthereumChain",[{chainId:ARC_CHAIN_ID}]);
      const signer=provider.getSigner();
      const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
      setMsg("Confirm in wallet...");
      const tx=isRefund ? await contract.refund(marketId) : await contract.claimWinnings(marketId);
      setMsg("Confirming on-chain...");
      await tx.wait();
      setState("done");
      onDone(tx.hash);
    }catch(e){
      setState("error");
      setMsg(e.code===4001?"Cancelled":e.reason||e.message?.slice(0,60)||"Failed");
      setTimeout(()=>setState("idle"),3000);
    }
  };

  if(state==="done") return(
    <div style={{padding:"8px 14px",background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:8,fontSize:12,color:t.green,fontFamily:"monospace",fontWeight:700}}>
      ✓ {isRefund?"Refunded":"Claimed!"}
    </div>
  );
  if(state==="error") return(
    <div style={{padding:"8px 14px",background:t.redBg,border:`1px solid ${t.redBorder}`,borderRadius:8,fontSize:12,color:t.red,fontFamily:"monospace"}}>
      ✕ {msg}
    </div>
  );

  return(
    <button onClick={go} disabled={state==="loading"}
      style={{padding:"10px 20px",background:isRefund?t.amberBg:t.greenBg,border:`1.5px solid ${isRefund?t.amber:t.greenBorder}`,borderRadius:9,fontSize:13,fontWeight:800,color:isRefund?t.amber:t.green,cursor:state==="loading"?"not-allowed":"pointer",fontFamily:"monospace",letterSpacing:0.3}}>
      {state==="loading"?`⏳ ${msg}`:isRefund?"↩ REFUND STAKE":"🏆 CLAIM WINNINGS"}
    </button>
  );
}

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
function AdminPanel({t,account,onResolved}){
  const [resolveId,setResolveId]=useState("");
  const [outcome,setOutcome]=useState("YES");
  const [cancelId,setCancelId]=useState("");
  const [status,setStatus]=useState(null);
  const [loading,setLoading]=useState(false);

  const getSigner=async()=>{
    const provider=new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("wallet_switchEthereumChain",[{chainId:ARC_CHAIN_ID}]);
    return provider.getSigner();
  };

  const resolve=async()=>{
    if(!resolveId)return;
    setLoading(true);setStatus(null);
    try{
      const signer=await getSigner();
      const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
      setStatus({type:"info",msg:"Confirm in wallet..."});
      const yesWon=outcome==="YES";
      const tx=await contract.resolveMarket(Number(resolveId),yesWon);
      setStatus({type:"info",msg:"Waiting for confirmation..."});
      await tx.wait();
      saveResolution(Number(resolveId),yesWon);
      onResolved();
      setStatus({type:"ok",msg:`✓ Market #${resolveId} resolved — ${outcome} won`});
      setResolveId("");
    }catch(e){
      setStatus({type:"err",msg:`✕ ${e.code===4001?"Cancelled":e.reason||e.message?.slice(0,80)}`});
    }
    setLoading(false);
  };

  const cancel=async()=>{
    if(!cancelId)return;
    setLoading(true);setStatus(null);
    try{
      const signer=await getSigner();
      const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
      setStatus({type:"info",msg:"Confirm in wallet..."});
      const tx=await contract.cancelMarket(Number(cancelId));
      await tx.wait();
      onResolved();
      setStatus({type:"ok",msg:`✓ Market #${cancelId} cancelled — traders can refund`});
      setCancelId("");
    }catch(e){
      setStatus({type:"err",msg:`✕ ${e.code===4001?"Cancelled":e.reason||e.message?.slice(0,80)}`});
    }
    setLoading(false);
  };

  return(
    <div style={{padding:"32px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <h2 style={{fontSize:22,fontWeight:800,color:t.text}}>Admin Panel</h2>
        <span style={{fontSize:10,fontFamily:"monospace",color:t.purple,background:t.purpleBg,border:`1px solid ${t.purpleBorder}`,padding:"3px 8px",borderRadius:4,fontWeight:700}}>OWNER ONLY</span>
      </div>
      <p style={{fontSize:13,color:t.textMuted,marginBottom:28}}>Resolve or cancel markets. Once resolved, winners can claim their USDC payout.</p>

      {/* Resolve */}
      <div style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,padding:"20px 24px",marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>Resolve Market</h3>
        <p style={{fontSize:12,color:t.textMuted,fontFamily:"monospace",marginBottom:16}}>Market endTime must have passed on-chain before you can resolve.</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",marginBottom:14}}>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",display:"block",marginBottom:4}}>MARKET ID</label>
            <input value={resolveId} onChange={e=>setResolveId(e.target.value)} placeholder="e.g. 47"
              style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px",color:t.text,fontSize:14,fontFamily:"monospace",width:90,outline:"none"}}/>
          </div>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",display:"block",marginBottom:4}}>OUTCOME</label>
            <div style={{display:"flex",background:t.bg,borderRadius:8,padding:3,border:`1px solid ${t.border}`}}>
              {["YES","NO"].map(s=>(
                <button key={s} onClick={()=>setOutcome(s)}
                  style={{padding:"6px 18px",borderRadius:6,border:"none",background:outcome===s?(s==="YES"?t.green:t.red):"transparent",color:outcome===s?"#fff":t.textMuted,fontWeight:700,cursor:"pointer",fontSize:13,transition:"all 0.15s"}}>{s}</button>
              ))}
            </div>
          </div>
          <button onClick={resolve} disabled={loading||!resolveId}
            style={{padding:"9px 22px",background:t.purple,border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1,fontFamily:"monospace"}}>
            {loading?"RESOLVING...":"RESOLVE →"}
          </button>
        </div>
        {/* Market picker */}
        <div style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",marginBottom:6}}>QUICK SELECT</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,maxHeight:100,overflowY:"auto"}}>
          {ALL_MARKETS.map(m=>(
            <button key={m.id} onClick={()=>setResolveId(String(m.id))}
              style={{padding:"3px 9px",background:resolveId===String(m.id)?t.purple:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:5,fontSize:10,color:resolveId===String(m.id)?"#fff":t.textMuted,cursor:"pointer",fontFamily:"monospace"}}>
              #{m.id}
            </button>
          ))}
        </div>
      </div>

      {/* Cancel */}
      <div style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,padding:"20px 24px",marginBottom:16}}>
        <h3 style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>Cancel Market</h3>
        <p style={{fontSize:12,color:t.textMuted,fontFamily:"monospace",marginBottom:14}}>Cancels the market — all traders get a full USDC refund.</p>
        <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
          <div>
            <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",display:"block",marginBottom:4}}>MARKET ID</label>
            <input value={cancelId} onChange={e=>setCancelId(e.target.value)} placeholder="e.g. 48"
              style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px",color:t.text,fontSize:14,fontFamily:"monospace",width:90,outline:"none"}}/>
          </div>
          <button onClick={cancel} disabled={loading||!cancelId}
            style={{padding:"9px 22px",background:t.red,border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1,fontFamily:"monospace"}}>
            CANCEL MARKET
          </button>
        </div>
      </div>

      {status&&(
        <div style={{padding:"12px 16px",background:status.type==="ok"?t.greenBg:status.type==="err"?t.redBg:t.blueDim,border:`1px solid ${status.type==="ok"?t.greenBorder:status.type==="err"?t.redBorder:t.blueBorder}`,borderRadius:10,fontSize:13,color:status.type==="ok"?t.green:status.type==="err"?t.red:t.blue,fontFamily:"monospace"}}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

// ── PORTFOLIO WITH CLAIMING ───────────────────────────────────────────────────
function Portfolio({t,account,positions,resolutions}){
  const [onChain,setOnChain]=useState({});
  const [loading,setLoading]=useState(false);
  const [claimed,setClaimed]=useState(()=>LS.get("arcana_claimed_v2",{}));

  const fetchOnChain=useCallback(async()=>{
    if(!account||positions.length===0)return;
    setLoading(true);
    const ids=[...new Set(positions.map(p=>p.marketId).filter(Boolean))];
    const results={};
    await Promise.all(ids.map(async id=>{
      const [market,shares]=await Promise.all([getOnChainMarket(id),getUserShares(id,account)]);
      results[id]={market,shares};
    }));
    setOnChain(results);
    setLoading(false);
  },[account,positions]);

  useEffect(()=>{fetchOnChain();},[fetchOnChain]);

  if(!account) return(
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:48,marginBottom:16}}>🔒</div>
      <p style={{fontSize:15,color:t.textMuted}}>Connect your wallet to see your portfolio</p>
    </div>
  );
  if(positions.length===0) return(
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:48,marginBottom:16}}>📊</div>
      <p style={{fontSize:15,color:t.textMuted}}>No positions yet — place your first trade!</p>
    </div>
  );

  // Group by marketId
  const grouped={};
  for(const p of positions){
    const id=p.marketId;
    if(!id)continue;
    if(!grouped[id]) grouped[id]={marketId:id,market:p.market,positions:[]};
    grouped[id].positions.push(p);
  }

  const totalInvested=positions.reduce((s,p)=>s+parseFloat(p.amt||0),0);

  const getStatus=(id)=>{
    const d=onChain[id];
    if(!d?.market)return"open";
    if(d.market.cancelled)return"cancelled";
    if(d.market.resolved)return"resolved";
    return"open";
  };

  const yesWonFor=(id)=>{
    const v=resolutions[String(id)];
    return v===undefined?null:v;
  };

  const calcPayout=(id)=>{
    const d=onChain[id];
    if(!d?.market||!d?.shares)return 0;
    const {yesPool,noPool}=d.market;
    const total=yesPool+noPool;
    const yw=yesWonFor(id);
    if(yw===null)return 0;
    if(yw) return yesPool>0?(d.shares.yes/yesPool)*total:0;
    return noPool>0?(d.shares.no/noPool)*total:0;
  };

  const isWinner=(id)=>{
    const d=onChain[id];
    const yw=yesWonFor(id);
    if(yw===null||!d?.shares)return null;
    if(yw&&d.shares.yes>0)return true;
    if(!yw&&d.shares.no>0)return true;
    return false;
  };

  const groups=Object.values(grouped);
  const resolved=groups.filter(g=>getStatus(g.marketId)==="resolved");
  const cancelled=groups.filter(g=>getStatus(g.marketId)==="cancelled");
  const open=groups.filter(g=>getStatus(g.marketId)==="open");

  const renderGroup=(g)=>{
    const id=g.marketId;
    const status=getStatus(id);
    const yw=yesWonFor(id);
    const winner=isWinner(id);
    const payout=calcPayout(id);
    const d=onChain[id];
    const alreadyClaimed=claimed[String(id)];

    const accentColor=status==="resolved"?(winner?t.green:t.red):status==="cancelled"?t.amber:t.blue;
    const accentBg=status==="resolved"?(winner?t.greenBg:t.redBg):status==="cancelled"?t.amberBg:t.blueDim;

    return(
      <div key={id} style={{background:t.surface,border:`1.5px solid ${winner&&!alreadyClaimed?t.greenBorder:t.border}`,borderRadius:12,padding:"18px 22px",marginBottom:12,transition:"all 0.15s"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:0}}>
            {/* Status badges */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:10,fontWeight:700,fontFamily:"monospace",color:accentColor,background:accentBg,padding:"3px 8px",borderRadius:4}}>
                {status==="resolved"?(yw===null?"RESOLVED":yw?"✓ YES WON":"✕ NO WON"):status==="cancelled"?"CANCELLED":"OPEN"}
              </span>
              {winner===true&&!alreadyClaimed&&<span style={{fontSize:10,fontWeight:700,color:t.green,background:t.greenBg,padding:"3px 8px",borderRadius:4,fontFamily:"monospace"}}>🏆 YOU WON</span>}
              {winner===false&&<span style={{fontSize:10,fontWeight:700,color:t.red,background:t.redBg,padding:"3px 8px",borderRadius:4,fontFamily:"monospace"}}>✕ YOU LOST</span>}
              {alreadyClaimed&&<span style={{fontSize:10,fontWeight:700,color:t.green,background:t.greenBg,padding:"3px 8px",borderRadius:4,fontFamily:"monospace"}}>✓ CLAIMED</span>}
            </div>

            <p style={{fontSize:14,fontWeight:700,color:t.text,margin:"0 0 10px",lineHeight:1.4}}>{g.market}</p>

            {/* Positions summary */}
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:8}}>
              {g.positions.map((p,i)=>(
                <div key={i} style={{fontSize:12,fontFamily:"monospace"}}>
                  <span style={{color:p.side==="YES"?t.green:t.red,fontWeight:700}}>{p.side}</span>
                  <span style={{color:t.textMuted}}> ${parseFloat(p.amt||0).toFixed(2)} USDC</span>
                </div>
              ))}
            </div>

            {/* On-chain pool info */}
            {d?.market&&(
              <div style={{fontSize:11,fontFamily:"monospace",color:t.textLight}}>
                Pool: YES ${d.market.yesPool.toFixed(2)} · NO ${d.market.noPool.toFixed(2)} · Total ${(d.market.yesPool+d.market.noPool).toFixed(2)} USDC
                {d.shares&&<span> · Your shares: YES {d.shares.yes.toFixed(2)} / NO {d.shares.no.toFixed(2)}</span>}
              </div>
            )}
          </div>

          {/* Right side — payout + claim */}
          <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end",flexShrink:0}}>
            {status==="resolved"&&winner===true&&!alreadyClaimed&&(
              <>
                <div style={{fontSize:22,fontWeight:800,color:t.green,fontFamily:"monospace"}}>+${payout.toFixed(2)}</div>
                <div style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",textAlign:"right"}}>USDC payout</div>
                <ClaimButton marketId={id} isRefund={false} t={t} onDone={(txHash)=>{
                  const next={...claimed,[String(id)]:txHash};
                  setClaimed(next);LS.set("arcana_claimed_v2",next);
                }}/>
              </>
            )}
            {status==="resolved"&&winner===false&&(
              <div style={{fontSize:13,color:t.red,fontFamily:"monospace",fontWeight:700}}>No payout</div>
            )}
            {status==="cancelled"&&!alreadyClaimed&&(
              <>
                <div style={{fontSize:16,fontWeight:700,color:t.amber,fontFamily:"monospace"}}>
                  ${g.positions.reduce((s,p)=>s+parseFloat(p.amt||0),0).toFixed(2)} refund
                </div>
                <ClaimButton marketId={id} isRefund={true} t={t} onDone={(txHash)=>{
                  const next={...claimed,[String(id)]:txHash};
                  setClaimed(next);LS.set("arcana_claimed_v2",next);
                }}/>
              </>
            )}
            {alreadyClaimed&&(
              <a href={`https://testnet.arcscan.app/tx/${alreadyClaimed}`} target="_blank" rel="noreferrer"
                style={{fontSize:11,color:t.blue,fontFamily:"monospace",textDecoration:"none"}}>↗ View claim TX</a>
            )}
            {status==="open"&&(
              <span style={{fontSize:11,color:t.textMuted,fontFamily:"monospace"}}>Awaiting resolution</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return(
    <div style={{padding:"32px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h2 style={{fontSize:22,fontWeight:800,color:t.text}}>Your Portfolio</h2>
        <button onClick={fetchOnChain} disabled={loading}
          style={{padding:"6px 14px",background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:8,color:t.blue,fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
          {loading?"SYNCING...":"↻ REFRESH"}
        </button>
      </div>
      <p style={{fontSize:13,color:t.textMuted,marginBottom:24}}>
        Live data from Arc Testnet · Winners claim directly on-chain
      </p>

      {/* Stats */}
      <div style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}}>
        {[["Total Invested",`$${totalInvested.toFixed(2)}`],["Open",open.length],["Resolved",resolved.length],["Cancelled",cancelled.length]].map(([l,v])=>(
          <div key={l} style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,padding:"14px 20px",minWidth:110}}>
            <div style={{fontSize:11,color:t.textLight,fontFamily:"monospace",marginBottom:4}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",color:t.text}}>{v}</div>
          </div>
        ))}
      </div>

      {resolved.length>0&&(
        <>
          <div style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,letterSpacing:2,marginBottom:10}}>RESOLVED — CLAIM YOUR WINNINGS</div>
          {resolved.map(renderGroup)}
        </>
      )}
      {cancelled.length>0&&(
        <>
          <div style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,letterSpacing:2,marginBottom:10,marginTop:24}}>CANCELLED — REFUND AVAILABLE</div>
          {cancelled.map(renderGroup)}
        </>
      )}
      {open.length>0&&(
        <>
          <div style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,letterSpacing:2,marginBottom:10,marginTop:24}}>OPEN POSITIONS</div>
          {open.map(renderGroup)}
        </>
      )}
    </div>
  );
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
function Leaderboard({t,account,newTrades=[]}){
  const [data,setData]=useState(()=>buildLeaderboard([]));
  const [loading,setLoading]=useState(false);
  const [last,setLast]=useState(0);

  const load=useCallback(async(force=false)=>{
    const stale=Date.now()-last>5*60*1000;
    if(!force&&!stale&&last>0)return;
    setLoading(true);
    try{
      const fresh=await fetchLiveTrades();
      if(fresh&&fresh.length>0){setData(buildLeaderboard(fresh));setLast(Date.now());}
    }catch{}
    setLoading(false);
  },[last]);

  useEffect(()=>{load();},[]);

  const rows=React.useMemo(()=>buildLeaderboard(newTrades||[]),[newTrades]);

  return(
    <div style={{padding:"32px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h2 style={{fontSize:22,fontWeight:800,color:t.text}}>Leaderboard</h2>
        <button onClick={()=>load(true)} disabled={loading}
          style={{padding:"6px 14px",background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:8,color:t.blue,fontSize:11,fontFamily:"monospace",cursor:"pointer"}}>
          {loading?"SYNCING...":"↻ REFRESH"}
        </button>
      </div>
      <p style={{fontSize:13,color:t.textMuted,marginBottom:24}}>
        Top traders by real on-chain activity · {rows.length} traders · {CHAIN_STATS.totalTrades} total trades
      </p>
      <div style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,overflow:"hidden"}}>
        {rows.map(row=>(
          <div key={row.rank} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 20px",borderBottom:row.rank<rows.length?`1px solid ${t.border}`:"none",background:account&&row.fullAddr?.toLowerCase()===account?.toLowerCase()?t.blueDim:"transparent"}}>
            <span style={{fontSize:14,width:24,textAlign:"center"}}>{row.badge||`#${row.rank}`}</span>
            <span style={{flex:1,fontSize:13,fontFamily:"monospace",color:t.text}}>
              {row.addr}
              {account&&row.fullAddr?.toLowerCase()===account?.toLowerCase()&&(
                <span style={{marginLeft:8,fontSize:10,color:t.blue,background:t.blueDim,padding:"2px 6px",borderRadius:4}}>YOU</span>
              )}
            </span>
            <span style={{fontSize:12,color:t.textMuted,minWidth:70,textAlign:"right"}}>{row.trades} trades</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
function Activity({t,account,newTrades=[]}){
  const [liveTrades,setLiveTrades]=useState([]);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      const fresh=await fetchLiveTrades();
      if(fresh&&fresh.length>0)setLiveTrades(fresh);
      setLoading(false);
    };
    load();
  },[]);

  const allActivity=React.useMemo(()=>{
    const seen=new Set();
    const merged=[];
    // 1. session trades (newest, yours)
    for(const tr of (newTrades||[])){
      if(tr.txHash&&!seen.has(tr.txHash)){seen.add(tr.txHash);merged.push(tr);}
    }
    // 2. live chain trades
    for(const tr of liveTrades){
      if(tr.txHash&&!seen.has(tr.txHash)){seen.add(tr.txHash);merged.push(tr);}
    }
    // 3. seed — ALWAYS included, never skipped
    for(const tr of ACTIVITY_SEED){
      if(tr.txHash&&!seen.has(tr.txHash)){seen.add(tr.txHash);merged.push(tr);}
    }
    return merged;
  },[liveTrades,newTrades]);

  return(
    <div style={{padding:"32px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <h2 style={{fontSize:22,fontWeight:800,color:t.text}}>Activity</h2>
        <span style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,background:t.blueDim,padding:"4px 10px",borderRadius:6}}>
          {loading?"loading...":allActivity.length+" trades on-chain"}
        </span>
      </div>
      <p style={{fontSize:13,color:t.textMuted,marginBottom:24}}>
        Every real trade on Arcana Markets · all wallets visible
      </p>
      <div style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,overflow:"hidden",maxHeight:600,overflowY:"auto"}}>
        {allActivity.map((row,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",borderBottom:i<allActivity.length-1?`1px solid ${t.border}`:"none",background:account&&row.from?.toLowerCase()===account?.toLowerCase()?t.blueDim:"transparent"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:t.green,flexShrink:0}}/>
            <span style={{fontSize:12,fontFamily:"monospace",color:t.text,minWidth:110,flexShrink:0,fontWeight:600}}>
              {row.shortAddr}
              {account&&row.from?.toLowerCase()===account?.toLowerCase()&&
                <span style={{marginLeft:6,fontSize:9,color:t.blue,background:t.blueDim,padding:"1px 5px",borderRadius:3}}>YOU</span>
              }
            </span>
            <span style={{flex:1,fontSize:12,color:t.text}}>{row.market||"Arcana Markets"}</span>
            {row.side&&<span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:row.side==="YES"?t.green:t.red,flexShrink:0}}>{row.side}</span>}
            {row.usdc>0&&<span style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,flexShrink:0}}>${row.usdc}</span>}
            <span style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",minWidth:100,textAlign:"right",flexShrink:0}}>{row.time}</span>
            <a href={`https://testnet.arcscan.app/tx/${row.txHash}`} target="_blank" rel="noreferrer"
              style={{fontSize:10,color:t.blue,fontFamily:"monospace",textDecoration:"none",flexShrink:0}}>↗ TX</a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GRID CARD with resolved/cancelled state ───────────────────────────────────
function GridCard({m,onTrade,t,livePrice,resolvedOutcome,isResolved,isCancelled}){
  const [hov,setHov]=useState(false);
  const yes=pct(m.yes),no=100-yes,up=m.chg>=0,sparkCol=up?t.green:t.red;

  const topBarColor=isResolved?(resolvedOutcome?t.green:t.red):isCancelled?t.amber:hov?t.blue:t.border;
  const cardBorderColor=isResolved?(resolvedOutcome?t.greenBorder:t.redBorder):isCancelled?t.amber:hov?t.cardBorderHov:t.cardBorder;

  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:t.surface,border:`1.5px solid ${cardBorderColor}`,borderRadius:12,display:"flex",flexDirection:"column",cursor:"pointer",transition:"all 0.18s",boxShadow:hov?t.shadowHov:t.shadow,opacity:isCancelled?0.75:1}}>
      <div style={{height:3,background:topBarColor,borderRadius:"10px 10px 0 0",transition:"background 0.2s"}}/>
      <div style={{padding:"15px 17px",flex:1,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:36,height:36,borderRadius:8,background:t.blueDim,border:`1px solid ${t.blueBorder}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:15}}>◈</span>
            </div>
            <span style={{fontSize:10,fontWeight:700,color:t.blue,background:t.blueDim,padding:"2px 7px",borderRadius:4,fontFamily:"monospace"}}>{m.cat}</span>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {isResolved&&<span style={{fontSize:9,fontWeight:700,color:resolvedOutcome?t.green:t.red,background:resolvedOutcome?t.greenBg:t.redBg,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{resolvedOutcome?"✓ YES WON":"✕ NO WON"}</span>}
            {isCancelled&&<span style={{fontSize:9,fontWeight:700,color:t.amber,background:t.amberBg,padding:"2px 6px",borderRadius:4}}>CANCELLED</span>}
            {!isResolved&&!isCancelled&&m.hot&&<span style={{fontSize:9,fontWeight:700,color:t.amber,background:t.amberBg,padding:"2px 5px",borderRadius:4}}>🔥 HOT</span>}
            {!isResolved&&!isCancelled&&m.trending&&<span style={{fontSize:9,fontWeight:700,color:t.green,background:t.greenBg,padding:"2px 5px",borderRadius:4}}>↑ TREND</span>}
          </div>
        </div>

        {livePrice&&<div style={{background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:6,padding:"4px 8px",fontSize:10,color:t.blue,fontFamily:"monospace"}}>{livePrice}</div>}

        <p style={{fontSize:14,color:t.text,lineHeight:1.5,margin:0,fontWeight:600,flex:1}}>{m.title}</p>

        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"baseline",gap:3}}>
              <span style={{fontSize:30,fontWeight:800,color:t.text,lineHeight:1,fontFamily:"monospace"}}>{yes}</span>
              <span style={{fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>% chance</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <Spark prob={m.yes} up={up} col={sparkCol}/>
              <span style={{fontSize:12,fontWeight:700,color:sparkCol,fontFamily:"monospace"}}>{up?"+":""}{Math.round(m.chg*100)}%</span>
            </div>
          </div>
          <div style={{height:5,borderRadius:3,background:t.surfaceAlt,overflow:"hidden"}}>
            <div style={{width:`${yes}%`,height:"100%",background:isResolved?(resolvedOutcome?t.green:t.red):`linear-gradient(90deg,${t.green},${t.blue})`,borderRadius:3}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:11,color:t.blue,fontFamily:"monospace",fontWeight:600}}>YES {yes}¢</span>
            <span style={{fontSize:11,color:t.textLight,fontFamily:"monospace"}}>NO {no}¢</span>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${t.border}`}}>
          <div><div style={{fontSize:11,color:t.textLight,fontFamily:"monospace"}}>Vol</div><div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:t.text}}>${m.vol}</div></div>
          <div><div style={{fontSize:11,color:t.textLight,fontFamily:"monospace"}}>Ends</div><div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:t.text}}>{m.ends}</div></div>
        </div>

        {isResolved?(
          <div style={{padding:"10px",background:resolvedOutcome?t.greenBg:t.redBg,border:`1px solid ${resolvedOutcome?t.greenBorder:t.redBorder}`,borderRadius:8,textAlign:"center",fontSize:13,fontWeight:700,color:resolvedOutcome?t.green:t.red,fontFamily:"monospace"}}>
            {resolvedOutcome?"✓ YES WON — go to Portfolio to claim":"✕ NO WON — go to Portfolio to claim"}
          </div>
        ):isCancelled?(
          <div style={{padding:"10px",background:t.amberBg,border:`1px solid ${t.amber}`,borderRadius:8,textAlign:"center",fontSize:13,fontWeight:700,color:t.amber,fontFamily:"monospace"}}>
            CANCELLED — refund available in Portfolio
          </div>
        ):(
          <div style={{display:"flex",gap:8}}>
            {[["YES",yes,t.green,t.greenBg,t.greenBorder],["NO",no,t.red,t.redBg,t.redBorder]].map(([lbl,odds,col,bg,border])=>(
              <button key={lbl} onClick={e=>{e.stopPropagation();onTrade(m,lbl);}}
                style={{flex:1,padding:"9px 0",background:bg,border:`1.5px solid ${border}`,borderRadius:8,color:col,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"monospace"}}>
                {lbl} {odds}¢
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TRADE MODAL ───────────────────────────────────────────────────────────────
function TradeModal({m,initSide,onClose,t,account,usdcBalance,onPositionAdded,onActivityAdded}){
  const [side,setSide]=useState(initSide||"YES");
  const [amt,setAmt]=useState("");
  const [done,setDone]=useState(false);
  const [loading,setLoading]=useState(false);
  const [loadingMsg,setLoadingMsg]=useState("");
  const [error,setError]=useState("");
  const [txHash,setTxHash]=useState("");
  if(!m)return null;

  const isMarketEnded=(()=>{
    const endsStr=m.ends||"";
    const hasYear=/20\d\d/.test(endsStr);
    const endDate=new Date(hasYear?endsStr:endsStr+" 2026");
    return !isNaN(endDate.getTime())&&endDate<new Date();
  })();

  const prob=side==="YES"?m.yes:1-m.yes;
  const cents=Math.round(prob*100);
  const shares=amt?(parseFloat(amt)/prob).toFixed(2):"0.00";
  const payout=parseFloat(shares).toFixed(2);
  const profit=amt?(parseFloat(payout)-parseFloat(amt)).toFixed(2):"0.00";
  const isYes=side==="YES";

  const switchToArc=async()=>{
    try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:ARC_CHAIN_ID}]});}
    catch(e){
      try{await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:ARC_CHAIN_ID,chainName:"Arc Testnet",nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18},rpcUrls:[ARC_RPC],blockExplorerUrls:["https://testnet.arcscan.app"]}]});}
      catch{}
    }
  };

  const placeOrder=async()=>{
    if(!account){setError("Connect your wallet first!");return;}
    if(!amt||parseFloat(amt)<0.01){setError("Minimum trade is 0.01 USDC");return;}
    if(parseFloat(usdcBalance)<parseFloat(amt)){setError(`Insufficient USDC. You have ${usdcBalance}`);return;}
    setLoading(true);setError("");
    try{
      setLoadingMsg("Switching to Arc Testnet...");
      await switchToArc();
      const provider=new ethers.providers.Web3Provider(window.ethereum);
      const signer=provider.getSigner();
      const usdcContract=new ethers.Contract(USDC_ADDRESS,USDC_ABI,signer);
      const arcanaContract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);
      const usdcAmt=ethers.utils.parseUnits(parseFloat(amt).toFixed(6),6);
      setLoadingMsg("Step 1/2: Approve USDC spend in wallet...");
      const approveTx=await usdcContract.approve(CONTRACT_ADDRESS,usdcAmt);
      setLoadingMsg("Waiting for approval confirmation...");
      await approveTx.wait();
      setLoadingMsg("Step 2/2: Place your trade in wallet...");
      const tradeTx=await arcanaContract.buyShares(m.id,isYes,usdcAmt);
      setLoadingMsg("Confirming on Arc...");
      const receipt=await tradeTx.wait();
      if(receipt.status===0)throw new Error("Trade failed on-chain.");
      setTxHash(tradeTx.hash);
      const tradeRecord={marketId:m.id,market:m.title,side,amt,shares,payout,profit,txHash:tradeTx.hash};
      onPositionAdded(tradeRecord);
      onActivityAdded({...tradeRecord,time:new Date().toISOString().slice(0,16)});
      setDone(true);
    }catch(err){
      if(err.code===4001||err.message?.includes("rejected"))setError("Transaction cancelled.");
      else setError(err.message||"Transaction failed. Please try again.");
    }
    setLoading(false);
  };

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{height:3,background:isMarketEnded?t.amber:t.blue,borderRadius:"16px 16px 0 0"}}/>
        <div style={{padding:"20px"}}>
          {isMarketEnded?(
            <div style={{textAlign:"center",padding:"16px 0"}}>
              <div style={{fontSize:40,marginBottom:12}}>🔒</div>
              <h3 style={{fontSize:17,fontWeight:800,color:t.text,marginBottom:8}}>Market Closed</h3>
              <p style={{fontSize:13,color:t.textMuted,lineHeight:1.6,marginBottom:16}}>This market has ended and is pending resolution.</p>
              <button onClick={onClose} style={{width:"100%",padding:"12px",background:t.blue,color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer"}}>Close</button>
            </div>
          ):done?(
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{width:54,height:54,borderRadius:"50%",background:t.greenBg,border:`2px solid ${t.greenBorder}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24}}>✅</div>
              <h3 style={{fontSize:18,fontWeight:800,color:t.text,marginBottom:8}}>Trade Confirmed!</h3>
              <p style={{fontSize:13,color:t.textMuted,lineHeight:1.6,marginBottom:16}}>Your trade is live on Arc. If correct, you win <strong style={{color:t.green}}>${payout}</strong>.</p>
              <div style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"left"}}>
                {[["Market",m.title.slice(0,35)+"…"],["Side",`${side} @ ${cents}¢`],["Amount",`$${amt} USDC`],["Potential Payout",`$${payout}`]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>{k}</span>
                    <span style={{fontSize:12,color:t.blue,fontFamily:"monospace",fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
             
              <button onClick={onClose} style={{width:"100%",padding:"10px",background:t.blue,color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:"pointer"}}>Done</button>
            </div>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <p style={{fontSize:13,color:t.text,lineHeight:1.4,margin:0,fontWeight:600,flex:1,paddingRight:12}}>{m.title}</p>
                <button onClick={onClose} style={{background:"none",border:"none",color:t.textMuted,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
              </div>
              {account&&<div style={{background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:t.green,fontFamily:"monospace"}}>Balance: ${usdcBalance} USDC</div>}
              {!account&&<div style={{background:t.amberBg,border:`1px solid ${t.amber}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:t.amber,fontFamily:"monospace"}}>⚠ Connect wallet to trade</div>}
              {error&&<div style={{background:t.redBg,border:`1px solid ${t.redBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:t.red,fontFamily:"monospace"}}>{error}</div>}
              {loading&&<div style={{background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:t.blue,fontFamily:"monospace"}}>⏳ {loadingMsg}</div>}
              <div style={{display:"flex",background:t.bg,borderRadius:10,padding:4,marginBottom:14}}>
                {["YES","NO"].map(s=>(
                  <button key={s} onClick={()=>setSide(s)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:side===s?(s==="YES"?t.green:t.red):"transparent",color:side===s?"#fff":t.textMuted,fontWeight:700,cursor:"pointer",fontSize:13,transition:"all 0.15s"}}>{s}</button>
                ))}
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",letterSpacing:1,display:"block",marginBottom:6}}>AMOUNT</label>
                <div style={{display:"flex",alignItems:"center",background:t.bg,border:`1.5px solid ${t.border}`,borderRadius:10}}>
                  <span style={{padding:"12px 12px",color:t.textMuted,fontFamily:"monospace",fontSize:13}}>$</span>
                  <input type="number" value={amt} onChange={e=>setAmt(e.target.value)} style={{flex:1,background:"none",border:"none",outline:"none",color:t.text,fontSize:16,fontFamily:"monospace",fontWeight:700,padding:"12px 0"}}/>
                  <span style={{padding:"12px 14px",color:t.textMuted,fontFamily:"monospace",fontSize:12}}>USDC</span>
                </div>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  {["0.01","0.1","1","10","50"].map(v=>(
                    <button key={v} onClick={()=>setAmt(v)} style={{flex:1,padding:"6px 0",background:amt===v?t.blue:t.bg,border:`1px solid ${amt===v?t.blue:t.border}`,borderRadius:6,color:amt===v?"#fff":t.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>${v}</button>
                  ))}
                </div>
              </div>
              <div style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
                {[["Avg price",`${cents}¢`],["Shares",shares],["Potential payout",`$${payout}`],["Potential profit",`+$${profit}`]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>{k}</span>
                    <span style={{fontSize:12,color:t.text,fontFamily:"monospace",fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={placeOrder} disabled={loading}
                style={{width:"100%",padding:"14px",background:t.blue,color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,fontFamily:"monospace",letterSpacing:0.5}}>
                {loading?`⏳ PROCESSING...`:`PLACE ${side} ORDER ON ARC`}
              </button>
              <p style={{textAlign:"center",fontSize:11,color:t.textLight,fontFamily:"monospace",marginTop:10}}>Trades settle on Arc Testnet · USDC</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function ArcanaMarkets(){
  const [dark,setDark]=useState(()=>LS.get("arcana_theme",false));
  const [page,setPage]=useState("Markets");
  const [cat,setCat]=useState("All");
  const [q,setQ]=useState("");
  const [active,setActive]=useState(null);
  const [tradeSide,setTradeSide]=useState(null);
  const [account,setAccount]=useState(null);
  const [usdcBalance,setUsdcBalance]=useState("0.00");
  const [positions,setPositions]=useState([]);
  const [newTrades,setNewTrades]=useState(()=>LS.get("arcana_new_trades",[]));
  const [livePrices,setLivePrices]=useState({});
  const [tickIdx,setTickIdx]=useState(0);
  const [resolutions,setResolutions]=useState(()=>getResolutions());
  const [isOwner,setIsOwner]=useState(false);
  const [stats,setStats]=useState(()=>buildStats([]));const [dropdownOpen,setDropdownOpen]=useState(false); const [copied,setCopied]=useState(false);

  const t=dark?THEMES.dark:THEMES.light;
  const toggleTheme=()=>{const n=!dark;setDark(n);LS.set("arcana_theme",n);};

  const refreshBal=async(addr)=>{setUsdcBalance(await getUsdcBalance(addr));};

  // Check if connected wallet is contract owner
  const checkOwner=useCallback(async(addr)=>{
    if(!addr){setIsOwner(false);return;}
    const owner=await getContractOwner();
    setIsOwner(owner&&owner.toLowerCase()===addr.toLowerCase());
  },[]);

  const loadWalletData=useCallback(async(addr)=>{
    if(!addr)return;
    const key=addr.toLowerCase();
    const local=LS.get(`arcana_positions_${key}`,[]);
    // Merge seed trades
    const seedTrades=getWalletHistory(addr);
    const localHashes=new Set(local.map(p=>p.txHash));
    const seedPositions=seedTrades.filter(s=>!localHashes.has(s.txHash)).map(s=>({
      marketId:parseInt((Object.keys(MC).find(k=>MC[k]===s.market)||"M0").replace("M","")),
      market:s.market,side:s.side,amt:s.amt,txHash:s.txHash,time:s.time
    }));
    const merged=[...local,...seedPositions];
    setPositions(merged);
    if(seedPositions.length>0)LS.set(`arcana_positions_${key}`,merged);
    // Also fetch live from chain
    try{
      const live=await fetchWalletLiveHistory(addr);
      if(live&&live.length>0){
        const mergedHashes=new Set(merged.map(p=>p.txHash));
        const newLive=live.filter(l=>!mergedHashes.has(l.txHash));
        if(newLive.length>0){
          const final=[...newLive,...merged];
          setPositions(final);
          LS.set(`arcana_positions_${key}`,final);
        }
      }
    }catch{}
  },[]);

  const connectWallet=async()=>{
    const provider=window.ethereum;
    if(!provider){alert("No EVM wallet found! Install MetaMask or any EVM wallet.");return;}
    try{
      LS.set("arcana_user_disconnected",false);
      try{await provider.request({method:"wallet_requestPermissions",params:[{eth_accounts:{}}]});}
      catch(e){if(e.code===4001)return;}
      const accounts=await provider.request({method:"eth_requestAccounts"});
      if(!accounts?.length)return;
      const addr=accounts[0];
      setAccount(addr);
      LS.set("arcana_last_wallet",addr);
      await refreshBal(addr);
      loadWalletData(addr);
      checkOwner(addr);
    }catch(e){if(e.code!==4001)console.error(e);}
  };

  const disconnectWallet=()=>{
    LS.set("arcana_user_disconnected",true);
    LS.set("arcana_last_wallet",null);
    setAccount(null);setUsdcBalance("0.00");setPositions([]);setIsOwner(false);if(window.ethereum){window.ethereum.request({method:"wallet_revokePermissions",params:[{eth_accounts:{}}]}).catch(()=>{});}
  };

  useEffect(()=>{
    const userDisconnected=LS.get("arcana_user_disconnected",false);
    const lastWallet=LS.get("arcana_last_wallet",null);
    if(!userDisconnected&&lastWallet&&window.ethereum){
      window.ethereum.request({method:"eth_accounts"}).then(accs=>{
        const still=accs.find(a=>a.toLowerCase()===lastWallet.toLowerCase());
        if(still){setAccount(still);refreshBal(still);loadWalletData(still);checkOwner(still);}
        else LS.set("arcana_last_wallet",null);
      }).catch(()=>{});
    }
    if(window.ethereum){
      const h=(accs)=>{
               if(LS.get("arcana_user_disconnected",false))return;
        const addr=accs[0]||null;
        if(addr){LS.set("arcana_user_disconnected",false);LS.set("arcana_last_wallet",addr);setAccount(addr);refreshBal(addr);loadWalletData(addr);checkOwner(addr);}
        else{LS.set("arcana_last_wallet",null);setAccount(null);setUsdcBalance("0.00");setPositions([]);setIsOwner(false);}
      };
      window.ethereum.on("accountsChanged",h);
      return()=>window.ethereum.removeListener("accountsChanged",h);
    }
  },[]);

  useEffect(()=>{
    const fetchPrices=async()=>{
      try{
        const res=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true");
        const data=await res.json();
        setLivePrices({bitcoin:{price:data.bitcoin?.usd,change:data.bitcoin?.usd_24h_change},ethereum:{price:data.ethereum?.usd,change:data.ethereum?.usd_24h_change},solana:{price:data.solana?.usd,change:data.solana?.usd_24h_change}});
      }catch{}
    };
    fetchPrices();
    const iv=setInterval(fetchPrices,30000);
    return()=>clearInterval(iv);
  },[]);

  // Live stats refresh every 60s
  useEffect(()=>{
    const refresh=async()=>{
      const live=await fetchLiveStats();
      setStats(buildStats(live,LS.get("arcana_new_trades",[])));
    };
    refresh();
    const iv=setInterval(refresh,60000);
    return()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    const timer=setInterval(()=>setTickIdx(i=>(i+1)%ALL_MARKETS.length),3500);
    return()=>clearInterval(timer);
  },[]);

  const addPosition=useCallback((trade)=>{
    if(!account)return;
    const key=account.toLowerCase();
    setPositions(prev=>{
      const next=[trade,...prev];
      LS.set(`arcana_positions_${key}`,next);
      return next;
    });
  },[account]);

  const addActivity=useCallback((trade)=>{
    if(!account)return;
    const entry={from:account,shortAddr:`${account.slice(0,6)}...${account.slice(-4)}`,txHash:trade.txHash,time:new Date().toISOString().slice(0,16),market:trade.market,side:trade.side,usdc:parseFloat(trade.amt)||0};
    setNewTrades(prev=>{
      const next=[entry,...prev];
      LS.set("arcana_new_trades",next);
      fetchLiveStats().then(live=>setStats(buildStats(live,next)));
      return next;
    });
  },[account]);

  const refreshResolutions=()=>setResolutions(getResolutions());

  const filtered=ALL_MARKETS.filter(m=>cat==="Trending"?m.trending:cat==="All"?true:m.cat===cat).filter(m=>!q||m.title.toLowerCase().includes(q.toLowerCase()));
  const tick=ALL_MARKETS[tickIdx];

  const NAV_TABS=["Markets","Portfolio",...(isOwner?["Admin"]:[]),"Leaderboard","Activity"];

  return(
    <div style={{minHeight:"100vh",background:t.bg,color:t.text,fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .card{transition:all 0.18s;}
        @media(max-width:640px){
          .nav-links{display:none!important;}
          .hero-stats{flex-direction:column!important;}
          .top-movers{grid-template-columns:1fr 1fr!important;}
          .markets-grid{grid-template-columns:1fr!important;}
          .filter-row{flex-direction:column!important;}
          .nav-right{gap:6px!important;}
          .usdc-badge{display:none!important;}
        }
        @media(max-width:480px){
          .hero-title{font-size:28px!important;}
          .top-movers{grid-template-columns:1fr!important;}
        }
      `}</style>

      {/* NAV */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:t.navBg,borderBottom:`1px solid ${t.border}`}}>
        <div style={{maxWidth:1380,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",gap:16,height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,cursor:"pointer"}} onClick={()=>setPage("Markets")}>
            <div style={{width:32,height:32,borderRadius:10,background:"#2563EB",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="1" transform="rotate(45 12 12)" stroke="white" strokeWidth="2.5" fill="none"/>
                <rect x="7" y="7" width="10" height="10" rx="0.5" transform="rotate(45 12 12)" fill="white"/>
              </svg>
            </div>
            <span style={{fontSize:17,fontWeight:800,letterSpacing:-0.5,color:t.text}}>arcana</span>
            <span style={{fontSize:9,background:t.blueDim,color:t.blue,border:`1px solid ${t.blueBorder}`,padding:"2px 6px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>TESTNET</span>
          </div>
          <div className="nav-links" style={{display:"flex",gap:1,overflowX:"auto",flex:1}}>
            {NAV_TABS.map(n=>(
              <button key={n} onClick={()=>{setPage(n);if(n==="Admin")refreshResolutions();}}
                style={{padding:"6px 14px",background:page===n?t.blueDim:"none",border:"none",borderRadius:8,color:page===n?t.blue:n==="Admin"?t.purple:t.textMuted,fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                {n}{n==="Portfolio"&&positions.length>0?` (${positions.length})`:""}
              </button>
            ))}
          </div>
          <div className="nav-right" style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            {account&&<div className="usdc-badge" style={{padding:"6px 12px",background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:8,fontSize:12,color:t.green,fontFamily:"monospace",fontWeight:700}}>${usdcBalance} USDC</div>}
            <button onClick={toggleTheme} style={{position:"relative",width:52,height:28,borderRadius:14,background:dark?"#4F8EF7":"#E5E7EB",border:"none",cursor:"pointer",transition:"background 0.3s",padding:0,flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:dark?26:3,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left 0.3s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                {dark?"🌙":"☀️"}
              </div>
            </button>
          {account?(
  <div style={{position:"relative"}}>
    <button onClick={()=>setDropdownOpen(o=>!o)} style={{padding:"8px 18px",background:`linear-gradient(135deg,${t.blue},#7C3AED)`,color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"monospace",boxShadow:`0 0 18px ${t.blue}66`,letterSpacing:0.3,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>◈</span>{account.slice(0,6)}...{account.slice(-4)}<span style={{fontSize:10,opacity:0.8}}>▾</span>
    </button>
    {dropdownOpen&&(<>
      <div onClick={()=>setDropdownOpen(false)} style={{position:"fixed",inset:0,zIndex:199}}/>
      <div style={{position:"absolute",right:0,top:"calc(100% + 10px)",background:t.surface,border:`1.5px solid ${t.blue}`,borderRadius:16,padding:16,minWidth:280,zIndex:200,boxShadow:`0 8px 32px ${t.blue}44,0 2px 8px rgba(0,0,0,0.3)`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${t.border}`}}>
          <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${t.blue},#7C3AED)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>◈</div>
          <div>
            <div style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",marginBottom:2,letterSpacing:1}}>CONNECTED WALLET</div>
            <div style={{fontSize:12,fontWeight:700,color:t.text,fontFamily:"monospace"}}>{account.slice(0,10)}...{account.slice(-6)}</div>
          </div>
        </div>
        <div style={{background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>USDC Balance</span>
          <span style={{fontSize:16,fontWeight:800,color:t.green,fontFamily:"monospace"}}>${usdcBalance}</span>
        </div>
        <button onClick={()=>{navigator.clipboard.writeText(account);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{display:"flex",width:"100%",padding:"10px 14px",background:copied?t.greenBg:t.blueDim,border:`1px solid ${copied?t.greenBorder:t.blueBorder}`,borderRadius:10,color:copied?t.green:t.blue,fontSize:13,cursor:"pointer",fontFamily:"monospace",fontWeight:600,alignItems:"center",gap:8,marginBottom:8,transition:"all 0.2s",boxSizing:"border-box"}}>
          {copied?"✓ Copied!":"📋 Copy Address"}
        </button>
        <a href={`https://testnet.arcscan.app/address/${account}`} target="_blank" rel="noreferrer" style={{display:"flex",width:"100%",padding:"10px 14px",background:t.surfaceAlt,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,fontSize:13,fontFamily:"monospace",fontWeight:600,alignItems:"center",gap:8,marginBottom:8,textDecoration:"none"}}>
          ↗ View on ArcScan
        </a>
        <button onClick={()=>{disconnectWallet();setDropdownOpen(false);}} style={{display:"flex",width:"100%",padding:"10px 14px",background:t.redBg,border:`1px solid ${t.redBorder}`,borderRadius:10,color:t.red,fontSize:13,cursor:"pointer",fontFamily:"monospace",fontWeight:600,alignItems:"center",gap:8,transition:"all 0.2s",boxSizing:"border-box"}}>
          ✕ Disconnect Wallet
        </button>
      </div>
    </>)}
  </div>
):(
              <WalletModal t={t} account={account} onConnected={(addr) => { setAccount(addr); LS.set("arcana_last_wallet", addr); refreshBal(addr); loadWalletData(addr); checkOwner(addr); }} onDisconnected={disconnectWallet} />
               
                      )}
          </div>
        </div>
      </nav>

      {/* TICKER */}
      <div style={{background:t.tickerBg,padding:"7px 20px"}}>
        <div style={{maxWidth:1380,margin:"0 auto",display:"flex",alignItems:"center",gap:20,overflowX:"auto"}}>
          <span style={{fontSize:10,fontFamily:"monospace",color:t.tickerText,letterSpacing:2,flexShrink:0,opacity:0.6}}>LIVE</span>
          {["bitcoin","ethereum","solana"].map(coin=>{
            const data=livePrices[coin];
            const sym=coin==="bitcoin"?"BTC":coin==="ethereum"?"ETH":"SOL";
            const up=(data?.change||0)>=0;
            return(
              <span key={coin} style={{fontSize:11,fontFamily:"monospace",color:t.tickerText,flexShrink:0,opacity:0.9}}>
                {sym} {data?`$${data.price?.toLocaleString()}`:"—"} <span style={{color:up?"#4ade80":"#f87171"}}>{data?`${up?"+":""}${data.change?.toFixed(2)}%`:""}</span>
              </span>
            );
          })}
          <span style={{fontSize:10,fontFamily:"monospace",color:"rgba(255,255,255,0.4)",margin:"0 4px"}}>·</span>
          <span style={{fontSize:11,fontFamily:"monospace",color:t.tickerText,opacity:0.7,flexShrink:0}}>
            {tick?.title.slice(0,40)}… <span style={{color:"#4ade80"}}>{pct(tick?.yes)}%</span>
          </span>
        </div>
      </div>

      <div style={{maxWidth:1380,margin:"0 auto",padding:"0 20px 60px"}}>

        {page==="Admin"&&(
          isOwner
            ?<AdminPanel t={t} account={account} onResolved={refreshResolutions}/>
            :<div style={{textAlign:"center",padding:"80px 20px"}}>
              <div style={{fontSize:48,marginBottom:16}}>🚫</div>
              <p style={{color:t.textMuted,fontSize:15}}>Owner wallet required to access this panel</p>
            </div>
        )}

        {page==="Portfolio"&&(
          <Portfolio t={t} account={account} positions={positions} resolutions={resolutions}/>
        )}

        {page==="Leaderboard"&&(
          <Leaderboard t={t} account={account} newTrades={newTrades}/>
        )}

        {page==="Activity"&&(
          <Activity t={t} account={account} newTrades={newTrades}/>
        )}

        {page==="Markets"&&(
          <>
            <div style={{padding:"44px 0 32px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:32,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:280}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:6,background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:6,padding:"4px 10px",marginBottom:16}}>
                  <span style={{fontSize:10,fontWeight:700,fontFamily:"monospace",letterSpacing:1}}><span style={{color:t.green}}>●</span><span style={{color:t.blue}}> ARC TESTNET · LIVE</span></span>
                </div>
                <h1 style={{fontSize:"clamp(36px,6vw,72px)",fontWeight:800,letterSpacing:-2,color:t.text,lineHeight:1.05,marginBottom:12}}>
                  Arcana Markets
                </h1>
                <p style={{fontSize:18,fontWeight:800,color:t.text,marginBottom:8,lineHeight:1.2,letterSpacing:-0.3}}>
                  Predict. Trade. Win USDC.
                </p>
                <p style={{fontSize:14,color:t.textMuted,lineHeight:1.6}}>
                  {ALL_MARKETS.length} prediction markets. Trade YES or NO with USDC on Arc's EVM testnet.
                </p>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}} className="hero-stats">
                {[[stats.totalVolume,"Total Volume"],[stats.openMarkets,"Open Markets"],[stats.traderCount,"Traders"]].map(([v,l])=>(
                  <div key={l} style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:12,padding:"20px 28px",minWidth:130,textAlign:"center"}}>
                    <div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:t.blue,marginBottom:6,letterSpacing:-1}}>{v}</div>
                    <div style={{fontSize:12,color:t.textMuted,fontFamily:"monospace",letterSpacing:0.5}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:32}}>
              <div style={{fontSize:11,fontFamily:"monospace",color:t.textMuted,letterSpacing:2,marginBottom:12}}>TOP MOVERS</div>
              <div className="top-movers" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {TOP_MOVERS.map(m=>{
                  const up=m.chg>=0;
                  return(
                    <div key={m.id} onClick={()=>{setActive(m);setTradeSide(null);}}
                      style={{background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=t.blue}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                      <div style={{flex:1}}>
                        <p style={{fontSize:12,color:t.text,fontWeight:600,margin:"0 0 4px",lineHeight:1.3}}>{m.title.slice(0,30)}…</p>
                        <span style={{fontSize:11,fontFamily:"monospace",color:t.textMuted}}>{pct(m.yes)}%</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,fontFamily:"monospace",color:up?t.green:t.red}}>{up?"+":""}{Math.round(m.chg*100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:20,alignItems:"center",flexWrap:"wrap"}} className="filter-row">
              <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
                {CATS.map(c=>(
                  <button key={c} onClick={()=>setCat(c)}
                    style={{padding:"6px 13px",background:cat===c?t.blue:t.surface,border:`1px solid ${cat===c?t.blue:t.border}`,borderRadius:20,color:cat===c?"#fff":t.textMuted,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{c}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..."
                  style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,padding:"7px 12px",color:t.text,fontSize:13,outline:"none",width:160}}/>
              </div>
            </div>

            <div style={{marginBottom:16,fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>{filtered.length} markets</div>

            <div className="markets-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
              {filtered.map(m=>{
                const outcome=resolutions[String(m.id)];
                const isResolved=outcome!==undefined;
                // isCancelled: we'd need an on-chain read per card to know;
                // for now we show cancelled state only in Portfolio where we do fetch on-chain
                return(
                  <div key={m.id} className="card">
                    <GridCard m={m}
                      onTrade={(mkt,side)=>{setActive(mkt);setTradeSide(side);}}
                      t={t}
                      resolvedOutcome={outcome}
                      isResolved={isResolved}
                      isCancelled={false}
                      livePrice={
                        m.cat==="Crypto"&&m.title.includes("BTC")&&livePrices.bitcoin?`BTC $${livePrices.bitcoin.price?.toLocaleString()}`:
                        m.cat==="Crypto"&&m.title.includes("ETH")&&livePrices.ethereum?`ETH $${livePrices.ethereum.price?.toLocaleString()}`:
                        m.cat==="Crypto"&&m.title.includes("SOL")&&livePrices.solana?`SOL $${livePrices.solana.price?.toLocaleString()}`:
                        null
                      }
                    />
                  </div>
                );
              })}
            </div>
            {filtered.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:t.textMuted}}>No markets found</div>}

            <div style={{marginTop:52,background:t.navy,borderRadius:16,padding:"30px 34px",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{width:48,height:48,borderRadius:14,background:"#2563EB",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="4" width="16" height="16" rx="1" transform="rotate(45 12 12)" stroke="white" strokeWidth="2.5" fill="none"/>
                  <rect x="7" y="7" width="10" height="10" rx="0.5" transform="rotate(45 12 12)" fill="white"/>
                </svg>
              </div>
              <div style={{flex:1}}>
                <h3 style={{fontSize:17,fontWeight:700,marginBottom:5,color:"#fff"}}>Powered by Arc Network</h3>
                <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.6}}>Every prediction trade settles on-chain with real USDC.</p>
              </div>
              <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
                {[["0x3600...0000","USDC"],["0x4cef52","Chain ID"],["< 1s","Finality"],["USDC","Gas Token"]].map(([v,l])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontSize:12,fontFamily:"monospace",color:"#fff",fontWeight:700}}>{v}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:"monospace"}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <footer style={{borderTop:`1px solid ${t.border}`,padding:20,textAlign:"center",background:t.bg}}>
        <p style={{fontSize:11,fontFamily:"monospace",color:t.textLight}}>✦ ARCANA.MARKETS · ARC TESTNET · {CONTRACT_ADDRESS.slice(0,10)}…</p>
      </footer>

      {active&&(
        <TradeModal
          m={active}
          initSide={tradeSide}
          onClose={()=>{setActive(null);setTradeSide(null);}}
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
