// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./AccessControl.sol";

/**
 * @title LiquidityPool v2
 * @notice Constant-product (x*y=k) AMM for tokenA/tokenB with a 0.3% fee and an LP ERC20.
 *         v2 adds slippage protection: swap(tokenIn, amountIn, minAmountOut) and a
 *         getAmountOut() quote view.
 */
contract LiquidityPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public tokenA;
    IERC20 public tokenB;
    AccessControl public accessControl;

    uint256 public reserveA;
    uint256 public reserveB;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 shares);
    event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);

    modifier notPaused() {
        require(!accessControl.paused(), "System Paused");
        _;
    }

    constructor(address _tokenA, address _tokenB, address _accessControl) ERC20("LP Token", "LPT") {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        accessControl = AccessControl(_accessControl);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external nonReentrant notPaused {
        require(amountA > 0 && amountB > 0, "Zero amount");

        uint256 shares;
        if (totalSupply() == 0) {
            shares = Math.sqrt(amountA * amountB);
        } else {
            shares = Math.min((amountA * totalSupply()) / reserveA, (amountB * totalSupply()) / reserveB);
        }
        require(shares > 0, "Zero shares minted");

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        _mint(msg.sender, shares);
        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB, shares);
    }

    function removeLiquidity(uint256 shares) external nonReentrant notPaused {
        require(shares > 0, "Zero shares");
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");

        uint256 amountA = (shares * reserveA) / totalSupply();
        uint256 amountB = (shares * reserveB) / totalSupply();

        _burn(msg.sender, shares);
        reserveA -= amountA;
        reserveB -= amountB;

        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, shares);
    }

    /// @notice Quote the output of swapping `amountIn` of `tokenIn` (0.3% fee included).
    function getAmountOut(address _tokenIn, uint256 _amountIn) public view returns (uint256) {
        require(_tokenIn == address(tokenA) || _tokenIn == address(tokenB), "Invalid token");
        bool isTokenA = _tokenIn == address(tokenA);
        uint256 reserveIn = isTokenA ? reserveA : reserveB;
        uint256 reserveOut = isTokenA ? reserveB : reserveA;
        if (_amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        uint256 amountInWithFee = _amountIn * 997;
        return (amountInWithFee * reserveOut) / ((reserveIn * 1000) + amountInWithFee);
    }

    function swap(address _tokenIn, uint256 _amountIn, uint256 _minAmountOut)
        external
        nonReentrant
        notPaused
        returns (uint256 amountOut)
    {
        require(_amountIn > 0, "Zero amount");
        amountOut = getAmountOut(_tokenIn, _amountIn);
        require(amountOut > 0, "Insufficient output");
        require(amountOut >= _minAmountOut, "Slippage");

        bool isTokenA = _tokenIn == address(tokenA);
        IERC20 tokenIn = isTokenA ? tokenA : tokenB;
        IERC20 tokenOut = isTokenA ? tokenB : tokenA;

        tokenIn.safeTransferFrom(msg.sender, address(this), _amountIn);
        tokenOut.safeTransfer(msg.sender, amountOut);

        if (isTokenA) {
            reserveA += _amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += _amountIn;
            reserveA -= amountOut;
        }

        emit Swap(msg.sender, _tokenIn, _amountIn, amountOut);
    }
}
