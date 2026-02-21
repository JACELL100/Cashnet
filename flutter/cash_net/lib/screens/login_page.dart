import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../providers/auth_provider.dart';
import '../config/theme.dart';
import '../config/google_signin_config.dart';
import '../services/wallet_service.dart';
import '../models/user.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  UserRole selectedRole = UserRole.borrower;
  bool _isLoading = false;

  @override
  void dispose() {
    super.dispose();
  }

  Color get roleColor {
    switch (selectedRole) {
      case UserRole.admin:
        return AppTheme.adminColor;
      case UserRole.auditor:
        return AppTheme.auditorColor;
      case UserRole.lender:
        return AppTheme.lenderColor;
      case UserRole.borrower:
        return AppTheme.borrowerColor;
    }
  }

  String get roleIcon {
    switch (selectedRole) {
      case UserRole.admin:
        return '◆';
      case UserRole.auditor:
        return '◈';
      case UserRole.lender:
        return '≈';
      case UserRole.borrower:
        return '⊡';
    }
  }

  Future<void> _handleMockLogin() async {
    setState(() => _isLoading = true);

    // Simulate network delay
    await Future.delayed(const Duration(milliseconds: 800));

    final authProvider = context.read<AuthProvider>();

    // Create mock user based on selected role
    final mockEmail = '${selectedRole.value}@cashnet.local';
    final success = await authProvider.login(
      email: mockEmail,
      password: 'mock',
      role: selectedRole.value,
    );

    setState(() => _isLoading = false);

    if (success && mounted) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(authProvider.error ?? 'Login failed'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() => _isLoading = true);

    try {
      final GoogleSignIn googleSignIn = GoogleSignIn(
        scopes: ['email', 'profile'],
        clientId: GoogleSignInConfig.webClientId,
      );

      // Sign out first to force account picker
      await googleSignIn.signOut();

      // This will show Google account picker
      final account = await googleSignIn.signIn();

      if (account == null) {
        // User cancelled
        setState(() => _isLoading = false);
        return;
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;

      if (idToken != null && mounted) {
        final authProvider = context.read<AuthProvider>();
        final success = await authProvider.loginWithGoogle(idToken);

        setState(() => _isLoading = false);

        if (success && mounted) {
          // Redirect to dashboard (admin/auditor specific)
          Navigator.of(context).pushReplacementNamed('/dashboard');
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(authProvider.error ?? 'Google sign-in failed'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      setState(() => _isLoading = false);

      if (mounted) {
        // In development mode, use mock login instead
        if (GoogleSignInConfig.isDevelopment) {
          final shouldContinue = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              backgroundColor: AppTheme.bgSecondary,
              title: Row(
                children: [
                  Icon(Icons.info_outline, color: AppTheme.warning, size: 24),
                  const SizedBox(width: 12),
                  const Text(
                    'Google Sign-In Unavailable',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 16,
                      fontFamily: 'Courier',
                    ),
                  ),
                ],
              ),
              content: const Text(
                'Google Sign-In is not configured.\n\nUse mock authentication instead?',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 14,
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: roleColor,
                  ),
                  child: const Text('Use Mock Login'),
                ),
              ],
            ),
          );

          if (shouldContinue == true) {
            await _handleMockLogin();
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Google sign-in error: ${e.toString()}'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      }
    }
  }

  Future<void> _handleWalletConnect() async {
    setState(() => _isLoading = true);

    try {
      // Initialize wallet service
      final walletService = WalletService();

      // Show loading dialog
      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: true,
          builder: (context) => AlertDialog(
            backgroundColor: AppTheme.bgSecondary,
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(color: roleColor),
                const SizedBox(height: 16),
                const Text(
                  'Opening Wallet App...',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontFamily: 'Courier',
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Approve connection in MetaMask.',
                  style: TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 12,
                    fontFamily: 'Courier',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                const Text(
                  'Switch to MetaMask app and approve.',
                  style: TextStyle(
                    color: AppTheme.warning,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'Courier',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Timeout in 30 seconds...',
                  style: TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 10,
                    fontFamily: 'Courier',
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text(
                    'Cancel',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontFamily: 'Courier',
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }

      // Connect wallet
      final walletAddress = await walletService.connect();

      // Close loading dialog
      if (mounted) {
        Navigator.of(context).pop();
      }

      if (walletAddress == null) {
        setState(() => _isLoading = false);

        if (mounted) {
          // Immediately offer mock login
          final useMock = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              backgroundColor: AppTheme.bgSecondary,
              title: const Text(
                'No Wallet Connected',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontFamily: 'Courier',
                ),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.bgPrimary,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: const Text(
                      'Install a mobile wallet app:\n\n'
                      '• MetaMask (recommended)\n'
                      '• Trust Wallet\n'
                      '• Rainbow Wallet\n\n'
                      'Or use mock login for testing.',
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 12,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: roleColor,
                  ),
                  child: const Text('Use Mock Login'),
                ),
              ],
            ),
          );

          if (useMock == true) {
            await _handleMockLogin();
          }
        }
        return;
      }

      // Authenticate with backend
      final authResponse = await walletService.authenticateWithWallet(
        selectedRole.value,
      );

      if (authResponse?.success == true && authResponse?.user != null) {
        final authProvider = context.read<AuthProvider>();
        authProvider.setUser(authResponse!.user!);

        setState(() => _isLoading = false);

        if (mounted) {
          Navigator.of(context).pushReplacementNamed('/dashboard');
        }
      } else {
        setState(() => _isLoading = false);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content:
                  Text(authResponse?.error ?? 'Wallet authentication failed'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      }
    } catch (e) {
      setState(() => _isLoading = false);

      // Close any open dialogs
      if (mounted && Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }

      if (mounted) {
        // Show error with option to use mock login
        final useMock = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: AppTheme.bgSecondary,
            title: Row(
              children: [
                Icon(Icons.error_outline, color: AppTheme.error, size: 24),
                const SizedBox(width: 12),
                const Text(
                  'Connection Failed',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 18,
                    fontFamily: 'Courier',
                  ),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.toString().contains('Timeout') ||
                          e.toString().contains('timeout')
                      ? 'Connection timed out after 15 seconds.'
                      : 'Error: ${e.toString()}',
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 12,
                    fontFamily: 'Courier',
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.bgPrimary,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: const Text(
                    'Common issues:\n'
                    '• No mobile wallet installed\n'
                    '• Connection timeout\n'
                    '• Request rejected in wallet\n\n'
                    'Use mock login for development?',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 11,
                      fontFamily: 'Courier',
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: roleColor,
                ),
                child: const Text('Use Mock Login'),
              ),
            ],
          ),
        );

        if (useMock == true) {
          await _handleMockLogin();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 40),

                // Logo
                Center(
                  child: Column(
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: roleColor,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Center(
                          child: Text(
                            roleIcon,
                            style: const TextStyle(
                              fontSize: 32,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      RichText(
                        text: TextSpan(
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'Courier',
                          ),
                          children: [
                            const TextSpan(
                              text: 'cashnet ',
                              style: TextStyle(color: AppTheme.textPrimary),
                            ),
                            TextSpan(
                              text: selectedRole.displayName.toLowerCase(),
                              style: TextStyle(color: roleColor),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 40),

                // Role Selector
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.bgSecondary,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.border),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'SELECT ROLE',
                        style: TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: UserRole.values.map((role) {
                          final isSelected = selectedRole == role;
                          final color = AppTheme.getRoleColor(role.value);

                          return GestureDetector(
                            onTap: () => setState(() => selectedRole = role),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? color.withOpacity(0.1)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: isSelected ? color : AppTheme.border,
                                  width: isSelected ? 2 : 1,
                                ),
                              ),
                              child: Text(
                                role.displayName,
                                style: TextStyle(
                                  color: isSelected
                                      ? color
                                      : AppTheme.textSecondary,
                                  fontSize: 12,
                                  fontWeight: isSelected
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                  fontFamily: 'Courier',
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 32),

                // Login Buttons
                if (selectedRole == UserRole.admin ||
                    selectedRole == UserRole.auditor) ...[
                  // Google Sign In for Admin/Auditor
                  ElevatedButton.icon(
                    onPressed: _isLoading ? null : _handleGoogleSignIn,
                    icon: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Image.network(
                            'https://www.google.com/favicon.ico',
                            width: 24,
                            height: 24,
                            errorBuilder: (context, error, stackTrace) =>
                                const Icon(Icons.login, size: 24),
                          ),
                    label: const Text(
                      'Continue with Google',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black87,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      elevation: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Mock Login option
                  TextButton.icon(
                    onPressed: _isLoading ? null : _handleMockLogin,
                    icon: const Icon(Icons.developer_mode, size: 20),
                    label: const Text('Use Mock Login (Dev)'),
                    style: TextButton.styleFrom(
                      foregroundColor: roleColor,
                    ),
                  ),
                ] else ...[
                  // Wallet Connect for Lender/Borrower
                  ElevatedButton.icon(
                    onPressed: _isLoading ? null : _handleWalletConnect,
                    icon: _isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Icon(Icons.account_balance_wallet, size: 24),
                    label: const Text(
                      'Connect Wallet',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: roleColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      elevation: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Mock Login option
                  TextButton.icon(
                    onPressed: _isLoading ? null : _handleMockLogin,
                    icon: const Icon(Icons.developer_mode, size: 20),
                    label: const Text('Use Mock Login (Dev)'),
                    style: TextButton.styleFrom(
                      foregroundColor: roleColor,
                    ),
                  ),
                ],

                const SizedBox(height: 32),

                // Info Box
                Container(
                  padding: const EdgeInsets.all(16),
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
                            roleIcon,
                            style: TextStyle(
                              color: roleColor,
                              fontSize: 20,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${selectedRole.displayName} ACCESS',
                            style: TextStyle(
                              color: roleColor,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'Courier',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _getRoleDescription(),
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 11,
                          fontFamily: 'Courier',
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Network indicator
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.success),
                    ),
                    child: const Text(
                      '⛓ SEPOLIA TESTNET',
                      style: TextStyle(
                        color: AppTheme.success,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _getRoleDescription() {
    switch (selectedRole) {
      case UserRole.admin:
        return 'Full protocol access. Register wallets, assign roles, pause contracts, monitor all participants.';
      case UserRole.auditor:
        return 'Read-only access to all protocol data. View transactions, analyze patterns, generate compliance reports.';
      case UserRole.lender:
        return 'Provide liquidity to pools and lending markets. Earn yield on deposits and manage portfolio.';
      case UserRole.borrower:
        return 'Access credit facilities. Borrow against collateral, build credit score, manage positions.';
    }
  }
}

// Wallet Selection Dialog
class _WalletSelectionDialog extends StatefulWidget {
  final Color roleColor;

  const _WalletSelectionDialog({required this.roleColor});

  @override
  State<_WalletSelectionDialog> createState() => _WalletSelectionDialogState();
}

class _WalletSelectionDialogState extends State<_WalletSelectionDialog> {
  final List<Map<String, String>> _mockWallets = [
    {
      'name': 'Account 1',
      'address': '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      'balance': '2.45 ETH',
    },
    {
      'name': 'Account 2',
      'address': '0x9876543210abcdef9876543210abcdef98765432',
      'balance': '10.12 ETH',
    },
    {
      'name': 'Account 3',
      'address': '0x1234567890abcdef1234567890abcdef12345678',
      'balance': '0.05 ETH',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppTheme.bgSecondary,
      title: Row(
        children: [
          Icon(Icons.account_balance_wallet, color: widget.roleColor, size: 24),
          const SizedBox(width: 12),
          const Text(
            'Select Wallet',
            style: TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 18,
              fontFamily: 'Courier',
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Choose a wallet to connect:',
              style: TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 16),
            ..._mockWallets.map((wallet) => _buildWalletOption(wallet)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.bgPrimary,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppTheme.border),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: AppTheme.warning, size: 16),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Mock wallets for development. In production, this will connect to MetaMask or WalletConnect.',
                      style: TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 10,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }

  Widget _buildWalletOption(Map<String, String> wallet) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => Navigator.of(context).pop(wallet['address']),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.bgPrimary,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: widget.roleColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Center(
                    child: Text(
                      wallet['name']!.substring(wallet['name']!.length - 1),
                      style: TextStyle(
                        color: widget.roleColor,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        wallet['name']!,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'Courier',
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${wallet['address']!.substring(0, 6)}...${wallet['address']!.substring(wallet['address']!.length - 4)}',
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 11,
                          fontFamily: 'Courier',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  wallet['balance']!,
                  style: TextStyle(
                    color: widget.roleColor,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'Courier',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
