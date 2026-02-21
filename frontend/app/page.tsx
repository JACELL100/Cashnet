'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const TechEarth = dynamic(() => import('@/components/TechEarth'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center">
      <div className="text-accent font-mono text-sm">Loading 3D Earth...</div>
    </div>
  ),
});

type UserRole = 'ADMIN' | 'AUDITOR' | 'LENDER' | 'BORROWER';

const roles: { role: UserRole; title: string; icon: string; description: string; color: string }[] = [
  {
    role: 'ADMIN',
    title: 'Administrator',
    icon: '⚙',
    description: 'Full platform access, manage users, configure system settings',
    color: 'text-purple-400 border-purple-400/50 bg-purple-400/10',
  },
  {
    role: 'AUDITOR',
    title: 'Auditor',
    icon: '◆',
    description: 'Review transactions, verify compliance, audit smart contracts',
    color: 'text-amber-400 border-amber-400/50 bg-amber-400/10',
  },
  {
    role: 'LENDER',
    title: 'Lender',
    icon: '≈',
    description: 'Provide liquidity, earn interest, manage lending pools',
    color: 'text-emerald-400 border-emerald-400/50 bg-emerald-400/10',
  },
  {
    role: 'BORROWER',
    title: 'Borrower',
    icon: '⎇',
    description: 'Access credit, manage loans, track collateral health',
    color: 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleRoleSelect = (role: UserRole) => {
    console.log('[LANDING] Role selected:', role, 'Auth mode:', authMode);
    let targetUrl: string;

    if (role === 'ADMIN') {
      targetUrl = '/admin/login';
    } else if (role === 'AUDITOR') {
      targetUrl = '/auditor/login';
    } else if (role === 'LENDER') {
      targetUrl = authMode === 'signup' ? '/lender/signup' : '/lender/login';
    } else {
      // BORROWER
      targetUrl = `/${authMode}?role=BORROWER`;
    }

    console.log('[LANDING] Navigating to:', targetUrl);
    setShowRoleModal(false);
    router.push(targetUrl);
  };

  const openRoleModal = (mode: 'login' | 'signup') => {
    console.log('[LANDING] Opening modal for mode:', mode);
    setAuthMode(mode);
    setShowRoleModal(true);
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)]">
      {/* Role Selection Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowRoleModal(false)}
          />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-xl p-8 animate-fadeUp">
            <button
              onClick={() => setShowRoleModal(false)}
              className="absolute top-4 right-4 text-text-secondary hover:text-text-primary text-xl"
            >
              ×
            </button>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold font-mono text-text-primary mb-2">
                Select Your Role
              </h2>
              <p className="text-text-secondary font-mono text-sm">
                Choose how you want to use cashnet
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRoleSelect(r.role);
                  }}
                  className={`group p-6 border rounded-lg text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${r.color}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{r.icon}</div>
                    <div>
                      <h3 className="font-bold font-mono text-text-primary text-lg">
                        {r.title}
                      </h3>
                      <p className="text-text-secondary font-mono text-xs mt-1">
                        {r.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-0.5 w-0 group-hover:w-full transition-all bg-current opacity-50" />
                </button>
              ))}
            </div>

            <p className="text-center text-text-tertiary font-mono text-xs mt-6">
              You can change your role later in settings
            </p>
          </div>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 h-16 md:h-17 bg-[color:var(--color-bg-secondary)] border-b border-[color:var(--color-border)] backdrop-blur-sm z-40">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-xs font-bold text-[color:var(--color-bg-primary)]">
              RE
            </div>
            <span className="font-mono text-sm font-bold text-text-primary hidden sm:inline">
              cashnet
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-mono">
            <a href="#features" className="text-text-secondary hover:text-accent transition-colors">
              Features
            </a>
            <a href="#tech" className="text-text-secondary hover:text-accent transition-colors">
              Tech Stack
            </a>
            <a href="#pricing" className="text-text-secondary hover:text-accent transition-colors">
              Pricing
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => openRoleModal('login')}
              className="btn ghost text-xs py-2 px-3"
            >
              Sign In
            </button>
            <button
              onClick={() => openRoleModal('signup')}
              className="btn accent text-xs py-2 px-3"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="max-w-7xl mx-auto px-6 w-full">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-16 items-center min-h-[calc(100vh-4rem)]">
            {/* Left: Content */}
            <div className="space-y-5 animate-fadeUp z-10">
              {/* Badge */}
              <div className="inline-block px-3 py-1.5 bg-[rgba(0,212,255,0.1)] border border-accent rounded-full">
                <span className="text-xs font-mono text-accent uppercase tracking-wider">
                  institutional defi risk simulation
                </span>
              </div>

              {/* Title with Shimmer */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold font-mono text-text-primary leading-tight">
                Understand{' '}
                <span
                  style={{
                    background: 'linear-gradient(90deg, #00d4ff, #7dd3fc, #00d4ff)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'shimmer 3s ease-in-out infinite',
                  }}
                >
                  Systemic Risk
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-sm md:text-base text-text-secondary font-mono max-w-md leading-relaxed">
                The cashnet platform simulates complex DeFi scenarios, liquidation cascades, and market stress events in a controlled environment.
              </p>

              {/* KPI Row */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '200+', desc: 'Simulations' },
                  { label: '$2.4B', desc: 'Tested' },
                  { label: '97.8%', desc: 'Accuracy' },
                  { label: '50ms', desc: 'Latency' },
                ].map((kpi, idx) => (
                  <div key={idx} className="p-3 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded hover:border-accent transition-colors">
                    <div className="text-xl font-bold font-mono text-accent">{kpi.label}</div>
                    <div className="text-xs text-text-tertiary font-mono mt-0.5">{kpi.desc}</div>
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => openRoleModal('signup')}
                  className="btn accent px-6 py-2.5 font-mono text-sm font-semibold hover:scale-105 transition-transform"
                >
                  Start Free Trial
                </button>
                <button className="btn outline px-6 py-2.5 font-mono text-sm hover:scale-105 transition-transform">
                  Watch Demo
                </button>
              </div>
            </div>

            {/* Right: 3D Earth */}
            <div className="relative flex items-center justify-center h-[400px] md:h-[500px]">
              <TechEarth />
            </div>
          </div>
        </div>
      </section>

      {/* Live Ticker */}
      <div className="bg-[color:var(--color-bg-secondary)] border-y border-[color:var(--color-border)] py-4 overflow-hidden">
        <div className="flex gap-8 animate-marquee">
          {[
            'ETH/USD: $3,245.67',
            'USDC Pool: $1.2M',
            'Liquidation Risk: 3.2%',
            'Network Status: Optimal',
            'Oracle Feed: Active',
          ].map((item, idx) => (
            <span key={idx} className="text-sm font-mono text-text-secondary whitespace-nowrap">
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gradient-to-b from-transparent via-[rgba(0,212,255,0.03)] to-transparent">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Powerful Features
            </h2>
            <p className="text-text-secondary font-mono">
              Everything you need to understand DeFi risk
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '⊡', name: 'Multi-Agent Simulation', desc: 'Model 6+ agent types with custom behaviors', color: 'accent' },
              { icon: '≈', name: 'Liquidity Engine', desc: 'Realistic AMM mechanics and slippage curves', color: 'cyan' },
              { icon: '⎇', name: 'Lending Markets', desc: 'Collateral ratios, health factors, liquidations', color: 'success' },
              { icon: '⚠', name: 'Threat Detection', desc: 'MEV, oracle, governance, flash loan risks', color: 'danger' },
              { icon: '✓', name: 'Credit Scoring', desc: 'Dynamic rates and tier-based borrowing', color: 'purple' },
              { icon: '◆', name: 'Audit Trail', desc: 'Cryptographic verification of all events', color: 'warn' },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group p-6 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded hover:border-accent transition-all duration-200 hover:translate-y-[-3px]"
              >
                <div className={`text-4xl mb-4 w-12 h-12 rounded flex items-center justify-center`}>
                  {feature.icon}
                </div>
                <h3 className="font-bold font-mono text-text-primary mb-2">{feature.name}</h3>
                <p className="text-sm text-text-secondary font-mono">{feature.desc}</p>
                <div className={`mt-4 h-1 w-0 group-hover:w-full transition-all bg-accent`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: '1', title: 'Configure', desc: 'Set market parameters and agent strategies' },
              { num: '2', title: 'Simulate', desc: 'Run real-time DeFi scenarios with live data' },
              { num: '3', title: 'Monitor', desc: 'Track metrics across 7 specialized modules' },
              { num: '4', title: 'Analyze', desc: 'Review audit trails and generate reports' },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="flex flex-col items-center space-y-4 text-center">
                  <div className="w-12 h-12 bg-accent text-[color:var(--color-bg-primary)] rounded flex items-center justify-center font-bold font-mono">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="font-bold font-mono text-text-primary">{step.title}</h3>
                    <p className="text-sm text-text-secondary font-mono mt-1">{step.desc}</p>
                  </div>
                </div>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-6 -right-4 text-accent animate-arrowPulse">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="tech" className="py-20 px-6 bg-[color:var(--color-bg-secondary)]">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Built With Enterprise Tech
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { name: 'Next.js', icon: '▲', layer: 'Frontend' },
              { name: 'FastAPI', icon: '⚡', layer: 'Backend' },
              { name: 'Solidity', icon: '◈', layer: 'Smart Contracts' },
              { name: 'Python', icon: '🐍', layer: 'Analytics' },
              { name: 'PostgreSQL', icon: '🔒', layer: 'Database' },
              { name: 'Ethers.js', icon: '🔌', layer: 'Web3' },
            ].map((tech, idx) => (
              <div
                key={idx}
                className="p-4 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded text-center space-y-2"
              >
                <div className="text-2xl">{tech.icon}</div>
                <div className="font-bold font-mono text-text-primary text-sm">{tech.name}</div>
                <div className="text-xs text-text-tertiary font-mono">{tech.layer}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Transparent Pricing
            </h2>
            <p className="text-text-secondary font-mono">
              Choose the plan that fits your needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'STARTER',
                price: 'Free',
                desc: 'Perfect for learning',
                features: [
                  'Up to 3 simulations/month',
                  '2 concurrent agents',
                  'Basic analytics',
                  'Community support',
                ],
              },
              {
                name: 'PRO',
                price: '$299',
                period: '/month',
                desc: 'For active users',
                highlight: true,
                features: [
                  'Unlimited simulations',
                  '6 concurrent agents',
                  'Advanced analytics',
                  'Email support',
                  'Custom parameters',
                  'API access',
                ],
              },
              {
                name: 'ENTERPRISE',
                price: 'Custom',
                desc: 'For institutions',
                features: [
                  'Everything in Pro',
                  'Dedicated support',
                  'Custom integrations',
                  'SLA guarantees',
                  'On-premise option',
                  'Training included',
                ],
              },
            ].map((plan, idx) => (
              <div
                key={idx}
                className={`relative p-8 rounded border transition-all duration-200 ${
                  plan.highlight
                    ? 'bg-accent/10 border-accent scale-105'
                    : 'bg-[color:var(--color-bg-secondary)] border-[color:var(--color-border)]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-6 px-2 py-1 bg-accent text-[color:var(--color-bg-primary)] rounded text-xs font-mono font-bold">
                    POPULAR
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="font-bold font-mono text-text-primary uppercase">{plan.name}</h3>
                  <div className="space-y-1">
                    <div className="text-3xl font-bold font-mono text-accent">
                      {plan.price}
                      {plan.period && <span className="text-base text-text-secondary">{plan.period}</span>}
                    </div>
                    <p className="text-sm text-text-secondary font-mono">{plan.desc}</p>
                  </div>

                  <button
                    className={`w-full py-3 rounded font-mono text-sm font-bold transition-colors ${
                      plan.highlight
                        ? 'btn accent'
                        : 'btn ghost'
                    }`}
                  >
                    Get Started
                  </button>

                  <div className="space-y-2 pt-4 border-t border-[color:var(--color-border)]">
                    {plan.features.map((feature, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-2 text-sm font-mono text-text-secondary">
                        <span className="text-success mt-0.5">✓</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent via-[rgba(179,103,255,0.02)] to-transparent">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Trusted by Industry Leaders
            </h2>
            <p className="text-text-secondary font-mono">
              Risk teams worldwide rely on cashnet for stress testing
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: 'cashnet identified a critical liquidation cascade scenario we would have missed. Essential for institutional risk management.',
                author: 'Sarah Chen',
                role: 'Chief Risk Officer, MegaFund Capital',
                rating: 5,
              },
              {
                quote: 'The accuracy and speed of simulations gives us confidence in our risk models. Invaluable tool for our research team.',
                author: 'Alex Kowalski',
                role: 'Head of Research, DeFi Labs',
                rating: 5,
              },
              {
                quote: 'Finally, a platform that lets us test extreme market scenarios realistically. Changed how we approach portfolio management.',
                author: 'Maria Rodriguez',
                role: 'Portfolio Manager, CryptoVentures',
                rating: 5,
              },
            ].map((testimonial, idx) => (
              <div key={idx} className="p-6 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded hover:border-purple transition-all duration-200">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <span key={i} className="text-warn">★</span>
                  ))}
                </div>
                <p className="text-text-secondary font-mono text-sm mb-4 italic">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-accent to-cyan rounded flex items-center justify-center text-xs font-bold text-[color:var(--color-bg-primary)]">
                    {testimonial.author.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-text-primary font-mono font-bold text-sm">{testimonial.author}</p>
                    <p className="text-text-tertiary font-mono text-xs">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 bg-[color:var(--color-bg-secondary)]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { stat: '500+', label: 'Enterprise Clients' },
            { stat: '10M+', label: 'Simulations Run' },
            { stat: '$50B+', label: 'Tested Assets' },
            { stat: '99.9%', label: 'Uptime SLA' },
          ].map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="text-4xl font-bold font-mono text-accent">{item.stat}</div>
              <div className="text-sm text-text-secondary font-mono">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Security & Compliance Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Enterprise-Grade Security
            </h2>
            <p className="text-text-secondary font-mono">
              Built with institutional trust and compliance in mind
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: '🔐',
                title: 'End-to-End Encryption',
                desc: 'All data encrypted in transit and at rest with military-grade AES-256 encryption',
              },
              {
                icon: '✓',
                title: 'SOC 2 Type II Certified',
                desc: 'Annual audits ensure compliance with industry security standards',
              },
              {
                icon: '🔍',
                title: 'Audit Trails',
                desc: 'Immutable cryptographic verification of all simulation events and decisions',
              },
              {
                icon: '🌐',
                title: 'Multi-Region Redundancy',
                desc: 'Data replicated across geographic regions for maximum availability',
              },
            ].map((item, idx) => (
              <div key={idx} className="p-8 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded hover:border-accent transition-all duration-200 hover:translate-y-[-2px]">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="font-bold font-mono text-text-primary mb-2 text-lg">{item.title}</h3>
                <p className="text-text-secondary font-mono text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-transparent via-[rgba(0,212,255,0.02)] to-transparent">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'What blockchain networks does cashnet support?',
                a: 'We support Ethereum mainnet, Polygon, Arbitrum, Optimism, and all EVM-compatible chains. Testnet support includes Sepolia, Goerli, and Mumbai.',
              },
              {
                q: 'Can I run simulations with real market data?',
                a: 'Yes, our platform integrates with major DeFi protocols and real-time price feeds from Uniswap, Aave, and Compound. You can also use historical data for backtesting.',
              },
              {
                q: 'How long does a typical simulation take?',
                a: 'Most simulations complete in 2-5 seconds depending on complexity. Our optimized engine can handle complex multi-agent scenarios with thousands of transactions.',
              },
              {
                q: 'Is my simulation data private?',
                a: 'Absolutely. All data is encrypted end-to-end and never shared. Enterprise plans offer private deployment options for maximum control.',
              },
              {
                q: 'Can I export simulation results?',
                a: 'Yes, results can be exported as JSON, CSV, or PDF reports with detailed analytics and visualizations for presentation and analysis.',
              },
              {
                q: 'What support is available?',
                a: 'Starter users get community support. Pro users have email support with 24-hour response time. Enterprise includes dedicated account managers and priority support.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded overflow-hidden transition-all duration-200 hover:border-accent"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-[color:var(--color-bg-accent)] transition-colors"
                >
                  <h3 className="font-bold font-mono text-text-primary">{faq.q}</h3>
                  <span className={`text-accent text-xl transition-transform duration-200 ${expandedFaq === idx ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
                {expandedFaq === idx && (
                  <div className="px-6 pb-6 text-text-secondary font-mono text-sm border-t border-[color:var(--color-border)]">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Partners */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-mono text-text-primary">
              Native Integrations
            </h2>
            <p className="text-text-secondary font-mono">
              Connect seamlessly with your favorite DeFi protocols
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              'Uniswap V3',
              'Aave V3',
              'Curve',
              'Balancer',
              'MakerDAO',
              'Lido',
              'Compound',
              'dYdX',
            ].map((protocol, idx) => (
              <div
                key={idx}
                className="p-6 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded hover:border-cyan transition-all duration-200 text-center"
              >
                <div className="text-2xl font-bold font-mono text-accent mb-2">{protocol}</div>
                <div className="text-xs text-text-tertiary font-mono">Connected</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto relative p-12 bg-[color:var(--color-bg-secondary)] border border-accent rounded text-center space-y-6 overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold font-mono text-text-primary mb-4">
              Ready to Master DeFi Risk?
            </h2>
            <p className="text-text-secondary font-mono mb-2">
              Start with a free trial. No credit card required.
            </p>
            <p className="text-xs text-text-tertiary font-mono mb-8">
              Get instant access to all platform features for 14 days
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => openRoleModal('signup')}
                className="btn accent px-8 py-4 font-mono font-bold"
              >
                Get Started Free
              </button>
              <button className="btn ghost px-8 py-4 font-mono">
                Schedule 1:1 Demo
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-[color:var(--color-border)] flex justify-center gap-4">
              <div className="text-xs text-text-tertiary font-mono">
                <div className="font-bold text-text-primary">No Credit Card</div>
                Required
              </div>
              <div className="text-xs text-text-tertiary font-mono">
                <div className="font-bold text-text-primary">14 Days</div>
                Full Access
              </div>
              <div className="text-xs text-text-tertiary font-mono">
                <div className="font-bold text-text-primary">Cancel</div>
                Anytime
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-4">
              <h3 className="font-bold font-mono text-text-primary text-sm">Product</h3>
              <ul className="space-y-2 text-sm font-mono text-text-secondary">
                <li><a href="#" className="hover:text-accent transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Docs</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-bold font-mono text-text-primary text-sm">Company</h3>
              <ul className="space-y-2 text-sm font-mono text-text-secondary">
                <li><a href="#" className="hover:text-accent transition-colors">About</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Careers</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-bold font-mono text-text-primary text-sm">Legal</h3>
              <ul className="space-y-2 text-sm font-mono text-text-secondary">
                <li><a href="#" className="hover:text-accent transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">Cookies</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-bold font-mono text-text-primary text-sm">Network</h3>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded text-xs font-mono text-accent">
                  sepolia
                </span>
                <span className="px-2 py-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded text-xs font-mono text-cyan">
                  testnet
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-[color:var(--color-border)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs font-mono text-text-tertiary">
              © 2024 cashnet. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-text-secondary hover:text-accent transition-colors">
                Twitter
              </a>
              <a href="#" className="text-text-secondary hover:text-accent transition-colors">
                Discord
              </a>
              <a href="#" className="text-text-secondary hover:text-accent transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
