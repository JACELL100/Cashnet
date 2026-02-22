import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../services/auth_service.dart';

class ParticipantsPage extends StatefulWidget {
  const ParticipantsPage({super.key});

  @override
  State<ParticipantsPage> createState() => _ParticipantsPageState();
}

class _ParticipantsPageState extends State<ParticipantsPage> {
  List<dynamic> _participants = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchParticipants();
  }

  Future<void> _fetchParticipants() async {
    setState(() => _isLoading = true);

    try {
      final url = '${AuthService.apiBaseUrl}/participants';
      print('📡 [PARTICIPANTS] API CALL: GET $url');

      final response = await http
          .get(
            Uri.parse(url),
          )
          .timeout(const Duration(seconds: 5));

      print('📥 [PARTICIPANTS] RESPONSE: Status ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print(
            '✅ [PARTICIPANTS] DATA LOADED: ${data is Map ? data.keys.join(', ') : 'List with ${(data is List ? data.length : 0)} items'}');
        print('📊 [PARTICIPANTS] Content: $data');

        setState(() {
          _participants = (data is Map && data.containsKey('data'))
              ? data['data']
              : (data is List ? data : []);
          _isLoading = false;
        });
      } else {
        print(
            '⚠️ [PARTICIPANTS] API returned ${response.statusCode}, using mock data');
        _loadMockData();
      }
    } catch (e) {
      print('❌ [PARTICIPANTS] Fetch failed: $e');
      _loadMockData();
    }
  }

  void _loadMockData() {
    setState(() {
      _participants = [
        {
          'wallet': '0xabc1...ef23',
          'role': 'BORROWER',
          'status': 'verified',
          'time': '2m ago'
        },
        {
          'wallet': '0xdef4...gh56',
          'role': 'LENDER',
          'status': 'pending',
          'time': '14m ago'
        },
        {
          'wallet': '0x789a...bc01',
          'role': 'BORROWER',
          'status': 'verified',
          'time': '1h ago'
        },
        {
          'wallet': '0x456d...ef78',
          'role': 'AUDITOR',
          'status': 'verified',
          'time': '3h ago'
        },
      ];
      _isLoading = false;
    });
  }

  Color _getRoleColor(String role) {
    switch (role) {
      case 'BORROWER':
        return const Color(0xFF00D4FF);
      case 'LENDER':
        return const Color(0xFFB367FF);
      case 'AUDITOR':
        return const Color(0xFFF0A500);
      case 'ADMIN':
        return const Color(0xFFFF3860);
      default:
        return const Color(0xFF64748B);
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'verified':
        return const Color(0xFF22C55E);
      case 'pending':
        return const Color(0xFFF0A500);
      case 'flagged':
        return const Color(0xFFFF3860);
      default:
        return const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _fetchParticipants,
      color: const Color(0xFF00D4FF),
      child: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF00D4FF)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Participants',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      fontFamily: 'monospace'),
                ),
                const SizedBox(height: 16),
                ..._participants.map((p) => Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        border: Border.all(color: const Color(0xFF334155)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p['wallet'] ?? '',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontFamily: 'monospace',
                                        fontSize: 12)),
                                Text(p['time'] ?? '',
                                    style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 10,
                                        fontFamily: 'monospace')),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _getRoleColor(p['role'] ?? '')
                                  .withOpacity(0.1),
                              border: Border.all(
                                  color: _getRoleColor(p['role'] ?? '')),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(p['role'] ?? '',
                                style: TextStyle(
                                    fontSize: 10,
                                    color: _getRoleColor(p['role'] ?? ''),
                                    fontFamily: 'monospace')),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _getStatusColor(p['status'] ?? '')
                                  .withOpacity(0.1),
                              border: Border.all(
                                  color: _getStatusColor(p['status'] ?? '')),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(p['status'] ?? '',
                                style: TextStyle(
                                    fontSize: 10,
                                    color: _getStatusColor(p['status'] ?? ''),
                                    fontFamily: 'monospace')),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
    );
  }
}
