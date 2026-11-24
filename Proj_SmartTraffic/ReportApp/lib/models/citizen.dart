class Citizen {
  final String id; // CCCD - 12 digits
  final String fullName;
  final String dateOfBirth;
  final String address;
  final List<String> licensePlates;

  Citizen({
    required this.id,
    required this.fullName,
    required this.dateOfBirth,
    required this.address,
    required this.licensePlates,
  });
}
