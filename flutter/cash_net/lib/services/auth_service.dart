import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/user.dart';

class AuthService {
  static const String apiBaseUrl = 'https://cash-net.onrender.com';

  // Username/Password Authentication for Admin
  Future<AuthResponse> loginWithUsernamePassword({
    required String username,
    required String password,
  }) async {
    try {
      // Try real API first
      final response = await http
          .post(
            Uri.parse('$apiBaseUrl/api/auth/admin-login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'username': username,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final user = User(
          id: data['user']['id'] ?? username,
          walletAddress: null,
          name: data['user']['name'] ?? 'Admin',
          email: data['user']['email'] ?? '$username@cashnet.admin',
          role: 'ADMIN',
          plan: 'admin',
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        return AuthResponse.success(user, data['access_token']);
      } else {
        return AuthResponse.error('Invalid username or password');
      }
    } catch (e) {
      // Fallback to dev credentials if API is unavailable
      print('API unavailable, using dev credentials: $e');

      if (username == 'admin' && password == 'admin123') {
        final user = User(
          id: 'dev_admin',
          walletAddress: null,
          name: 'Dev Admin',
          email: 'admin@cashnet.dev',
          role: 'ADMIN',
          plan: 'admin',
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        return AuthResponse.success(user, 'dev_admin_token');
      }

      return AuthResponse.error(
          'Network error. Dev credentials: admin/admin123');
    }
  }

  // Wallet Authentication
  Future<AuthResponse> loginWithWallet({
    required String walletAddress,
    required String signature,
    String? name,
    String? email,
    String role = 'BORROWER',
  }) async {
    try {
      // Try real API first
      final response = await http
          .post(
            Uri.parse('$apiBaseUrl/api/auth/verify'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'wallet_address': walletAddress,
              'signature': signature,
              'name': name,
              'email': email,
              'role': role,
            }),
          )
          .timeout(const Duration(seconds: 3));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final user = User(
          id: data['wallet_address'] ?? walletAddress,
          walletAddress: walletAddress,
          name: name ?? 'User',
          email: email,
          role: data['role'] ?? role,
          plan: 'starter',
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        return AuthResponse.success(user, null);
      } else {
        return AuthResponse.error('Signature verification failed');
      }
    } catch (e) {
      // Fallback to mock authentication if API is unavailable
      print('API unavailable, using mock wallet auth: $e');

      // Mock user creation
      final user = User(
        id: walletAddress,
        walletAddress: walletAddress,
        name: name ?? 'Wallet User',
        email: email ?? '${walletAddress.substring(0, 8)}@wallet.local',
        role: role,
        plan: 'pro',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        avatar:
            'https://api.dicebear.com/7.x/identicon/svg?seed=$walletAddress',
      );

      return AuthResponse.success(
          user, 'mock_token_${DateTime.now().millisecondsSinceEpoch}');
    }
  }

  // Google SSO Authentication (for Admin/Auditor)
  Future<AuthResponse> loginWithGoogle(String idToken) async {
    try {
      // Try real API first
      final response = await http
          .post(
            Uri.parse('$apiBaseUrl/auth/google'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'credential': idToken}),
          )
          .timeout(const Duration(seconds: 3));

      if (response.statusCode == 403) {
        return AuthResponse.error('Access denied - Account not provisioned');
      }

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final user = User.fromJson(data);
        return AuthResponse.success(user, data['token']);
      } else {
        return AuthResponse.error('Authentication failed');
      }
    } catch (e) {
      // Fallback to mock authentication if API is unavailable
      print('API unavailable, using mock Google auth: $e');
      return AuthResponse.error(
          'Google authentication requires backend connection. Use mock login instead.');
    }
  }

  // Email/Password Login (Mock for testing)
  Future<AuthResponse> login({
    required String email,
    required String password,
    required String role,
  }) async {
    try {
      // Simulate API delay
      await Future.delayed(const Duration(milliseconds: 800));

      // Mock user creation
      final user = User(
        id: 'user_${DateTime.now().millisecondsSinceEpoch}',
        email: email,
        name: email.split('@')[0],
        role: role,
        plan: 'starter',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=$email',
      );

      return AuthResponse.success(user, null);
    } catch (e) {
      return AuthResponse.error('Login failed: $e');
    }
  }

  // Get nonce for wallet signature
  Future<String?> getNonce(String walletAddress) async {
    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/auth/nonce'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'wallet_address': walletAddress}),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['nonce'];
      }
      return null;
    } catch (e) {
      print('Error getting nonce: $e');
      return null;
    }
  }
}
