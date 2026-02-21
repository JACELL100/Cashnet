import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/user.dart';
import '../services/auth_service.dart';

class AuthProvider with ChangeNotifier {
  User? _user;
  String? _token;
  bool _isAuthenticated = false;
  bool _loading = false;
  String? _error;

  final AuthService _authService = AuthService();

  User? get user => _user;
  String? get token => _token;
  bool get isAuthenticated => _isAuthenticated;
  bool get loading => _loading;
  String? get error => _error;

  AuthProvider() {
    _loadUser();
  }

  Future<void> _loadUser() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userJson = prefs.getString('user');
      final token = prefs.getString('token');

      if (userJson != null) {
        _user = User.fromJson(jsonDecode(userJson));
        _token = token;
        _isAuthenticated = true;
        notifyListeners();
      }
    } catch (e) {
      print('Error loading user: $e');
    }
  }

  Future<void> _saveUser(User user, String? token) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('user', jsonEncode(user.toJson()));
      if (token != null) {
        await prefs.setString('token', token);
      }
    } catch (e) {
      print('Error saving user: $e');
    }
  }

  Future<bool> loginWithWallet({
    required String walletAddress,
    required String signature,
    String? name,
    String? email,
    required String role,
  }) async {
    _setLoading(true);

    final response = await _authService.loginWithWallet(
      walletAddress: walletAddress,
      signature: signature,
      name: name,
      email: email,
      role: role,
    );

    if (response.success && response.user != null) {
      _user = response.user;
      _token = response.token;
      _isAuthenticated = true;
      _error = null;
      await _saveUser(_user!, _token);
      _setLoading(false);
      return true;
    } else {
      _error = response.error;
      _setLoading(false);
      return false;
    }
  }

  Future<bool> loginWithGoogle(String idToken) async {
    _setLoading(true);

    final response = await _authService.loginWithGoogle(idToken);

    if (response.success && response.user != null) {
      _user = response.user;
      _token = response.token;
      _isAuthenticated = true;
      _error = null;
      await _saveUser(_user!, _token);
      _setLoading(false);
      return true;
    } else {
      _error = response.error;
      _setLoading(false);
      return false;
    }
  }

  Future<bool> login({
    required String email,
    required String password,
    required String role,
  }) async {
    _setLoading(true);

    final response = await _authService.login(
      email: email,
      password: password,
      role: role,
    );

    if (response.success && response.user != null) {
      _user = response.user;
      _token = response.token;
      _isAuthenticated = true;
      _error = null;
      await _saveUser(_user!, _token);
      _setLoading(false);
      return true;
    } else {
      _error = response.error;
      _setLoading(false);
      return false;
    }
  }

  Future<void> logout() async {
    _user = null;
    _token = null;
    _isAuthenticated = false;
    _error = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user');
    await prefs.remove('token');

    notifyListeners();
  }

  void setUser(User user, {String? token}) {
    _user = user;
    _token = token;
    _isAuthenticated = true;
    _error = null;
    _saveUser(user, token);
    notifyListeners();
  }

  void _setLoading(bool value) {
    _loading = value;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
