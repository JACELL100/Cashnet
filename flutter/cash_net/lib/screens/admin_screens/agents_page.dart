import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class AgentsPage extends StatefulWidget {
  const AgentsPage({super.key});

  @override
  State<AgentsPage> createState() => _AgentsPageState();
}

class _AgentsPageState extends State<AgentsPage> {
  List<dynamic> _agents = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchAgents();
  }

  Future<void> _fetchAgents() async {
    setState(() => _isLoading = true);

    try {
      final url = '${AuthService.apiBaseUrl}/api/agents';
      print('📡 [AGENTS] API CALL: GET $url');
      
      final response = await http
          .get(
            Uri.parse(url),
          )
          .timeout(const Duration(seconds: 5));

      print('📥 [AGENTS] RESPONSE: Status ${response.statusCode}');
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print('✅ [AGENTS] DATA LOADED: ${data is Map ? data.keys.join(', ') : 'List with ${(data is List ? data.length : 0)} items'}');
        print('📊 [AGENTS] Content: $data');
        
        setState(() {
          _agents = (data is Map && data.containsKey('data'))
              ? data['data']
              : (data is List ? data : []);
          _isLoading = false;
        });
      } else {
        print('⚠️ [AGENTS] API returned ${response.statusCode}, using mock data');
        _loadMockData();
      }
    } catch (e) {
      print('❌ [AGENTS] Fetch failed: $e');
      _loadMockData();
    }
  }

  void _loadMockData() {
    setState(() {
      _agents = [
        {
          'id': '1',
          'name': 'Arbitrage Bot #1',
          'type': 'arbitrage_bot',
          'active': true,
          'pnl': 12500.50
        },
        {
          'id': '2',
          'name': 'Liquidator #1',
          'type': 'liquidator_bot',
          'active': true,
          'pnl': 8900.25
        },
        {
          'id': '3',
          'name': 'Whale #1',
          'type': 'whale',
          'active': true,
          'pnl': 45000.00
        },
        {
          'id': '4',
          'name': 'MEV Bot #1',
          'type': 'mev_bot',
          'active': false,
          'pnl': -2300.75
        },
        {
          'id': '5',
          'name': 'Retail Trader #1',
          'type': 'retail_trader',
          'active': true,
          'pnl': 1200.00
        },
      ];
      _isLoading = false;
    });
  }

  Color _getTypeColor(String type) {
    switch (type) {
      case 'arbitrage_bot':
        return const Color(0xFF00D4FF);
      case 'liquidator_bot':
        return const Color(0xFFFF3860);
      case 'whale':
        return const Color(0xFF22C55E);
      case 'mev_bot':
        return const Color(0xFFF0A500);
      case 'retail_trader':
        return const Color(0xFFB367FF);
      case 'attacker':
        return const Color(0xFFFF0033);
      default:
        return const Color(0xFF64748B);
    }
  }

  String _getTypeIcon(String type) {
    switch (type) {
      case 'arbitrage_bot':
        return '⇄';
      case 'liquidator_bot':
        return '⚡';
      case 'whale':
        return '🐋';
      case 'mev_bot':
        return '▲';
      case 'retail_trader':
        return '◈';
      case 'attacker':
        return '☠';
      default:
        return '◆';
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _fetchAgents,
      color: const Color(0xFFB367FF),
      child: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFFB367FF)),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Active Agents',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_agents.where((a) => a['active'] == true).length} active · ${_agents.length} total',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh, color: Color(0xFFB367FF)),
                      onPressed: _fetchAgents,
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Agent Cards
                ..._agents.map((agent) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          border: Border.all(
                            color: agent['active'] == true
                                ? _getTypeColor(agent['type'] ?? 'unknown')
                                : const Color(0xFF334155),
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  _getTypeIcon(agent['type'] ?? ''),
                                  style: const TextStyle(fontSize: 20),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        agent['name'] ?? 'Unknown Agent',
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.white,
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                      Text(
                                        (agent['type'] ?? 'unknown')
                                            .toUpperCase(),
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: _getTypeColor(
                                              agent['type'] ?? ''),
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: agent['active'] == true
                                        ? const Color(0xFF22C55E)
                                            .withOpacity(0.1)
                                        : const Color(0xFF64748B)
                                            .withOpacity(0.1),
                                    border: Border.all(
                                      color: agent['active'] == true
                                          ? const Color(0xFF22C55E)
                                          : const Color(0xFF64748B),
                                    ),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    agent['active'] == true
                                        ? 'ACTIVE'
                                        : 'INACTIVE',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: agent['active'] == true
                                          ? const Color(0xFF22C55E)
                                          : const Color(0xFF64748B),
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                _buildStat(
                                    'PnL',
                                    '\$${(agent['pnl'] ?? 0).toStringAsFixed(2)}',
                                    (agent['pnl'] ?? 0) >= 0
                                        ? const Color(0xFF22C55E)
                                        : const Color(0xFFFF3860)),
                                _buildStat('Trades', '${agent['trades'] ?? 0}',
                                    const Color(0xFF00D4FF)),
                                _buildStat(
                                    'Success',
                                    '${agent['success_rate'] ?? 0}%',
                                    const Color(0xFFB367FF)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    )),
              ],
            ),
    );
  }

  Widget _buildStat(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: Colors.grey[600],
            fontFamily: 'monospace',
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: color,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}
