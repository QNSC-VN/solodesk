class SessionUser {
  final String id;
  final String email;
  final String displayName;

  SessionUser({required this.id, required this.email, required this.displayName});

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String,
      );

  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'displayName': displayName};
}

/// Mirrors backend-api's real `LoginResult` shape (`@qnsc-vn/identity`,
/// see CLAUDE.md's "Real login" section) — same tokens web-accounting's
/// `lib/auth.ts` `Session` type carries, just stored in
/// `flutter_secure_storage` here instead of httpOnly cookies (mobile has
/// no CORS restriction, so this app calls backend-api directly, no BFF).
class Session {
  final String accessToken;
  final String refreshToken;
  final String csrfToken;
  final int expiresIn;
  final SessionUser user;

  Session({required this.accessToken, required this.refreshToken, required this.csrfToken, required this.expiresIn, required this.user});

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        csrfToken: json['csrfToken'] as String,
        expiresIn: json['expiresIn'] as int,
        user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      );
}
