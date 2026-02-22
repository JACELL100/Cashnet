"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, TrendingUp, Activity, Zap } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://cash-net.onrender.com";

interface BlockchainTransaction {
  tx_hash: string;
  contract: string;
  function: string;
  args: Record<string, any>;
  block_number: number;
  gas_used: number;
  status: string;
}

interface BlockchainStats {
  connected: boolean;
  contracts_loaded: boolean;
  current_block: number;
  total_txs: number;
  on_chain_txs: number;
  simulated_txs: number;
  by_contract: Record<string, number>;
  total_gas_used: number;
  contract_addresses: Record<string, string>;
  token_contracts: Record<string, string>;
  real_txs_enabled: boolean;
}

interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

export default function BlockchainMonitorPage() {
  const [transactions, setTransactions] = useState<BlockchainTransaction[]>([]);
  const [stats, setStats] = useState<BlockchainStats | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenInfo>>({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchBlockchainData = async () => {
    try {
      // Fetch transactions
      const txResponse = await fetch(`${API_URL}/blockchain/transactions?limit=100`);
      const txData = await txResponse.json();
      if (txData.success) {
        setTransactions(txData.transactions);
      }

      // Fetch stats
      const statsResponse = await fetch(`${API_URL}/blockchain/stats`);
      const statsData = await statsResponse.json();
      if (statsData.success) {
        setStats(statsData);
      }

      // Fetch token info
      const tokenResponse = await fetch(`${API_URL}/blockchain/tokens/info`);
      const tokenData = await tokenResponse.json();
      if (tokenData.success) {
        setTokens(tokenData.tokens);
      }

      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch blockchain data:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchBlockchainData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getContractColor = (contract: string) => {
    const colors: Record<string, string> = {
      LiquidityPool: "bg-blue-500",
      LendingPool: "bg-purple-500",
      CreditRegistry: "bg-green-500",
      CollateralVault: "bg-orange-500",
      SecurityAudit: "bg-red-500",
      ScenarioRegistry: "bg-pink-500",
    };
    return colors[contract] || "bg-gray-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading blockchain data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Blockchain Monitor</h1>
          <p className="text-(--muted-foreground)">
            Real-time on-chain transaction tracking with Palladium & Badassium tokens
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="h-4 w-4 mr-2" />
            {autoRefresh ? "Auto-Refresh On" : "Auto-Refresh Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchBlockchainData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Network Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.connected ? (
                <span className="text-green-500">● Connected</span>
              ) : (
                <span className="text-red-500">● Disconnected</span>
              )}
            </div>
            <p className="text-xs text-(--muted-foreground) mt-1">
              Block #{stats?.current_block || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_txs || 0}</div>
            <p className="text-xs text-(--muted-foreground) mt-1">
              {stats?.on_chain_txs || 0} on-chain, {stats?.simulated_txs || 0} simulated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gas Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((stats?.total_gas_used || 0) / 1000000).toFixed(2)}M
            </div>
            <p className="text-xs text-(--muted-foreground) mt-1">Total gas consumed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Real TXs Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.real_txs_enabled ? (
                <span className="text-green-500">✓ Yes</span>
              ) : (
                <span className="text-yellow-500">○ No</span>
              )}
            </div>
            <p className="text-xs text-(--muted-foreground) mt-1">
              {stats?.real_txs_enabled ? "Recording on-chain" : "Simulation only"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Token Information */}
      <Card>
        <CardHeader>
          <CardTitle>Deployed Tokens</CardTitle>
          <CardDescription>Custom ERC20 tokens used in simulations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(tokens).map((token) => (
              <div key={token.symbol} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{token.symbol}</h3>
                    <p className="text-sm text-(--muted-foreground)">
                      Decimals: {token.decimals}
                    </p>
                  </div>
                  <Zap className="h-5 w-5 text-yellow-500" />
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-(--muted) px-2 py-1 rounded flex-1 truncate">
                    {token.address}
                  </code>
                  <a
                    href={`https://sepolia.etherscan.io/token/${token.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transactions by Contract */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions by Contract</CardTitle>
          <CardDescription>Distribution of recorded transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats?.by_contract &&
              Object.entries(stats.by_contract).map(([contract, count]) => (
                <div key={contract} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getContractColor(contract)}`} />
                    <span className="font-medium">{contract}</span>
                  </div>
                  <Badge variant="outline">{count} txs</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Latest {transactions.length} blockchain interactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.slice(0, 50).map((tx, idx) => (
              <div
                key={`${tx.tx_hash}-${idx}`}
                className="border rounded-lg p-4 hover:bg-(--muted) transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getContractColor(tx.contract)}>{tx.contract}</Badge>
                    <Badge variant="outline">{tx.function}</Badge>
                    <Badge className={`${getStatusColor(tx.status)} text-white`}>
                      {tx.status}
                    </Badge>
                    {tx.args.on_chain && (
                      <Badge variant="default" className="bg-green-600">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        On-Chain
                      </Badge>
                    )}
                  </div>
                  <div className="text-right text-sm text-(--muted-foreground)">
                    <div>Block #{tx.block_number}</div>
                    <div>{(tx.gas_used / 1000).toFixed(1)}k gas</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <code className="text-xs bg-(--muted) px-2 py-1 rounded flex-1 truncate">
                    {tx.tx_hash}
                  </code>
                  {tx.tx_hash.startsWith("0x") && tx.tx_hash.length === 66 && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${tx.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>

                {/* Transaction Details */}
                <div className="text-xs space-y-1 text-(--muted-foreground)">
                  {tx.args.agent_id && <div>Agent: {tx.args.agent_id}</div>}
                  {tx.args.token_in && tx.args.token_out && (
                    <div>
                      Swap: {tx.args.amount_in} {tx.args.token_in} → {tx.args.amount_out}{" "}
                      {tx.args.token_out} ({tx.args.price_impact_pct?.toFixed(2)}% impact)
                    </div>
                  )}
                  {tx.args.liquidator && (
                    <div>
                      Liquidation: {tx.args.liquidator} → {tx.args.target} (
                      {tx.args.debt_covered} debt covered)
                    </div>
                  )}
                  {tx.args.scenario && (
                    <div>
                      Scenario: {tx.args.scenario} - {tx.args.phase} ({tx.args.severity})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {transactions.length === 0 && (
            <div className="text-center py-12 text-(--muted-foreground)">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions yet. Start a simulation to see blockchain activity.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
