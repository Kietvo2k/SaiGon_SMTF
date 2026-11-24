import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/citizen.dart';
import 'cccd_entry_screen.dart';
import '../main.dart'; // To access global theme notifier if needed

class SettingsScreen extends StatelessWidget {
  final Citizen citizen;

  const SettingsScreen({super.key, required this.citizen});

  Future<void> _logout(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('saved_cccd');
    if (context.mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (context) => const CccdEntryScreen()),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cài đặt'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // Profile Summary
          Card(
            elevation: 0,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: ListTile(
              leading: const CircleAvatar(
                child: Icon(FluentIcons.person_24_regular),
              ),
              title: Text(citizen.fullName, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text('CCCD: ${citizen.id}'),
            ),
          ),
          const SizedBox(height: 24),
          
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Text(
              'HIỂN THỊ',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
          ),
          
          // Theme Toggle
          ValueListenableBuilder<ThemeMode>(
            valueListenable: themeNotifier,
            builder: (context, currentMode, child) {
              final isDarkMode = currentMode == ThemeMode.dark || 
                (currentMode == ThemeMode.system && MediaQuery.of(context).platformBrightness == Brightness.dark);
                
              return SwitchListTile(
                title: const Text('Chế độ nền tối'),
                subtitle: const Text('Giao diện Dark Mode'),
                secondary: const Icon(FluentIcons.weather_moon_24_regular),
                value: isDarkMode,
                onChanged: (value) async {
                  final newMode = value ? ThemeMode.dark : ThemeMode.light;
                  themeNotifier.value = newMode;
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setInt('theme_mode', newMode.index);
                },
              );
            },
          ),
          
          const SizedBox(height: 24),
          
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Text(
              'TÀI KHOẢN',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
          ),
          
          ListTile(
            leading: const Icon(FluentIcons.sign_out_24_regular, color: Colors.red),
            title: const Text('Đăng xuất', style: TextStyle(color: Colors.red)),
            onTap: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Đăng xuất'),
                  content: const Text('Bạn có chắc chắn muốn đăng xuất và xoá mã định danh CCCD trên thiết bị này?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Hủy'),
                    ),
                    FilledButton(
                      onPressed: () {
                        Navigator.pop(context);
                        _logout(context);
                      },
                      style: FilledButton.styleFrom(backgroundColor: Colors.red),
                      child: const Text('Đồng ý'),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
