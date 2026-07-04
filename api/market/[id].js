const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x44c5445C01f1A0FD5D7AA661776327Ac11872889";
const ARC_RPC = "https://rpc.testnet.arc.network";
const ABI = ["function markets(uint256) external view returns (uint256 id, string title, string category, uint256 yesPool, uint256 noPool, uint256 endTime, bool resolved, bool cancelled, bool yesWon)"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function replaceMeta(html, attr, val, content) {
  const re = new RegExp(`(<meta[^>]*${attr}=["']${val}["'][^>]*content=)["'][^"']*["']`, "i");
  return re.test(html) ? html.replace(re, `$1"${esc(content)}"`) : html;
}

module.exports = async function handler(req, res) {
  const id = (req.query.id || "").toString().replace(/[^0-9]/g, "");

  let html;
  try {
    html = fs.readFileSync(path.join(process.cwd(), "build", "index.html"), "utf8");
  } catch {
    res.status(500).send("Not found");
    return;
  }

  if (id) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const m = await contract.markets(id);
      if (Number(m.id) !== 0) {
        const yesPool = Number(m.yesPool);
        const noPool = Number(m.noPool);
        const total = yesPool + noPool;
        const yesPct = total > 0 ? Math.round((yesPool / total) * 100) : 50;
        const noPct = 100 - yesPct;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const url = `https://${host}/market/${id}`;
        const image = `https://${host}/LOGO.jpg`;
        const ogTitle = m.title;
        const ogDesc = `${yesPct}% YES · ${noPct}% NO — Trade on Arcana Markets, settled on-chain in USDC.`;

        html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(ogTitle)}</title>`);
        html = replaceMeta(html, "name", "description", ogDesc);
        html = replaceMeta(html, "property", "og:title", ogTitle);
        html = replaceMeta(html, "property", "og:description", ogDesc);
        html = replaceMeta(html, "property", "og:url", url);
        html = replaceMeta(html, "property", "og:image", image);
        html = replaceMeta(html, "name", "twitter:title", ogTitle);
        html = replaceMeta(html, "name", "twitter:description", ogDesc);
        html = replaceMeta(html, "name", "twitter:image", image);
      }
    } catch {
      // market not found or chain read failed — fall through, serve default meta
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
};
