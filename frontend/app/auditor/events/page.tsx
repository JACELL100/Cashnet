'use client';

import React, { useState, useEffect, useRef } from 'react';

// Event type categories
type EventCategory = 'ALL' | 'TRANSACTION' | 'ALERT' | 'AUTH' | 'SYSTEM';
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'DEBUG';

interface LogEvent {
  id: string;
  timestamp: Date;
  category: EventCategory;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: any;
}

const levelColors: Record<LogLevel, string> = {
  INFO: '#00d4ff',
  WARN: '#f0a500',
  ERROR: '#ff3860',
  SUCCESS: '#22c55e',
  DEBUG: '#b367ff',
};

const categoryIcons: Record<EventCategory, string> = {
  ALL: '◈',
  TRANSACTION: '⎇',
  ALERT: '⚠',
  AUTH: '⊙',
  SYSTEM: '⚙',
};

export default function EventLogPage() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [filter, setFilter] = useState<EventCategory>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [eventCount, setEventCount] = useState({ total: 0, alerts: 0, transactions: 0 });
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch system logs from backend
  const fetchSystemLogs = async () => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com'}/api/logs/?limit=200`;
      console.log('Fetching logs from:', url);
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Logs data received:', data);
        const logs = data.logs || [];
        console.log('Number of logs:', logs.length);
        return logs.map((log: any) => ({
          id: `log-${log.id}`,
          timestamp: new Date(log.timestamp),
          category: log.category as EventCategory,
          level: log.level as LogLevel,
          source: log.source,
          message: log.message,
          metadata: log.metadata,
        }));
      } else {
        console.error('Response not OK:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to fetch system logs:', error);
    }
    return [];
  };

  // Load all events
  const loadEvents = async () => {
    if (isPaused) return;

    // Fetch real system logs from backend (includes all categories)
    const systemLogs = await fetchSystemLogs();

    setEvents(systemLogs);
    
    // Count by category
    const alertCount = systemLogs.filter((e: LogEvent) => e.category === 'ALERT').length;
    const transactionCount = systemLogs.filter((e: LogEvent) => e.category === 'TRANSACTION').length;
    
    setEventCount({
      total: systemLogs.length,
      alerts: alertCount,
      transactions: transactionCount,
    });
  };

  // Initial load and polling
  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [isPaused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Filter events
  const filteredEvents = events.filter((event) => {
    const matchesCategory = filter === 'ALL' || event.category === filter;
    const matchesSearch = searchTerm === '' || 
      event.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.source.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const exportLogs = () => {
    const logText = filteredEvents.map(event => 
      `[${event.timestamp.toISOString()}] [${event.level}] [${event.category}] ${event.source}: ${event.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-log-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">Event Log Viewer</h1>
          <p className="text-sm text-text-tertiary font-mono mt-1">
            Live system events · Backend & Frontend monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded text-xs font-mono font-bold ${isPaused ? 'bg-[rgba(255,56,96,0.1)] border border-[#ff3860] text-[#ff3860]' : 'bg-[rgba(34,197,94,0.1)] border border-[#22c55e] text-[#22c55e]'}`}>
            {isPaused ? '⏸ PAUSED' : '● LIVE'}
          </span>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
          <div className="text-xs font-mono text-text-tertiary mb-1">Total Events</div>
          <div className="text-2xl font-bold font-mono text-[#00d4ff]">{eventCount.total}</div>
        </div>
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
          <div className="text-xs font-mono text-text-tertiary mb-1">Transactions</div>
          <div className="text-2xl font-bold font-mono text-[#22c55e]">{eventCount.transactions}</div>
        </div>
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
          <div className="text-xs font-mono text-text-tertiary mb-1">Alerts</div>
          <div className="text-2xl font-bold font-mono text-[#ff3860]">{eventCount.alerts}</div>
        </div>
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
          <div className="text-xs font-mono text-text-tertiary mb-1">Filtered</div>
          <div className="text-2xl font-bold font-mono text-[#f0a500]">{filteredEvents.length}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'TRANSACTION', 'ALERT', 'AUTH', 'SYSTEM'] as EventCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                  filter === cat
                    ? 'bg-[#f0a500] text-white border border-[#f0a500]'
                    : 'border border-(--color-border) text-text-secondary hover:border-[#f0a500] hover:text-[#f0a500]'
                }`}
              >
                <span className="mr-1">{categoryIcons[cat]}</span>
                {cat}
              </button>
            ))}
          </div>

          {/* Search and Actions */}
          <div className="flex gap-2 flex-1">
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-(--color-bg-primary) border border-(--color-border) rounded text-xs font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-[#f0a500]"
            />
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                isPaused
                  ? 'border-[#22c55e] text-[#22c55e] hover:bg-[rgba(34,197,94,0.1)]'
                  : 'border-[#ff3860] text-[#ff3860] hover:bg-[rgba(255,56,96,0.1)]'
              }`}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                autoScroll
                  ? 'border-[#f0a500] text-[#f0a500] bg-[rgba(240,165,0,0.1)]'
                  : 'border-(--color-border) text-text-tertiary hover:border-[#f0a500]'
              }`}
            >
              {autoScroll ? '↓ Auto' : '↓ Manual'}
            </button>
            <button
              onClick={exportLogs}
              className="px-3 py-1.5 rounded text-xs font-mono border border-(--color-border) text-text-secondary hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
            >
              ⬇ Export
            </button>
            <button
              onClick={() => setEvents([])}
              className="px-3 py-1.5 rounded text-xs font-mono border border-(--color-border) text-text-tertiary hover:border-[#ff3860] hover:text-[#ff3860] transition-colors"
            >
              ✕ Clear
            </button>
          </div>
        </div>
      </div>

      {/* Terminal-like Log Display */}
      <div className="rounded-lg border border-(--color-border) bg-[#0a0e14] overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#1a1f29] border-b border-[#2a2f39]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff3860]"></div>
              <div className="w-3 h-3 rounded-full bg-[#f0a500]"></div>
              <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
            </div>
            <span className="text-xs font-mono text-[#8a91a0] ml-3">
              cashnet-auditor@event-log ~ {filter.toLowerCase()}
            </span>
          </div>
          <div className="text-xs font-mono text-[#8a91a0]">
            {filteredEvents.length} events
          </div>
        </div>

        {/* Log Content */}
        <div
          ref={logContainerRef}
          className="h-150 overflow-y-auto p-4 font-mono text-xs leading-6 custom-scrollbar"
          style={{ backgroundColor: '#0a0e14' }}
        >
          {filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#8a91a0]">
              <div className="text-center max-w-md">
                <div className="text-4xl mb-3">◈</div>
                <div className="text-base mb-2">No events to display</div>
                <div className="text-xs mt-2 opacity-60 leading-relaxed">
                  {searchTerm ? (
                    'Try adjusting your search filter'
                  ) : (
                    <>
                      <div className="mb-2">Events will appear here automatically as the system generates them.</div>
                      <div className="text-[#00d4ff] font-mono mb-1">To generate events:</div>
                      <div className="text-left mx-auto inline-block">
                        • Login/logout to create AUTH events<br/>
                        • Make API requests to generate API events<br/>
                        • Restart backend to see SYSTEM events<br/>
                        • Or run: <span className="text-[#f0a500]">python test_logging.py</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            filteredEvents.map((event, index) => (
              <div
                key={event.id}
                className="flex items-start gap-3 hover:bg-[rgba(255,255,255,0.02)] py-1 px-2 -mx-2 rounded transition-colors group"
              >
                {/* Timestamp */}
                <div className="shrink-0 text-[#5a6270] select-none">
                  <span className="opacity-60">{formatDate(event.timestamp)}</span>
                  {' '}
                  <span className="text-[#8a91a0]">{formatTimestamp(event.timestamp)}</span>
                </div>

                {/* Level Badge */}
                <div
                  className="shrink-0 px-2 py-0 rounded font-bold"
                  style={{
                    color: levelColors[event.level],
                    backgroundColor: `${levelColors[event.level]}15`,
                    border: `1px solid ${levelColors[event.level]}40`,
                  }}
                >
                  {event.level}
                </div>

                {/* Category Icon */}
                <div
                  className="shrink-0"
                  style={{ color: levelColors[event.level] }}
                >
                  {categoryIcons[event.category]}
                </div>

                {/* Source */}
                <div className="shrink-0 text-[#00d4ff] min-w-30">
                  [{event.source}]
                </div>

                {/* Message */}
                <div className="flex-1 text-[#c7cdd8] break-all">
                  {event.message}
                </div>

                {/* Metadata Indicator */}
                {event.metadata && (
                  <div className="shrink-0 text-[#b367ff] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title={JSON.stringify(event.metadata, null, 2)}>
                    &#123;...&#125;
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
        <div className="text-xs font-mono text-text-tertiary mb-3">Event Levels</div>
        <div className="flex flex-wrap gap-4">
          {Object.entries(levelColors).map(([level, color]) => (
            <div key={level} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              ></div>
              <span className="text-xs font-mono text-text-secondary">{level}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1f29;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2a2f39;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3a3f49;
        }
      `}</style>
    </div>
  );
}
