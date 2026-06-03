// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
// ArcanaMarkets v2
// Deploy on Arc Testnet — USDC: 0x3600000000000000000000000000000000000000
// ─────────────────────────────────────────────────────────────────────────────

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcanaMarkets {

    // ── Storage ───────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public admins;

    IERC20 public immutable usdc;

    struct Market {
        uint256 id;
        string  title;
        string  category;
        uint256 yesPool;   // total USDC staked YES (6 decimals)
        uint256 noPool;    // total USDC staked NO  (6 decimals)
        uint256 endTime;   // unix timestamp — no trades accepted after this
        bool    resolved;
        bool    cancelled;
        bool    yesWon;    // set on resolution
    }

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;

    // user stake amounts (USDC, 6 decimals)
    mapping(uint256 => mapping(address => uint256)) public yesShares;
    mapping(uint256 => mapping(address => uint256)) public noShares;

    // prevents double-claim / double-refund
    mapping(uint256 => mapping(address => bool)) public claimed;

    // ── Events ────────────────────────────────────────────────────────────────

    event MarketCreated  (uint256 indexed marketId, string title, string category, uint256 endTime);
    event SharesBought   (address indexed buyer, uint256 indexed marketId, bool isYes, uint256 usdcAmount, uint256 shares);
    event MarketResolved (uint256 indexed marketId, bool yesWon);
    event MarketCancelled(uint256 indexed marketId);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount);
    event AdminAdded     (address indexed admin);
    event AdminRemoved   (address indexed admin);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "ArcanaMarkets: not owner");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == owner || admins[msg.sender], "ArcanaMarkets: not admin");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    //
    // _usdc on Arc Testnet: 0x3600000000000000000000000000000000000000
    //
    constructor(address _usdc) {
        require(_usdc != address(0), "Zero USDC address");
        owner = msg.sender;
        usdc  = IERC20(_usdc);

        // Pre-authorised admins
        _addAdmin(0x3B4a7deb1274A6F802f45455c6A3998a1D8384d9);
        _addAdmin(0x89f9EAeF8CfF2fAfE0664b5944AD3197A74588Bf);
    }

    // ── Admin management (owner only) ─────────────────────────────────────────

    function addAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Zero address");
        _addAdmin(_admin);
    }

    function removeAdmin(address _admin) external onlyOwner {
        admins[_admin] = false;
        emit AdminRemoved(_admin);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Zero address");
        owner = _newOwner;
    }

    function _addAdmin(address _admin) internal {
        admins[_admin] = true;
        emit AdminAdded(_admin);
    }

    // ── Market creation (admin only) ─────────────────────────────────────────

    function createMarket(
        string memory _title,
        string memory _category,
        uint256 _endTime
    ) external onlyAdmin {
        require(bytes(_title).length > 0,       "Title required");
        require(_endTime > block.timestamp,      "End time must be future");

        marketCount++;
        markets[marketCount] = Market({
            id:        marketCount,
            title:     _title,
            category:  _category,
            yesPool:   0,
            noPool:    0,
            endTime:   _endTime,
            resolved:  false,
            cancelled: false,
            yesWon:    false
        });

        emit MarketCreated(marketCount, _title, _category, _endTime);
    }

    // ── Trading ───────────────────────────────────────────────────────────────

    function buyShares(
        uint256 _marketId,
        bool    _isYes,
        uint256 _usdcAmount
    ) external {
        Market storage m = markets[_marketId];
        require(m.id != 0,                        "Market does not exist");
        require(!m.resolved,                      "Market already resolved");
        require(!m.cancelled,                     "Market is cancelled");
        require(block.timestamp < m.endTime,      "Market has ended");
        require(_usdcAmount > 0,                  "Amount must be > 0");

        require(
            usdc.transferFrom(msg.sender, address(this), _usdcAmount),
            "USDC transfer failed"
        );

        if (_isYes) {
            m.yesPool                        += _usdcAmount;
            yesShares[_marketId][msg.sender] += _usdcAmount;
        } else {
            m.noPool                         += _usdcAmount;
            noShares[_marketId][msg.sender]  += _usdcAmount;
        }

        emit SharesBought(msg.sender, _marketId, _isYes, _usdcAmount, _usdcAmount);
    }

    // ── Resolution (admin only) ───────────────────────────────────────────────

    function resolveMarket(uint256 _marketId, bool _yesWon) external onlyAdmin {
        Market storage m = markets[_marketId];
        require(m.id != 0,      "Market does not exist");
        require(!m.resolved,    "Already resolved");
        require(!m.cancelled,   "Market is cancelled");

        m.resolved = true;
        m.yesWon   = _yesWon;

        emit MarketResolved(_marketId, _yesWon);
    }

    // ── Claiming ──────────────────────────────────────────────────────────────

    function claimWinnings(uint256 _marketId) external {
        Market storage m = markets[_marketId];
        require(m.resolved,                           "Not resolved yet");
        require(!m.cancelled,                         "Market is cancelled");
        require(!claimed[_marketId][msg.sender],      "Already claimed");

        uint256 userShares;
        uint256 winningPool;

        if (m.yesWon) {
            userShares   = yesShares[_marketId][msg.sender];
            winningPool  = m.yesPool;
        } else {
            userShares   = noShares[_marketId][msg.sender];
            winningPool  = m.noPool;
        }

        require(userShares > 0,   "No winning shares");
        require(winningPool > 0,  "Empty winning pool");

        uint256 totalPool = m.yesPool + m.noPool;
        uint256 payout    = (userShares * totalPool) / winningPool;

        claimed[_marketId][msg.sender] = true;
        require(usdc.transfer(msg.sender, payout), "USDC transfer failed");

        emit WinningsClaimed(_marketId, msg.sender, payout);
    }

    // ── Cancellation & refund (admin cancels, anyone refunds) ─────────────────

    function cancelMarket(uint256 _marketId) external onlyAdmin {
        Market storage m = markets[_marketId];
        require(m.id != 0,    "Market does not exist");
        require(!m.resolved,  "Already resolved");
        require(!m.cancelled, "Already cancelled");

        m.cancelled = true;
        emit MarketCancelled(_marketId);
    }

    function refund(uint256 _marketId) external {
        Market storage m = markets[_marketId];
        require(m.cancelled,                        "Market not cancelled");
        require(!claimed[_marketId][msg.sender],    "Already refunded");

        uint256 total = yesShares[_marketId][msg.sender]
                      + noShares[_marketId][msg.sender];
        require(total > 0, "Nothing to refund");

        claimed[_marketId][msg.sender] = true;
        require(usdc.transfer(msg.sender, total), "USDC transfer failed");
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// Returns implied probability as (yesOdds, noOdds) each in [0, 1_000_000].
    /// Defaults to 50/50 when pools are empty.
    function getMarketOdds(uint256 _marketId)
        external
        view
        returns (uint256 yesOdds, uint256 noOdds)
    {
        Market storage m = markets[_marketId];
        uint256 total = m.yesPool + m.noPool;
        if (total == 0) return (500_000, 500_000);
        yesOdds = (m.yesPool * 1_000_000) / total;
        noOdds  = 1_000_000 - yesOdds;
    }

    /// Convenience getter — same fields the public mapping exposes but
    /// returns the full struct including yesWon.
    function getMarket(uint256 _marketId) external view returns (Market memory) {
        return markets[_marketId];
    }

    /// Returns a user's stake in both sides of a market.
    function getPosition(uint256 _marketId, address _user)
        external
        view
        returns (uint256 yes, uint256 no)
    {
        return (yesShares[_marketId][_user], noShares[_marketId][_user]);
    }
}
