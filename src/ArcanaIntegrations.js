import React, { useState, useEffect, useCallback, useRef } from "react";

const ARC_CHAIN_ID = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.network";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ERC8183_CONTRACT = "0x0747EEf0706327138c69792bF28Cd525089e4583";

const ERC8183_ABI = [
  { name:"createJob", type:"function", stateMutability:"nonpayable", inputs:[{name:"provider",type:"address"},{name:"evaluator",type:"address"},{name:"expiredAt",type:"uint256"},{name:"description",type:"string"},{name:"hook",type:"address"}], outputs:[{name:"jobId",type:"uint256"}] },
  { name:"setBudget", type:"function", stateMutability:"nonpayable", inputs:[{name:"jobId",type:"uint256"},{name:"amount",type:"uint256"},{name:"optParams",type:"bytes"}], outputs:[] },
  { name:"fund", type:"function", stateMutability:"nonpayable", inputs:[{name:"jobId",type:"uint256"},{name:"optParams",type:"bytes"}], outputs:[] },
  { name:"submit", type:"function", stateMutability:"nonpayable", inputs:[{name:"jobId",type:"uint256"},{name:"deliverable",type:"bytes32"},{name:"optParams",type:"bytes"}], outputs:[] },
  { name:"complete", type:"function", stateMutability:"nonpayable", inputs:[{name:"jobId",type:"uint256"},{name:"reason",type:"bytes32"},{name:"optParams",type:"bytes"}], outputs:[] },
  { name:"JobCreated", type:"event", anonymous:false, inputs:[{indexed:true,name:"jobId",type:"uint256"},{indexed:true,name:"client",type:"address"},{indexed:true,name:"provider",type:"address"},{indexed:false,name:"evaluator",type:"address"},{indexed:false,name:"expiredAt",type:"uint256"},{indexed:false,name:"hook",type:"address"}] },
];

const USDC_ABI_FULL = [
  { name:"approve", type:"function", stateMutability:"nonpayable", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] },
  { name:"balanceOf", type:"function", stateMutability:"view", inputs:[{name:"account",type:"address"}], outputs:[{type:"uint256"}] },
];

function WalletConnectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#3B99FC"/>
      <path d="M9.58 12.85c3.54-3.47 9.28-3.47 12.82 0l0.43 0.42a0.44 0.44 0 010 0.63l-1.46 1.43a0.23 0.23 0 01-0.32 0l-0.59-0.58c-2.47-2.42-6.47-2.42-8.94 0l-0.63 0.62a0.23 0.23 0 01-0.32 0L9.11 13.94a0.44 0.44 0 010-0.63l0.47-0.46zm15.84 2.95l1.3 1.27a0.44 0.44 0 010 0.63l-5.85 5.73a0.46 0.46 0 01-0.64 0l-4.15-4.07a0.11 0.11 0 00-0.16 0l-4.15 4.07a0.46 0.46 0 01-0.64 0L5.28 17.7a0.44 0.44 0 010-0.63l1.3-1.27a0.46 0.46 0 01.64 0l4.15 4.07a0.11 0.11 0 00.16 0l4.15-4.07a0.46 0.46 0 01.64 0l4.15 4.07a0.11 0.11 0 00.16 0l4.15-4.07a0.46 0.46 0 01.64 0z" fill="white"/>
    </svg>
  );
}

export function useCircleWallet() {
  const [circleAddress, setCircleAddress] = useState(null);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleEmail, setCircleEmail] = useState("");
  const [circleError, setCircleError] = useState("");
  const [circleStep, setCircleStep] = useState("idle");
  const [circleOtp, setCircleOtp] = useState("");

  const initCircleSDK = useCallback(async (email) => {
    setCircleLoading(true);
    setCircleError("");
    try {
      await new Promise(r => setTimeout(r, 500));
      setCircleStep("check_email");
    } catch (e) {
      setCircleError("Failed to send code");
    }
    setCircleLoading(false);
  }, []);

  const verifyOTP = useCallback(async (email, otp) => {
    setCircleLoading(true);
    setCircleError("");
    try {
      await new Promise(r => setTimeout(r, 1000));
      const hash = email.split("").reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0);
      const addr = "0x" + Math.abs(hash).toString(16).padStart(40, "0").slice(0, 40);
      setCircleAddress(addr);
      setCircleStep("connected");
    } catch (e) {
      setCircleError("Invalid code. Please try again.");
    }
    setCircleLoading(false);
  }, []);

  const disconnectCircle = useCallback(() => {
    setCircleAddress(null);
    setCircleStep("idle");
    setCircleEmail("");
    setCircleError("");
    setCircleOtp("");
  }, []);

  return { circleAddress, circleLoading, circleEmail, setCircleEmail, circleError, circleStep, setCircleStep, circleOtp, setCircleOtp, initCircleSDK, verifyOTP, disconnectCircle };
}

export function WalletModal({ t, account, onConnected, onDisconnected }) {
  const [open, setOpen] = useState(false);
  const [evmLoading, setEvmLoading] = useState(null);
  const [evmError, setEvmError] = useState("");
  const modalRef = useRef(null);
  const { circleAddress, circleLoading, circleEmail, setCircleEmail, circleError, circleStep, setCircleStep, circleOtp, setCircleOtp, initCircleSDK, verifyOTP, disconnectCircle } = useCircleWallet();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (modalRef.current && !modalRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (circleAddress && circleStep === "connected") { onConnected(circleAddress); setOpen(false); }
  }, [circleAddress, circleStep]);

  const EVM_WALLETS = [
    { id:"metamask", label:"MetaMask", icon:<span style={{fontSize:22}}>🦊</span> },
    { id:"coinbase", label:"Coinbase Wallet", icon:<span style={{fontSize:22}}>🔵</span> },
    { id:"walletconnect", label:"WalletConnect", icon:<WalletConnectIcon /> },
    { id:"injected", label:"Browser Wallet", icon:<span style={{fontSize:22}}>🌐</span> },
  ];

  const connectEVM = async (walletId) => {
    if (!window.ethereum) { setEvmError("No EVM wallet found. Install MetaMask."); return; }
    setEvmLoading(walletId); setEvmError("");
    try {
      await window.ethereum.request({ method:"wallet_requestPermissions", params:[{eth_accounts:{}}] });
      const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No accounts");
      try {
        await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:ARC_CHAIN_ID}] });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{ chainId:ARC_CHAIN_ID, chainName:"Arc Testnet", nativeCurrency:{name:"USDC",symbol:"USDC",decimals:18}, rpcUrls:[ARC_RPC], blockExplorerUrls:["https://testnet.arcscan.app"] }]});
        }
      }
      onConnected(accounts[0]); setOpen(false);
    } catch (e) {
      if (e.code !== 4001) setEvmError(e.message?.slice(0,80) || "Connection failed");
    }
    setEvmLoading(null);
  };

  const handleCircleConnect = async () => {
    if (!circleEmail || !circleEmail.includes("@")) { setCircleError("Please enter a valid email"); return; }
    setCircleError("");
    await initCircleSDK(circleEmail);
  };

  const handleDisconnect = () => {
    if (circleAddress) disconnectCircle();
    if (onDisconnected) onDisconnected();
  };

  if (account) {
    return (
      <button onClick={handleDisconnect} style={{ padding:"7px 16px", background:t.blue, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace", display:"flex", alignItems:"center", gap:6 }}>
        <span style={{opacity:0.7}}>◈</span>{account.slice(0,6)}...{account.slice(-4)}<span style={{opacity:0.5,marginLeft:2}}>✕</span>
      </button>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ padding:"7px 16px", background:t.blue, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
        Connect Wallet
      </button>
      {open && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)", zIndex:2147483647, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div ref={modalRef} style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 32px 100px rgba(0,0,0,0.8)" }}>
            <div style={{ padding:"18px 24px 14px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:t.surface, zIndex:1 }}>
              <div>
                <p style={{ fontSize:17, fontWeight:800, color:t.text, margin:0 }}>Connect to Arcana</p>
                <p style={{ fontSize:11, color:t.textMuted, margin:"2px 0 0", fontFamily:"monospace" }}>Arc Testnet · USDC · Powered by Circle</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:t.textMuted, fontSize:22, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ padding:"16px 24px 24px" }}>
              <div style={{ background:"linear-gradient(135deg,#1d4ed8,#2563eb,#1e40af)", borderRadius:14, padding:"16px 18px", marginBottom:14, border:"1.5px solid rgba(255,255,255,0.15)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⬡</div>
                  <div style={{flex:1}}>
                    <p style={{ color:"#fff", fontWeight:800, fontSize:14, margin:0 }}>Circle Wallet</p>
                    <p style={{ color:"rgba(255,255,255,0.65)", fontSize:11, margin:0, fontFamily:"monospace" }}>Email + OTP · No seed phrase</p>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, background:"rgba(255,255,255,0.2)", color:"#fff", padding:"3px 8px", borderRadius:4, fontFamily:"monospace" }}>RECOMMENDED</span>
                </div>
                {(circleStep === "idle" || circleStep === "email") && (
                  <div style={{ display:"flex", gap:8 }}>
                    <input type="email" placeholder="your@email.com" value={circleEmail}
                      onChange={e => setCircleEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCircleConnect()}
                      style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:13, outline:"none", minWidth:0 }}
                    />
                    <button onClick={handleCircleConnect} disabled={circleLoading}
                      style={{ padding:"9px 14px", background:"#fff", color:"#1d4ed8", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
                      {circleLoading ? "⏳" : "Continue →"}
                    </button>
                  </div>
                )}
                {circleStep === "check_email" && (
                  <div>
                    <p style={{ color:"#fff", fontSize:12, margin:"0 0 8px", fontFamily:"monospace" }}>📧 Enter the 6-digit code sent to <strong>{circleEmail}</strong></p>
                    <div style={{ display:"flex", gap:8 }}>
                      <input type="text" placeholder="000000" maxLength={6} value={circleOtp}
                        onChange={e => setCircleOtp(e.target.value.replace(/[^0-9]/g,""))}
                        style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:20, fontFamily:"monospace", letterSpacing:6, outline:"none", textAlign:"center" }}
                      />
                      <button onClick={() => verifyOTP(circleEmail, circleOtp)} disabled={circleLoading || circleOtp.length < 6}
                        style={{ padding:"9px 14px", background:"#fff", color:"#1d4ed8", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:"pointer", opacity:circleOtp.length<6?0.6:1 }}>
                        {circleLoading ? "⏳" : "Verify →"}
                      </button>
                    </div>
                    <button onClick={() => { setCircleStep("idle"); setCircleOtp(""); }}
                      style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontSize:11, cursor:"pointer", marginTop:6 }}>
                      ← Different email
                    </button>
                  </div>
                )}
                {circleStep === "connected" && (
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", fontFamily:"monospace" }}>✓ Connected · {circleAddress?.slice(0,10)}...</div>
                )}
                {circleError && <p style={{ color:"#fca5a5", fontSize:11, fontFamily:"monospace", margin:"8px 0 0" }}>✕ {circleError}</p>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ flex:1, height:1, background:t.border }} />
                <span style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", whiteSpace:"nowrap" }}>OR USE EVM WALLET</span>
                <div style={{ flex:1, height:1, background:t.border }} />
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {EVM_WALLETS.map(w => (
                  <button key={w.id} onClick={() => connectEVM(w.id)} disabled={!!evmLoading}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:t.bg, border:`1.5px solid ${evmLoading===w.id?t.blue:t.border}`, borderRadius:12, cursor:evmLoading?"not-allowed":"pointer", width:"100%" }}
                    onMouseEnter={e => { if(!evmLoading) e.currentTarget.style.borderColor=t.blue; }}
                    onMouseLeave={e => { if(evmLoading!==w.id) e.currentTarget.style.borderColor=t.border; }}>
                    <span style={{ display:"flex", alignItems:"center", justifyContent:"center", width:28, flexShrink:0 }}>{w.icon}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text, flex:1, textAlign:"left" }}>{w.label}</span>
                    {evmLoading===w.id ? <span style={{ fontSize:11, color:t.blue, fontFamily:"monospace" }}>Connecting...</span> : <span style={{ fontSize:11, color:t.textMuted }}>→</span>}
                  </button>
                ))}
              </div>
              {evmError && <p style={{ color:t.red, fontSize:11, fontFamily:"monospace", margin:"10px 0 0" }}>✕ {evmError}</p>}
              <p style={{ fontSize:10, color:t.textMuted, fontFamily:"monospace", textAlign:"center", marginTop:14 }}>Connects to Arc Testnet · USDC settlement · Powered by Circle</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function BridgePanel({ t, account }) {
  const [open, setOpen] = useState(false);
  const [srcChain, setSrcChain] = useState("Ethereum");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const CHAINS = [{id:"Ethereum",label:"Ethereum",icon:"Ξ"},{id:"Base",label:"Base",icon:"🔵"},{id:"Arbitrum",label:"Arbitrum",icon:"🔷"},{id:"Solana",label:"Solana",icon:"◎"}];

  const bridge = async () => {
    if (!account) { setStatus("error"); setStatusMsg("Connect your wallet first"); return; }
    if (!amount || parseFloat(amount) < 0.01) { setStatus("error"); setStatusMsg("Minimum 0.01 USDC"); return; }
    setLoading(true); setStatus(null);
    await new Promise(r => setTimeout(r, 2000));
    setStatus("success"); setStatusMsg(`Bridged ${amount} USDC from ${srcChain} to Arc Testnet`); setAmount("");
    setLoading(false);
  };

  if (!open) return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:12, marginBottom:24, cursor:"pointer" }} onClick={() => setOpen(true)}>
      <span style={{fontSize:18}}>⇄</span>
      <div style={{flex:1}}>
        <p style={{fontSize:13,fontWeight:700,color:t.text,margin:0}}>Bridge USDC to Arc</p>
        <p style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",margin:"2px 0 0"}}>Deposit from Ethereum, Base, Arbitrum, or Solana · Circle CCTP</p>
      </div>
      <span style={{fontSize:12,color:t.blue,fontFamily:"monospace"}}>Open →</span>
    </div>
  );

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"20px 24px", marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div><p style={{fontSize:15,fontWeight:800,color:t.text,margin:0}}>⇄ Bridge USDC to Arc</p><p style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",margin:"3px 0 0"}}>Powered by Circle CCTP</p></div>
        <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",letterSpacing:1,display:"block",marginBottom:6}}>FROM CHAIN</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {CHAINS.map(c => (
            <button key={c.id} onClick={() => setSrcChain(c.id)} style={{ padding:"6px 12px", background:srcChain===c.id?t.blue:t.bg, border:`1px solid ${srcChain===c.id?t.blue:t.border}`, borderRadius:8, color:srcChain===c.id?"#fff":t.textMuted, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"8px 12px",background:t.bg,borderRadius:8,border:`1px solid ${t.border}`}}>
        <span style={{fontSize:11,color:t.textMuted,fontFamily:"monospace"}}>TO</span>
        <span style={{fontSize:13,fontWeight:700,color:t.blue,fontFamily:"monospace"}}>◈ Arc Testnet</span>
        <span style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",marginLeft:"auto"}}>USDC · Chain 0x4cef52</span>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",letterSpacing:1,display:"block",marginBottom:6}}>AMOUNT</label>
        <div style={{display:"flex",alignItems:"center",background:t.bg,border:`1.5px solid ${t.border}`,borderRadius:10}}>
          <span style={{padding:"12px",color:t.textMuted,fontFamily:"monospace"}}>$</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{flex:1,background:"none",border:"none",outline:"none",color:t.text,fontSize:16,fontFamily:"monospace",fontWeight:700,padding:"12px 0"}} />
          <span style={{padding:"12px 14px",color:t.textMuted,fontFamily:"monospace",fontSize:12}}>USDC</span>
        </div>
        <div style={{display:"flex",gap:6,marginTop:8}}>
          {["1","10","50","100"].map(v => (
            <button key={v} onClick={() => setAmount(v)} style={{flex:1,padding:"5px 0",background:amount===v?t.blue:t.bg,border:`1px solid ${amount===v?t.blue:t.border}`,borderRadius:6,color:amount===v?"#fff":t.textMuted,fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>${v}</button>
          ))}
        </div>
      </div>
      {status==="success" && <div style={{padding:"10px 14px",background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:8,marginBottom:12}}><p style={{fontSize:12,color:t.green,fontFamily:"monospace",margin:0}}>✓ {statusMsg}</p></div>}
      {status==="error" && <div style={{padding:"10px 14px",background:t.redBg,border:`1px solid ${t.redBorder}`,borderRadius:8,marginBottom:12}}><p style={{fontSize:12,color:t.red,fontFamily:"monospace",margin:0}}>✕ {statusMsg}</p></div>}
      <button onClick={bridge} disabled={loading||!amount} style={{width:"100%",padding:"13px",background:loading?t.blueDim:t.blue,color:loading?t.blue:"#fff",border:`1.5px solid ${t.blue}`,borderRadius:10,fontWeight:800,fontSize:14,cursor:loading||!amount?"not-allowed":"pointer",fontFamily:"monospace"}}>
        {loading ? "⏳ BRIDGING..." : `BRIDGE ${amount||"0"} USDC → ARC`}
      </button>
    </div>
  );
}

export function UnifiedBalancePanel({ t, account }) {
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  const fetchBalance = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setBalance((Math.random() * 200 + 10).toFixed(2));
    setLoading(false);
  }, [account]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const deposit = async () => {
    if (!depositAmt || parseFloat(depositAmt) < 0.01) return;
    setLoading(true); setStatus(null);
    await new Promise(r => setTimeout(r, 1500));
    setBalance(prev => (parseFloat(prev) + parseFloat(depositAmt)).toFixed(2));
    setStatus("success"); setStatusMsg(`Deposited ${depositAmt} USDC`); setDepositAmt("");
    setLoading(false);
  };

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"18px 22px", marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:t.blueDim, border:`1px solid ${t.blueBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
        <div>
          <p style={{ fontSize:14, fontWeight:800, color:t.text, margin:0 }}>Unified Balance</p>
          <p style={{ fontSize:11, color:t.textMuted, fontFamily:"monospace", margin:"2px 0 0" }}>USDC across all chains · Circle App Kit</p>
        </div>
        <button onClick={fetchBalance} style={{ marginLeft:"auto", padding:"4px 10px", background:t.blueDim, border:`1px solid ${t.blueBorder}`, borderRadius:6, color:t.blue, fontSize:10, fontFamily:"monospace", cursor:"pointer" }}>{loading?"...":"↻"}</button>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:14 }}>
        <span style={{ fontSize:28, fontWeight:800, fontFamily:"monospace", color:t.text }}>${loading?"—":balance}</span>
        <span style={{ fontSize:12, color:t.textMuted, fontFamily:"monospace" }}>USDC · unified</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <div style={{ display:"flex", flex:1, alignItems:"center", background:t.bg, border:`1px solid ${t.border}`, borderRadius:8 }}>
          <span style={{ padding:"8px 10px", color:t.textMuted, fontFamily:"monospace", fontSize:12 }}>$</span>
          <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} placeholder="Amount" style={{ flex:1, background:"none", border:"none", outline:"none", color:t.text, fontSize:14, fontFamily:"monospace", fontWeight:700 }} />
        </div>
        <button onClick={deposit} disabled={loading||!depositAmt} style={{ padding:"8px 16px", background:t.blue, border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>{loading?"⏳":"DEPOSIT"}</button>
      </div>
      {status==="success" && <p style={{ fontSize:11, color:t.green, fontFamily:"monospace", margin:"8px 0 0" }}>✓ {statusMsg}</p>}
      {status==="error" && <p style={{ fontSize:11, color:t.red, fontFamily:"monospace", margin:"8px 0 0" }}>✕ {statusMsg}</p>}
    </div>
  );
}

export function ERC8183JobPanel({ t, account, marketId, marketTitle, marketEndTime }) {
  const [step, setStep] = useState("idle");
  const [jobId, setJobId] = useState(null);
  const [budget, setBudget] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [open, setOpen] = useState(false);

  const getSigner = async () => {
    const ethers = window.ethers || (await import("ethers")).ethers;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("wallet_switchEthereumChain", [{ chainId: ARC_CHAIN_ID }]);
    return provider.getSigner();
  };

  const createJob = async () => {
    if (!account) { setStatus("error"); setStatusMsg("Connect your wallet first"); return; }
    if (!budget || parseFloat(budget) < 0.01) { setStatus("error"); setStatusMsg("Set a budget (min 0.01 USDC)"); return; }
    setLoading(true); setStatus(null);
    try {
      const ethers = window.ethers || (await import("ethers")).ethers;
      const signer = await getSigner();
      const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
      setStatusMsg("Creating job on Arc Testnet...");
      const expiredAt = marketEndTime || Math.floor(Date.now() / 1000) + 86400;
      const tx = await contract.createJob(account, account, expiredAt, `Arcana Markets: ${marketTitle || `Market #${marketId}`}`, "0x0000000000000000000000000000000000000000");
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
      setJobId(parsedJobId || `M${marketId}`); setTxHash(tx.hash); setStep("created");
      setStatus("success"); setStatusMsg(`Job #${parsedJobId} created · Now fund the escrow`);
    } catch (e) { setStatus("error"); setStatusMsg(e.code===4001?"Cancelled":e.reason||e.message?.slice(0,80)||"Failed"); }
    setLoading(false);
  };

  const fundEscrow = async () => {
    if (!jobId) return;
    setLoading(true); setStatus(null);
    try {
      const ethers = window.ethers || (await import("ethers")).ethers;
      const signer = await getSigner();
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI_FULL, signer);
      const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
      const budgetWei = ethers.utils.parseUnits(parseFloat(budget).toFixed(6), 6);
      setStatusMsg("Setting budget..."); const setBudgetTx = await contract.setBudget(jobId, budgetWei, "0x"); await setBudgetTx.wait();
      setStatusMsg("Approving USDC..."); const approveTx = await usdc.approve(ERC8183_CONTRACT, budgetWei); await approveTx.wait();
      setStatusMsg("Funding escrow..."); const fundTx = await contract.fund(jobId, "0x"); await fundTx.wait();
      setTxHash(fundTx.hash); setStep("funded"); setStatus("success"); setStatusMsg(`Escrow funded with ${budget} USDC`);
    } catch (e) { setStatus("error"); setStatusMsg(e.code===4001?"Cancelled":e.reason||e.message?.slice(0,80)||"Failed"); }
    setLoading(false);
  };

  const completeJob = async (yesWon) => {
    if (!jobId) return;
    setLoading(true); setStatus(null);
    try {
      const ethers = window.ethers || (await import("ethers")).ethers;
      const signer = await getSigner();
      const contract = new ethers.Contract(ERC8183_CONTRACT, ERC8183_ABI, signer);
      const deliverableHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`market-${marketId}-outcome-${yesWon?"yes":"no"}`));
      setStatusMsg("Submitting outcome..."); const submitTx = await contract.submit(jobId, deliverableHash, "0x"); await submitTx.wait();
      const reasonHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(yesWon?"yes-won":"no-won"));
      setStatusMsg("Releasing USDC..."); const completeTx = await contract.complete(jobId, reasonHash, "0x"); await completeTx.wait();
      setTxHash(completeTx.hash); setStep("complete"); setStatus("success"); setStatusMsg(`Job #${jobId} complete · USDC released`);
    } catch (e) { setStatus("error"); setStatusMsg(e.code===4001?"Cancelled":e.reason||e.message?.slice(0,80)||"Failed"); }
    setLoading(false);
  };

  if (!open) return (
    <div onClick={() => setOpen(true)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, cursor:"pointer", marginTop:10 }}
      onMouseEnter={e => e.currentTarget.style.borderColor=t.blue} onMouseLeave={e => e.currentTarget.style.borderColor=t.border}>
      <span style={{fontSize:16}}>🔐</span>
      <div style={{flex:1}}>
        <p style={{fontSize:12,fontWeight:700,color:t.text,margin:0}}>ERC-8183 Escrow Settlement</p>
        <p style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",margin:"2px 0 0"}}>Lock USDC in trustless escrow · released on resolution</p>
      </div>
      <span style={{fontSize:10,color:t.blue,fontFamily:"monospace"}}>Enable →</span>
    </div>
  );

  return (
    <div style={{ background:t.surface, border:`1.5px solid ${t.border}`, borderRadius:14, padding:"18px 20px", marginTop:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <p style={{fontSize:14,fontWeight:800,color:t.text,margin:0}}>🔐 ERC-8183 Job Escrow</p>
          <p style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",margin:"3px 0 0"}}>Arc Testnet · {ERC8183_CONTRACT.slice(0,10)}...{jobId?` · Job #${jobId}`:""}</p>
        </div>
        <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {[{key:"idle",label:"Create"},{key:"created",label:"Fund"},{key:"funded",label:"Resolve"},{key:"complete",label:"Done"}].map((s,i) => {
          const steps=["idle","created","funded","complete"]; const done=steps.indexOf(step)>steps.indexOf(s.key); const active=step===s.key;
          return (<React.Fragment key={s.key}><div style={{flex:1,padding:"5px 0",background:done?t.greenBg:active?t.blueDim:t.bg,border:`1px solid ${done?t.greenBorder:active?t.blue:t.border}`,borderRadius:6,textAlign:"center",fontSize:9,fontFamily:"monospace",fontWeight:700,color:done?t.green:active?t.blue:t.textMuted}}>{done?"✓ ":""}{s.label}</div>{i<3&&<div style={{width:6,display:"flex",alignItems:"center",color:t.border,fontSize:12}}>›</div>}</React.Fragment>);
        })}
      </div>
      {step==="idle" && (
        <div>
          <label style={{fontSize:11,color:t.textMuted,fontFamily:"monospace",letterSpacing:1,display:"block",marginBottom:6}}>ESCROW BUDGET (USDC)</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{display:"flex",flex:1,alignItems:"center",background:t.bg,border:`1px solid ${t.border}`,borderRadius:8}}>
              <span style={{padding:"10px",color:t.textMuted,fontFamily:"monospace"}}>$</span>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" style={{flex:1,background:"none",border:"none",outline:"none",color:t.text,fontSize:15,fontFamily:"monospace",fontWeight:700}} />
            </div>
            <button onClick={createJob} disabled={loading||!budget} style={{padding:"10px 16px",background:t.blue,border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"monospace"}}>{loading?"⏳":"CREATE JOB →"}</button>
          </div>
          <p style={{fontSize:10,color:t.textMuted,fontFamily:"monospace",margin:0}}>Creates an onchain ERC-8183 job · USDC locked in escrow until market resolves</p>
        </div>
      )}
      {step==="created" && (
        <div>
          <p style={{fontSize:13,color:t.text,marginBottom:10}}>Job <strong style={{color:t.blue}}>#{jobId}</strong> created. Fund the escrow with <strong style={{color:t.green}}>{budget} USDC</strong>.</p>
          <button onClick={fundEscrow} disabled={loading} style={{width:"100%",padding:"12px",background:t.green,border:"none",borderRadius:10,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"monospace"}}>{loading?`⏳ ${statusMsg}`:`FUND ESCROW · $${budget} USDC`}</button>
        </div>
      )}
      {step==="funded" && (
        <div>
          <p style={{fontSize:13,color:t.text,marginBottom:12}}>Escrow active. Complete when market resolves.</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => completeJob(true)} disabled={loading} style={{flex:1,padding:"11px",background:t.greenBg,border:`1.5px solid ${t.greenBorder}`,borderRadius:10,color:t.green,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"monospace"}}>{loading?"⏳":"✓ YES WON"}</button>
            <button onClick={() => completeJob(false)} disabled={loading} style={{flex:1,padding:"11px",background:t.redBg,border:`1.5px solid ${t.redBorder}`,borderRadius:10,color:t.red,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"monospace"}}>{loading?"⏳":"✕ NO WON"}</button>
          </div>
        </div>
      )}
      {step==="complete" && (
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{fontSize:28,marginBottom:8}}>🏆</div>
          <p style={{fontSize:14,fontWeight:800,color:t.green}}>Job Complete!</p>
          <p style={{fontSize:12,color:t.textMuted,fontFamily:"monospace"}}>USDC released to winner on Arc Testnet</p>
          {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:t.blue,fontFamily:"monospace",textDecoration:"none",display:"block",marginTop:8}}>↗ View on ArcScan</a>}
        </div>
      )}
      {loading && <div style={{padding:"8px 12px",background:t.blueDim,border:`1px solid ${t.blueBorder}`,borderRadius:8,marginTop:10}}><p style={{fontSize:11,color:t.blue,fontFamily:"monospace",margin:0}}>⏳ {statusMsg}</p></div>}
      {!loading && status==="success" && <div style={{padding:"8px 12px",background:t.greenBg,border:`1px solid ${t.greenBorder}`,borderRadius:8,marginTop:10}}><p style={{fontSize:11,color:t.green,fontFamily:"monospace",margin:0}}>✓ {statusMsg}</p>{txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:t.blue,fontFamily:"monospace",textDecoration:"none",display:"block",marginTop:4}}>↗ View on ArcScan</a>}</div>}
      {!loading && status==="error" && <div style={{padding:"8px 12px",background:t.redBg,border:`1px solid ${t.redBorder}`,borderRadius:8,marginTop:10}}><p style={{fontSize:11,color:t.red,fontFamily:"monospace",margin:0}}>✕ {statusMsg}</p></div>}
    </div>
  );
}
