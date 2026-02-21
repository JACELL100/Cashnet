'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROJECT_INFO,
  ROUTES,
  FEATURES,
  FAQ,
  findBestRoute,
  findRelevantFeatures,
  findFAQAnswer,
} from '@/lib/projectContext';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

// Web Speech API types
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface IWindow extends Window {
  SpeechRecognition?: new () => ISpeechRecognition;
  webkitSpeechRecognition?: new () => ISpeechRecognition;
}

export default function VoiceAgent() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const win = window as IWindow;
      const SpeechRecognitionAPI = win.SpeechRecognition || win.webkitSpeechRecognition;
      
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          handleUserInput(transcript);
        };
        
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };
        
        recognition.onend = () => {
          setIsListening(false);
        };
        
        recognitionRef.current = recognition;
      } else {
        setIsSupported(false);
      }
      
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addMessage('assistant', `Hello! I'm your CashNet assistant. I can help you navigate the platform, explain features, or answer questions. Try saying "How do I borrow?" or "Take me to the dashboard". How can I help you today?`);
    }
  }, [isOpen]);

  const addMessage = (type: 'user' | 'assistant', text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      type,
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    
    if (type === 'assistant') {
      speak(text);
    }
  };

  const speak = (text: string) => {
    if (synthRef.current) {
      // Cancel any ongoing speech
      synthRef.current.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      synthRef.current.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      setPulseAnimation(true);
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setPulseAnimation(false);
    }
  };

  const handleUserInput = useCallback((input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    
    addMessage('user', trimmedInput);
    setInputText('');
    
    // Process the input and generate response
    const response = processQuery(trimmedInput);
    
    // Small delay for natural conversation feel
    setTimeout(() => {
      addMessage('assistant', response.text);
      if (response.navigate) {
        setTimeout(() => {
          router.push(response.navigate!);
        }, 2000);
      }
    }, 500);
  }, [router]);

  const processQuery = (query: string): { text: string; navigate?: string } => {
    const normalizedQuery = query.toLowerCase();
    
    // Navigation intents
    const navigationKeywords = ['go to', 'take me to', 'navigate to', 'open', 'show me', 'where is'];
    const isNavigationIntent = navigationKeywords.some(kw => normalizedQuery.includes(kw));
    
    if (isNavigationIntent) {
      const route = findBestRoute(query);
      if (route) {
        return {
          text: `Taking you to ${route.description}. Redirecting now...`,
          navigate: route.path,
        };
      }
    }
    
    // Check for specific page requests without explicit navigation keywords
    const route = findBestRoute(query);
    if (route && (normalizedQuery.includes('page') || normalizedQuery.includes('section'))) {
      return {
        text: `I found the ${route.description}. Would you like me to take you there? Just say "yes" or click the navigate button.`,
      };
    }
    
    // Role-specific questions
    if (normalizedQuery.includes('admin')) {
      const adminInfo = PROJECT_INFO.roles.ADMIN;
      return {
        text: `Administrators have ${adminInfo.description}. Their capabilities include: ${adminInfo.capabilities.join(', ')}. Would you like me to take you to the admin login?`,
      };
    }
    
    if (normalizedQuery.includes('lender') || normalizedQuery.includes('lending')) {
      const lenderInfo = PROJECT_INFO.roles.LENDER;
      if (normalizedQuery.includes('how') || normalizedQuery.includes('earn')) {
        return {
          text: `As a lender, you can ${lenderInfo.description}. To get started, sign up as a lender, connect your wallet, and deposit funds into the lending pool. You'll automatically earn interest. Want me to take you to the lender signup?`,
        };
      }
      return {
        text: `Lenders can ${lenderInfo.description}. Capabilities: ${lenderInfo.capabilities.join(', ')}. Would you like to go to the lender section?`,
      };
    }
    
    if (normalizedQuery.includes('borrower') || normalizedQuery.includes('borrow')) {
      const borrowerInfo = PROJECT_INFO.roles.BORROWER;
      if (normalizedQuery.includes('how')) {
        return {
          text: `To borrow on CashNet: 1) Sign up as a borrower, 2) Connect your wallet, 3) Complete identity verification, 4) Deposit collateral, 5) Borrow against your collateral. Your credit score affects your borrowing terms. Want me to take you to signup?`,
        };
      }
      return {
        text: `Borrowers can ${borrowerInfo.description}. Capabilities: ${borrowerInfo.capabilities.join(', ')}. Would you like to go to the borrower section?`,
      };
    }
    
    if (normalizedQuery.includes('auditor') || normalizedQuery.includes('audit')) {
      const auditorInfo = PROJECT_INFO.roles.AUDITOR;
      return {
        text: `Auditors can ${auditorInfo.description}. Capabilities: ${auditorInfo.capabilities.join(', ')}. Would you like to go to the auditor login?`,
      };
    }
    
    // Feature questions
    const features = findRelevantFeatures(query);
    if (features.length > 0) {
      const feature = features[0];
      return {
        text: `${feature.name}: ${feature.description}. ${feature.howToUse} Related pages include: ${feature.relatedRoutes.join(', ')}. Would you like me to take you there?`,
      };
    }
    
    // FAQ matching
    const faq = findFAQAnswer(query);
    if (faq) {
      return { text: faq.answer };
    }
    
    // Credit score questions
    if (normalizedQuery.includes('credit') || normalizedQuery.includes('score')) {
      return {
        text: `Your credit score on CashNet is calculated based on your on-chain activity including repayment history, collateral health factor, and transaction patterns. A higher score means better borrowing terms. You can view your credit score in the dashboard under the Credit section. Want me to take you there?`,
      };
    }
    
    // Liquidity engine questions
    if (normalizedQuery.includes('liquidity') || normalizedQuery.includes('pool') || normalizedQuery.includes('amm')) {
      return {
        text: `The Liquidity Engine is CashNet's core financial engine. It's an Automated Market Maker (AMM) that manages how funds flow between lenders and borrowers. It uses machine learning to optimize interest rates based on pool utilization. Admins can access detailed analytics in the liquidity section.`,
      };
    }
    
    // Agent questions
    if (normalizedQuery.includes('agent') || normalizedQuery.includes('bot') || normalizedQuery.includes('trading')) {
      return {
        text: `CashNet features AI trading agents including: Arbitrage Bots (exploit price differences), Whale Agents (large traders), MEV Bots (extract value from transactions), Liquidator Bots (handle undercollateralized loans), and Retail Traders. Admins can monitor all agent activity in the agents dashboard.`,
      };
    }
    
    // Security/threats questions
    if (normalizedQuery.includes('security') || normalizedQuery.includes('threat') || normalizedQuery.includes('fraud') || normalizedQuery.includes('attack')) {
      return {
        text: `CashNet has real-time threat detection monitoring for fraud, attacks, and suspicious activity. This includes cascade risk analysis and attacker agent simulation. Admins can view alerts and take protective action in the threats section.`,
      };
    }
    
    // General help
    if (normalizedQuery.includes('help') || normalizedQuery.includes('what can you do')) {
      return {
        text: `I can help you with: 1) Navigating to any page - just say "go to dashboard" or "show me lending", 2) Explaining features like lending, borrowing, or the liquidity engine, 3) Answering questions about roles (admin, lender, borrower, auditor), 4) Getting started guides. What would you like to know?`,
      };
    }
    
    // Affirmative responses (for follow-up navigation)
    if (normalizedQuery === 'yes' || normalizedQuery === 'yeah' || normalizedQuery === 'sure' || normalizedQuery === 'ok') {
      if (route) {
        return {
          text: `Great! Taking you to ${route.description} now.`,
          navigate: route.path,
        };
      }
      return { text: `What page would you like me to take you to?` };
    }
    
    // Platform overview
    if (normalizedQuery.includes('what is') && (normalizedQuery.includes('cashnet') || normalizedQuery.includes('this'))) {
      return {
        text: `${PROJECT_INFO.name} is ${PROJECT_INFO.description} The platform supports four roles: Administrators, Auditors, Lenders, and Borrowers. What role are you interested in?`,
      };
    }
    
    // Default response
    return {
      text: `I'm not sure I understood that. You can ask me about: borrowing and lending, credit scores, the liquidity engine, AI trading agents, or say "go to [page name]" to navigate. How can I help?`,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      handleUserInput(inputText);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-110 transition-transform duration-200 group"
        aria-label="Open voice assistant"
      >
        <svg
          className="w-7 h-7 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
        <span className="absolute -top-10 right-0 bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Voice Assistant
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-[#0a0f1a] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-500/20 to-purple-600/20 px-4 py-3 border-b border-cyan-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center ${isSpeaking ? 'animate-pulse' : ''}`}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">CashNet Assistant</h3>
            <p className="text-cyan-400 text-xs">
              {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready to help'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Stop speaking"
            >
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-cyan-500/30 scrollbar-track-transparent">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${
                message.type === 'user'
                  ? 'bg-cyan-500/20 text-cyan-100 rounded-br-sm'
                  : 'bg-purple-500/20 text-purple-100 rounded-bl-sm'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-cyan-500/30 bg-[#0d1320]">
        {!isSupported && (
          <p className="text-yellow-400 text-xs mb-2 text-center">
            Voice not supported in this browser. Use text input instead.
          </p>
        )}
        
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or use voice..."
            className="flex-1 bg-white/5 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
          
          {isSupported && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
              }`}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
          )}
          
          <button
            type="submit"
            className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl hover:bg-purple-500/30 transition-colors"
            title="Send message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {['Dashboard', 'How to borrow?', 'Liquidity', 'Help'].map((action) => (
            <button
              key={action}
              onClick={() => handleUserInput(action)}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-400 hover:text-white hover:border-cyan-500/50 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
