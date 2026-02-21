import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:walletconnect_dart/walletconnect_dart.dart';
import 'package:url_launcher/url_launcher.dart';
import 'auth_service.dart';
import '../models/user.dart';

class WalletService extends ChangeNotifier {
  WalletConnect? _connector;
  SessionStatus? _session;
  String? _account;
  int? _chainId;

  // Getters
  bool get isConnected => _session != null && _account != null;
  String? get account => _account;
  int? get chainId => _chainId;
  SessionStatus? get session => _session;

  // WalletConnect bridge URL
  static const String bridgeUrl = 'https://bridge.walletconnect.org';

  // Sepolia Chain ID
  static const int sepoliaChainId = 11155111;

  Future<void> initWalletConnect() async {
    // Create connector
    _connector = WalletConnect(
      bridge: bridgeUrl,
      clientMeta: const PeerMeta(
        name: 'CashNet',
        description: 'DeFi Protocol for Credit & Liquidity',
        url: 'https://cashnet.finance',
        icons: [
          'https://gblobscdn.gitbook.com/spaces%2F-M4xK3q1qC8AxKKaCZGQ%2Favatar.png'
        ],
      ),
    );

    // Subscribe to events
    _connector!.on('connect', (session) => _onConnect(session));
    _connector!.on('session_update', (payload) => _onSessionUpdate(payload));
    _connector!.on('disconnect', (session) => _onDisconnect());
  }

  Future<String?> connect() async {
    if (_connector == null) {
      await initWalletConnect();
    }

    // Check if already connected
    if (!_connector!.connected) {
      try {
        // Create session with timeout
        final sessionFuture = _connector!.createSession(
          chainId: sepoliaChainId,
          onDisplayUri: (uri) async {
            // Android: Launch wallet app directly via deep link (no QR code needed)
            debugPrint('WalletConnect URI: $uri');

            // DON'T encode the URI - it's already properly formatted
            // MetaMask expects the raw WalletConnect URI

            // List of wallet deep link schemes
            final walletSchemes = [
              // Direct WalletConnect URI (most compatible)
              uri,
              // MetaMask specific schemes
              'metamask://wc?uri=$uri',
              'https://metamask.app.link/wc?uri=$uri',
              // Other wallets
              'trust://wc?uri=$uri',
              'rainbow://wc?uri=$uri',
            ];

            // Try to launch wallet apps
            bool launched = false;
            for (final scheme in walletSchemes) {
              try {
                final walletUri = Uri.parse(scheme);
                final canLaunch = await canLaunchUrl(walletUri);
                debugPrint('Can launch $scheme: $canLaunch');

                if (canLaunch || scheme == uri) {
                  await launchUrl(
                    walletUri,
                    mode: LaunchMode.externalApplication,
                  );
                  debugPrint('Successfully launched: $scheme');
                  launched = true;
                  // Break after first successful launch
                  break;
                }
              } catch (e) {
                debugPrint('Failed to launch $scheme: $e');
                continue;
              }
            }

            if (!launched) {
              debugPrint('No wallet app could be launched');
            }
          },
        );

        // Add 30 second timeout (increased for manual approval)
        final session = await sessionFuture.timeout(
          const Duration(seconds: 30),
          onTimeout: () {
            debugPrint('WalletConnect connection timeout');
            throw TimeoutException('Connection timeout - please try again');
          },
        );

        _session = session;
        if (session.accounts.isNotEmpty) {
          _account = session.accounts.first;
          _chainId = session.chainId;
          notifyListeners();
          return _account;
        }
      } catch (e) {
        debugPrint('WalletConnect Error: $e');
        return null;
      }
    } else {
      // Already connected
      _account = _session?.accounts.first;
      _chainId = _session?.chainId;
      return _account;
    }

    return null;
  }

  Future<String?> signMessage(String message) async {
    if (_connector == null || !_connector!.connected || _account == null) {
      debugPrint('Wallet not connected');
      return null;
    }

    try {
      // Sign personal message
      final signature = await _connector!.sendCustomRequest(
        method: 'personal_sign',
        params: [
          message,
          _account!,
        ],
      );

      return signature;
    } catch (e) {
      debugPrint('Sign message error: $e');
      return null;
    }
  }

  Future<AuthResponse?> authenticateWithWallet(String role) async {
    try {
      if (!isConnected || _account == null) {
        return AuthResponse.error('Wallet not connected');
      }

      // Get nonce from backend
      final authService = AuthService();
      final nonce = await authService.getNonce(_account!);

      if (nonce == null) {
        // Fallback to mock nonce
        final mockNonce =
            'Sign this message to authenticate: ${DateTime.now().millisecondsSinceEpoch}';
        final signature = await signMessage(mockNonce);

        if (signature == null) {
          return AuthResponse.error('Failed to sign message');
        }

        return await authService.loginWithWallet(
          walletAddress: _account!,
          signature: signature,
          role: role,
        );
      }

      // Sign the nonce
      final signature = await signMessage(nonce);

      if (signature == null) {
        return AuthResponse.error('Failed to sign message');
      }

      // Send to backend for verification
      return await authService.loginWithWallet(
        walletAddress: _account!,
        signature: signature,
        role: role,
      );
    } catch (e) {
      debugPrint('Authentication error: $e');
      return AuthResponse.error('Authentication failed: $e');
    }
  }

  Future<void> disconnect() async {
    try {
      if (_connector != null && _connector!.connected) {
        await _connector!.killSession();
      }
    } catch (e) {
      debugPrint('Disconnect error: $e');
    }

    _connector = null;
    _session = null;
    _account = null;
    _chainId = null;
    notifyListeners();
  }

  void _onConnect(dynamic session) {
    debugPrint('WalletConnect: Connected');
    if (session is SessionStatus) {
      _session = session;
      if (session.accounts.isNotEmpty) {
        _account = session.accounts.first;
        _chainId = session.chainId;
        notifyListeners();
      }
    }
  }

  void _onSessionUpdate(dynamic payload) {
    debugPrint('WalletConnect: Session updated');
    if (payload is WCSessionUpdateResponse) {
      _session = SessionStatus(
        chainId: payload.chainId,
        accounts: payload.accounts,
      );
      if (_session!.accounts.isNotEmpty) {
        _account = _session!.accounts.first;
        _chainId = _session!.chainId;
        notifyListeners();
      }
    }
  }

  void _onDisconnect() {
    debugPrint('WalletConnect: Disconnected');
    _session = null;
    _account = null;
    _chainId = null;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
