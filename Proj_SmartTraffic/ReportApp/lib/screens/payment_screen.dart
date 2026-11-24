import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/violation.dart';
import '../services/mock_data_service.dart';

class PaymentScreen extends StatefulWidget {
  final Violation violation;

  const PaymentScreen({super.key, required this.violation});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final NumberFormat _currencyFormat = NumberFormat.currency(locale: 'vi_VN', symbol: 'đ');
  bool _isProcessing = false;

  Future<void> _confirmPayment() async {
    setState(() {
      _isProcessing = true;
    });

    // Simulate bank transaction confirmation delay
    final success = await MockDataService().payViolation(widget.violation.id);

    setState(() {
      _isProcessing = false;
    });

    if (success && mounted) {
      // Show Success Dialog
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  FluentIcons.checkmark_circle_24_regular,
                  color: Colors.green.shade600,
                  size: 64,
                ),
              ).animate().scale(duration: 400.ms, curve: Curves.easeOutBack),
              const SizedBox(height: 24),
              Text(
                'Thanh toán thành công',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.green.shade800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Kho bạc Nhà nước đã xác nhận giao dịch nộp phạt số tiền ${_currencyFormat.format(widget.violation.fineAmount)} cho mã quyết định ${widget.violation.id}.',
                textAlign: TextAlign.center,
                style: const TextStyle(height: 1.4),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () {
                  Navigator.pop(context); // Dismiss dialog
                  Navigator.pop(context, true); // Return success to detail screen
                },
                style: FilledButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Hoàn tất'),
              ),
            ],
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final violation = widget.violation;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thanh toán phạt nguội'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Instructions Alert
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer.withOpacity(0.3),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.colorScheme.primaryContainer.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  Icon(FluentIcons.info_24_regular, color: theme.colorScheme.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Sử dụng ứng dụng Ngân hàng (Mobile Banking) hoặc Ví điện tử quét mã QR dưới đây để thực hiện thanh toán trực tuyến.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                ],
              ),
            ).animate().fade(duration: 300.ms),
            const SizedBox(height: 20),

            // QR Code Center Box
            Card(
              elevation: 0,
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 24.0, horizontal: 16.0),
                child: Column(
                  children: [
                    // QR Code Frame
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.grey.shade200),
                      ),
                      child: QrImageView(
                        data: violation.paymentQrData,
                        version: QrVersions.auto,
                        size: 200,
                        backgroundColor: Colors.white,
                      ),
                    ).animate().scale(delay: 150.ms, duration: 350.ms, curve: Curves.easeOutBack),
                    const SizedBox(height: 16),
                    Text(
                      'MÃ VIETQR QUỐC GIA',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.grey.shade600,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Nộp phạt Kho bạc Nhà nước',
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Beneficiary Info Details
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceVariant.withOpacity(0.15),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.3)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  children: [
                    _buildPaymentDetailRow('Đơn vị thụ hưởng', 'KHO BAC NHA NUOC TW', theme),
                    const Divider(height: 20, thickness: 0.5),
                    _buildPaymentDetailRow('Số tài khoản', '113115117', theme),
                    const Divider(height: 20, thickness: 0.5),
                    _buildPaymentDetailRow('Ngân hàng', 'VietinBank', theme),
                    const Divider(height: 20, thickness: 0.5),
                    _buildPaymentDetailRow(
                      'Số tiền nộp phạt', 
                      _currencyFormat.format(violation.fineAmount), 
                      theme,
                      valueColor: theme.colorScheme.primary,
                      isBold: true,
                    ),
                    const Divider(height: 20, thickness: 0.5),
                    _buildPaymentDetailRow('Nội dung chuyển khoản', 'NOPPHAT ${violation.id}', theme, isCopyable: true),
                  ],
                ),
              ),
            ).animate().fade(delay: 200.ms, duration: 400.ms),
            const SizedBox(height: 24),

            // Confirm payment button
            FilledButton(
              onPressed: _isProcessing ? null : _confirmPayment,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: _isProcessing
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Tôi đã chuyển khoản thanh toán',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: _isProcessing ? null : () => Navigator.pop(context),
              child: const Text('Quay lại'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentDetailRow(
    String label, 
    String value, 
    ThemeData theme, {
    Color? valueColor,
    bool isBold = false,
    bool isCopyable = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  value,
                  textAlign: TextAlign.end,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: isBold || isCopyable ? FontWeight.bold : FontWeight.normal,
                    color: valueColor ?? theme.colorScheme.onSurface,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (isCopyable) ...[
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () {
                    // Quick mock clipboard copy
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Đã sao chép nội dung chuyển khoản.'),
                        duration: Duration(seconds: 1),
                      ),
                    );
                  },
                  child: Icon(
                    FluentIcons.clipboard_24_regular,
                    size: 16,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
