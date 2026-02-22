class User {
  final String id;
  final String? walletAddress;
  final String? name;
  final String? email;
  final String role;
  final String plan;
  final int createdAt;
  final String? avatar;
  final String? token;

  User({
    required this.id,
    this.walletAddress,
    this.name,
    this.email,
    required this.role,
    this.plan = 'starter',
    required this.createdAt,
    this.avatar,
    this.token,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? json['uid'] ?? '',
      walletAddress: json['walletAddress'] ?? json['wallet_address'],
      name: json['name'],
      email: json['email'],
      role: json['role'] ?? 'BORROWER',
      plan: json['plan'] ?? 'starter',
      createdAt: json['createdAt'] ??
          json['created_at'] ??
          DateTime.now().millisecondsSinceEpoch,
      avatar: json['avatar'] ?? json['picture'],
      token: json['token'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'walletAddress': walletAddress,
      'name': name,
      'email': email,
      'role': role,
      'plan': plan,
      'createdAt': createdAt,
      'avatar': avatar,
      'token': token,
    };
  }
}

enum UserRole {
  borrower,
  lender,
  admin,
  auditor;

  String get displayName {
    switch (this) {
      case UserRole.borrower:
        return 'BORROWER';
      case UserRole.lender:
        return 'LENDER';
      case UserRole.admin:
        return 'ADMIN';
      case UserRole.auditor:
        return 'AUDITOR';
    }
  }

  String get value => displayName;
}

class AuthResponse {
  final User? user;
  final String? token;
  final String? error;
  final bool success;

  AuthResponse({
    this.user,
    this.token,
    this.error,
    required this.success,
  });

  // Getter for success status
  bool get isSuccess => success;

  factory AuthResponse.success(User user, String? token) {
    return AuthResponse(
      user: user,
      token: token,
      success: true,
    );
  }

  factory AuthResponse.error(String error) {
    return AuthResponse(
      error: error,
      success: false,
    );
  }
}
