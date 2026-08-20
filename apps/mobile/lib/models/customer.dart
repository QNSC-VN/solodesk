/// Mirrors backend-api's `GET /v1/customers` response — a real aggregate
/// over confirmed orders + bookings, grouped by an exact customer-name
/// string. No stored Customer entity exists (see CLAUDE.md's "Customer
/// aggregate" section) — same real limitation the CEO mockup's own
/// "Khách hàng" screen has: two slightly different spellings of one
/// person's name appear as two separate customers.
class CustomerSummary {
  final String name;
  final int orderCount;
  final String totalSpent;
  final DateTime? firstOrderAt;
  final DateTime? lastOrderAt;
  final String? primaryChannel;
  final int bookingCount;

  CustomerSummary({
    required this.name,
    required this.orderCount,
    required this.totalSpent,
    required this.firstOrderAt,
    required this.lastOrderAt,
    required this.primaryChannel,
    required this.bookingCount,
  });

  factory CustomerSummary.fromJson(Map<String, dynamic> json) => CustomerSummary(
        name: json['name'] as String,
        orderCount: json['orderCount'] as int,
        totalSpent: json['totalSpent'] as String,
        firstOrderAt: json['firstOrderAt'] == null ? null : DateTime.parse(json['firstOrderAt'] as String),
        lastOrderAt: json['lastOrderAt'] == null ? null : DateTime.parse(json['lastOrderAt'] as String),
        primaryChannel: json['primaryChannel'] as String?,
        bookingCount: json['bookingCount'] as int,
      );
}

class CustomerOrderSummary {
  final String id;
  final String channel;
  final String status;
  final String totalAmount;
  final DateTime createdAt;

  CustomerOrderSummary({required this.id, required this.channel, required this.status, required this.totalAmount, required this.createdAt});

  factory CustomerOrderSummary.fromJson(Map<String, dynamic> json) => CustomerOrderSummary(
        id: json['id'] as String,
        channel: json['channel'] as String,
        status: json['status'] as String,
        totalAmount: json['totalAmount'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class CustomerBookingSummary {
  final String id;
  final String resourceId;
  final String status;
  final DateTime startsAt;
  final DateTime endsAt;
  final int partySize;

  CustomerBookingSummary({required this.id, required this.resourceId, required this.status, required this.startsAt, required this.endsAt, required this.partySize});

  factory CustomerBookingSummary.fromJson(Map<String, dynamic> json) => CustomerBookingSummary(
        id: json['id'] as String,
        resourceId: json['resourceId'] as String,
        status: json['status'] as String,
        startsAt: DateTime.parse(json['startsAt'] as String),
        endsAt: DateTime.parse(json['endsAt'] as String),
        partySize: json['partySize'] as int,
      );
}

class CustomerDetail extends CustomerSummary {
  final List<CustomerOrderSummary> orders;
  final List<CustomerBookingSummary> bookings;

  CustomerDetail({
    required super.name,
    required super.orderCount,
    required super.totalSpent,
    required super.firstOrderAt,
    required super.lastOrderAt,
    required super.primaryChannel,
    required super.bookingCount,
    required this.orders,
    required this.bookings,
  });

  factory CustomerDetail.fromJson(Map<String, dynamic> json) => CustomerDetail(
        name: json['name'] as String,
        orderCount: json['orderCount'] as int,
        totalSpent: json['totalSpent'] as String,
        firstOrderAt: json['firstOrderAt'] == null ? null : DateTime.parse(json['firstOrderAt'] as String),
        lastOrderAt: json['lastOrderAt'] == null ? null : DateTime.parse(json['lastOrderAt'] as String),
        primaryChannel: json['primaryChannel'] as String?,
        bookingCount: json['bookingCount'] as int,
        orders: (json['orders'] as List<dynamic>).map((o) => CustomerOrderSummary.fromJson(o as Map<String, dynamic>)).toList(),
        bookings: (json['bookings'] as List<dynamic>).map((b) => CustomerBookingSummary.fromJson(b as Map<String, dynamic>)).toList(),
      );
}
