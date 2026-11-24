import 'dart:convert';
import 'dart:io';

import '../models/violation.dart';

/// LAN/demo connector for AI evidence. Production must use authenticated user
/// sessions and HTTPS instead of a shared development key.
class TrafficEvidenceApi {
  static const String _baseUrl = String.fromEnvironment(
    'SMART_TRAFFIC_API_BASE',
    defaultValue: 'http://192.168.16.50:8090',
  );
  static const String _appKey = String.fromEnvironment('SMART_TRAFFIC_APP_KEY');

  bool get configured => _appKey.isNotEmpty;

  Uri _uri(String path, [Map<String, String>? query]) => Uri.parse(_baseUrl)
      .replace(path: path, queryParameters: query);

  Map<String, String> get _headers => <String, String>{
        'Accept': 'application/json',
        'X-SmartTraffic-App-Key': _appKey,
      };

  Future<List<Violation>> getViolations(String cccd) async {
    if (!configured) {
      throw StateError('SMART_TRAFFIC_APP_KEY is not configured.');
    }
    final client = HttpClient();
    try {
      final request = await client.getUrl(
        _uri('/api/mobile/violations', <String, String>{'cccd': cccd}),
      );
      _headers.forEach(request.headers.set);
      final response = await request.close().timeout(const Duration(seconds: 12));
      final body = await utf8.decoder.bind(response).join();
      if (response.statusCode != HttpStatus.ok) {
        throw StateError(_readError(response.statusCode, body));
      }
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final records = (decoded['violations'] as List<dynamic>? ?? const <dynamic>[]);
      return records
          .whereType<Map<String, dynamic>>()
          .map((record) => _fromRecord(record, cccd))
          .toList(growable: false);
    } finally {
      client.close(force: true);
    }
  }

  Violation _fromRecord(Map<String, dynamic> record, String cccd) {
    final evidence = (record['evidence_urls'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final scene = evidence['scene']?.toString() ?? '';
    final occurredAt = DateTime.tryParse(record['occurred_at']?.toString() ?? '');
    return Violation(
      id: record['id']?.toString() ?? '',
      cccd: cccd,
      licensePlate: record['plate']?.toString() ?? 'UNREADABLE',
      vehicleModel: record['vehicle_type']?.toString() ?? 'UNKNOWN',
      violationType: 'AI red-light detection',
      location: record['lane']?.toString() ?? 'MONITORED LANE',
      dateTime: occurredAt?.toLocal() ?? DateTime.now(),
      fineAmount: 0,
      imageUrl: scene.isEmpty ? '' : _absoluteEvidenceUrl(scene, cccd),
      imageHeaders: _headers,
      reviewStatus: record['review_status']?.toString() ?? 'PENDING_REVIEW',
      reviewNote: record['review_note']?.toString() ?? '',
      plateConfidence: (record['plate_confidence'] as num?)?.toDouble() ?? 0,
      plateStatus: record['plate_status']?.toString() ?? '',
      paymentQrData: '',
    );
  }

  String _absoluteEvidenceUrl(String relativePath, String cccd) {
    final path = Uri.parse(relativePath);
    return _uri(path.path, <String, String>{...path.queryParameters, 'cccd': cccd}).toString();
  }

  String _readError(int statusCode, String body) {
    try {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded['error']?.toString() ?? 'Server returned HTTP $statusCode.';
    } catch (_) {
      return 'Unable to reach evidence server (HTTP $statusCode).';
    }
  }
}
