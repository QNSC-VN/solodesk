/// Mirrors backend-api's `GET /v1/tax/estimate` response
/// (`TaxEstimateResponseDto`). `rateGroup` is `null` exactly when the
/// tenant hasn't picked one yet — the real "not configured" state, never
/// a guessed default (see CLAUDE.md's "Tax/filing v1" section).
class TaxRateGroup {
  final String code;
  final String name;
  final String gtgtRate;
  final String tncnRate;
  final bool isDraft;

  TaxRateGroup({required this.code, required this.name, required this.gtgtRate, required this.tncnRate, required this.isDraft});

  factory TaxRateGroup.fromJson(Map<String, dynamic> json) => TaxRateGroup(
        code: json['code'] as String,
        name: json['name'] as String,
        gtgtRate: json['gtgtRate'] as String,
        tncnRate: json['tncnRate'] as String,
        isDraft: json['isDraft'] as bool,
      );
}

class TaxEstimate {
  final int quarter;
  final int year;
  final String revenue;
  final bool isExempt;
  final String gtgt;
  final String tncn;
  final String total;
  final TaxRateGroup? rateGroup;
  final DateTime filingDeadline;
  final bool isFiled;

  TaxEstimate({
    required this.quarter,
    required this.year,
    required this.revenue,
    required this.isExempt,
    required this.gtgt,
    required this.tncn,
    required this.total,
    required this.rateGroup,
    required this.filingDeadline,
    required this.isFiled,
  });

  factory TaxEstimate.fromJson(Map<String, dynamic> json) => TaxEstimate(
        quarter: json['quarter'] as int,
        year: json['year'] as int,
        revenue: json['revenue'] as String,
        isExempt: json['isExempt'] as bool,
        gtgt: json['gtgt'] as String,
        tncn: json['tncn'] as String,
        total: json['total'] as String,
        rateGroup: json['rateGroup'] == null ? null : TaxRateGroup.fromJson(json['rateGroup'] as Map<String, dynamic>),
        filingDeadline: DateTime.parse(json['filingDeadline'] as String),
        isFiled: json['isFiled'] as bool,
      );
}

/// The 4 statutory rate-groups, fixed and closed — same "no free text for a
/// known small option set" discipline as onboarding's Generative UI.
class RateGroupOption {
  final String code;
  final String label;
  const RateGroupOption(this.code, this.label);
}

const kRateGroupOptions = [
  RateGroupOption('phanPhoi', 'Phân phối, cung cấp hàng hoá'),
  RateGroupOption('sanXuat', 'Sản xuất, vận tải, dịch vụ có gắn với hàng hoá'),
  RateGroupOption('dichVu', 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu'),
  RateGroupOption('khac', 'Hoạt động kinh doanh khác'),
];
