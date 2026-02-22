const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/* === Low-level helpers (re-exported for wallet auth pages) === */
export const api = {
  get: async (url: string) => {
    const res = await fetch(`${API_URL}${url}`, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    return { data: await res.json() };
  },
  post: async (url: string, body?: unknown) => {
    const res = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    return { data: await res.json() };
  },
};

export async function loginWithWallet(
  address: string,
  signature: string,
  name?: string,
  email?: string,
  role?: string
) {
  const res = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: address, signature, name, email }),
  });
  if (!res.ok) throw new ApiError(res.status, `Wallet login failed`);
  const data = await res.json();
  // Normalise the backend AuthResponse into the shape pages expect
  return {
    uid: data.wallet_address,
    wallet_address: data.wallet_address,
    name: data.name ?? null,
    email: data.email ?? null,
    role: role ?? 'BORROWER',
    token: data.token,
    created_at: data.created_at,
  };
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/* === SIMULATION API === */
export const simulationApi = {
  startSimulation: (opts?: { max_steps?: number; tick_delay?: number }) =>
    apiRequest('/api/simulation/start', {
      method: 'POST',
      body: JSON.stringify(opts ?? { max_steps: 200, tick_delay: 0.5 }),
    }),
  getStatus: () => apiRequest('/api/simulation/status'),
  getSummary: () => apiRequest('/api/simulation/summary'),
  pause: () => apiRequest('/api/simulation/pause', { method: 'POST' }),
  resume: () => apiRequest('/api/simulation/resume', { method: 'POST' }),
  stop: () => apiRequest('/api/simulation/stop', { method: 'POST' }),
  getTradeLog: (limit = 100) => apiRequest(`/api/sim/trade-log?limit=${limit}`),
  getActivityFeed: (limit = 50) => apiRequest(`/api/sim/activity-feed?limit=${limit}`),
  getPoolState: () => apiRequest('/api/sim/pool'),
  getLendingState: () => apiRequest('/api/sim/lending'),
  getFraudStats: () => apiRequest('/api/sim/fraud/stats'),
};

/* === MARKET DATA API (Real-time from CoinDesk) === */
export const marketApi = {
  getAllPrices: () => apiRequest('/agents-sim/market/prices'),
  getPrice: (symbol: string) => apiRequest(`/agents-sim/market/price/${symbol}`),
  getCondition: () => apiRequest('/agents-sim/market/condition'),
  getAll: () => apiRequest('/agents-sim/market/all'),
};

/* === AGENT API === */
export const agentApi = {
  listAgents: () => apiRequest('/api/agents'),
  getAgent: (id: string) => apiRequest(`/api/agents/${id}`),
  updateAgent: (id: string, data: any) =>
    apiRequest(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleAgent: (id: string, active: boolean) =>
    apiRequest(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ active }) }),
  getActivityFeed: () => apiRequest('/api/sim/activity-feed?limit=50'),
};

/* === LIQUIDITY API === */
export const liquidityApi = {
  getPoolData: () => apiRequest('/api/liquidity/pool'),
  getDepthChart: () => apiRequest('/api/liquidity/depth-chart'),
  getSlippageCurve: () => apiRequest('/api/liquidity/slippage-curve'),
  getEventLog: () => apiRequest('/api/liquidity/events'),
};

/* === LENDING API === */
export const lendingApi = {
  getBorrowers: () => apiRequest('/api/lending/borrowers'),
  getMetrics: () => apiRequest('/api/lending/metrics'),
  getCascadeEvents: () => apiRequest('/api/lending/cascade-events'),
  triggerLiquidation: (borrowerId: string) =>
    apiRequest('/api/lending/liquidate', {
      method: 'POST',
      body: JSON.stringify({ borrowerId }),
    }),
};

/* === THREAT API === */
export const threatApi = {
  getThreatScores: () => apiRequest('/api/threats/scores'),
  getAlerts: () => apiRequest('/api/threats/alerts'),
  resolveAlert: (alertId: string) =>
    apiRequest(`/api/threats/alerts/${alertId}/resolve`, { method: 'POST' }),
  simulateAttack: (type: string, params: any) =>
    apiRequest('/api/threats/simulate', {
      method: 'POST',
      body: JSON.stringify({ type, params }),
    }),
};

/* === CREDIT API === */
export const creditApi = {
  getLeaderboard: () => apiRequest('/api/credit/leaderboard'),
  getScoreDetails: (wallet: string) =>
    apiRequest(`/api/credit/scores/${wallet}`),
  getScoreHistory: (wallet: string) =>
    apiRequest(`/api/credit/scores/${wallet}/history`),
  getDynamicRates: () => apiRequest('/api/credit/dynamic-rates'),
};

/* === AUTH API (email/password) === */
export const authApi = {
  emailSignup: (name: string, email: string, password: string, role: string) =>
    apiRequest<{ uid: string; email: string; name: string; role: string; token: string }>(
      '/api/auth/email/signup',
      { method: 'POST', body: JSON.stringify({ name, email, password, role }) }
    ),
  emailLogin: (email: string, password: string) =>
    apiRequest<{ uid: string; email: string; name: string; role: string; token: string }>(
      '/api/auth/email/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
};

/* === AUDIT API === */
export const auditApi = {
  getLog: (filters?: any) =>
    apiRequest('/api/audit/log', {
      method: 'POST',
      body: JSON.stringify(filters),
    }),
  verifyEvent: (eventId: string) =>
    apiRequest(`/api/audit/verify/${eventId}`, { method: 'POST' }),
  exportReport: (format: 'csv' | 'json' | 'pdf') =>
    apiRequest(`/api/audit/export?format=${format}`),
  compareSimulations: (sim1Id: string, sim2Id: string) =>
    apiRequest(`/api/audit/compare`, {
      method: 'POST',
      body: JSON.stringify({ sim1Id, sim2Id }),
    }),
};

/* === PARTICIPANTS API === */
export const participantApi = {
  getAll: () => apiRequest<any[]>('/participants/'),
  getOne: (wallet: string) => apiRequest<any>(`/participants/${wallet}`),
  register: (wallet: string, role: string) =>
    apiRequest('/participants/register', {
      method: 'POST',
      body: JSON.stringify({ wallet, role }),
    }),
  delete: (wallet: string) =>
    apiRequest(`/participants/${wallet}`, { method: 'DELETE' }),
  getAdminsAuditors: () => apiRequest<any[]>('/auth/adminandauditor'),
  getBorrowers: () => apiRequest<any[]>('/api/auth/borrowers'),
  updateScore: (wallet: string, score: number) =>
    apiRequest(`/participants/${wallet}/score`, {
      method: 'PUT',
      body: JSON.stringify({ score }),
    }),
};

/* === WALLET API === */
export const walletApi = {
  connect: () => apiRequest('/api/wallet/connect', { method: 'POST' }),
  disconnect: () => apiRequest('/api/wallet/disconnect', { method: 'POST' }),
  getBalance: (address: string) =>
    apiRequest(`/api/wallet/balance/${address}`),
};

/* === TESTING API === */
export const testingApi = {
  // Liquidity Tests
  liquidity: {
    getPoolState: () => apiRequest('/api/liquidity/pool'),
    getSlippageCurve: () => apiRequest('/api/liquidity/slippage-curve'),
    getDepthChart: () => apiRequest('/api/liquidity/depth-chart'),
    stressTest: (scenario: string, magnitude: number) =>
      apiRequest('/pool/stress-test', {
        method: 'POST',
        body: JSON.stringify({ scenario, magnitude }),
      }),
  },
  // Lending Tests
  lending: {
    getBorrowers: () => apiRequest('/api/lending/borrowers'),
    getHealthFactor: (wallet: string) =>
      apiRequest(`/lending/health-factor/${wallet}`),
    getMetrics: () => apiRequest('/api/lending/metrics'),
    liquidate: (wallet: string) =>
      apiRequest(`/lending/liquidate/${wallet}`, { method: 'POST' }),
    cascadeSimulation: (priceDropPct: number) =>
      apiRequest('/lending/cascade-simulation', {
        method: 'POST',
        body: JSON.stringify({ price_drop_percentage: priceDropPct }),
      }),
  },
  // Agent Tests
  agents: {
    listAgents: () => apiRequest('/api/agents'),
    getActivityFeed: () => apiRequest('/api/agents/activity-feed'),
  },
  // Simulation Tests
  simulation: {
    start: (opts: { max_steps: number; tick_delay: number }) =>
      apiRequest('/api/simulation/start', {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
    getStatus: () => apiRequest('/api/simulation/status'),
    pause: () => apiRequest('/api/simulation/pause', { method: 'POST' }),
    resume: () => apiRequest('/api/simulation/resume', { method: 'POST' }),
    stop: () => apiRequest('/api/simulation/stop', { method: 'POST' }),
  },
  // Fraud/Threat Tests
  threats: {
    getAlerts: () => apiRequest('/api/threats/alerts'),
    getThreatScores: () => apiRequest('/api/threats/scores'),
    simulateScenario: (scenarioType: string) =>
      apiRequest('/api/threats/simulate', {
        method: 'POST',
        body: JSON.stringify({ scenario_type: scenarioType }),
      }),
  },
  // Credit Tests
  credit: {
    getLeaderboard: () => apiRequest('/api/credit/leaderboard'),
    getScore: (wallet: string) => apiRequest(`/api/credit/scores/${wallet}`),
    getHistory: (wallet: string) =>
      apiRequest(`/api/credit/scores/${wallet}/history`),
    getDynamicRates: () => apiRequest('/api/credit/dynamic-rates'),
  },
  // Market Data Tests
  market: {
    getAllPrices: () => apiRequest('/agents-sim/market/prices'),
    getPrice: (symbol: string) =>
      apiRequest(`/agents-sim/market/price/${symbol}`),
    getCondition: () => apiRequest('/agents-sim/market/condition'),
  },
};
