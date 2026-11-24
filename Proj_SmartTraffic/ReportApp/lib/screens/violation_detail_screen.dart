import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import '../models/violation.dart';
import 'payment_screen.dart';

class ViolationDetailScreen extends StatefulWidget {
  final Violation violation;

  const ViolationDetailScreen({super.key, required this.violation});

  @override
  State<ViolationDetailScreen> createState() => _ViolationDetailScreenState();
}

class _ViolationDetailScreenState extends State<ViolationDetailScreen> {
  final NumberFormat _currencyFormat = NumberFormat.currency(locale: 'vi_VN', symbol: 'đ');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final violation = widget.violation;

    return Scaffold(
      appBar: AppBar(
        title: Text('Mã vi phạm: ${violation.id}'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Evidence Image section
            Card(
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              elevation: 4,
              shadowColor: Colors.black12,
              child: Stack(
                alignment: Alignment.bottomLeft,
                children: [
                  violation.imageUrl.isNotEmpty
                      ? Image.network(
                    violation.imageUrl,
                    headers: violation.imageHeaders,
                    height: 220,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        height: 220,
                        color: theme.colorScheme.surfaceVariant,
                        child: Icon(
                          FluentIcons.image_24_regular,
                          size: 64,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      );
                    },
                  )
                      : Container(
                          height: 220,
                          color: theme.colorScheme.surfaceVariant,
                          child: Icon(FluentIcons.image_24_regular, size: 64, color: theme.colorScheme.onSurfaceVariant),
                        ),
                  Container(
                    height: 220,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.7),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      children: [
                        const Icon(FluentIcons.camera_24_regular, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(
                          'Ảnh chụp bằng chứng vi phạm',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fade(duration: 350.ms).scale(begin: const Offset(0.95, 0.95), curve: Curves.easeOut),
            const SizedBox(height: 20),

            if (violation.pendingReview) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.amber.shade700),
                ),
                child: Row(children: [
                  Icon(FluentIcons.warning_24_regular, color: Colors.amber.shade900),
                  const SizedBox(width: 10),
                  Expanded(child: Text(
                    violation.reviewNote.isEmpty
                        ? 'Ho so do AI phat hien dang cho xac minh; day chua phai thong bao xu phat.'
                        : violation.reviewNote,
                    style: TextStyle(color: Colors.amber.shade900, fontWeight: FontWeight.w600),
                  )),
                ]),
              ),
              const SizedBox(height: 16),
            ],

            // Main details card
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceVariant.withOpacity(0.2),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CHI TIẾT VI PHẠM',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const Divider(height: 24, thickness: 0.5),
                    
                    _buildDetailRow(
                      context, 
                      FluentIcons.error_circle_24_regular, 
                      'Hành vi vi phạm', 
                      violation.violationType,
                      isBold: true,
                    ),
                    const SizedBox(height: 16),

                    _buildDetailRow(
                      context, 
                      FluentIcons.vehicle_car_24_regular, 
                      'Phương tiện & Biển kiểm soát', 
                      '${violation.licensePlate} (${violation.vehicleModel})',
                    ),
                    const SizedBox(height: 16),

                    _buildDetailRow(
                      context, 
                      FluentIcons.location_24_regular, 
                      'Địa điểm xảy ra', 
                      violation.location,
                    ),
                    const SizedBox(height: 16),

                    _buildDetailRow(
                      context, 
                      FluentIcons.clock_24_regular, 
                      'Thời gian ghi nhận', 
                      DateFormat('HH:mm - EEEE, dd/MM/yyyy', 'vi_VN').format(violation.dateTime),
                    ),
                    const SizedBox(height: 16),

                    violation.pendingReview
                        ? _buildDetailRow(
                            context,
                            FluentIcons.clock_24_regular,
                            'Processing status',
                            'Awaiting human verification',
                            valueColor: Colors.orange.shade800,
                            isBold: true,
                          )
                        : _buildDetailRow(
                            context,
                            FluentIcons.money_24_regular,
                            'M?c ph?t quy ??nh',
                            _currencyFormat.format(violation.fineAmount),
                            valueColor: violation.isPaid ? theme.colorScheme.primary : theme.colorScheme.error,
                            isBold: true,
                          ),
                  ],
                ),
              ),
            ).animate().fade(delay: 150.ms, duration: 400.ms),
            const SizedBox(height: 24),

            // Action / Payment Box
            _buildPaymentSection(theme, violation),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(
    BuildContext context, 
    IconData icon, 
    String label, 
    String value, {
    Color? valueColor,
    bool isBold = false,
  }) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 22, color: theme.colorScheme.primary.withOpacity(0.8)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
                  color: valueColor ?? theme.colorScheme.onSurface,
                  fontSize: isBold ? 15 : 14,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPaymentSection(ThemeData theme, Violation violation) {
    if (violation.pendingReview) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceVariant.withOpacity(0.45),
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Column(children: [
          Icon(FluentIcons.shield_24_regular, size: 42),
          SizedBox(height: 10),
          Text('Ho so dang cho xac minh', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
          SizedBox(height: 8),
          Text('Ung dung chi hien thi bang chung AI. Chua co quyet dinh xu phat, muc phat hay chuc nang thanh toan.', textAlign: TextAlign.center),
        ]),
      );
    }
    if (violation.isPaid) {
      return Card(
        elevation: 0,
        color: Colors.green.shade50,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.green.shade200),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            children: [
              Icon(FluentIcons.checkmark_circle_24_regular, color: Colors.green.shade700, size: 48),
              const SizedBox(height: 12),
              Text(
                'Lỗi này đã được nộp phạt',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: Colors.green.shade800,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Biên lai điện tử đã lưu trong hệ thống Kho bạc Nhà nước Việt Nam.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: Colors.green.shade700),
              ),
            ],
          ),
        ),
      ).animate().fade(delay: 200.ms);
    } else {
      return Container(
        padding: const EdgeInsets.all(20.0),
        decoration: BoxDecoration(
          color: theme.colorScheme.errorContainer.withOpacity(0.2),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: theme.colorScheme.errorContainer),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(FluentIcons.info_24_regular, color: theme.colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Vui lòng nộp phạt trước ngày quy định để tránh chịu phí trả chậm.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onErrorContainer,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () async {
                final result = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => PaymentScreen(violation: violation),
                  ),
                );
                if (result == true) {
                  setState(() {
                    violation.isPaid = true;
                  });
                  // Show thank you dialog/snackbar and pop with update indicator
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Nộp phạt trực tuyến thành công!'),
                        backgroundColor: Colors.green,
                      ),
                    );
                    Navigator.pop(context, true); // Pop back to reload dashboard
                  }
                }
              },
              icon: const Icon(FluentIcons.qr_code_24_regular),
              label: const Text('Nộp phạt trực tuyến (Mã QR)'),
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error,
                foregroundColor: theme.colorScheme.onError,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ],
        ),
      ).animate().fade(delay: 200.ms);
    }
  }
}
