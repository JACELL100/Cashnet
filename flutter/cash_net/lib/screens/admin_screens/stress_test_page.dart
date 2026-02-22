import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class StressTestPage extends StatefulWidget {
  const StressTestPage({super.key});

  @override
  State<StressTestPage> createState() => _StressTestPageState();
}

class _StressTestPageState extends State<StressTestPage> {
  String? _runningTest;
  Map<String, dynamic>? _testResult;

  final List<Map<String, dynamic>> _scenarios = [
    {
      'id': 'withdrawal',
      'name': 'Mass Withdrawal',
      'description':
          'Simulate panic selling and liquidity drain from the AMM pool',
      'icon': '💸',
      'category': 'pool',
      'difficulty': 'medium',
    },
    {
      'id': 'flash_swap',
      'name': 'Flash Swap Attack',
      'description': 'Large instantaneous swap causing extreme price impact',
      'icon': '⚡',
      'category': 'pool',
      'difficulty': 'high',
    },
    {
      'id': 'sustained_drain',
      'name': 'Sustained Drain',
      'description': 'Gradual liquidity extraction over time',
      'icon': '🌊',
      'category': 'pool',
      'difficulty': 'low',
    },
    {
      'id': 'price_crash',
      'name': 'Collateral Price Crash',
      'description':
          'Simulate 30-50% price drop triggering cascade liquidations',
      'icon': '📉',
      'category': 'lending',
      'difficulty': 'critical',
    },
    {
      'id': 'bank_run',
      'name': 'Bank Run',
      'description': 'Mass simultaneous withdrawal attempts from lenders',
      'icon': '🏃',
      'category': 'lending',
      'difficulty': 'high',
    },
    {
      'id': 'flash_loan_exploit',
      'name': 'Flash Loan Attack',
      'description':
          'Euler Finance style - borrow massive amounts, manipulate, liquidate',
      'icon': '🎯',
      'category': 'attack',
      'difficulty': 'critical',
    },
    {
      'id': 'sandwich_mega',
      'name': 'MEV Sandwich Attack',
      'description':
          'Front-run and back-run large trades for profit extraction',
      'icon': '🥪',
      'category': 'attack',
      'difficulty': 'high',
    },
    {
      'id': 'oracle_manipulation',
      'name': 'Oracle Manipulation',
      'description':
          'Mango Markets style - inflate collateral value artificially',
      'icon': '🔮',
      'category': 'attack',
      'difficulty': 'critical',
    },
    {
      'id': 'wash_trading',
      'name': 'Wash Trading',
      'description':
          'Circular trades between wallets to inflate volume metrics',
      'icon': '🔄',
      'category': 'attack',
      'difficulty': 'high',
    },
    {
      'id': 'liquidity_poisoning',
      'name': 'Liquidity Poisoning',
      'description':
          'Rapid add/remove liquidity at skewed ratios to distort pricing',
      'icon': '☠️',
      'category': 'attack',
      'difficulty': 'high',
    },
  ];

  Future<void> _runStressTest(String testId, int severity) async {
    setState(() {
      _runningTest = testId;
      _testResult = null;
    });

    try {
      // Map test IDs to backend attack types
      final attackTypeMap = {
        'withdrawal': 'liquidity_poisoning',
        'price_crash': 'oracle_manipulation',
        'bank_run': 'flash_loan_exploit',
        'flash_loan_exploit': 'flash_loan_exploit',
        'sandwich_mega': 'sandwich_mega',
        'oracle_manipulation': 'oracle_manipulation',
        'wash_trading': 'wash_trading',
        'liquidity_poisoning': 'liquidity_poisoning',
      };

      final attackType = attackTypeMap[testId] ?? testId;

      final url = '${AuthService.apiBaseUrl}/api/threats/simulate';
      print('📡 [STRESS_TEST] POST $url');
      print(
          '📊 [STRESS_TEST] Running test: $testId (mapped to: $attackType) with severity: $severity');

      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'attack_type': attackType,
          'params': {
            'severity': severity,
            'intensity': severity / 100.0,
          },
        }),
      );

      print('📥 [STRESS_TEST] Response: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print('✅ [STRESS_TEST] Completed successfully');
        print('📊 [STRESS_TEST] Result: $data');

        setState(() {
          _testResult = data['data'] ?? data;
        });
        _showSnackBar('Stress test completed!', Colors.green);
      } else {
        print('⚠️ [STRESS_TEST] Failed with ${response.statusCode}');
        final errorBody = response.body;
        print('📄 [STRESS_TEST] Error body: $errorBody');
        _showSnackBar('Test failed: ${response.statusCode}', Colors.red);
      }
    } catch (e) {
      print('❌ [STRESS_TEST] Error: $e');
      _showSnackBar('Error: $e', Colors.red);
    } finally {
      setState(() => _runningTest = null);
    }
  }

  void _showSnackBar(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(fontFamily: 'monospace')),
        backgroundColor: color,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'pool':
        return const Color(0xFF00D4FF);
      case 'lending':
        return const Color(0xFFB367FF);
      case 'attack':
        return const Color(0xFFFF0033);
      default:
        return const Color(0xFF64748B);
    }
  }

  Color _getDifficultyColor(String difficulty) {
    switch (difficulty) {
      case 'low':
        return const Color(0xFF22C55E);
      case 'medium':
        return const Color(0xFFF0A500);
      case 'high':
        return const Color(0xFFFF3860);
      case 'critical':
        return const Color(0xFFFF0033);
      default:
        return const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Stress Testing',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    fontFamily: 'monospace',
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Simulate worst-case scenarios and attack vectors',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Test Result Card
            if (_testResult != null) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  border: Border.all(color: const Color(0xFF22C55E)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.check_circle,
                          color: Color(0xFF22C55E),
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Test Results',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const Spacer(),
                        IconButton(
                          icon:
                              const Icon(Icons.close, color: Color(0xFF64748B)),
                          onPressed: () => setState(() => _testResult = null),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _testResult!['message'] ?? 'Test completed successfully',
                      style: const TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 14,
                        fontFamily: 'monospace',
                      ),
                    ),
                    if (_testResult!['impact'] != null) ...[
                      const SizedBox(height: 12),
                      const Divider(color: Color(0xFF334155)),
                      const SizedBox(height: 12),
                      Text(
                        'Impact: ${_testResult!['impact']}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Category Filters
            Row(
              children: [
                _buildCategoryChip('Pool Tests', 'pool'),
                const SizedBox(width: 8),
                _buildCategoryChip('Lending Tests', 'lending'),
                const SizedBox(width: 8),
                _buildCategoryChip('Attack Vectors', 'attack'),
              ],
            ),
            const SizedBox(height: 24),

            // Scenarios List
            ..._scenarios.map((scenario) {
              final isRunning = _runningTest == scenario['id'];
              final categoryColor = _getCategoryColor(scenario['category']);
              final difficultyColor =
                  _getDifficultyColor(scenario['difficulty']);

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  border: Border.all(color: const Color(0xFF334155)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: categoryColor.withOpacity(0.1),
                      border: Border.all(color: categoryColor),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Text(
                        scenario['icon'],
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
                  ),
                  title: Row(
                    children: [
                      Expanded(
                        child: Text(
                          scenario['name'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: difficultyColor.withOpacity(0.1),
                          border: Border.all(color: difficultyColor),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          scenario['difficulty'].toUpperCase(),
                          style: TextStyle(
                            color: difficultyColor,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          scenario['description'],
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 12,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton(
                                onPressed: isRunning
                                    ? null
                                    : () => _runStressTest(scenario['id'], 30),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color(0xFFF0A500).withOpacity(0.2),
                                  foregroundColor: const Color(0xFFF0A500),
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    side: const BorderSide(
                                        color: Color(0xFFF0A500)),
                                  ),
                                ),
                                child: Text(
                                  isRunning ? 'Running...' : 'Low (30%)',
                                  style: const TextStyle(
                                      fontSize: 12, fontFamily: 'monospace'),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: isRunning
                                    ? null
                                    : () => _runStressTest(scenario['id'], 60),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color(0xFFFF3860).withOpacity(0.2),
                                  foregroundColor: const Color(0xFFFF3860),
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    side: const BorderSide(
                                        color: Color(0xFFFF3860)),
                                  ),
                                ),
                                child: Text(
                                  isRunning ? 'Running...' : 'High (60%)',
                                  style: const TextStyle(
                                      fontSize: 12, fontFamily: 'monospace'),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: isRunning
                                    ? null
                                    : () => _runStressTest(scenario['id'], 90),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      const Color(0xFFFF0033).withOpacity(0.2),
                                  foregroundColor: const Color(0xFFFF0033),
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    side: const BorderSide(
                                        color: Color(0xFFFF0033)),
                                  ),
                                ),
                                child: Text(
                                  isRunning ? 'Running...' : 'Max (90%)',
                                  style: const TextStyle(
                                      fontSize: 12, fontFamily: 'monospace'),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryChip(String label, String category) {
    final color = _getCategoryColor(category);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.bold,
          fontFamily: 'monospace',
        ),
      ),
    );
  }
}
