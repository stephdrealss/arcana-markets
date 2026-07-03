# AI-only markets conversion — tomorrow's plan

Branch: `ai-only-conversion` (pushed, not merged to `main` — `main` still auto-deploys, untouched).

## Status as of tonight
- Frontend/API code changes are done and committed on this branch: Markets page is now
  AI-Markets-only, the two unresolvable "FIFA Club World Cup 2026" markets (ids 77/78)
  are removed from the frontend and seed scripts, and the 9 new World Cup 2026 markets
  (with resolution criteria) are staged in `src/App.js` with **provisional ids 80-88**.
- The on-chain side is blocked: the contract at `0x443a47eF1025e047879b1BA08c94e6dedB354D54`
  is the **old v1 single-owner contract**, not the v2 multi-admin contract in
  `contracts/ArcanaMarkets.sol`. Neither the new Circle agent wallet
  (`0xae5cf800d8c7a95c5b2bb169a01196bdb30aaa8b`) nor the existing admin wallet
  (`0x89f9EAeF8CfF2fAfE0664b5944AD3197A74588Bf`) can create/cancel markets on it —
  only the real owner (`0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9`, your MetaMask) can.
- `.env.vercel.tmp` (empty placeholder pull, Circle keys are marked sensitive/write-only
  in Vercel) has been deleted.

## Tomorrow's steps
1. **Deploy the v2 contract** from `contracts/ArcanaMarkets.sol` using
   `tools/deploy-v2.html` — open it directly in a browser, connect MetaMask
   (the owner wallet), it switches to Arc Testnet and deploys with the USDC address
   pre-filled. Never touches a private key file — MetaMask signs everything.
2. **Add the agent wallet as admin** on the new contract — same tool, step 3
   ("Add admin"), pre-filled with `0xae5cf800d8c7a95c5b2bb169a01196bdb30aaa8b`.
   There's also a read-only "Check admin status" button to confirm before moving on.
3. **Repoint the app + scripts to the new contract address** — replace
   `0x443a47eF1025e047879b1BA08c94e6dedB354D54` in:
   - `src/App.js` (`CONTRACT_ADDRESS`)
   - `scripts/seedWorldCup2026.js` (`CONTRACT`)
   - `scripts/createWorldCupMarkets.ts`, `api/create-wc-markets-today.js`,
     `api/create-markets.js`, `api/generate-markets.js` (all hardcode the same address)
4. **Re-run `npm run seed:worldcup`** (`scripts/seedWorldCup2026.js`) — now that the
   agent wallet is admin, it should cancel markets 77/78 and create the 9 new markets
   without needing the owner key each time. Reconcile the real on-chain ids it reports
   back into `src/App.js` (replacing the provisional 80-88 placeholders).
5. **Review everything together, then merge `ai-only-conversion` → `main`** (which
   triggers the Vercel auto-deploy) — do not push to `main` before this review.

## Notes / open items
- The two Round of 16 markets (USA–Belgium, Mexico–England) used an assumed
  noon ET kickoff since no exact time was given — confirm real kickoff times and
  adjust `closeTime` in `src/App.js` before go-live.
- `.env.local` and Vercel's `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET` are not
  gitignored (only `node_modules` is in `.gitignore`) — worth tightening separately.
