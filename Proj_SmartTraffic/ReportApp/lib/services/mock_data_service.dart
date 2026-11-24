import '../models/citizen.dart';
import '../models/violation.dart';
import 'traffic_evidence_api.dart';

class MockDataService {
  // Singleton instance
  static final MockDataService _instance = MockDataService._internal();
  factory MockDataService() => _instance;
  MockDataService._internal() {
    _initializeData();
  }

  final Map<String, Citizen> _citizens = {};
  final List<Violation> _violations = [];
  final TrafficEvidenceApi _evidenceApi = TrafficEvidenceApi();

  void _initializeData() {
    // Citizen 1: Multiple violations
    _citizens['001095000123'] = Citizen(
      id: '001095000123',
      fullName: 'Đỗ Phú Hưng',
      dateOfBirth: '15/08/1995',
      address: 'Số 12 Ngõ 45, Đường Nguyễn Trãi, Thanh Xuân, Hà Nội',
      licensePlates: ['29G1-123.45', '29A-678.90'],
    );

    // Citizen 2: No violations
    _citizens['002096000456'] = Citizen(
      id: '002096000456',
      fullName: 'Trần Thị Minh',
      dateOfBirth: '22/11/1996',
      address: 'Số 88 Phố Huế, Hai Bà Trưng, Hà Nội',
      licensePlates: ['30E-999.99'],
    );

    // Mock Violations for Citizen 1
    _violations.add(
      Violation(
        id: 'V-2026-001',
        cccd: '001095000123',
        licensePlate: '29G1-123.45',
        vehicleModel: 'Honda SH 150i (Đen)',
        violationType: 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông (Vượt đèn đỏ)',
        location: 'Ngã tư Nguyễn Trãi - Khuất Duy Tiến, Thanh Xuân, Hà Nội',
        dateTime: DateTime(2026, 7, 10, 8, 32),
        fineAmount: 4000000.0,
        imageUrl: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=800',
        isPaid: false,
        paymentQrData: '00020101021238540010A00000072701240006970415011011311511720208NOPPHAT1520457125303704540740000005802VN5925KHO%20BAC%20NHA%20NUOC%20TW6005HA%20NOI62280824NOPPHAT%20V-2026-001%20NOP%20PHAT6304',
      ),
    );

    _violations.add(
      Violation(
        id: 'V-2026-002',
        cccd: '001095000123',
        licensePlate: '29A-678.90',
        vehicleModel: 'Toyota Vios (Trắng)',
        violationType: 'Điều khiển xe chạy quá tốc độ quy định từ 10 km/h đến 20 km/h',
        location: 'Km 18+500, Đại lộ Thăng Long, Nam Từ Liêm, Hà Nội',
        dateTime: DateTime(2026, 7, 12, 14, 15),
        fineAmount: 5000000.0,
        imageUrl: 'https://images.unsplash.com/photo-1519074002996-a69e7ac46a42?auto=format&fit=crop&q=80&w=800',
        isPaid: false,
        paymentQrData: '00020101021238540010A00000072701240006970415011011311511720208NOPPHAT2520457125303704540750000005802VN5925KHO%20BAC%20NHA%20NUOC%20TW6005HA%20NOI62280824NOPPHAT%20V-2026-002%20NOP%20PHAT6304',
      ),
    );

    _violations.add(
      Violation(
        id: 'V-2026-003',
        cccd: '001095000123',
        licensePlate: '29G1-123.45',
        vehicleModel: 'Honda SH 150i (Đen)',
        violationType: 'Không đội mũ bảo hiểm cho người đi mô tô, xe máy',
        location: 'Tuyến đường Lê Văn Lương, Cầu Giấy, Hà Nội',
        dateTime: DateTime(2026, 6, 25, 18, 45),
        fineAmount: 500000.0,
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=800',
        isPaid: true,
        paymentQrData: '00020101021238540010A00000072701240006970415011011311511720208NOPPHAT352045712530370454075000005802VN5925KHO%20BAC%20NHA%20NUOC%20TW6005HA%20NOI62280824NOPPHAT%20V-2026-003%20NOP%20PHAT6304',
      ),
    );
  }

  // Get or create citizen (generates a mock profile for unlisted CCCD numbers)
  Future<Citizen> getCitizen(String cccd) async {
    await Future.delayed(const Duration(milliseconds: 600)); // Simulate API delay
    if (_citizens.containsKey(cccd)) {
      return _citizens[cccd]!;
    } else {
      // Create a default profile for any new CCCD so it works for testing
      final newCitizen = Citizen(
        id: cccd,
        fullName: 'Nguyễn Văn Định Danh ($cccd)',
        dateOfBirth: '01/01/1990',
        address: 'Thành phố Hà Nội, Việt Nam',
        licensePlates: ['29X1-${cccd.substring(cccd.length - 5)}'],
      );
      _citizens[cccd] = newCitizen;
      return newCitizen;
    }
  }

  // Get violations for a specific CCCD
  Future<List<Violation>> getViolations(String cccd) async {
    if (_evidenceApi.configured) {
      return _evidenceApi.getViolations(cccd);
    }
    await Future.delayed(const Duration(milliseconds: 400));
    return _violations.where((v) => v.cccd == cccd).toList();
  }

  // Pull fresh AI evidence when configured. Without an API key, retain the
  // original local mock dataset so the UI can still be demonstrated offline.
  Future<List<Violation>> searchViolations(String cccd) => getViolations(cccd);

  // Mock payment confirmation
  Future<bool> payViolation(String violationId) async {
    await Future.delayed(const Duration(seconds: 1)); // Simulate transaction processing
    final index = _violations.indexWhere((v) => v.id == violationId);
    if (index != -1) {
      _violations[index].isPaid = true;
      return true;
    }
    return false;
  }

  // Add violation dynamically (can be used to simulate receiving a new push notification alert)
  void addMockViolationForUser(String cccd) {
    final newId = 'V-2026-${100 + _violations.length}';
    _violations.add(
      Violation(
        id: newId,
        cccd: cccd,
        licensePlate: _citizens[cccd]?.licensePlates.first ?? '29A-888.88',
        vehicleModel: 'Phương tiện vi phạm',
        violationType: 'Dừng, đỗ xe tại vị trí có biển "Cấm dừng và đỗ xe"',
        location: 'Đường Nguyễn Chí Thanh, Đống Đa, Hà Nội',
        dateTime: DateTime.now(),
        fineAmount: 900000.0,
        imageUrl: 'https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&q=80&w=800',
        isPaid: false,
        paymentQrData: '00020101021238540010A00000072701240006970415011011311511720208NOPPHAT952045712530370454079000005802VN5925KHO%20BAC%20NHA%20NUOC%20TW6005HA%20NOI62280824NOPPHAT%20${newId}6304',
      ),
    );
  }
}
