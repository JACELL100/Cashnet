import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../config/theme.dart';

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final user = authProvider.user;

    if (user == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final roleColor = AppTheme.getRoleColor(user.role);

    return Scaffold(
      appBar: AppBar(
        title: Text('cashnet ${user.role.toLowerCase()}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await authProvider.logout();
              if (context.mounted) {
                Navigator.of(context).pushReplacementNamed('/login');
              }
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppTheme.bgSecondary,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: roleColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: roleColor,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Center(
                          child: Text(
                            _getRoleIcon(user.role),
                            style: const TextStyle(
                              fontSize: 24,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Welcome back,',
                              style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              user.name ?? 'User',
                              style: const TextStyle(
                                color: AppTheme.textPrimary,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: roleColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: roleColor),
                    ),
                    child: Text(
                      user.role,
                      style: TextStyle(
                        color: roleColor,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // User Info
            _buildInfoCard(
              'Account Information',
              [
                if (user.email != null) _buildInfoRow('Email', user.email!),
                if (user.walletAddress != null)
                  _buildInfoRow(
                      'Wallet', _truncateAddress(user.walletAddress!)),
                _buildInfoRow('Role', user.role),
                _buildInfoRow('Plan', user.plan.toUpperCase()),
              ],
            ),

            const SizedBox(height: 24),

            // Role-specific content
            _buildRoleContent(user.role, roleColor),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard(String title, List<Widget> children) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.bold,
              fontFamily: 'Courier',
            ),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.textTertiary,
              fontSize: 12,
              fontFamily: 'Courier',
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              fontFamily: 'Courier',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleContent(String role, Color roleColor) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: roleColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: roleColor.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                _getRoleIcon(role),
                style: TextStyle(color: roleColor, fontSize: 20),
              ),
              const SizedBox(width: 8),
              Text(
                '$role FEATURES',
                style: TextStyle(
                  color: roleColor,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'Courier',
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ..._getRoleFeatures(role).map((feature) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Text(
                      '•',
                      style: TextStyle(color: roleColor, fontSize: 16),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        feature,
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                          fontFamily: 'Courier',
                        ),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  String _getRoleIcon(String role) {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return '◆';
      case 'AUDITOR':
        return '◈';
      case 'LENDER':
        return '≈';
      case 'BORROWER':
        return '⊡';
      default:
        return '◆';
    }
  }

  List<String> _getRoleFeatures(String role) {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return [
          'Manage all participants',
          'Assign roles on-chain',
          'Pause contracts',
          'View all module data',
          'Configure protocol parameters',
        ];
      case 'AUDITOR':
        return [
          'View all transactions',
          'Analyze fraud patterns',
          'Generate compliance reports',
          'Monitor protocol health',
          'Export audit logs',
        ];
      case 'LENDER':
        return [
          'Provide liquidity to pools',
          'Earn yield on deposits',
          'Manage portfolio',
          'Track APY metrics',
          'Withdraw earnings',
        ];
      case 'BORROWER':
        return [
          'Access credit facilities',
          'Borrow against collateral',
          'Build credit score',
          'Manage positions',
          'Track health factor',
        ];
      default:
        return [];
    }
  }

  String _truncateAddress(String address) {
    if (address.length <= 13) return address;
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }
}
