import 'dart:async';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/citizen.dart';
import '../models/violation.dart';
import '../services/mock_data_service.dart';
import 'cccd_entry_screen.dart';
import 'violation_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  final Citizen citizen;

  const HomeScreen({super.key, required this.citizen});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final MockDataService _dataService = MockDataService();
  List<Violation> _violations = [];
  bool _isLoading = true;
  Timer? _refreshTimer;
  final Set<String> _seenViolationIds = <String>{};
  bool _hasLoadedViolations = false;
  final NumberFormat _currencyFormat = NumberFormat.currency(locale: 'vi_VN', symbol: 'đ');

  @override
  void initState() {
    super.initState();
    _loadViolations();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _loadViolations(announceNew: true);
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadViolations({bool announceNew = false}) async {
    if (!_hasLoadedViolations) {
      setState(() { _isLoading = true; });
    }
    try {
      final list = await _dataService.getViolations(widget.citizen.id);
      final newRecords = _hasLoadedViolations
          ? list.where((item) => !_seenViolationIds.contains(item.id)).toList()
          : const <Violation>[];
      if (!mounted) return;
      setState(() {
        _violations = list;
        _seenViolationIds
          ..clear()
          ..addAll(list.map((item) => item.id));
        _isLoading = false;
        _hasLoadedViolations = true;
      });
      if (announceNew && newRecords.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Co ${newRecords.length} ho so AI moi dang cho xac minh.'),
            backgroundColor: Colors.orange.shade800,
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;
      setState(() { _isLoading = false; });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Khong the dong bo ho so: $error')),
      );
    }
  }

  Future<void> _refreshViolations() => _loadViolations(announceNew: true);

  // Offline mock helper retained for local UI development only.
  void _simulateNewViolation() {
    _dataService.addMockViolationForUser(widget.citizen.id);
    _refreshViolations();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(FluentIcons.warning_24_regular, color: Colors.white),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Có thông báo vi phạm mới được gửi tới CCCD ${widget.citizen.id}!',
              ),
            ),
          ],
        ),
        backgroundColor: Colors.deepOrange,
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    // Calculate stats
    final pendingReview = _violations.where((v) => v.pendingReview).toList();
    final activeViolations = _violations.where((v) => !v.isPaid && !v.pendingReview).toList();
    final resolvedViolations = _violations.where((v) => v.isPaid).toList();
    final double totalFine = activeViolations.fold(0.0, (sum, item) => sum + item.fineAmount);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'SmartTraffic',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(FluentIcons.alert_24_regular),
            tooltip: 'Giả lập lỗi phạt nguội mới',
            onPressed: _simulateNewViolation,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refreshViolations,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Citizen Info Card (Material You styling)
                    _buildCitizenProfileCard(theme),
                    const SizedBox(height: 20),

                    // Stats Section
                    _buildStatsRow(theme, pendingReview.length, activeViolations.length, resolvedViolations.length, totalFine),
                    const SizedBox(height: 24),

                    // Self-check button
                    _buildManualCheckButton(theme),
                    const SizedBox(height: 24),

                    // Violations List title
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Danh sách vi phạm giao thông',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        Text(
                          '${_violations.length} lỗi',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Violation cards
                    if (_violations.isEmpty)
                      _buildEmptyViolationsCard(theme)
                    else
                      ListView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _violations.length,
                        itemBuilder: (context, index) {
                          final violation = _violations[index];
                          return _buildViolationCard(theme, violation)
                              .animate()
                              .fade(delay: (index * 100).ms, duration: 300.ms)
                              .slideX(begin: 0.1, curve: Curves.easeOut);
                        },
                      ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildCitizenProfileCard(ThemeData theme) {
    return Card(
      elevation: 4,
      shadowColor: Colors.black.withValues(alpha: 0.2),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: AspectRatio(
        aspectRatio: 1.586, // Standard ID card ratio (85.6 mm x 53.98 mm)
        child: LayoutBuilder(
          builder: (context, constraints) {
            final w = constraints.maxWidth;
            final h = constraints.maxHeight;

            return Stack(
              fit: StackFit.expand,
              children: [
                // Background image from assets
                Image.asset(
                  'assets/images/cccd_template.jpg',
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Container(
                    color: Colors.grey.shade300,
                    child: const Center(
                      child: Text(
                        'Template Error:\nThiếu file assets/images/cccd_template.jpg',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),
                
                // Photo Placeholder (left side)
                Positioned(
                  left: w * 0.04,
                  top: h * 0.35,
                  width: w * 0.24,
                  height: h * 0.50,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: widget.citizen.id == '001095000123'
                        ? Image.asset(
                            'assets/images/pholead.jpg',
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) => const Center(
                              child: Icon(FluentIcons.person_24_regular, size: 40, color: Colors.black45),
                            ),
                          )
                        : Image.network(
                            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) => const Center(
                              child: Icon(FluentIcons.person_24_regular, size: 40, color: Colors.black45),
                            ),
                          ),
                  ),
                ),

                // CCCD number (Right of "Số / No.:")
                Positioned(
                  left: w * 0.40,
                  top: h * 0.425,
                  child: Text(
                    widget.citizen.id,
                    style: TextStyle(
                      fontSize: w * 0.040,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFFD32F2F), // Red
                      letterSpacing: 2.0,
                    ),
                  ),
                ),

                // Full name (Below "Họ và tên / Full name:")
                Positioned(
                  left: w * 0.30,
                  top: h * 0.555,
                  child: Text(
                    widget.citizen.fullName.toUpperCase(),
                    style: TextStyle(
                      fontSize: w * 0.035,
                      fontWeight: FontWeight.w800,
                      color: Colors.black,
                    ),
                  ),
                ),

                // Date of birth (Right of "Ngày sinh / Date of birth:")
                Positioned(
                  left: w * 0.575,
                  top: h * 0.615,
                  child: Text(
                    widget.citizen.dateOfBirth,
                    style: TextStyle(
                      fontSize: w * 0.030,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),

                // Sex (Right of "Giới tính / Sex:")
                Positioned(
                  left: w * 0.47,
                  top: h * 0.685,
                  child: Text(
                    'Nam',
                    style: TextStyle(
                      fontSize: w * 0.030,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),

                // Nationality (Right of "Quốc tịch / Nationality:")
                Positioned(
                  left: w * 0.825,
                  top: h * 0.685,
                  child: Text(
                    'Việt Nam',
                    style: TextStyle(
                      fontSize: w * 0.030,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),
                
                // Address (Below "Nơi thường trú / Place of residence:")
                Positioned(
                  left: w * 0.30,
                  top: h * 0.89,
                  width: w * 0.65,
                  child: Text(
                    widget.citizen.address,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: w * 0.028,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ).animate().fade(duration: 400.ms).slideY(begin: -0.05);
  }

  Widget _buildStatsRow(ThemeData theme, int pending, int active, int resolved, double totalFine) {
    return Row(
      children: [
        Expanded(
          child: Card(
            elevation: 0,
            color: pending > 0 ? Colors.orange.shade50 : theme.colorScheme.surfaceVariant,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 12.0),
              child: Column(children: [
                Text('AI review queue', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('$pending', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: Colors.orange.shade800)),
                const SizedBox(height: 4),
                Text('Awaiting verification', textAlign: TextAlign.center, style: theme.textTheme.labelSmall),
              ]),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Card(
            elevation: 0,
            color: theme.colorScheme.secondaryContainer.withOpacity(0.4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 12.0),
              child: Column(children: [
                Text('Resolved records', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('$resolved', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: theme.colorScheme.onSecondaryContainer)),
                const SizedBox(height: 4),
                Text(active > 0 ? '$active approved record(s)' : 'No approved record', textAlign: TextAlign.center, style: theme.textTheme.labelSmall),
              ]),
            ),
          ),
        ),
      ],
    ).animate().fade(delay: 150.ms, duration: 400.ms);
  }

  Widget _buildManualCheckButton(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            theme.colorScheme.primary,
            theme.colorScheme.secondary,
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.primary.withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () async {
            // Show loading dialog
            showDialog(
              context: context,
              barrierDismissible: false,
              builder: (context) => const AlertDialog(
                content: Row(
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(width: 24),
                    Expanded(child: Text('Đang đối soát dữ liệu phạt nguội quốc gia...')),
                  ],
                ),
              ),
            );

            // Wait 1.5s
            await Future.delayed(const Duration(milliseconds: 1500));
            if (mounted) {
              Navigator.pop(context); // Close loading dialog
              _refreshViolations();
            }
          },
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16.0, horizontal: 20.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(FluentIcons.search_24_regular, color: Colors.white),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    'Kiểm tra vi phạm tức thời (Tự check)',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ).animate().fade(delay: 200.ms, duration: 400.ms);
  }

  Widget _buildEmptyViolationsCard(ThemeData theme) {
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceVariant.withOpacity(0.3),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 48.0, horizontal: 24.0),
        child: Column(
          children: [
            Icon(FluentIcons.shield_24_regular, size: 64, color: Colors.green.shade400),
            const SizedBox(height: 16),
            Text(
              'Tuyệt vời! Không có vi phạm',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Mã định danh của bạn chưa ghi nhận bất kỳ dữ liệu lỗi phạt nguội nào trên hệ thống.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    ).animate().fade(delay: 300.ms);
  }

  Widget _buildViolationCard(ThemeData theme, Violation violation) {
    final statusColor = violation.pendingReview ? Colors.orange : (violation.isPaid ? Colors.green : Colors.red);
    final statusBgColor = violation.pendingReview ? Colors.orange.shade50 : (violation.isPaid ? Colors.green.shade50 : Colors.red.shade50);
    final statusText = violation.pendingReview ? 'Cho xac minh' : (violation.isPaid ? 'Da xu ly' : 'Da duyet');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: violation.isPaid 
              ? theme.colorScheme.outlineVariant.withOpacity(0.3)
              : theme.colorScheme.error.withOpacity(0.3),
          width: violation.isPaid ? 1 : 1.5,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          final result = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ViolationDetailScreen(violation: violation),
            ),
          );
          if (result == true) {
            _loadViolations(); // Reload dashboard when paid
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top status row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusBgColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusText,
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Text(
                    violation.id,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              // Violation name
              Text(
                violation.violationType,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              
              // Vehicle plate & model
              Row(
                children: [
                  const Icon(FluentIcons.vehicle_car_24_regular, size: 18, color: Colors.blueGrey),
                  const SizedBox(width: 8),
                  Text(
                    '${violation.licensePlate} • ${violation.vehicleModel}',
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // Date/Time
              Row(
                children: [
                  const Icon(FluentIcons.clock_24_regular, size: 18, color: Colors.blueGrey),
                  const SizedBox(width: 8),
                  Text(
                    DateFormat('HH:mm - dd/MM/yyyy').format(violation.dateTime),
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              const Divider(height: 16, thickness: 0.5),

              // Fine amount and arrow
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Mức phạt tiền:',
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  Row(
                    children: [
                      Text(
                        _currencyFormat.format(violation.fineAmount),
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: violation.isPaid ? theme.colorScheme.primary : theme.colorScheme.error,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        FluentIcons.chevron_right_24_regular,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
