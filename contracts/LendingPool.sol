// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AccessControl.sol";
import "./CollateralVault.sol";
import "./CreditRegistry.sol";

contract LendingPool {
    AccessControl public accessControl;
    CollateralVault public vault;
    CreditRegistry public credit;
    IERC20 public borrowToken;

    uint256 public totalBorrowed;
    uint256 public constant MOCK_ETH_PRICE = 2000e18; 

    struct Loan {
        uint256 amount;
        uint256 interestAccrued;
        uint256 lastUpdateTimestamp;
    }

    mapping(address => Loan) public loans;

    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtRecovered);

    constructor(address _accessControl, address _vault, address _credit, address _borrowToken) {
        accessControl = AccessControl(_accessControl);
        vault = CollateralVault(_vault);
        credit = CreditRegistry(_credit);
        borrowToken = IERC20(_borrowToken);
    }

    function getCurrentInterestRate() public view returns (uint256) {
        uint256 poolBalance = borrowToken.balanceOf(address(this));
        if (poolBalance == 0 && totalBorrowed == 0) return 5;
        
        uint256 utilizationRatio = (totalBorrowed * 100) / (poolBalance + totalBorrowed);
        return 5 + ((utilizationRatio * 15) / 100);
    }

    function depositCollateral() external payable {
        require(!accessControl.paused(), "System Paused");
        vault.lockCollateral{value: msg.value}(msg.sender);
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function borrow(uint256 amount) external {
        require(!accessControl.paused(), "System Paused");
        // Removed BORROWER_ROLE check - anyone with sufficient collateral and credit can borrow

        _updateInterest(msg.sender);

        uint256 maxLtv = credit.getMaxLTV(msg.sender);
        require(maxLtv > 0, "Credit score too low");

        uint256 collateralValue = (vault.ethCollateral(msg.sender) * MOCK_ETH_PRICE) / 1e18;
        uint256 maxBorrow = (collateralValue * maxLtv) / 100;

        require(loans[msg.sender].amount + amount <= maxBorrow, "Exceeds LTV limit");
        require(borrowToken.balanceOf(address(this)) >= amount, "Not enough liquidity");

        loans[msg.sender].amount += amount;
        totalBorrowed += amount;

        borrowToken.transfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external {
        require(!accessControl.paused(), "System Paused");
        _updateInterest(msg.sender);

        uint256 totalDebt = loans[msg.sender].amount + loans[msg.sender].interestAccrued;
        require(amount <= totalDebt, "Overpayment");

        borrowToken.transferFrom(msg.sender, address(this), amount);

        if (amount >= loans[msg.sender].interestAccrued) {
            uint256 principalRepaid = amount - loans[msg.sender].interestAccrued;
            loans[msg.sender].interestAccrued = 0;
            loans[msg.sender].amount -= principalRepaid;
            totalBorrowed -= principalRepaid;
        } else {
            loans[msg.sender].interestAccrued -= amount;
        }

        emit Repaid(msg.sender, amount);
    }

    function liquidate(address user) external {
        require(!accessControl.paused(), "System Paused");
        _updateInterest(user);

        uint256 maxLtv = credit.getMaxLTV(user);
        uint256 collateralValue = (vault.ethCollateral(user) * MOCK_ETH_PRICE) / 1e18;
        uint256 liquidationThreshold = (collateralValue * (maxLtv + 5)) / 100; 

        uint256 totalDebt = loans[user].amount + loans[user].interestAccrued;
        require(totalDebt > liquidationThreshold, "Health factor OK");

        uint256 ethToSeize = (totalDebt * 1e18) / MOCK_ETH_PRICE;
        
        borrowToken.transferFrom(msg.sender, address(this), totalDebt);
        
        totalBorrowed -= loans[user].amount;
        delete loans[user];

        vault.seizeCollateral(user, msg.sender, ethToSeize);

        emit Liquidated(user, msg.sender, totalDebt);
    }

    function _updateInterest(address user) internal {
        if (loans[user].amount > 0) {
            uint256 timeElapsed = block.timestamp - loans[user].lastUpdateTimestamp;
            uint256 baseRate = getCurrentInterestRate();
            uint256 userRate = (baseRate * credit.getInterestMultiplier(user)) / 100;
            
            uint256 newInterest = (loans[user].amount * userRate * timeElapsed) / (100 * 31536000);
            loans[user].interestAccrued += newInterest;
        }
        loans[user].lastUpdateTimestamp = block.timestamp;
    }
}