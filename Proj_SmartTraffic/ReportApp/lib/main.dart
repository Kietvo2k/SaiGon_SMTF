import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models/citizen.dart';
import 'screens/cccd_entry_screen.dart';
import 'screens/main_screen.dart';
import 'services/mock_data_service.dart';

// Global theme notifier for dark mode toggle
final ValueNotifier<ThemeMode> themeNotifier = ValueNotifier(ThemeMode.system);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Vietnamese date formatting
  await initializeDateFormatting('vi_VN', null);

  // Check saved CCCD and theme mode
  final prefs = await SharedPreferences.getInstance();
  final savedCccd = prefs.getString('saved_cccd');
  final savedThemeIndex = prefs.getInt('theme_mode');
  
  if (savedThemeIndex != null && savedThemeIndex >= 0 && savedThemeIndex < ThemeMode.values.length) {
    themeNotifier.value = ThemeMode.values[savedThemeIndex];
  }

  Citizen? savedCitizen;
  if (savedCccd != null && savedCccd.isNotEmpty) {
    try {
      savedCitizen = await MockDataService().getCitizen(savedCccd);
    } catch (_) {
      // If error occurs, fallback to entry screen
    }
  }

  runApp(MyApp(initialCitizen: savedCitizen));
}

class MyApp extends StatelessWidget {
  final Citizen? initialCitizen;

  const MyApp({super.key, this.initialCitizen});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, currentMode, child) {
        return MaterialApp(
          title: 'SmartTraffic',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            useMaterial3: true,
            appBarTheme: const AppBarTheme(centerTitle: true),
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFFA42723), // Material You Red (VNeID red) seed
              brightness: Brightness.light,
            ),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            appBarTheme: const AppBarTheme(centerTitle: true),
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFFA42723),
              brightness: Brightness.dark,
            ),
          ),
          themeMode: currentMode,
          home: initialCitizen != null
              ? MainScreen(citizen: initialCitizen!)
              : const CccdEntryScreen(),
        );
      },
    );
  }
}
