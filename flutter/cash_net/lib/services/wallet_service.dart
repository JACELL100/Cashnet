import 'dart:async';
import 'package:flutter/foundation.dart';
// WalletConnect disabled for admin-only app - v2 migration incomplete
// import 'package:walletconnect_flutter_v2/walletconnect_flutter_v2.dart';
import 'package:url_launcher/url_launcher.dart';
import 'auth_service.dart';
import '../models/user.dart';

/// Wallet Service - STUB VERSION
/// This is a stub implementation for admin-only app.
/// WalletConnect functionality is disabled as v2 migration is incomplete.
/// Kept for backward compatibility with existing code.
class WalletService extends ChangeNotifier {
  String? _account;
  final AuthService _authService = AuthService();

  // Getters
  bool get isConnected => false;
  String? get account => _account;

  // Sepolia Chain ID
  static const String sepoliaChainId = 'eip155:11155111';
  static const int sepoliaChainIdInt = 11155111;

  Future<void> initWalletConnect() async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
  }

  Future<String?> connect() async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
    return null;
  }

  Future<void> disconnect() async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
    _account = null;
    notifyListeners();
  }

  Future<String?> signMessage(String message) async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
    return null;
  }

  Future<AuthResponse?> authenticateWithWallet(String role) async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
    return AuthResponse.error('WalletConnect is disabled');
  }

  Future<String?> sendTransaction({
    required String to,
    required String data,
    String? value,
  }) async {
    debugPrint('⚠️ WalletConnect is disabled in admin-only app');
    return null;
  }

  @override
  void dispose() {
    super.dispose();
  }
}
