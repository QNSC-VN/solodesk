import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Ported directly from `design-system/solodesk/MASTER.md`'s Agriculture/
/// Farm Tech palette — this app deliberately does NOT get its own color
/// system. Docs' own architecture (`packages/ui-kit` — "shared design
/// tokens across Flutter and Next.js, one design system, not two drifting
/// in parallel") is why: a `ui-ux-pro-max --design-system` run for this
/// page suggested a generic "AI purple" palette, overridden — see
/// `design-system/solodesk/pages/mobile.md` for the full reasoning.
class AppColors {
  static const primary = Color(0xFF15803D); // earth green
  static const onPrimary = Color(0xFFFFFFFF);
  static const secondary = Color(0xFF22C55E);
  static const onSecondary = Color(0xFF0F172A);
  static const accent = Color(0xFFA16207); // harvest gold
  static const onAccent = Color(0xFFFFFFFF);
  static const background = Color(0xFFF0FDF4);
  static const foreground = Color(0xFF14532D);
  static const card = Color(0xFFFFFFFF);
  static const cardForeground = Color(0xFF14532D);
  static const muted = Color(0xFFE8F0F1);
  static const mutedForeground = Color(0xFF475569);
  static const border = Color(0xFFBBF7D0);
  static const destructive = Color(0xFFDC2626);
  static const onDestructive = Color(0xFFFFFFFF);
  static const ring = Color(0xFF15803D);
}

/// Touch-target/spacing constants from `design-system/solodesk/pages/mobile.md`
/// — real per-platform numbers (48dp Android / 44pt iOS minimum), not the
/// web app's 44px-everywhere rule applied blindly to a native app.
class AppMetrics {
  static const double minTouchTarget = 48;
  static const double touchSpacing = 12;
  static const double cardRadius = 8;
  static const double bodyFontSize = 18; // elderly-appropriate base size, not the web default 16px
}

ThemeData buildAppTheme() {
  final headingFont = GoogleFonts.lexendTextTheme();
  final bodyFont = GoogleFonts.sourceSans3TextTheme();

  final textTheme = bodyFont.copyWith(
    headlineLarge: headingFont.headlineLarge?.copyWith(color: AppColors.foreground, fontWeight: FontWeight.w700),
    headlineMedium: headingFont.headlineMedium?.copyWith(color: AppColors.foreground, fontWeight: FontWeight.w700),
    headlineSmall: headingFont.headlineSmall?.copyWith(color: AppColors.foreground, fontWeight: FontWeight.w600),
    titleLarge: headingFont.titleLarge?.copyWith(color: AppColors.foreground, fontWeight: FontWeight.w600),
    bodyLarge: bodyFont.bodyLarge?.copyWith(color: AppColors.foreground, fontSize: AppMetrics.bodyFontSize),
    bodyMedium: bodyFont.bodyMedium?.copyWith(color: AppColors.foreground, fontSize: AppMetrics.bodyFontSize - 2),
  );

  final colorScheme = ColorScheme.light(
    primary: AppColors.primary,
    onPrimary: AppColors.onPrimary,
    secondary: AppColors.secondary,
    onSecondary: AppColors.onSecondary,
    tertiary: AppColors.accent,
    onTertiary: AppColors.onAccent,
    surface: AppColors.card,
    onSurface: AppColors.cardForeground,
    error: AppColors.destructive,
    onError: AppColors.onDestructive,
    outline: AppColors.border,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.background,
    textTheme: textTheme,
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.cardRadius), side: const BorderSide(color: AppColors.border)),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.onAccent,
        minimumSize: const Size.fromHeight(AppMetrics.minTouchTarget),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.cardRadius)),
        textStyle: bodyFont.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.primary, width: 1.5),
        minimumSize: const Size.fromHeight(AppMetrics.minTouchTarget),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.cardRadius)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.card,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppMetrics.cardRadius), borderSide: const BorderSide(color: AppColors.border)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    appBarTheme: const AppBarTheme(backgroundColor: AppColors.card, foregroundColor: AppColors.foreground, elevation: 0, centerTitle: false),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.card,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: AppColors.mutedForeground,
      type: BottomNavigationBarType.fixed,
    ),
    dividerColor: AppColors.border,
  );
}
