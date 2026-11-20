// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./AccessControl.sol";
import "./CollateralVault.sol";
import "./CreditRegistry.sol";
import "./interfaces/AggregatorV3Interface.sol";

/**
 * @title LendingPool v2
 * @notice ETH-collateralised PLDM money market.
 *
 *  - Lenders supply PLDM and receive interest-bearing shares (this contract is the
 *    "CashNet PLDM Supply" / cnPLDM ERC20). Share value = totalAssets / totalSupply,
 *    where totalAssets = cash + totalDebt.
 *  - Borrowers lock ETH in the CollateralVault and borrow PLDM (valued at $1) up to
 *    collateralUsd * maxLTV / 100. maxLTV comes from CreditRegistry.getMaxLTV
 *    (80/60/40/0 by credit score). The old per-user interest multiplier is NOT used:
 *    every borrower pays the same utilisation-based rate.
 *  - Interest: single global borrow index. Debt is stored as scaled debt;
 *    debt = scaledDebt * borrowIndex / 1e18. Annual rate = 5% + 15% * utilisation,
 *    utilisation = totalDebt / (cash + totalDebt). Accrued on every mutating call.
 *  - ETH price: Chainlink ETH/USD feed, normalised to 1e18, with a staleness window.
 *  - Liquidation: allowed when debt > collateralUsd * (maxLTV + 5) / 100 (any debt if
 *    maxLTV == 0). Close factor 50%, liquidator receives ETH worth repaid * 105%.
 *  - Identity / roles are intentionally not enforced for supply/borrow.
 */
contract LendingPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant BASE_RATE_BPS = 500; // 5% APR at 0% utilisation
    uint256 public constant SLOPE_RATE_BPS = 1500; // +15% APR at 100% utilisation
    uint256 public constant LIQUIDATION_BUFFER = 5; // percentage points above maxLTV
    uint256 public constant CLOSE_FACTOR_BPS = 5000; // max 50% of debt per liquidation
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5% collateral bonus

    AccessControl public accessControl;
    CollateralVault public vault;
    CreditRegistry public credit;
    IERC20 public borrowToken;

    AggregatorV3Interface public priceFeed;
    uint8 public priceFeedDecimals;
    uint256 public maxPriceAge;

    uint256 public borrowIndex = WAD;
    uint256 public lastAccrual;
    uint256 public totalScaledDebt;
    uint256 public cash; // PLDM held for lending (internal accounting; ignores donations)
    mapping(address => uint256) public scaledDebt;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 repaid, uint256 collateralSeized);
    event Supplied(address indexed lender, uint256 amount, uint256 shares);
    event Withdrawn(address indexed lender, uint256 amount, uint256 shares);
    event InterestAccrued(uint256 borrowIndex, uint256 totalDebt);
    event OracleUpdated(address feed, uint256 maxPriceAge);

    modifier notPaused() {
        require(!accessControl.paused(), "System Paused");
        _;
    }

    modifier onlyAdmin() {
        require(accessControl.hasRole(accessControl.ADMIN_ROLE(), msg.sender), "Not Admin");
        _;
    }

    constructor(
        address _accessControl,
        address _vault,
        address _credit,
        address _borrowToken,
        address _priceFeed,
        uint256 _maxPriceAge
    ) ERC20("CashNet PLDM Supply", "cnPLDM") {
        accessControl = AccessControl(_accessControl);
        vault = CollateralVault(_vault);
        credit = CreditRegistry(_credit);
        borrowToken = IERC20(_borrowToken);
        _setOracle(_priceFeed, _maxPriceAge);
        lastAccrual = block.timestamp;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setOracle(address _priceFeed, uint256 _maxPriceAge) external onlyAdmin {
        _setOracle(_priceFeed, _maxPriceAge);
    }

    function _setOracle(address _priceFeed, uint256 _maxPriceAge) internal {
        require(_priceFeed != address(0) && _maxPriceAge > 0, "Bad oracle config");
        priceFeed = AggregatorV3Interface(_priceFeed);
        priceFeedDecimals = AggregatorV3Interface(_priceFeed).decimals();
        require(priceFeedDecimals <= 18, "Bad feed decimals");
        maxPriceAge = _maxPriceAge;
        emit OracleUpdated(_priceFeed, _maxPriceAge);
    }

    // ─── Oracle ────────────────────────────────────────────────────────────

    /// @notice Latest feed answer normalised to 1e18 without the staleness check.
    function latestEthPrice() public view returns (uint256 price, uint256 updatedAt, bool isStale) {
        (, int256 answer,, uint256 _updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0) return (0, _updatedAt, true);
        price = uint256(answer) * (10 ** (18 - priceFeedDecimals));
        updatedAt = _updatedAt;
        isStale = _updatedAt == 0 || _updatedAt + maxPriceAge < block.timestamp;
    }

    /// @notice ETH/USD price (1e18 = $1). Reverts if the feed is invalid or stale.
    function getEthPrice() public view returns (uint256) {
        (uint256 price,, bool isStale) = latestEthPrice();
        require(price > 0, "Invalid price");
        require(!isStale, "Stale price");
        return price;
    }

    // ─── Interest ──────────────────────────────────────────────────────────

    function _rateBps(uint256 _cash, uint256 _debt) internal pure returns (uint256) {
        if (_debt == 0) return BASE_RATE_BPS;
        return BASE_RATE_BPS + (SLOPE_RATE_BPS * _debt) / (_cash + _debt);
    }

    function _currentIndex() internal view returns (uint256) {
        uint256 dt = block.timestamp - lastAccrual;
        if (dt == 0 || totalScaledDebt == 0) return borrowIndex;
        uint256 storedDebt = (totalScaledDebt * borrowIndex) / WAD;
        uint256 growth = (_rateBps(cash, storedDebt) * dt * WAD) / (BPS * SECONDS_PER_YEAR);
        return borrowIndex + (borrowIndex * growth) / WAD;
    }

    function accrueInterest() public {
        if (block.timestamp == lastAccrual) return;
        borrowIndex = _currentIndex();
        lastAccrual = block.timestamp;
        emit InterestAccrued(borrowIndex, totalBorrowed());
    }

    // ─── Lender side ───────────────────────────────────────────────────────

    function supply(uint256 amount) external nonReentrant notPaused returns (uint256 shares) {
        require(amount > 0, "Zero amount");
        accrueInterest();
        shares = convertToShares(amount);
        require(shares > 0, "Zero shares");
        borrowToken.safeTransferFrom(msg.sender, address(this), amount);
        cash += amount;
        _mint(msg.sender, shares);
        emit Supplied(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant notPaused returns (uint256 amount) {
        require(shares > 0, "Zero shares");
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");
        accrueInterest();
        amount = convertToAssets(shares);
        require(amount > 0, "Zero amount");
        require(amount <= cash, "Insufficient liquidity");
        _burn(msg.sender, shares);
        cash -= amount;
        borrowToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, shares);
    }

    // ─── Borrower side ─────────────────────────────────────────────────────

    function depositCollateral() external payable nonReentrant notPaused {
        require(msg.value > 0, "Zero amount");
        vault.lockCollateral{value: msg.value}(msg.sender);
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant notPaused {
        require(amount > 0, "Zero amount");
        accrueInterest();
        uint256 collateral = vault.ethCollateral(msg.sender);
        require(amount <= collateral, "Insufficient collateral");
        uint256 debt = getUserDebt(msg.sender);
        if (debt > 0) {
            uint256 maxLtv = credit.getMaxLTV(msg.sender);
            uint256 newValue = ((collateral - amount) * getEthPrice()) / WAD;
            require(debt * 100 <= newValue * maxLtv, "Exceeds LTV limit");
        }
        vault.releaseCollateral(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function borrow(uint256 amount) external nonReentrant notPaused {
        require(amount > 0, "Zero amount");
        accrueInterest();
        uint256 maxLtv = credit.getMaxLTV(msg.sender);
        require(maxLtv > 0, "Credit score too low");
        require(amount <= cash, "Not enough liquidity");
        uint256 newDebt = getUserDebt(msg.sender) + amount;
        require(newDebt * 100 <= _collateralValue(msg.sender, getEthPrice()) * maxLtv, "Exceeds LTV limit");

        uint256 scaled = Math.mulDiv(amount, WAD, borrowIndex, Math.Rounding.Ceil);
        scaledDebt[msg.sender] += scaled;
        totalScaledDebt += scaled;
        cash -= amount;

        borrowToken.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Repay debt. Amounts above the current debt are capped, so
    ///         type(uint256).max repays everything (approve slightly more than the debt).
    function repay(uint256 amount) external nonReentrant notPaused returns (uint256 repaid) {
        accrueInterest();
        repaid = _repay(msg.sender, msg.sender, amount);
        emit Repaid(msg.sender, repaid);
    }

    function liquidate(address user, uint256 repayAmount)
        external
        nonReentrant
        notPaused
        returns (uint256 repaid, uint256 seized)
    {
        accrueInterest();
        uint256 debt = getUserDebt(user);
        require(debt > 0, "No debt");
        uint256 price = getEthPrice();
        require(_isLiquidatable(user, debt, price), "Health factor OK");

        uint256 maxRepay = (debt * CLOSE_FACTOR_BPS) / BPS;
        if (maxRepay == 0) maxRepay = debt;
        if (repayAmount > maxRepay) repayAmount = maxRepay;
        require(repayAmount > 0, "Zero amount");

        seized = (repayAmount * (BPS + LIQUIDATION_BONUS_BPS) * WAD) / (BPS * price);
        uint256 collateral = vault.ethCollateral(user);
        if (seized > collateral) seized = collateral;

        repaid = _repay(user, msg.sender, repayAmount);
        if (seized > 0) vault.seizeCollateral(user, msg.sender, seized);
        emit Liquidated(user, msg.sender, repaid, seized);
    }

    function _repay(address user, address payer, uint256 amount) internal returns (uint256) {
        uint256 debt = getUserDebt(user);
        require(debt > 0, "No debt");
        require(amount > 0, "Zero amount");
        if (amount > debt) amount = debt;

        uint256 scaled = amount == debt ? scaledDebt[user] : (amount * WAD) / borrowIndex;
        if (scaled > scaledDebt[user]) scaled = scaledDebt[user];

        borrowToken.safeTransferFrom(payer, address(this), amount);
        cash += amount;
        scaledDebt[user] -= scaled;
        totalScaledDebt -= scaled;
        return amount;
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    function _collateralValue(address user, uint256 price) internal view returns (uint256) {
        return (vault.ethCollateral(user) * price) / WAD;
    }

    function _isLiquidatable(address user, uint256 debt, uint256 price) internal view returns (bool) {
        if (debt == 0) return false;
        uint256 maxLtv = credit.getMaxLTV(user);
        if (maxLtv == 0) return true;
        return debt * 100 > _collateralValue(user, price) * (maxLtv + LIQUIDATION_BUFFER);
    }

    /// @notice Current debt (principal + interest) of `user`, including un-accrued interest.
    function getUserDebt(address user) public view returns (uint256) {
        uint256 s = scaledDebt[user];
        if (s == 0) return 0;
        return Math.mulDiv(s, _currentIndex(), WAD, Math.Rounding.Ceil);
    }

    /// @notice Total outstanding debt across all borrowers (incl. un-accrued interest).
    function totalBorrowed() public view returns (uint256) {
        return (totalScaledDebt * _currentIndex()) / WAD;
    }

    /// @notice cash + totalBorrowed: what all cnPLDM shares are worth in PLDM.
    function totalAssets() public view returns (uint256) {
        return cash + totalBorrowed();
    }

    function getAvailableLiquidity() external view returns (uint256) {
        return cash;
    }

    /// @notice Borrow APR in basis points (500 = 5.00%).
    function getBorrowRateBps() public view returns (uint256) {
        return _rateBps(cash, totalBorrowed());
    }

    /// @notice Supply APR in basis points (borrow rate * utilisation).
    function getSupplyRateBps() external view returns (uint256) {
        uint256 debt = totalBorrowed();
        if (debt == 0) return 0;
        return (getBorrowRateBps() * debt) / (cash + debt);
    }

    /// @notice Utilisation in basis points.
    function getUtilizationBps() external view returns (uint256) {
        uint256 debt = totalBorrowed();
        if (debt == 0) return 0;
        return (debt * BPS) / (cash + debt);
    }

    /// @notice Borrow APR as a whole percentage (e.g. 5 = 5%), kept for backwards compatibility.
    function getCurrentInterestRate() external view returns (uint256) {
        return getBorrowRateBps() / 100;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply_ = totalSupply();
        uint256 assets_ = totalAssets();
        if (supply_ == 0 || assets_ == 0) return assets;
        return (assets * supply_) / assets_;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply_ = totalSupply();
        if (supply_ == 0) return shares;
        return (shares * totalAssets()) / supply_;
    }

    /// @notice PLDM value of one whole cnPLDM share, scaled by 1e18.
    function exchangeRate() external view returns (uint256) {
        return convertToAssets(WAD);
    }

    function balanceOfUnderlying(address lender) external view returns (uint256) {
        return convertToAssets(balanceOf(lender));
    }

    function isLiquidatable(address user) external view returns (bool) {
        (uint256 price,,) = latestEthPrice();
        return _isLiquidatable(user, getUserDebt(user), price);
    }

    /**
     * @notice Snapshot of a borrower position (uses the latest feed price even if stale).
     * @return collateralEth  ETH locked in the vault (wei)
     * @return collateralUsd  collateral value in USD (1e18 = $1)
     * @return debt           current debt in PLDM (1e18 = 1 PLDM)
     * @return maxLtv         max LTV percent from CreditRegistry
     * @return healthFactor   collateralUsd*(maxLtv+5)/100 / debt, 1e18-scaled; < 1e18 means
     *                        liquidatable; type(uint256).max when debt == 0; 0 when maxLtv == 0
     * @return maxBorrowable  additional PLDM borrowable now (LTV headroom, capped by pool cash)
     */
    function getAccountData(address user)
        external
        view
        returns (
            uint256 collateralEth,
            uint256 collateralUsd,
            uint256 debt,
            uint256 maxLtv,
            uint256 healthFactor,
            uint256 maxBorrowable
        )
    {
        (uint256 price,,) = latestEthPrice();
        collateralEth = vault.ethCollateral(user);
        collateralUsd = (collateralEth * price) / WAD;
        debt = getUserDebt(user);
        maxLtv = credit.getMaxLTV(user);

        if (debt == 0) {
            healthFactor = type(uint256).max;
        } else if (maxLtv == 0) {
            healthFactor = 0;
        } else {
            healthFactor = (collateralUsd * (maxLtv + LIQUIDATION_BUFFER) * WAD) / (100 * debt);
        }

        uint256 limit = (collateralUsd * maxLtv) / 100;
        maxBorrowable = limit > debt ? limit - debt : 0;
        if (maxBorrowable > cash) maxBorrowable = cash;
    }
}
