class Violation {
  final String id;
  final String cccd;
  final String licensePlate;
  final String vehicleModel;
  final String violationType;
  final String location;
  final DateTime dateTime;
  final double fineAmount;
  final String imageUrl;
  final Map<String, String> imageHeaders;
  final String reviewStatus;
  final String reviewNote;
  final double plateConfidence;
  final String plateStatus;
  bool isPaid;
  final String paymentQrData;

  Violation({
    required this.id,
    required this.cccd,
    required this.licensePlate,
    required this.vehicleModel,
    required this.violationType,
    required this.location,
    required this.dateTime,
    required this.fineAmount,
    required this.imageUrl,
    this.imageHeaders = const {},
    this.reviewStatus = 'APPROVED',
    this.reviewNote = '',
    this.plateConfidence = 0.0,
    this.plateStatus = '',
    this.isPaid = false,
    required this.paymentQrData,
  });

  bool get pendingReview => reviewStatus == 'PENDING_REVIEW';
  bool get canPay => reviewStatus == 'APPROVED' && !isPaid;
}
