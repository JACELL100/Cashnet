import 'package:flutter/material.dart';

class LiquidityPage extends StatelessWidget {
  const LiquidityPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Liquidity Pool Monitor',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                fontFamily: 'monospace')),
        const SizedBox(height: 16),
        _buildCard('Pool Balance', '\$2.4M', const Color(0xFF00D4FF)),
        _buildCard('Total Deposits', '\$1.8M', const Color(0xFF22C55E)),
        _buildCard('Total Withdrawals', '\$400K', const Color(0xFFFF3860)),
        _buildCard('Active LPs', '22', const Color(0xFFB367FF)),
      ],
    );
  }

  Widget _buildCard(String label, String value, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          border: Border.all(color: const Color(0xFF334155)),
          borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Flexible(
          child: Text(label,
              style: const TextStyle(
                  color: Colors.white, fontSize: 14, fontFamily: 'monospace')),
        ),
        const SizedBox(width: 8),
        Text(value,
            style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace')),
      ]),
    );
  }
}

class CreditPage extends StatelessWidget {
  const CreditPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Credit & Lending',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                fontFamily: 'monospace')),
        const SizedBox(height: 16),
        _buildCard('Total Borrowed', '\$1.2M', const Color(0xFFFF3860)),
        _buildCard('Total Lent', '\$1.8M', const Color(0xFF22C55E)),
        _buildCard('Active Loans', '45', const Color(0xFF00D4FF)),
        _buildCard('Default Rate', '2.3%', const Color(0xFFF0A500)),
      ],
    );
  }

  Widget _buildCard(String label, String value, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          border: Border.all(color: const Color(0xFF334155)),
          borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Flexible(
          child: Text(label,
              style: const TextStyle(
                  color: Colors.white, fontSize: 14, fontFamily: 'monospace')),
        ),
        const SizedBox(width: 8),
        Text(value,
            style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace')),
      ]),
    );
  }
}

class BlockchainPage extends StatelessWidget {
  const BlockchainPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Blockchain Monitor',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                fontFamily: 'monospace')),
        const SizedBox(height: 16),
        _buildCard('Network', 'Sepolia', const Color(0xFF22C55E)),
        _buildCard('Total Transactions', '1,234', const Color(0xFF00D4FF)),
        _buildCard('Gas Used', '45.2 ETH', const Color(0xFFF0A500)),
        _buildCard('Contract Status', 'Active', const Color(0xFF22C55E)),
      ],
    );
  }

  Widget _buildCard(String label, String value, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          border: Border.all(color: const Color(0xFF334155)),
          borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Flexible(
          child: Text(label,
              style: const TextStyle(
                  color: Colors.white, fontSize: 14, fontFamily: 'monospace')),
        ),
        const SizedBox(width: 8),
        Text(value,
            style: TextStyle(
                color: color,
                fontSize: 16,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace')),
      ]),
    );
  }
}

class ThreatsPage extends StatelessWidget {
  const ThreatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Threat Detection',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                fontFamily: 'monospace')),
        const SizedBox(height: 16),
        _buildAlert('Unusual trading pattern detected', 'High',
            const Color(0xFFFF3860)),
        _buildAlert(
            'MEV bot activity spike', 'Medium', const Color(0xFFF0A500)),
        _buildAlert('Large withdrawal pending', 'Low', const Color(0xFF00D4FF)),
      ],
    );
  }

  Widget _buildAlert(String message, String severity, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(Icons.warning_amber_outlined, color: color, size: 20),
        const SizedBox(width: 12),
        Expanded(
            child: Text(message,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontFamily: 'monospace'))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
              color: color.withOpacity(0.2),
              border: Border.all(color: color),
              borderRadius: BorderRadius.circular(4)),
          child: Text(severity,
              style: TextStyle(
                  fontSize: 10,
                  color: color,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'monospace')),
        ),
      ]),
    );
  }
}
