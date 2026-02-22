import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class SystemControlPage extends StatefulWidget {
  const SystemControlPage({super.key});

  @override
  State<SystemControlPage> createState() => _SystemControlPageState();
}

class _SystemControlPageState extends State<SystemControlPage> {
  Map<String, dynamic>? _systemStatus;
  bool _isLoading = true;
  bool _isProcessing = false;
  Timer? _pollTimer;

  // Role management state
  final TextEditingController _walletController = TextEditingController();
  String _selectedRole = 'BORROWER';
  bool _isGrantingRole = false;
  bool _isCheckingRole = false;
  Map<String, dynamic>? _roleCheckResult;

  @override
  void initState() {
    super.initState();
    _fetchStatus();
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _walletController.dispose();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer =
        Timer.periodic(const Duration(seconds: 5), (_) => _fetchStatus());
  }

  Future<void> _fetchStatus() async {
    try {
      final url = '${AuthService.apiBaseUrl}/system/status';
      print('📡 [SYSTEM] API CALL: GET $url');

      final response = await http
          .get(
            Uri.parse(url),
          )
          .timeout(const Duration(seconds: 5));

      print('📥 [SYSTEM] RESPONSE: Status ${response.statusCode}');

      if (response.statusCode == 200 && mounted) {
        final data = jsonDecode(response.body);
        print(
            '✅ [SYSTEM] DATA LOADED: ${data is Map ? data.keys.join(', ') : 'Raw data'}');
        print('📊 [SYSTEM] Content: $data');

        setState(() {
          _systemStatus = data['data'] ?? data;
          _isLoading = false;
        });
      } else {
        print(
            '⚠️ [SYSTEM] API returned ${response.statusCode}, using mock data');
        _loadMockData();
      }
    } catch (e) {
      print('❌ [SYSTEM] Fetch failed: $e');
      _loadMockData();
    }
  }

  void _loadMockData() {
    if (mounted) {
      setState(() {
        _systemStatus = {
          'paused': false,
          'connected': true,
          'block_number': 5234567,
          'chain_id': 11155111,
          'network': 'Sepolia',
          'contracts_status': 'active',
        };
        _isLoading = false;
      });
    }
  }

  Future<void> _pauseSystem() async {
    setState(() => _isProcessing = true);
    try {
      final url = '${AuthService.apiBaseUrl}/system/pause';
      print('📡 [SYSTEM] POST $url');

      final response = await http.post(
        Uri.parse(url),
      );

      print('📥 [SYSTEM] Pause response: ${response.statusCode}');

      if (response.statusCode == 200) {
        print('✅ [SYSTEM] Paused successfully');
        _showSnackBar('System paused successfully', Colors.orange);
        await _fetchStatus();
      } else {
        print('⚠️ [SYSTEM] Pause failed with ${response.statusCode}');
        _showSnackBar('Failed to pause system', Colors.red);
      }
    } catch (e) {
      print('❌ [SYSTEM] Pause error: $e');
      _showSnackBar('Error: $e', Colors.red);
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _unpauseSystem() async {
    setState(() => _isProcessing = true);
    try {
      final url = '${AuthService.apiBaseUrl}/system/unpause';
      print('📡 [SYSTEM] POST $url');

      final response = await http.post(
        Uri.parse(url),
      );

      print('📥 [SYSTEM] Unpause response: ${response.statusCode}');

      if (response.statusCode == 200) {
        print('✅ [SYSTEM] Resumed successfully');
        _showSnackBar('System resumed successfully', Colors.green);
        await _fetchStatus();
      } else {
        print('⚠️ [SYSTEM] Unpause failed with ${response.statusCode}');
        _showSnackBar('Failed to resume system', Colors.red);
      }
    } catch (e) {
      print('❌ [SYSTEM] Unpause error: $e');
      _showSnackBar('Error: $e', Colors.red);
    } finally {
      setState(() => _isProcessing = false);
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

  @override
  Widget build(BuildContext context) {
    final isPaused = _systemStatus?['paused'] ?? false;
    final isConnected = _systemStatus?['connected'] ?? false;
    final blockNumber = _systemStatus?['block_number'] ?? 0;
    final network = _systemStatus?['network'] ?? 'Unknown';
    final contractsStatus = _systemStatus?['contracts_status'] ?? 'unknown';

    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      body: RefreshIndicator(
        onRefresh: _fetchStatus,
        color: const Color(0xFFFF3860),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
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
                        'System Control',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          fontFamily: 'monospace',
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Emergency pause controls for all smart contracts',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF00D4FF)),
                    onPressed: _fetchStatus,
                    tooltip: 'Refresh',
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Status Cards
              Row(
                children: [
                  Expanded(
                    child: _buildStatusCard(
                      'Blockchain',
                      isConnected ? 'Connected' : 'Disconnected',
                      isConnected
                          ? 'Block #${blockNumber.toString()}'
                          : 'No connection',
                      isConnected
                          ? const Color(0xFF22C55E)
                          : const Color(0xFFFF3860),
                      Icons.hub_outlined,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatusCard(
                      'System Status',
                      isPaused ? 'PAUSED' : 'ACTIVE',
                      isPaused ? 'Operations frozen' : 'All systems go',
                      isPaused
                          ? const Color(0xFFFF3860)
                          : const Color(0xFF22C55E),
                      isPaused
                          ? Icons.pause_circle_outline
                          : Icons.check_circle_outline,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildStatusCard(
                      'Network',
                      network,
                      'Ethereum Testnet',
                      const Color(0xFF00D4FF),
                      Icons.language_outlined,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatusCard(
                      'Contracts',
                      contractsStatus.toUpperCase(),
                      '6 deployed contracts',
                      contractsStatus == 'active'
                          ? const Color(0xFF22C55E)
                          : const Color(0xFF64748B),
                      Icons.description_outlined,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Warning Banner
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF3860).withOpacity(0.1),
                  border: Border.all(color: const Color(0xFFFF3860)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: Color(0xFFFF3860),
                      size: 24,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Emergency Controls',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            isPaused
                                ? 'System is currently paused. All contract operations are frozen.'
                                : 'Use pause to immediately freeze all contract operations during emergencies.',
                            style: const TextStyle(
                              color: Color(0xFF94A3B8),
                              fontFamily: 'monospace',
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Control Buttons
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  border: Border.all(color: const Color(0xFF334155)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'System Controls',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (!isPaused) ...[
                      SizedBox(
                        height: 56,
                        child: ElevatedButton.icon(
                          onPressed: _isProcessing ? null : _pauseSystem,
                          icon: _isProcessing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.pause_circle, size: 24),
                          label: Text(
                            _isProcessing
                                ? 'Pausing System...'
                                : 'PAUSE SYSTEM',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFFF3860),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        '• Freezes all lending operations\n• Stops liquidity pool swaps\n• Prevents new deposits/withdrawals\n• Emergency measure only',
                        style: TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ] else ...[
                      SizedBox(
                        height: 56,
                        child: ElevatedButton.icon(
                          onPressed: _isProcessing ? null : _unpauseSystem,
                          icon: _isProcessing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.play_circle, size: 24),
                          label: Text(
                            _isProcessing
                                ? 'Resuming System...'
                                : 'RESUME SYSTEM',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF22C55E),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        '• Restores all contract operations\n• Enables lending and liquidity\n• System returns to normal state\n• Use only when safe',
                        style: TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Contract Status List
              const Text(
                'Contract Status',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 12),
              _buildContractsList(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusCard(
      String label, String value, String subtitle, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                    fontFamily: 'monospace',
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: color,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 10,
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildContractsList() {
    final contracts = [
      {'name': 'LendingPool', 'status': 'active'},
      {'name': 'CollateralVault', 'status': 'active'},
      {'name': 'CreditRegistry', 'status': 'active'},
      {'name': 'LiquidityPool', 'status': 'active'},
      {'name': 'Palladium (PAL)', 'status': 'active'},
      {'name': 'Badassium (BAD)', 'status': 'active'},
    ];

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: contracts.length,
        separatorBuilder: (_, __) => const Divider(
          color: Color(0xFF334155),
          height: 1,
        ),
        itemBuilder: (context, index) {
          final contract = contracts[index];
          final status = contract['status'] ?? 'unknown';
          final isPaused = _systemStatus?['paused'] ?? false;
          final effectiveStatus = isPaused ? 'paused' : status;
          final statusColor = effectiveStatus == 'active'
              ? const Color(0xFF22C55E)
              : effectiveStatus == 'paused'
                  ? const Color(0xFFF0A500)
                  : const Color(0xFF64748B);

          return ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: Icon(
              Icons.description_outlined,
              color: statusColor,
              size: 24,
            ),
            title: Text(
              contract['name']!,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
                fontSize: 14,
              ),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.1),
                border: Border.all(color: statusColor),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: statusColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    effectiveStatus.toUpperCase(),
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
