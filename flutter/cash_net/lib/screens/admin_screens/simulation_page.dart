import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class SimulationPage extends StatefulWidget {
  const SimulationPage({super.key});

  @override
  State<SimulationPage> createState() => _SimulationPageState();
}

class _SimulationPageState extends State<SimulationPage> {
  Map<String, dynamic>? _simStatus;
  List<dynamic> _agents = [];
  List<dynamic> _activityFeed = [];
  List<dynamic> _scenarios = [];
  bool _isLoading = true;
  bool _isStarting = false;
  Timer? _pollTimer;

  int _maxSteps = 100;
  double _tickDelay = 0.5;

  @override
  void initState() {
    super.initState();
    _fetchData();
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer =
        Timer.periodic(const Duration(seconds: 3), (_) => _fetchData());
  }

  Future<void> _fetchData() async {
    try {
      print(
          '📡 [SIMULATION] API CALLS: Fetching status, agents, activity, scenarios');

      final responses = await Future.wait([
        http.get(Uri.parse('${AuthService.apiBaseUrl}/api/simulation/status')),
        http.get(Uri.parse('${AuthService.apiBaseUrl}/api/agents')),
        http.get(Uri.parse(
            '${AuthService.apiBaseUrl}/api/sim/activity-feed?limit=20')),
        http.get(
            Uri.parse('${AuthService.apiBaseUrl}/api/scenarios/available')),
      ]);

      print(
          '📥 [SIMULATION] RESPONSES: [${responses[0].statusCode}, ${responses[1].statusCode}, ${responses[2].statusCode}, ${responses[3].statusCode}]');

      if (mounted) {
        setState(() {
          if (responses[0].statusCode == 200) {
            final data = jsonDecode(responses[0].body);
            _simStatus = data['data'] ?? data;
            print('✅ [SIMULATION] Status loaded: $_simStatus');
          }
          if (responses[1].statusCode == 200) {
            final data = jsonDecode(responses[1].body);
            _agents = data['data'] ?? data ?? [];
            print('✅ [SIMULATION] Agents loaded: ${_agents.length} items');
          }
          if (responses[2].statusCode == 200) {
            final data = jsonDecode(responses[2].body);
            _activityFeed = data['data'] ?? data ?? [];
            print(
                '✅ [SIMULATION] Activity feed loaded: ${_activityFeed.length} items');
          }
          if (responses[3].statusCode == 200) {
            final data = jsonDecode(responses[3].body);
            _scenarios = data is List ? data : [];
            print(
                '✅ [SIMULATION] Scenarios loaded: ${_scenarios.length} items');
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      print('❌ [SIMULATION] Fetch failed: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _startSimulation() async {
    setState(() => _isStarting = true);
    try {
      final url = '${AuthService.apiBaseUrl}/api/simulation/start';
      print('📡 [SIMULATION] POST $url');
      print(
          '📊 [SIMULATION] Params: max_steps=$_maxSteps, tick_delay=$_tickDelay');

      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'max_steps': _maxSteps,
          'tick_delay': _tickDelay,
        }),
      );

      print('📥 [SIMULATION] Start response: ${response.statusCode}');

      if (response.statusCode == 200) {
        print('✅ [SIMULATION] Started successfully');
        _showSnackBar('Simulation started', Colors.green);
        await _fetchData();
      } else {
        print('⚠️ [SIMULATION] Start failed with ${response.statusCode}');
        _showSnackBar('Failed to start simulation', Colors.red);
      }
    } catch (e) {
      _showSnackBar('Error: $e', Colors.red);
    } finally {
      setState(() => _isStarting = false);
    }
  }

  Future<void> _stopSimulation() async {
    try {
      final url = '${AuthService.apiBaseUrl}/api/simulation/stop';
      print('📡 [SIMULATION] POST $url');

      await http.post(Uri.parse(url));
      print('✅ [SIMULATION] Stopped successfully');
      _showSnackBar('Simulation stopped', Colors.orange);
      await _fetchData();
    } catch (e) {
      _showSnackBar('Error: $e', Colors.red);
    }
  }

  Future<void> _pauseSimulation() async {
    try {
      final url = '${AuthService.apiBaseUrl}/api/simulation/pause';
      print('📡 [SIMULATION] POST $url');

      await http.post(Uri.parse(url));
      print('✅ [SIMULATION] Paused successfully');
      _showSnackBar('Simulation paused', Colors.orange);
      await _fetchData();
    } catch (e) {
      _showSnackBar('Error: $e', Colors.red);
    }
  }

  Future<void> _resumeSimulation() async {
    try {
      final url = '${AuthService.apiBaseUrl}/api/simulation/resume';
      print('📡 [SIMULATION] POST $url');

      await http.post(Uri.parse(url));
      print('✅ [SIMULATION] Resumed successfully');
      _showSnackBar('Simulation resumed', Colors.green);
      await _fetchData();
    } catch (e) {
      _showSnackBar('Error: $e', Colors.red);
    }
  }

  Future<void> _applyScenario(String scenarioType) async {
    try {
      final url = '${AuthService.apiBaseUrl}/api/scenarios/run';
      print('📡 [SIMULATION] POST $url');
      print('📊 [SIMULATION] Applying scenario: $scenarioType');

      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'scenario_type': scenarioType,
          'intensity': 1.0,
          'tick_delay': 0.5,
        }),
      );

      print('📥 [SIMULATION] Scenario response: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print('✅ [SIMULATION] Scenario started with job_id: ${data['job_id']}');
        _showSnackBar('Scenario applied: $scenarioType', Colors.blue);
      } else {
        print('⚠️ [SIMULATION] Failed with ${response.statusCode}');
        print('📄 [SIMULATION] Error body: ${response.body}');
        _showSnackBar('Failed to apply scenario', Colors.red);
      }
    } catch (e) {
      print('❌ [SIMULATION] Error: $e');
      _showSnackBar('Error: $e', Colors.red);
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
    final status = _simStatus?['status'] ?? 'idle';
    final isRunning = status == 'running';
    final isPaused = status == 'paused';

    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      body: RefreshIndicator(
        onRefresh: _fetchData,
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
                        'Simulation Control',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          fontFamily: 'monospace',
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Live Agent Simulation Engine',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isRunning
                          ? const Color(0xFF22C55E).withOpacity(0.1)
                          : isPaused
                              ? const Color(0xFFF0A500).withOpacity(0.1)
                              : const Color(0xFF64748B).withOpacity(0.1),
                      border: Border.all(
                        color: isRunning
                            ? const Color(0xFF22C55E)
                            : isPaused
                                ? const Color(0xFFF0A500)
                                : const Color(0xFF64748B),
                      ),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: isRunning
                                ? const Color(0xFF22C55E)
                                : isPaused
                                    ? const Color(0xFFF0A500)
                                    : const Color(0xFF64748B),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: isRunning
                                ? const Color(0xFF22C55E)
                                : isPaused
                                    ? const Color(0xFFF0A500)
                                    : const Color(0xFF64748B),
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Status Cards
              Row(
                children: [
                  Expanded(
                    child: _buildInfoCard(
                      'Current Step',
                      '${_simStatus?['current_step'] ?? 0}',
                      '/ ${_simStatus?['max_steps'] ?? 0}',
                      const Color(0xFF00D4FF),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildInfoCard(
                      'Active Agents',
                      '${_agents.where((a) => a['active'] == true).length}',
                      '/ ${_agents.length}',
                      const Color(0xFFB367FF),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildInfoCard(
                      'Tick Delay',
                      '${_simStatus?['tick_delay'] ?? 0.5}s',
                      'Update interval',
                      const Color(0xFFF0A500),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildInfoCard(
                      'Elapsed Time',
                      '${_simStatus?['elapsed_seconds'] ?? 0}s',
                      'Runtime',
                      const Color(0xFF22C55E),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Control Panel
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  border: Border.all(color: const Color(0xFF334155)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Control Panel',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Simulation Parameters
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Max Steps',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF64748B),
                                  fontFamily: 'monospace',
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0A0E1A),
                                  border: Border.all(
                                      color: const Color(0xFF334155)),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: TextField(
                                  enabled: !isRunning,
                                  keyboardType: TextInputType.number,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontFamily: 'monospace',
                                  ),
                                  decoration: const InputDecoration(
                                    border: InputBorder.none,
                                    hintText: '100',
                                    hintStyle:
                                        TextStyle(color: Color(0xFF64748B)),
                                  ),
                                  onChanged: (value) {
                                    final parsed = int.tryParse(value);
                                    if (parsed != null) {
                                      setState(() => _maxSteps = parsed);
                                    }
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Tick Delay (s)',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF64748B),
                                  fontFamily: 'monospace',
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0A0E1A),
                                  border: Border.all(
                                      color: const Color(0xFF334155)),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: TextField(
                                  enabled: !isRunning,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                          decimal: true),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontFamily: 'monospace',
                                  ),
                                  decoration: const InputDecoration(
                                    border: InputBorder.none,
                                    hintText: '0.5',
                                    hintStyle:
                                        TextStyle(color: Color(0xFF64748B)),
                                  ),
                                  onChanged: (value) {
                                    final parsed = double.tryParse(value);
                                    if (parsed != null) {
                                      setState(() => _tickDelay = parsed);
                                    }
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Control Buttons
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: !isRunning && !_isStarting
                                ? _startSimulation
                                : null,
                            icon: _isStarting
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.play_arrow, size: 20),
                            label: const Text('Start'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF22C55E),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: isPaused
                                ? _resumeSimulation
                                : (isRunning ? _pauseSimulation : null),
                            icon: Icon(
                                isPaused ? Icons.play_arrow : Icons.pause,
                                size: 20),
                            label: Text(isPaused ? 'Resume' : 'Pause'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFF0A500),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed:
                                isRunning || isPaused ? _stopSimulation : null,
                            icon: const Icon(Icons.stop, size: 20),
                            label: const Text('Stop'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFF3860),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Scenarios
              if (_scenarios.isNotEmpty) ...[
                const Text(
                  'Crisis Scenarios',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(height: 12),
                _buildScenariosList(),
                const SizedBox(height: 24),
              ],

              // Activity Feed
              const Text(
                'Activity Feed',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 12),
              _buildActivityFeed(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoCard(
      String label, String value, String subtitle, Color color) {
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
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
            ),
          ),
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
            subtitle,
            style: const TextStyle(
              fontSize: 10,
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScenariosList() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: _scenarios.length > 5 ? 5 : _scenarios.length,
        separatorBuilder: (_, __) => const Divider(
          color: Color(0xFF334155),
          height: 1,
        ),
        itemBuilder: (context, index) {
          final scenario = _scenarios[index];
          final type = scenario['type'] ?? '';
          final name = scenario['name'] ?? 'Unknown';
          final description = scenario['description'] ?? '';
          final severity = scenario['severity'] ?? 'medium';

          Color severityColor = const Color(0xFF64748B);
          if (severity == 'critical') severityColor = const Color(0xFFFF0033);
          if (severity == 'high') severityColor = const Color(0xFFFF3860);
          if (severity == 'medium') severityColor = const Color(0xFFF0A500);

          return ListTile(
            contentPadding: const EdgeInsets.all(16),
            title: Text(
              name,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
              ),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                description,
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
            ),
            trailing: ElevatedButton(
              onPressed: () => _applyScenario(type),
              style: ElevatedButton.styleFrom(
                backgroundColor: severityColor.withOpacity(0.2),
                foregroundColor: severityColor,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(4),
                  side: BorderSide(color: severityColor),
                ),
              ),
              child: const Text(
                'Apply',
                style: TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActivityFeed() {
    if (_activityFeed.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          border: Border.all(color: const Color(0xFF334155)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text(
            'No activity yet. Start a simulation to see live events.',
            style: TextStyle(
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
              fontSize: 12,
            ),
          ),
        ),
      );
    }

    return Container(
      height: 400,
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _activityFeed.length,
        separatorBuilder: (_, __) => const Divider(
          color: Color(0xFF334155),
          height: 24,
        ),
        itemBuilder: (context, index) {
          final event = _activityFeed[index];
          final agentName = event['agent_name'] ?? 'Unknown';
          final agentType = event['agent_type'] ?? '';
          final eventType = event['event_type'] ?? '';
          final timestamp = event['timestamp'] ?? 0;

          final time =
              DateTime.fromMillisecondsSinceEpoch((timestamp * 1000).toInt());
          final timeStr =
              '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}:${time.second.toString().padLeft(2, '0')}';

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                timeStr,
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 10,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          agentName,
                          style: const TextStyle(
                            color: Color(0xFF00D4FF),
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          agentType,
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 10,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      eventType,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
