import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class TestingPage extends StatefulWidget {
  const TestingPage({super.key});

  @override
  State<TestingPage> createState() => _TestingPageState();
}

class _TestingPageState extends State<TestingPage> {
  final List<TestResult> _results = [];
  bool _isRunning = false;
  String _selectedCategory = 'all';

  final Map<String, List<Map<String, dynamic>>> _testCategories = {
    'pool': [
      {
        'id': 'pool_state',
        'name': 'Pool State',
        'description': 'Get current liquidity pool state'
      },
      {
        'id': 'slippage_curve',
        'name': 'Slippage Curve',
        'description': 'Calculate slippage for various trade sizes'
      },
      {
        'id': 'depth_chart',
        'name': 'Depth Chart',
        'description': 'Get order book depth visualization'
      },
    ],
    'lending': [
      {
        'id': 'health_check',
        'name': 'Health Check',
        'description': 'Check all lending positions health'
      },
      {
        'id': 'liquidation_check',
        'name': 'Liquidation Check',
        'description': 'Find positions eligible for liquidation'
      },
      {
        'id': 'utilization',
        'name': 'Utilization Rate',
        'description': 'Calculate current pool utilization'
      },
    ],
    'blockchain': [
      {
        'id': 'connectivity',
        'name': 'Blockchain Connection',
        'description': 'Test RPC endpoint connectivity'
      },
      {
        'id': 'contract_calls',
        'name': 'Contract Calls',
        'description': 'Test contract read operations'
      },
      {
        'id': 'gas_estimate',
        'name': 'Gas Estimation',
        'description': 'Estimate gas for common operations'
      },
    ],
    'agents': [
      {
        'id': 'agent_health',
        'name': 'Agent Health',
        'description': 'Check all agents are responding'
      },
      {
        'id': 'strategy_test',
        'name': 'Strategy Test',
        'description': 'Validate agent trading strategies'
      },
      {
        'id': 'ml_inference',
        'name': 'ML Inference',
        'description': 'Test ML model predictions'
      },
    ],
  };

  Future<void> _runAllTests() async {
    setState(() {
      _isRunning = true;
      _results.clear();
    });

    for (var category in _testCategories.entries) {
      for (var test in category.value) {
        await _runTest(test['id']!, test['name']!);
      }
    }

    setState(() => _isRunning = false);
    _showSnackBar('All tests completed', Colors.green);
  }

  Future<void> _runTest(String testId, String testName) async {
    setState(() {
      _results.add(TestResult(
        name: testName,
        status: TestStatus.pending,
        timestamp: DateTime.now(),
      ));
    });

    try {
      final url = '${AuthService.apiBaseUrl}/api/testing/run-test';
      print('📡 [TESTING] POST $url');
      print('📊 [TESTING] Running test: $testId ($testName)');
      
      final response = await http
          .post(
            Uri.parse(url),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'test_id': testId}),
          )
          .timeout(const Duration(seconds: 10));

      print('📥 [TESTING] Response: ${response.statusCode}');
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print('✅ [TESTING] Test passed: ${data['message'] ?? 'Success'}');
        print('📊 [TESTING] Data: ${data['data']}');
        
        setState(() {
          final index = _results.indexWhere(
              (r) => r.name == testName && r.status == TestStatus.pending);
          if (index != -1) {
            _results[index] = TestResult(
              name: testName,
              status: TestStatus.success,
              message: data['message'] ?? 'Test passed',
              data: data['data'],
              timestamp: DateTime.now(),
            );
          }
        });
      } else {
        print('⚠️ [TESTING] Test failed with ${response.statusCode}');
        setState(() {
          final index = _results.indexWhere(
              (r) => r.name == testName && r.status == TestStatus.pending);
          if (index != -1) {
            _results[index] = TestResult(
              name: testName,
              status: TestStatus.error,
              message: 'Test failed',
              timestamp: DateTime.now(),
            );
          }
        });
      }
    } catch (e) {
      setState(() {
        final index = _results.indexWhere(
            (r) => r.name == testName && r.status == TestStatus.pending);
        if (index != -1) {
          _results[index] = TestResult(
            name: testName,
            status: TestStatus.error,
            message: 'Error: $e',
            timestamp: DateTime.now(),
          );
        }
      });
    }

    // Small delay between tests
    await Future.delayed(const Duration(milliseconds: 500));
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

  @override
  Widget build(BuildContext context) {
    final filteredResults = _selectedCategory == 'all'
        ? _results
        : _results.where((r) {
            return _testCategories[_selectedCategory]
                    ?.any((t) => t['name'] == r.name) ??
                false;
          }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'System Testing',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Comprehensive system diagnostics and health checks',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                ElevatedButton.icon(
                  onPressed: _isRunning ? null : _runAllTests,
                  icon: _isRunning
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.play_arrow, size: 20),
                  label: Text(_isRunning ? 'Running...' : 'Run All'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF22C55E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Results Summary
            if (_results.isNotEmpty) ...[
              Row(
                children: [
                  Expanded(
                    child: _buildSummaryCard(
                      'Total Tests',
                      _results.length.toString(),
                      Icons.assessment_outlined,
                      const Color(0xFF00D4FF),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildSummaryCard(
                      'Passed',
                      _results
                          .where((r) => r.status == TestStatus.success)
                          .length
                          .toString(),
                      Icons.check_circle_outline,
                      const Color(0xFF22C55E),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildSummaryCard(
                      'Failed',
                      _results
                          .where((r) => r.status == TestStatus.error)
                          .length
                          .toString(),
                      Icons.error_outline,
                      const Color(0xFFFF3860),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
            ],

            // Category Filter
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildCategoryChip('All', 'all'),
                  const SizedBox(width: 8),
                  _buildCategoryChip('Pool Tests', 'pool'),
                  const SizedBox(width: 8),
                  _buildCategoryChip('Lending Tests', 'lending'),
                  const SizedBox(width: 8),
                  _buildCategoryChip('Blockchain', 'blockchain'),
                  const SizedBox(width: 8),
                  _buildCategoryChip('Agents', 'agents'),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Test Categories and Results
            if (_selectedCategory == 'all') ...[
              ..._testCategories.entries.map((category) => _buildTestCategory(
                    category.key,
                    category.value,
                  )),
            ] else ...[
              _buildTestCategory(
                  _selectedCategory, _testCategories[_selectedCategory]!),
            ],

            // Results List
            if (filteredResults.isNotEmpty) ...[
              const SizedBox(height: 24),
              const Text(
                'Test Results',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 12),
              _buildResultsList(filteredResults),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryCard(
      String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: color,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryChip(String label, String category) {
    final isSelected = _selectedCategory == category;
    final color =
        isSelected ? const Color(0xFF00D4FF) : const Color(0xFF64748B);

    return GestureDetector(
      onTap: () => setState(() => _selectedCategory = category),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.2) : Colors.transparent,
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            fontFamily: 'monospace',
          ),
        ),
      ),
    );
  }

  Widget _buildTestCategory(
      String categoryKey, List<Map<String, dynamic>> tests) {
    final categoryNames = {
      'pool': 'Liquidity Pool Tests',
      'lending': 'Lending Protocol Tests',
      'blockchain': 'Blockchain Tests',
      'agents': 'Agent Tests',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          categoryNames[categoryKey] ?? 'Tests',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
            fontFamily: 'monospace',
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            border: Border.all(color: const Color(0xFF334155)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: tests.length,
            separatorBuilder: (_, __) => const Divider(
              color: Color(0xFF334155),
              height: 1,
            ),
            itemBuilder: (context, index) {
              final test = tests[index];
              return ListTile(
                contentPadding: const EdgeInsets.all(16),
                leading: const Icon(
                  Icons.science_outlined,
                  color: Color(0xFF00D4FF),
                  size: 24,
                ),
                title: Text(
                  test['name']!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                    fontSize: 14,
                  ),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    test['description']!,
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
                trailing: ElevatedButton(
                  onPressed: _isRunning
                      ? null
                      : () => _runTest(test['id']!, test['name']!),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00D4FF).withOpacity(0.2),
                    foregroundColor: const Color(0xFF00D4FF),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                      side: const BorderSide(color: Color(0xFF00D4FF)),
                    ),
                  ),
                  child: const Text(
                    'Run',
                    style: TextStyle(fontSize: 12, fontFamily: 'monospace'),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildResultsList(List<TestResult> results) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: results.length,
        separatorBuilder: (_, __) => const Divider(
          color: Color(0xFF334155),
          height: 1,
        ),
        itemBuilder: (context, index) {
          final result = results[index];
          Color statusColor;
          IconData statusIcon;

          switch (result.status) {
            case TestStatus.success:
              statusColor = const Color(0xFF22C55E);
              statusIcon = Icons.check_circle;
              break;
            case TestStatus.error:
              statusColor = const Color(0xFFFF3860);
              statusIcon = Icons.error;
              break;
            case TestStatus.pending:
              statusColor = const Color(0xFFF0A500);
              statusIcon = Icons.hourglass_empty;
              break;
          }

          return ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: Icon(statusIcon, color: statusColor, size: 24),
            title: Text(
              result.name,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
                fontSize: 14,
              ),
            ),
            subtitle: result.message != null
                ? Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      result.message!,
                      style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12,
                        fontFamily: 'monospace',
                      ),
                    ),
                  )
                : null,
            trailing: Text(
              '${result.timestamp.hour.toString().padLeft(2, '0')}:${result.timestamp.minute.toString().padLeft(2, '0')}',
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 12,
                fontFamily: 'monospace',
              ),
            ),
          );
        },
      ),
    );
  }
}

enum TestStatus { pending, success, error }

class TestResult {
  final String name;
  final TestStatus status;
  final String? message;
  final dynamic data;
  final DateTime timestamp;

  TestResult({
    required this.name,
    required this.status,
    this.message,
    this.data,
    required this.timestamp,
  });
}
