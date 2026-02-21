// Project Context for Voice Agent
// This file contains all the information about the CashNet platform

export interface PageRoute {
  path: string;
  keywords: string[];
  description: string;
  role?: string[];
}

export interface Feature {
  name: string;
  description: string;
  howToUse: string;
  relatedRoutes: string[];
}

export const PROJECT_INFO = {
  name: 'CashNet',
  tagline: 'Institutional DeFi Risk Simulation Platform',
  description: `CashNet is a decentralized finance (DeFi) platform that enables lending, borrowing, 
    and liquidity provisioning on the blockchain. It features advanced risk simulation, 
    fraud detection, and AI-powered trading agents for institutional users.`,
  
  roles: {
    ADMIN: {
      description: 'Full platform access, manage users, configure system settings, monitor agents and threats',
      capabilities: ['Manage all users', 'View system analytics', 'Configure settings', 'Monitor AI agents', 'View threat detection'],
      loginPath: '/admin/login',
      signupPath: '/admin/signup',
      dashboardPath: '/admin',
    },
    AUDITOR: {
      description: 'Review transactions, verify compliance, audit smart contracts',
      capabilities: ['Audit transactions', 'Verify compliance', 'Review smart contracts', 'Generate reports'],
      loginPath: '/auditor/login',
      signupPath: '/auditor/signup',
      dashboardPath: '/auditor',
    },
    LENDER: {
      description: 'Provide liquidity, earn interest, manage lending pools',
      capabilities: ['Deposit funds', 'Earn interest', 'Manage lending positions', 'View analytics'],
      loginPath: '/lender/login',
      signupPath: '/lender/signup',
      dashboardPath: '/lender',
    },
    BORROWER: {
      description: 'Access credit, manage loans, track collateral health',
      capabilities: ['Borrow funds', 'Deposit collateral', 'Repay loans', 'Check health factor'],
      loginPath: '/login?role=BORROWER',
      signupPath: '/signup?role=BORROWER',
      dashboardPath: '/dashboard',
    },
  },
};

export const ROUTES: PageRoute[] = [
  // Landing & Auth
  { path: '/', keywords: ['home', 'landing', 'main', 'start', 'beginning'], description: 'Main landing page with role selection' },
  { path: '/login', keywords: ['login', 'sign in', 'signin', 'access', 'enter'], description: 'Login page for borrowers' },
  { path: '/signup', keywords: ['signup', 'sign up', 'register', 'create account', 'join'], description: 'Registration page for borrowers' },
  
  // Admin Routes
  { path: '/admin', keywords: ['admin', 'administrator', 'admin dashboard', 'management'], description: 'Admin dashboard overview', role: ['ADMIN'] },
  { path: '/admin/login', keywords: ['admin login', 'administrator login'], description: 'Admin login page', role: ['ADMIN'] },
  { path: '/admin/signup', keywords: ['admin signup', 'admin register'], description: 'Admin registration page', role: ['ADMIN'] },
  { path: '/admin/agents', keywords: ['agents', 'ai agents', 'bots', 'trading bots', 'arbitrage', 'whale', 'mev'], description: 'AI trading agents management and monitoring', role: ['ADMIN'] },
  { path: '/admin/liquidity', keywords: ['liquidity', 'liquidity pool', 'amm', 'pool management', 'reserves'], description: 'Liquidity pool management and analytics', role: ['ADMIN'] },
  { path: '/admin/threats', keywords: ['threats', 'security', 'fraud', 'attacks', 'risk', 'danger'], description: 'Threat detection and security monitoring', role: ['ADMIN'] },
  
  // Auditor Routes
  { path: '/auditor', keywords: ['auditor', 'audit', 'auditor dashboard'], description: 'Auditor dashboard', role: ['AUDITOR'] },
  { path: '/auditor/login', keywords: ['auditor login'], description: 'Auditor login page', role: ['AUDITOR'] },
  { path: '/auditor/signup', keywords: ['auditor signup', 'auditor register'], description: 'Auditor registration page', role: ['AUDITOR'] },
  
  // Lender Routes
  { path: '/lender', keywords: ['lender', 'lender dashboard', 'lending'], description: 'Lender dashboard overview', role: ['LENDER'] },
  { path: '/lender/login', keywords: ['lender login'], description: 'Lender login page', role: ['LENDER'] },
  { path: '/lender/signup', keywords: ['lender signup', 'lender register'], description: 'Lender registration page', role: ['LENDER'] },
  { path: '/lender/lending', keywords: ['lending', 'deposit', 'provide liquidity', 'earn interest', 'lend money'], description: 'Lending operations and position management', role: ['LENDER'] },
  
  // Borrower Routes (Dashboard)
  { path: '/dashboard', keywords: ['dashboard', 'borrower dashboard', 'my dashboard'], description: 'Borrower dashboard overview', role: ['BORROWER'] },
  { path: '/dashboard/credit', keywords: ['credit', 'credit score', 'creditworthiness', 'score'], description: 'Credit score and history', role: ['BORROWER'] },
  { path: '/dashboard/identity', keywords: ['identity', 'kyc', 'verification', 'profile verification'], description: 'Identity verification and KYC', role: ['BORROWER'] },
  { path: '/dashboard/profile', keywords: ['profile', 'my profile', 'account', 'settings'], description: 'User profile and settings', role: ['BORROWER'] },
];

export const FEATURES: Feature[] = [
  {
    name: 'Lending & Borrowing',
    description: 'Borrow funds against collateral or lend your assets to earn interest. The platform uses smart contracts to ensure secure and transparent transactions.',
    howToUse: 'As a borrower, deposit collateral and borrow up to your credit limit. As a lender, deposit funds into lending pools to earn interest.',
    relatedRoutes: ['/dashboard', '/lender/lending', '/dashboard/credit'],
  },
  {
    name: 'Liquidity Engine',
    description: 'An Automated Market Maker (AMM) that manages liquidity pools. Features ML-powered rate optimization and dynamic fee adjustment.',
    howToUse: 'Admins can monitor pool health, adjust parameters, and run simulations. Lenders can add liquidity to earn fees.',
    relatedRoutes: ['/admin/liquidity', '/lender/lending'],
  },
  {
    name: 'AI Trading Agents',
    description: 'Intelligent agents including Arbitrage Bots, Whale Agents, MEV Bots, Liquidator Bots, and Retail Traders that simulate real market conditions.',
    howToUse: 'Admins can view agent activity, configure parameters, and analyze their impact on the platform.',
    relatedRoutes: ['/admin/agents'],
  },
  {
    name: 'Threat Detection',
    description: 'Real-time monitoring for fraud, attacks, and suspicious activity. Includes cascade risk analysis and attacker agent simulation.',
    howToUse: 'Admins and auditors can view alerts, analyze threats, and take action to protect the platform.',
    relatedRoutes: ['/admin/threats', '/auditor'],
  },
  {
    name: 'Credit Scoring',
    description: 'On-chain credit registry that tracks borrower creditworthiness based on repayment history and collateral health.',
    howToUse: 'Borrowers can view their credit score and history. Higher scores enable better borrowing terms.',
    relatedRoutes: ['/dashboard/credit'],
  },
  {
    name: 'Identity Verification',
    description: 'Decentralized identity registry for KYC compliance. Ensures platform security while maintaining user privacy.',
    howToUse: 'Complete verification steps in the identity section to unlock full platform features.',
    relatedRoutes: ['/dashboard/identity'],
  },
  {
    name: 'Risk Simulation',
    description: 'Run simulations to test platform resilience against various scenarios including mass withdrawals, price crashes, and coordinated attacks.',
    howToUse: 'Admins can configure and run simulations to stress-test the platform.',
    relatedRoutes: ['/admin/agents', '/admin/threats'],
  },
];

export const FAQ = [
  {
    question: 'How do I get started as a borrower?',
    answer: 'Click Sign Up, select Borrower role, connect your wallet, complete identity verification, deposit collateral, and you can start borrowing.',
  },
  {
    question: 'How do I earn interest as a lender?',
    answer: 'Sign up as a Lender, connect your wallet, and deposit funds into the lending pool. You\'ll automatically earn interest on your deposits.',
  },
  {
    question: 'What is the liquidity engine?',
    answer: 'The liquidity engine is an AMM that manages how funds flow between lenders and borrowers. It uses ML to optimize interest rates based on pool utilization.',
  },
  {
    question: 'How does credit scoring work?',
    answer: 'Your credit score is calculated based on your on-chain activity including repayment history, collateral health, and transaction patterns.',
  },
  {
    question: 'What are AI agents?',
    answer: 'AI agents are automated trading bots that simulate real market participants including arbitrageurs, whales, and liquidators.',
  },
  {
    question: 'How is the platform secured?',
    answer: 'CashNet uses smart contracts on Ethereum, multi-signature access controls, real-time threat detection, and regular security audits.',
  },
];

// Helper function to find the best matching route
export function findBestRoute(query: string): PageRoute | null {
  const normalizedQuery = query.toLowerCase();
  let bestMatch: PageRoute | null = null;
  let bestScore = 0;

  for (const route of ROUTES) {
    for (const keyword of route.keywords) {
      if (normalizedQuery.includes(keyword)) {
        const score = keyword.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = route;
        }
      }
    }
  }

  return bestMatch;
}

// Helper function to find relevant features
export function findRelevantFeatures(query: string): Feature[] {
  const normalizedQuery = query.toLowerCase();
  return FEATURES.filter(feature => {
    const searchText = `${feature.name} ${feature.description}`.toLowerCase();
    return normalizedQuery.split(' ').some(word => 
      word.length > 3 && searchText.includes(word)
    );
  });
}

// Helper function to find FAQ answers
export function findFAQAnswer(query: string): typeof FAQ[0] | null {
  const normalizedQuery = query.toLowerCase();
  return FAQ.find(faq => {
    const questionWords = faq.question.toLowerCase().split(' ');
    const matchCount = questionWords.filter(word => 
      word.length > 3 && normalizedQuery.includes(word)
    ).length;
    return matchCount >= 2;
  }) || null;
}
