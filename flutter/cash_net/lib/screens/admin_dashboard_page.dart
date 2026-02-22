import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'admin_screens/agents_page.dart';
import 'admin_screens/participants_page.dart';
import 'admin_screens/additional_pages.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/auth_service.dart';

class AdminDashboardPage extends StatefulWidget {
  const AdminDashboardPage({super.key});

  @override
  State<AdminDashboardPage> createState() => _AdminDashboardPageState();
}

class _AdminDashboardPageState extends State<AdminDashboardPage> {
  int _selectedIndex = 0;
  Map<String, dynamic> _dashboardData = {};
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchDashboardData();
  }

  Future<void> _fetchDashboardData() async {
    setState(() => _isLoading = true);

    try {
      final response = await http
          .get(
            Uri.parse('${AuthService.apiBaseUrl}/api/admin/dashboard'),
          )
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        setState(() {
          _dashboardData = jsonDecode(response.body);
          _isLoading = false;
        });
      } else {
        _loadMockData();
      }
    } catch (e) {
      print('Dashboard data load failed: $e');
      _loadMockData();
    }
  }

  void _loadMockData() {
    setState(() {
      _dashboardData = {
        'participants': 128,
        'contracts': 6,
        'agents': 42,
        'tvl': 2400000,
        'active_agents': 38,
      };
      _isLoading = false;
    });
  }

  final List<_NavItem> _navItems = const [
    _NavItem(icon: Icons.dashboard_outlined, label: 'Overview'),
    _NavItem(icon: Icons.smart_toy_outlined, label: 'Agents'),
    _NavItem(icon: Icons.people_outline, label: 'Participants'),
    _NavItem(icon: Icons.water_drop_outlined, label: 'Liquidity'),
    _NavItem(icon: Icons.account_balance_wallet_outlined, label: 'Credit'),
    _NavItem(icon: Icons.hub_outlined, label: 'Blockchain'),
    _NavItem(icon: Icons.security_outlined, label: 'Threats'),
  ];

  Widget _buildBody() {
    switch (_selectedIndex) {
      case 0:
        return _buildOverview();
      case 1:
        return const AgentsPage();
      case 2:
        return const ParticipantsPage();
      case 3:
        return const LiquidityPage();
      case 4:
        return const CreditPage();
      case 5:
        return const BlockchainPage();
      case 6:
        return const ThreatsPage();
      default:
        return _buildOverview();
    }
  }

  Widget _buildOverview() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFFFF3860)),
      );
    }

    final participants = _dashboardData['participants'] ?? 128;
    final contracts = _dashboardData['contracts'] ?? 6;
    final agents = _dashboardData['agents'] ?? 42;
    final activeAgents = _dashboardData['active_agents'] ?? 38;
    final tvl = _dashboardData['tvl'] ?? 2400000;

    return RefreshIndicator(
      onRefresh: _fetchDashboardData,
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'System Overview',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'CashNet Simulation Lab · Admin Console',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, color: Color(0xFFFF3860)),
                  onPressed: _fetchDashboardData,
                  tooltip: 'Refresh',
                ),
              ],
            ),
            const SizedBox(height: 24),

            // KPI Cards
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.5,
              children: [
                _buildKPICard(
                  'Total Participants',
                  participants.toString(),
                  '+4 this week',
                  const Color(0xFFFF3860),
                  Icons.people_outline,
                ),
                _buildKPICard(
                  'Active Contracts',
                  contracts.toString(),
                  'All systems live',
                  const Color(0xFF00D4FF),
                  Icons.description_outlined,
                ),
                _buildKPICard(
                  'Active Agents',
                  '$activeAgents',
                  '$agents total',
                  const Color(0xFFB367FF),
                  Icons.smart_toy_outlined,
                ),
                _buildKPICard(
                  'Total Value Locked',
                  '\$${(tvl / 1000000).toStringAsFixed(1)}M',
                  '↑ 12% 7d',
                  const Color(0xFF22C55E),
                  Icons.attach_money_outlined,
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Quick Actions
            _buildQuickActions(),
            const SizedBox(height: 24),

            // Role Breakdown
            _buildRoleBreakdown(),
            const SizedBox(height: 24),

            // Recent Activity
            _buildRecentActivity(),
          ],
        ),
      ),
    );
  }

  Widget _buildKPICard(
      String label, String value, String sub, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey[600],
                  fontFamily: 'monospace',
                ),
              ),
              Icon(icon, color: color, size: 20),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: color,
              fontFamily: 'monospace',
            ),
          ),
          Text(
            sub,
            style: TextStyle(
              fontSize: 10,
              color: Colors.grey[700],
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Quick Actions',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.white,
            fontFamily: 'monospace',
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _buildActionChip('View Agents', Icons.smart_toy_outlined, () {
              setState(() => _selectedIndex = 1);
            }),
            _buildActionChip('Manage Participants', Icons.people_outline, () {
              setState(() => _selectedIndex = 2);
            }),
            _buildActionChip('Monitor Liquidity', Icons.water_drop_outlined,
                () {
              setState(() => _selectedIndex = 3);
            }),
            _buildActionChip('Check Threats', Icons.security_outlined, () {
              setState(() => _selectedIndex = 6);
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildActionChip(String label, IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          border: Border.all(color: const Color(0xFF334155)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: const Color(0xFF00D4FF), size: 16),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: Colors.white,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleBreakdown() {
    final roles = [
      {'role': 'BORROWER', 'count': 94, 'color': const Color(0xFF00D4FF)},
      {'role': 'LENDER', 'count': 22, 'color': const Color(0xFFB367FF)},
      {'role': 'AUDITOR', 'count': 8, 'color': const Color(0xFFF0A500)},
      {'role': 'ADMIN', 'count': 4, 'color': const Color(0xFFFF3860)},
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Role Distribution',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 16),
          ...roles.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: r['color'] as Color,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        r['role'] as String,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.white,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    Text(
                      (r['count'] as int).toString(),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: r['color'] as Color,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildRecentActivity() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Recent Activity',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 12),
          ...List.generate(
            3,
            (i) => _buildActivityItem(
              ['Agent activated', 'New participant', 'Threat detected'][i],
              ['2m ago', '14m ago', '1h ago'][i],
              [
                const Color(0xFF22C55E),
                const Color(0xFF00D4FF),
                const Color(0xFFFF3860)
              ][i],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityItem(String text, String time, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 11,
                color: Colors.white,
                fontFamily: 'monospace',
              ),
            ),
          ),
          Text(
            time,
            style: TextStyle(
              fontSize: 10,
              color: Colors.grey[600],
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.user;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0E1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFFFF3860),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text(
                  'CN',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'CashNet',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(width: 4),
            const Text(
              'admin',
              style: TextStyle(
                fontSize: 16,
                color: Color(0xFFFF3860),
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
        actions: [
          if (user != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: () {
                  showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      backgroundColor: const Color(0xFF1E293B),
                      title: const Text(
                        'Logout',
                        style: TextStyle(color: Colors.white),
                      ),
                      content: const Text(
                        'Are you sure you want to logout?',
                        style: TextStyle(color: Colors.white70),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () {
                            authProvider.logout();
                            Navigator.of(context)
                                .popUntil((route) => route.isFirst);
                          },
                          child: const Text(
                            'Logout',
                            style: TextStyle(color: Color(0xFFFF3860)),
                          ),
                        ),
                      ],
                    ),
                  );
                },
                icon: const Icon(Icons.logout, size: 16),
                label: Text(
                  user.name ?? 'Admin',
                  style: const TextStyle(fontSize: 12),
                ),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                ),
              ),
            ),
        ],
      ),
      body: Row(
        children: [
          // Navigation Rail
          NavigationRail(
            backgroundColor: const Color(0xFF1E293B),
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) {
              setState(() => _selectedIndex = index);
            },
            labelType: NavigationRailLabelType.all,
            selectedIconTheme: const IconThemeData(
              color: Color(0xFFFF3860),
            ),
            selectedLabelTextStyle: const TextStyle(
              color: Color(0xFFFF3860),
              fontFamily: 'monospace',
              fontSize: 11,
            ),
            unselectedIconTheme: const IconThemeData(
              color: Color(0xFF64748B),
            ),
            unselectedLabelTextStyle: const TextStyle(
              color: Color(0xFF64748B),
              fontFamily: 'monospace',
              fontSize: 11,
            ),
            destinations: _navItems
                .map((item) => NavigationRailDestination(
                      icon: Icon(item.icon),
                      label: Text(item.label),
                    ))
                .toList(),
          ),
          const VerticalDivider(thickness: 1, width: 1),
          // Main Content
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;

  const _NavItem({required this.icon, required this.label});
}
