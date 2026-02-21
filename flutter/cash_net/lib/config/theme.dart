import 'package:flutter/material.dart';

class AppTheme {
  // Colors matching the web UI
  static const Color bgPrimary = Color(0xFF0A0A0F);
  static const Color bgSecondary = Color(0xFF12121A);
  static const Color bgAccent = Color(0xFF1A1A24);
  static const Color border = Color(0xFF2A2A3A);
  static const Color textPrimary = Color(0xFFE5E5E5);
  static const Color textSecondary = Color(0xFFB0B0B0);
  static const Color textTertiary = Color(0xFF808080);
  static const Color accent = Color(0xFF00D4FF);
  static const Color accentHover = Color(0xFF00B8E6);

  // Role colors
  static const Color adminColor = Color(0xFFFF3860);
  static const Color auditorColor = Color(0xFFF0A500);
  static const Color lenderColor = Color(0xFFB367FF);
  static const Color borrowerColor = Color(0xFF00D4FF);
  static const Color success = Color(0xFF22C55E);
  static const Color error = Color(0xFFFF3860);
  static const Color warning = Color(0xFFF0A500);

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgPrimary,
      primaryColor: accent,
      fontFamily: 'Courier',
      colorScheme: const ColorScheme.dark(
        primary: accent,
        secondary: accentHover,
        surface: bgSecondary,
        background: bgPrimary,
        error: error,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgSecondary,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: textPrimary),
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.bold,
          fontFamily: 'Courier',
        ),
      ),
      cardTheme: CardTheme(
        color: bgSecondary,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: border, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: bgPrimary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: accent, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: error),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: const TextStyle(color: textTertiary, fontSize: 14),
        labelStyle: const TextStyle(color: textSecondary, fontSize: 12),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.black,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            fontFamily: 'Courier',
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: accent,
          side: const BorderSide(color: accent),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            fontFamily: 'Courier',
          ),
        ),
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(
            color: textPrimary, fontSize: 32, fontWeight: FontWeight.bold),
        displayMedium: TextStyle(
            color: textPrimary, fontSize: 24, fontWeight: FontWeight.bold),
        displaySmall: TextStyle(
            color: textPrimary, fontSize: 20, fontWeight: FontWeight.bold),
        headlineMedium: TextStyle(
            color: textPrimary, fontSize: 18, fontWeight: FontWeight.bold),
        titleLarge: TextStyle(
            color: textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(color: textSecondary, fontSize: 14),
        bodyMedium: TextStyle(color: textSecondary, fontSize: 12),
        bodySmall: TextStyle(color: textTertiary, fontSize: 10),
      ),
    );
  }

  static Color getRoleColor(String role) {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return adminColor;
      case 'AUDITOR':
        return auditorColor;
      case 'LENDER':
        return lenderColor;
      case 'BORROWER':
        return borrowerColor;
      default:
        return accent;
    }
  }
}
