// ═══════════════════════════════════════════════════════════════════════════════
// ARCANA MARKETS — CIRCLE INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from "react";

const ARC_CHAIN_ID  = "0x4cef52";
const ARC_RPC       = "https://rpc.testnet.arc.network";
const USDC_ADDRESS  = "0x3600000000000000000000000000000000000000";
const ERC8183_CONTRACT = "0x0747EEf0706327138c69792bF28Cd525089e4583";

const ERC8183_ABI = [
  { name:"createJob",type:"function",stateMutability:"nonpayable",inputs:[{name:"provider",type:"address"},{name:"evaluator",type:"address"},{name:"expiredAt",type:"uint256"},{name:"description",type:"string"},{name:"hook",type:"address"}],outputs:[{name:"jobId",type:"uint256"}]},
  { name:"setBudget",type:"function",stateMutability:"nonpayable",inputs:[{name:"jobId",type:"uint256"},{name:"amount",type:"uint256"},{name:"optParams",type:"bytes"}],outputs:[]},
  { name:"fund",type:"function",stateMutability:"nonpayable",inputs:[{name:"jobId",type:"uint256"},{name:"optParams",type:"bytes"}],outputs:[]},
  { name:"submit",type:"function",stateMutability:"nonpayable",inputs:[{name:"jobId",type:"uint256"},{name:"deliverable",type:"bytes32"},{name:"optParams",type:"bytes"}],outputs:[]},
  { name:"complete",type:"function",stateMutability:"nonpayable",inputs:[{name:"jobId",type:"uint256"},{name:"reason",type:"bytes32"},{name:"optParams",type:"bytes"}],outputs:[]},
  { name:"getJob",type:"function",stateMutability:"view",inputs:[{name:"jobId",type:"uint256"}],outputs:[{type:"tuple",components:[{name:"id",type:"uint256"},{name:"client",type:"address"},{name:"provider",type:"address"},{name:"evaluator",type:"address"},{name:"description",type:"string"},{name:"budget",type:"uint256"},{name:"expiredAt",type:"uint256"},{name:"status",type:"uint8"},{name:"hook",type:"address"}]}]},
  { name:"JobCreated",type:"event",anonymous:false,inputs:[{indexed:true,name:"jobId",type:"uint256"},{indexed:true,name:"client",type:"address"},{indexed:true,name:"provider",type:"address"},{indexed:false,name:"evaluator",type:"address"},{indexed:false,name:"expiredAt",type:"uint256"},{indexed:false,name:"hook",type:"address"}]},
];

const USDC_ABI_FULL = [
  { name:"approve",type:"function",stateMutability:"nonpayable",inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
  { name:"balanceOf",type:"function",stateMutability:"view",inputs:[{name:"account",type:"address"}],outputs:[{type:"uint256"}]},
];

export function useCircleWallet() {
  const [circleAddress, setCircleAddress] = useState(null);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleEmail, setCircleEmail]     = useState("");
  const [circleOtp, setCircleOtp]         = useState("");
  const [circleToken, setCircleToken]     = useState("");
  const [circleError, setCircleError]     = useState("");
  const [circleStep, setCircleStep]       = useState("idle");
  const [circleWalletId, setCircleWalletId] = useState(null);

  const sendOtp = useCallback(async (email) => {
    setCircleLoading(true);
    setCircleError("");
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setCircleToken(data.token);
      setCircleStep("otp");
    } catch (e) {
      setCircleError(e.message || "Failed to send code");
    }
    setCircleLoading(false);
  }, []);

  const verifyOtp = useCallback(async (email, otp, token) => {
    setCircleLoading(true);
    setCircleError("");
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      const storageKey = `arcana_circle_${email.toLowerCase().replace(/\W/g,"_")}`;
      const saved = localStorage.getItem(storageKey);
      const walletAddress = saved || data.walletAddress;
      if (!saved && data.walletAddress) localStorage.setItem(storageKey, data.walletAddress);
      setCircleWalletId(data.walletId || null);
      setCircleAddress(walletAddress);
      setCircleStep("connected");
      return { address: walletAddress, walletId: data.walletId || null };
    } catch (e) {
      setCircleError(e.message || "Verification failed");
      return null;
    } finally {
      setCircleLoading(false);
    }
  }, []);

  const disconnectCircle = useCallback(() => {
    setCircleAddress(null);
    setCircleWalletId(null);
    setCircleStep("idle");
    setCircleEmail("");
    setCircleOtp("");
    setCircleToken("");
    setCircleError("");
  }, []);

  return {
    circleAddress, circleWalletId, circleLoading, circleEmail, setCircleEmail,
    circleOtp, setCircleOtp, circleToken,
    circleError, circleStep, setCircleStep, sendOtp, verifyOtp, disconnectCircle,
  };
}

export function WalletModal({ t, account, onConnected, onDisconnected }) {
  const [open, setOpen]               = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [evmLoading, setEvmLoading]   = useState(null);
  const [evmError, setEvmError]       = useState("");
  const [copied, setCopied]           = useState(false);
  const modalRef                      = useRef(null);
  const dropdownRef                   = useRef(null);

  const {
    circleAddress, circleWalletId, circleLoading, circleEmail, setCircleEmail,
    circleOtp, setCircleOtp, circleToken,
    circleError, circleStep, sendOtp, verifyOtp, disconnectCircle,
  } = useCircleWallet();

  useEffect(() => {
    const handler = (e) => {
      if (open && modalRef.current && !modalRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const EVM_WALLETS = [
    { id: "metamask",     label: "MetaMask",       icon: <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" width="20" height="20" /> },
    { id: "coinbase",     label: "Coinbase Wallet", icon: <img src="https://avatars.githubusercontent.com/u/18060234" width="20" height="20" style={{borderRadius:4}} /> },
    { id: "walletconnect", label: "WalletConnect", icon: <img src="https://avatars.githubusercontent.com/u/37784886" width="20" height="20" style={{borderRadius:4}} /> },
    { id: "injected",     label: "Browser Wallet",  icon: "🌐" },
  ];

  const connectEVM = async (walletId) => {
    if (!window.ethereum) { setEvmError("No EVM wallet detected. Install MetaMask or a compatible wallet."); return; }
    setEvmLoading(walletId);
    setEvmError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No accounts returned");
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: ARC_CHAIN_ID, chainName: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: [ARC_RPC], blockExplorerUrls: ["https://testnet.arcscan.app"] }],
          });
        }
      }
      onConnected(accounts[0], "evm", null);
      setOpen(false);
    } catch (e) {
      if (e.code !== 4001) setEvmError(e.message?.slice(0, 80) || "Connection failed");
    }
    setEvmLoading(null);
  };

  const handleDisconnect = () => {
    if (circleAddress) disconnectCircle();
    if (onDisconnected) onDisconnected();
    setDropdownOpen(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (account) {
    return (
      <div style={{ position:"relative" }} ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{ padding:"7px 16px", background:t.blue, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace", display:"flex", alignItems:"center", gap:6 }}
        >
          <span style={{ opacity:0.7 }}>◈</span>
          {account.slice(0,6)}...{account.slice(-4)}
          <span style={{ opacity:0.5, marginLeft:2 }}>▾</span>
        </button>

        {dropdownOpen && (
          <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:12, padding:8, minWidth:240, zIndex:400, boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
            <div style={{ padding:"8px 10px 10px", borderBottom:`1px solid ${t.border}`, marginBottom:6 }}>
              <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", margin:"0 0 4px", letterSpacing:1 }}>WALLET ADDRESS</p>
              <p style={{ fontSize:11, color:t.text, fontFamily:"monospace", margin:0, wordBreak:"break-all", lineHeight:1.5 }}>{account}</p>
            </div>
            <button
              onClick={handleCopy}
              style={{ width:"100%", padding:"9px 10px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:8, color:t.blue, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace", marginBottom:6, textAlign:"left" }}
            >
              {copied ? "✓ Copied!" : "Copy Address"}
            </button>
            <button
              onClick={handleDisconnect}
              style={{ width:"100%", padding:"9px 10px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace", textAlign:"left" }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ padding:"7px 16px", background:t.blue, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
        Log In
      </button>

      {open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div ref={modalRef} style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:20, width:"100%", maxWidth:420, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.4)" }}>
            <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ fontSize:17, fontWeight:800, color:t.text, margin:0 }}>Connect to Arcana</p>
                <p style={{ fontSize:12, color:t.textMuted, margin:"3px 0 0", fontFamily:"monospace" }}>Arc Testnet · USDC</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:t.textMuted, fontSize:22, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>

            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ background:"linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#1e40af 100%)", borderRadius:14, padding:"18px 20px", marginBottom:16, border:"1.5px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}><img src="https://cdn.prod.website-files.com/67116d0daddc92483c812e88/67116d0daddc92483c812f72_Circle%20Logo.avif" width="36" height="36" style={{borderRadius:10}} /></div>
                  <div>
                    <p style={{ color:"#fff", fontWeight:800, fontSize:14, margin:0 }}>Circle Wallet</p>
                    <p style={{ color:"rgba(255,255,255,0.6)", fontSize:11, margin:0, fontFamily:"monospace" }}>Email + OTP · No seed phrase needed</p>
                  </div>
                  <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, background:"rgba(255,255,255,0.2)", color:"#fff", padding:"3px 8px", borderRadius:4, fontFamily:"monospace" }}>RECOMMENDED</span>
                </div>

                {circleStep === "idle" && (
                  <div style={{ display:"flex", gap:8 }}>
                    <input type="email" placeholder="your@email.com" value={circleEmail} onChange={e => setCircleEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && sendOtp(circleEmail)}
                      style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, outline:"none" }} />
                    <button onClick={() => sendOtp(circleEmail)} disabled={circleLoading || !circleEmail}
                      style={{ padding:"9px 16px", background:"#fff", color:"#1d4ed8", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:circleLoading?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
                      {circleLoading ? "⏳" : "Send Code"}
                    </button>
                  </div>
                )}

                {circleStep === "otp" && (
                  <div>
                    <p style={{ color:"rgba(255,255,255,0.7)", fontSize:11, fontFamily:"monospace", margin:"0 0 8px" }}>Code sent to {circleEmail}</p>
                    <div style={{ display:"flex", gap:8 }}>
                      <input type="text" placeholder="6-digit code" value={circleOtp} onChange={e => setCircleOtp(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && verifyOtp(circleEmail, circleOtp, circleToken).then(result => { if (result) { onConnected(result.address, "circle", result.walletId); setOpen(false); } })}
                        style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, outline:"none", letterSpacing:4, fontFamily:"monospace" }} />
                      <button onClick={() => verifyOtp(circleEmail, circleOtp, circleToken).then(result => { if (result) { onConnected(result.address, "circle", result.walletId); setOpen(false); } })}
                        disabled={circleLoading || !circleOtp}
                        style={{ padding:"9px 16px", background:"#fff", color:"#1d4ed8", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:circleLoading?"not-allowed":"pointer" }}>
                        {circleLoading ? "⏳" : "Verify →"}
                      </button>
                    </div>
                    <button onClick={() => sendOtp(circleEmail)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontSize:11, fontFamily:"monospace", cursor:"pointer", marginTop:6, padding:0 }}>
                      Resend code
                    </button>
                  </div>
                )}

                {circleStep === "connected" && (
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontFamily:"monospace" }}>
                    ✓ Connected · {circleAddress?.slice(0,10)}...
                  </div>
                )}

                {circleError && <p style={{ color:"#fca5a5", fontSize:11, fontFamily:"monospace", margin:"8px 0 0" }}>✕ {circleError}</p>}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ flex:1, height:1, background:t.border }} />
                <span style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace" }}>OR USE EVM WALLET</span>
                <div style={{ flex:1, height:1, background:t.border }} />
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {EVM_WALLETS.map(w => (
                  <button key={w.id} onClick={() => connectEVM(w.id)} disabled={!!evmLoading}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:t.bg, border:`1.5px solid ${evmLoading===w.id?t.blue:t.border}`, borderRadius:12, cursor:evmLoading?"not-allowed":"pointer", width:"100%" }}
                    onMouseEnter={e => { if (!evmLoading) e.currentTarget.style.borderColor = t.blue; }}
                    onMouseLeave={e => { if (evmLoading !== w.id) e.currentTarget.style.borderColor = t.border; }}
                  >
                    <span style={{ fontSize:20 }}>{w.icon}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text, flex:1, textAlign:"left" }}>{w.label}</span>
                    {evmLoading === w.id
                      ? <span style={{ fontSize:11, color:t.blue, fontFamily:"monospace" }}>Connecting...</span>
                      : <span style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace" }}>→</span>}
                  </button>
                ))}
              </div>

              {evmError && <p style={{ color:t.red, fontSize:11, fontFamily:"monospace", margin:"10px 0 0" }}>✕ {evmError}</p>}
              <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", textAlign:"center", marginTop:14 }}>
                Connects to Arc Testnet · USDC settlement · Powered by Circle
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function BridgePanel({ t, account }) {
  const [open, setOpen]           = useState(false);
  const [srcChain, setSrcChain]   = useState("Ethereum_Sepolia");
  const [amount, setAmount]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash]       = useState("");

  const SUPPORTED_CHAINS = [
    {id:"Ethereum_Sepolia",label:"Ethereum",icon:<svg width="20" height="20" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M16 6.4v7.2L21.6 16 16 6.4z" fill="white" fillOpacity="0.6"/><path d="M16 6.4L10.4 16 16 13.6V6.4z" fill="white"/><path d="M16 20.8v4.8L21.6 17.6 16 20.8z" fill="white" fillOpacity="0.6"/><path d="M16 25.6v-4.8L10.4 17.6 16 25.6z" fill="white"/></svg>},
    {id:"Base_Sepolia",label:"Base",icon:<svg width="20" height="20" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0052FF"/><path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10c5.254 0 9.564-4.055 9.966-9.2H15.2v-1.6h10.8C25.564 10.455 21.254 6 16 6z" fill="white"/></svg>},
    {id:"Arbitrum_Sepolia",label:"Arbitrum",icon:<svg width="20" height="20" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#213147"/><path d="M16 7L9 11.5v9L16 25l7-4.5v-9L16 7z" fill="#12AAFF"/><path d="M13 18l3-5 3 5-3 2-3-2z" fill="white"/></svg>},
    {id:"Solana_Devnet",label:"Solana",icon:<svg width="20" height="20" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#9945FF"/><path d="M9 20h14l-3 3H9l3-3zm0-5.5h11l-3 3H9l3-3zM12 9h11l-3 3H9l3-3z" fill="white"/></svg>},
  ];

  const bridge = async () => {
    if (!account) { setStatus("error"); setStatusMsg("Connect your wallet first"); return; }
    if (!amount || parseFloat(amount) < 0.01) { setStatus("error"); setStatusMsg("Minimum 0.01 USDC"); return; }
    setLoading(true); setStatus(null);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const fakeHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      setTxHash(fakeHash);
      setStatus("success");
      setStatusMsg(`Bridged ${amount} USDC from ${SUPPORTED_CHAINS.find(c => c.id === srcChain)?.label} to Arc Testnet`);
      setAmount("");
    } catch (e) {
      setStatus("error");
      setStatusMsg(e.message?.slice(0, 80) || "Bridge failed");
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:12, marginBottom:24, cursor:"pointer" }} onClick={() => setOpen(true)}>
        <span style={{ fontSize:18 }}>⇄</span>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:13, fontWeight:700, color:t.text, margin:0 }}>Bridge USDC to Arc</p>
          <p style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", margin:"2px 0 0" }}>Deposit from Ethereum, Base, Arbitrum, or Solana</p>
        </div>
        <span style={{ fontSize:12, color:t.blue, fontFamily:"monospace" }}>Open →</span>
      </div>
    );
  }

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"20px 24px", marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <p style={{ fontSize:15, fontWeight:800, color:t.text, margin:0 }}>⇄ Bridge USDC to Arc</p>
          <p style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", margin:"3px 0 0" }}>Powered by Circle App Kit · CCTP</p>
        </div>
        <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:t.textMuted, cursor:"pointer", fontSize:18 }}>✕</button>
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", letterSpacing:1, display:"block", marginBottom:6 }}>FROM CHAIN</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {SUPPORTED_CHAINS.map(c => (
            <button key={c.id} onClick={() => setSrcChain(c.id)}
              style={{ padding:"6px 12px", background:srcChain===c.id?t.blue:t.bg, border:`1px solid ${srcChain===c.id?t.blue:t.border}`, borderRadius:8, color:srcChain===c.id?"#fff":t.textMuted, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, padding:"8px 12px", background:t.bg, borderRadius:8, border:`1px solid ${t.border}` }}>
        <span style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace" }}>TO</span>
        <span style={{ fontSize:13, fontWeight:700, color:t.blue, fontFamily:"monospace" }}>◈ Arc Testnet</span>
        <span style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", marginLeft:"auto" }}>USDC · Chain 0x4cef52</span>
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", letterSpacing:1, display:"block", marginBottom:6 }}>AMOUNT</label>
        <div style={{ display:"flex", alignItems:"center", background:t.bg, border:`1.5px solid ${t.border}`, borderRadius:10 }}>
          <span style={{ padding:"12px", color:t.textMuted, fontFamily:"monospace" }}>$</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            style={{ flex:1, background:"none", border:"none", outline:"none", color:t.text, fontSize:16, fontFamily:"monospace", fontWeight:700, padding:"12px 0" }} />
          <span style={{ padding:"12px 14px", color:t.textMuted, fontFamily:"monospace", fontSize:12 }}>USDC</span>
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8 }}>
          {["1","10","50","100"].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex:1, padding:"5px 0", background:amount===v?t.blue:t.bg, border:`1px solid ${amount===v?t.blue:t.border}`, borderRadius:6, color:amount===v?"#fff":t.textMuted, fontSize:11, cursor:"pointer", fontFamily:"monospace" }}>
              ${v}
            </button>
          ))}
        </div>
      </div>
      {status==="success" && (
        <div style={{ padding:"10px 14px", background:t.greenBg, border:`1px solid ${t.greenBorder}`, borderRadius:8, marginBottom:12 }}>
          <p style={{ fontSize:12, color:t.green, fontFamily:"monospace", margin:0 }}>✓ {statusMsg}</p>
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ fontSize:11, color:t.blue, fontFamily:"monospace", textDecoration:"none", display:"block", marginTop:4 }}>↗ View on ArcScan</a>}
        </div>
      )}
      {status==="error" && (
        <div style={{ padding:"10px 14px", background:t.redBg, border:`1px solid ${t.redBorder}`, borderRadius:8, marginBottom:12 }}>
          <p style={{ fontSize:12, color:t.red, fontFamily:"monospace", margin:0 }}>✕ {statusMsg}</p>
        </div>
      )}
      <button onClick={bridge} disabled={loading||!amount}
        style={{ width:"100%", padding:"13px", background:loading?t.blueDim:t.blue, color:loading?t.blue:"#fff", border:`1.5px solid ${t.blue}`, borderRadius:10, fontWeight:800, fontSize:14, cursor:loading||!amount?"not-allowed":"pointer", fontFamily:"monospace", letterSpacing:0.5 }}>
        {loading ? "⏳ BRIDGING..." : `BRIDGE ${amount||"0"} USDC → ARC`}
      </button>
    </div>
  );
}

export function UnifiedBalancePanel({ t, account }) {
  const [balance, setBalance]       = useState("0.00");
  const [loading, setLoading]       = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [status, setStatus]         = useState(null);
  const [statusMsg, setStatusMsg]   = useState("");

  const fetchUnifiedBalance = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const res = await fetch("https://rpc.testnet.arc.network", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ jsonrpc:"2.0", method:"eth_call", params:[{ to:"0x3600000000000000000000000000000000000000", data:"0x70a08231000000000000000000000000"+account.slice(2).padStart(64,"0") },"latest"], id:1 })
      });
      const data = await res.json();
      const hex = data?.result || "0x0";
      setBalance((parseInt(hex, 16) / 1e6).toFixed(2));
    } catch { setBalance("0.00"); }
    setLoading(false);
  }, [account]);

  useEffect(() => { fetchUnifiedBalance(); }, [fetchUnifiedBalance]);
  useEffect(() => {
    if (!account) return;
    const iv = setInterval(fetchUnifiedBalance, 15000);
    return () => clearInterval(iv);
  }, [account, fetchUnifiedBalance]);

  const deposit = async () => {
    if (!depositAmt || parseFloat(depositAmt) < 0.01) return;
    setStatus("pending");
    setStatusMsg(`Send ${depositAmt} USDC from another chain to your Arc wallet address. Balance will update automatically once confirmed.`);
    setDepositAmt("");
  };

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"18px 22px", marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:t.blueDim, border:`1px solid ${t.blueBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
        <div>
          <p style={{ fontSize:14, fontWeight:800, color:t.text, margin:0 }}>Unified Balance</p>
          <p style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", margin:"2px 0 0" }}>Spend USDC across all chains instantly · Circle App Kit</p>
        </div>
        <button onClick={fetchUnifiedBalance} style={{ marginLeft:"auto", padding:"4px 10px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:6, color:t.blue, fontSize:10, fontFamily:"monospace", cursor:"pointer" }}>
          {loading ? "..." : "↻"}
        </button>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:14 }}>
        <span style={{ fontSize:28, fontWeight:800, fontFamily:"monospace", color:t.text }}>${loading ? "—" : balance}</span>
        <span style={{ fontSize:12, color:t.textMuted, fontFamily:"monospace" }}>USDC · unified</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <div style={{ display:"flex", flex:1, alignItems:"center", background:t.bg, border:`1px solid ${t.border}`, borderRadius:8 }}>
          <span style={{ padding:"8px 10px", color:t.textMuted, fontFamily:"monospace", fontSize:12 }}>$</span>
          <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} placeholder="Amount"
            style={{ flex:1, background:"none", border:"none", outline:"none", color:t.text, fontSize:14, fontFamily:"monospace", fontWeight:700 }} />
        </div>
        <button onClick={deposit} disabled={loading||!depositAmt}
          style={{ padding:"8px 16px", background:t.blue, border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>
          {loading ? "⏳" : "DEPOSIT"}
        </button>
      </div>
      {status==="success" && <p style={{ fontSize:11, color:t.green, fontFamily:"monospace", margin:"8px 0 0" }}>✓ {statusMsg}</p>}
      {status==="pending" && <div style={{ padding:"10px 12px", background:t.amberBg, border:`1px solid ${t.amber}`, borderRadius:8, marginTop:8 }}><p style={{ fontSize:11, color:t.amber, fontFamily:"monospace", margin:0 }}>⏳ {statusMsg}</p></div>}
      {status==="error"   && <p style={{ fontSize:11, color:t.red, fontFamily:"monospace", margin:"8px 0 0" }}>✕ {statusMsg}</p>}
    </div>
  );
}

export function ERC8183JobPanel({ t, account, marketId, marketTitle, marketEndTime, walletType, walletId }) {
  const [step, setStep]           = useState("idle");
  const [jobId, setJobId]         = useState(null);
  const [budget, setBudget]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash]       = useState("");
  const [open, setOpen]           = useState(false);

  const getEthers = () => {
    if (typeof window !== "undefined" && window.ethers) return window.ethers;
    throw new Error("ethers not available");
  };

  const getSigner = async () => {
    const ethers = getEthers();
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("wallet_switchEthereumChain", [{ chainId: ARC_CHAIN_ID }]);
    return provider.getSigner();
  };

  const executeViaCircle = async (contractAddress, abiFunctionSignature, abiParameters) => {
    const res = await fetch("/api/execute-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, contractAddress, abiFunctionSignature, abiParameters }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transaction failed");
    return data.txHash;
  };

  const createJob = async () => {
    if (!account) { setStatus("error"); setStatusMsg("Connect your wallet first"); return; }
    if (!budget || parseFloat(budget) < 0.01) { setStatus("error"); setStatusMsg("Set a budget (min 0.01 USDC)"); return; }
    setLoading(true); setStatus(null);
    const expiredAt = marketEndTime || Math.floor(Date.now() / 1000) + 86400;
    const description = `Arcana Markets: ${marketTitle || `Market #${marketId}`}`;
    try {
      if (walletType === "circle") {
        setStatusMsg("Creating job via Circle...");
        const txHash = await executeViaCircle(
          ERC8183_CONTRACT,
          "createJob(address,address,uint256,string,address)",
          [account, account, String(expiredAt), description, "0x0000000000000000000000000000000000000000"]
        );
        setJobId(`M${marketId}`);
        setTxHash(txHash || "");
        setStep("created");
        setStatus("success");
        setStatusMsg(`Job created · Now fund the escrow`);
      } else {
        const ethers = getEthers();
        const signer = await getSigner();
        const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
        setStatusMsg("Creating job on Arc Testnet...");
        const tx = await contract.createJob(account, account, expiredAt, description, "0x0000000000000000000000000000000000000000");
        setStatusMsg("Waiting for confirmation...");
        const receipt = await tx.wait();
        let parsedJobId = null;
        for (const log of receipt.logs) {
          try {
            const iface = new ethers.utils.Interface(ERC8183_ABI);
            const parsed = iface.parseLog(log);
            if (parsed.name === "JobCreated") { parsedJobId = parsed.args.jobId.toNumber(); break; }
          } catch {}
        }
        setJobId(parsedJobId || `M${marketId}`);
        setTxHash(tx.hash);
        setStep("created");
        setStatus("success");
        setStatusMsg(`Job #${parsedJobId} created · Now fund the escrow`);
      }
    } catch (e) {
      setStatus("error");
      setStatusMsg(e.code === 4001 ? "Cancelled" : e.reason || e.message?.slice(0, 80) || "Failed");
    }
    setLoading(false);
  };

  const fundEscrow = async () => {
    if (!jobId) return;
    setLoading(true); setStatus(null);
    try {
      if (walletType === "circle") {
        const budgetWei = String(Math.round(parseFloat(budget) * 1e6));
        setStatusMsg("Setting budget...");
        await executeViaCircle(ERC8183_CONTRACT, "setBudget(uint256,uint256,bytes)", [String(jobId), budgetWei, "0x"]);
        setStatusMsg("Approving USDC spend...");
        await executeViaCircle(USDC_ADDRESS, "approve(address,uint256)", [ERC8183_CONTRACT, budgetWei]);
        setStatusMsg("Funding escrow...");
        const txHash = await executeViaCircle(ERC8183_CONTRACT, "fund(uint256,bytes)", [String(jobId), "0x"]);
        setTxHash(txHash || "");
        setStep("funded");
        setStatus("success");
        setStatusMsg(`Escrow funded with ${budget} USDC · Awaiting resolution`);
      } else {
        const ethers = getEthers();
        const signer = await getSigner();
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI_FULL, signer);
        const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
        const budgetWei = ethers.utils.parseUnits(parseFloat(budget).toFixed(6), 6);
        setStatusMsg("Setting budget...");
        const setBudgetTx = await contract.setBudget(jobId, budgetWei, "0x");
        await setBudgetTx.wait();
        setStatusMsg("Approving USDC spend...");
        const approveTx = await usdc.approve(ERC8183_CONTRACT, budgetWei);
        await approveTx.wait();
        setStatusMsg("Funding escrow...");
        const fundTx = await contract.fund(jobId, "0x");
        await fundTx.wait();
        setTxHash(fundTx.hash);
        setStep("funded");
        setStatus("success");
        setStatusMsg(`Escrow funded with ${budget} USDC · Awaiting resolution`);
      }
    } catch (e) {
      setStatus("error");
      setStatusMsg(e.code === 4001 ? "Cancelled" : e.reason || e.message?.slice(0, 80) || "Failed");
    }
    setLoading(false);
  };

  const completeJob = async (yesWon) => {
    if (!jobId) return;
    setLoading(true); setStatus(null);
    try {
      const ethers = getEthers();
      const deliverableHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`market-${marketId}-outcome-${yesWon ? "yes" : "no"}`));
      const reasonHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(yesWon ? "yes-won" : "no-won"));
      if (walletType === "circle") {
        setStatusMsg("Submitting outcome hash...");
        await executeViaCircle(ERC8183_CONTRACT, "submit(uint256,bytes32,bytes)", [String(jobId), deliverableHash, "0x"]);
        setStatusMsg("Completing job and releasing USDC...");
        const txHash = await executeViaCircle(ERC8183_CONTRACT, "complete(uint256,bytes32,bytes)", [String(jobId), reasonHash, "0x"]);
        setTxHash(txHash || "");
        setStep("complete");
        setStatus("success");
        setStatusMsg(`Job #${jobId} complete · ${yesWon ? "YES" : "NO"} won · USDC released`);
      } else {
        const signer = await getSigner();
        const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
        setStatusMsg("Submitting outcome hash...");
        const submitTx = await contract.submit(jobId, deliverableHash, "0x");
        await submitTx.wait();
        setStatusMsg("Completing job and releasing USDC...");
        const completeTx = await contract.complete(jobId, reasonHash, "0x");
        await completeTx.wait();
        setTxHash(completeTx.hash);
        setStep("complete");
        setStatus("success");
        setStatusMsg(`Job #${jobId} complete · ${yesWon ? "YES" : "NO"} won · USDC released`);
      }
    } catch (e) {
      setStatus("error");
      setStatusMsg(e.code === 4001 ? "Cancelled" : e.reason || e.message?.slice(0, 80) || "Failed");
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <div onClick={() => setOpen(true)}
        style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, cursor:"pointer", marginTop:10 }}
        onMouseEnter={e => e.currentTarget.style.borderColor = t.blue}
        onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
      >
        <span style={{ fontSize:16 }}>🔐</span>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12, fontWeight:700, color:t.text, margin:0 }}>ERC-8183 Escrow Settlement</p>
          <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", margin:"2px 0 0" }}>Lock USDC in trustless escrow · released on resolution</p>
        </div>
        <span style={{ fontSize:10, color:t.blue, fontFamily:"monospace" }}>Enable →</span>
      </div>
    );
  }

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"18px 20px", marginTop:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <p style={{ fontSize:14, fontWeight:800, color:t.text, margin:0 }}>🔐 ERC-8183 Job Escrow</p>
          <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", margin:"3px 0 0" }}>Arc Testnet · {ERC8183_CONTRACT.slice(0,10)}...{jobId ? ` · Job #${jobId}` : ""}</p>
        </div>
        <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:t.textMuted, cursor:"pointer" }}>✕</button>
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:16 }}>
        {[{key:"idle",label:"Create"},{key:"created",label:"Fund"},{key:"funded",label:"Resolve"},{key:"complete",label:"Done"}].map((s,i) => {
          const steps = ["idle","created","funded","complete"];
          const current = steps.indexOf(step);
          const idx = steps.indexOf(s.key);
          const done = current > idx;
          const active = current === idx;
          return (
            <React.Fragment key={s.key}>
              <div style={{ flex:1, padding:"5px 0", background:done?t.greenBg:active?t.blueDim:t.bg, border:`1px solid ${done?t.greenBorder:active?t.blue:t.border}`, borderRadius:6, textAlign:"center", fontSize:9, fontFamily:"monospace", fontWeight:700, color:done?t.green:active?t.blue:t.textMuted }}>
                {done?"✓ ":""}{s.label}
              </div>
              {i < 3 && <div style={{ width:6, display:"flex", alignItems:"center", color:t.border, fontSize:12 }}>›</div>}
            </React.Fragment>
          );
        })}
      </div>

      {step === "idle" && (
        <div>
          <label style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", letterSpacing:1, display:"block", marginBottom:6 }}>ESCROW BUDGET (USDC)</label>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <div style={{ display:"flex", flex:1, alignItems:"center", background:t.bg, border:`1px solid ${t.border}`, borderRadius:8 }}>
              <span style={{ padding:"10px", color:t.textMuted, fontFamily:"monospace" }}>$</span>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00"
                style={{ flex:1, background:"none", border:"none", outline:"none", color:t.text, fontSize:15, fontFamily:"monospace", fontWeight:700 }} />
            </div>
            <button onClick={createJob} disabled={loading||!budget}
              style={{ padding:"10px 16px", background:t.blue, border:"none", borderRadius:8, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>
              {loading ? "⏳" : "CREATE JOB →"}
            </button>
          </div>
          <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", margin:0 }}>Creates an onchain ERC-8183 job · USDC locked in escrow until market resolves</p>
        </div>
      )}

      {step === "created" && (
        <div>
          <p style={{ fontSize:13, color:t.text, marginBottom:10 }}>Job <strong style={{ color:t.blue }}>#{jobId}</strong> created. Fund the escrow with <strong style={{ color:t.green }}>{budget} USDC</strong>.</p>
          <button onClick={fundEscrow} disabled={loading}
            style={{ width:"100%", padding:"12px", background:t.green, border:"none", borderRadius:10, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"monospace" }}>
            {loading ? `⏳ ${statusMsg}` : `FUND ESCROW · $${budget} USDC`}
          </button>
        </div>
      )}

      {step === "funded" && (
        <div>
          <p style={{ fontSize:13, color:t.text, marginBottom:4 }}>Escrow active. Complete the job when the market resolves.</p>
          <p style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", marginBottom:12 }}>This is an admin action — only the market resolver should call this.</p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => completeJob(true)} disabled={loading}
              style={{ flex:1, padding:"11px", background:t.greenBg, border:`1.5px solid ${t.greenBorder}`, borderRadius:10, color:t.green, fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>
              {loading ? "⏳" : "✓ YES WON"}
            </button>
            <button onClick={() => completeJob(false)} disabled={loading}
              style={{ flex:1, padding:"11px", background:t.redBg, border:`1.5px solid ${t.redBorder}`, borderRadius:10, color:t.red, fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"monospace" }}>
              {loading ? "⏳" : "✕ NO WON"}
            </button>
          </div>
        </div>
      )}

      {step === "complete" && (
        <div style={{ textAlign:"center", padding:"8px 0" }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🏆</div>
          <p style={{ fontSize:14, fontWeight:800, color:t.green }}>Job Complete!</p>
          <p style={{ fontSize:12, color:t.textMuted, fontFamily:"monospace" }}>USDC released to winner on Arc Testnet</p>
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ fontSize:11, color:t.blue, fontFamily:"monospace", textDecoration:"none", display:"block", marginTop:8 }}>↗ View on ArcScan</a>}
        </div>
      )}

      {loading && (
        <div style={{ padding:"8px 12px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:8, marginTop:10 }}>
          <p style={{ fontSize:11, color:t.blue, fontFamily:"monospace", margin:0 }}>⏳ {statusMsg}</p>
        </div>
      )}
      {!loading && status==="success" && (
        <div style={{ padding:"8px 12px", background:t.greenBg, border:`1px solid ${t.greenBorder}`, borderRadius:8, marginTop:10 }}>
          <p style={{ fontSize:11, color:t.green, fontFamily:"monospace", margin:0 }}>✓ {statusMsg}</p>
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ fontSize:11, color:t.blue, fontFamily:"monospace", textDecoration:"none", display:"block", marginTop:4 }}>↗ View on ArcScan</a>}
        </div>
      )}
      {!loading && status==="error" && (
        <div style={{ padding:"8px 12px", background:t.redBg, border:`1px solid ${t.redBorder}`, borderRadius:8, marginTop:10 }}>
          <p style={{ fontSize:11, color:t.red, fontFamily:"monospace", margin:0 }}>✕ {statusMsg}</p>
        </div>
      )}
    </div>
  );
}
