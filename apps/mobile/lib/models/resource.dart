/// Mirrors backend-api's `ResourceResponseDto` (`GET /v1/resources`) —
/// hand-written `fromJson` with field-by-field casts, same style as
/// `models/order.dart`.
class Resource {
  final String id;
  final String name;
  final String resourceType;
  final int capacity;
  final bool isActive;

  Resource({required this.id, required this.name, required this.resourceType, required this.capacity, required this.isActive});

  factory Resource.fromJson(Map<String, dynamic> json) => Resource(
        id: json['id'] as String,
        name: json['name'] as String,
        resourceType: json['resourceType'] as String,
        capacity: json['capacity'] as int,
        isActive: json['isActive'] as bool,
      );
}
