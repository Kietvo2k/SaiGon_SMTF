import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/mock_data_service.dart';
import 'main_screen.dart';

class CccdEntryScreen extends StatefulWidget {
  const CccdEntryScreen({super.key});

  @override
  State<CccdEntryScreen> createState() => _CccdEntryScreenState();
}

class _CccdEntryScreenState extends State<CccdEntryScreen> {
  final TextEditingController _cccdController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  Future<void> _submitCccd(String cccd) async {
    if (cccd.length != 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Số CCCD phải bao gồm đúng 12 chữ số.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Fetch citizen details from Mock Service
      final citizen = await MockDataService().getCitizen(cccd);
      
      // Save CCCD locally
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('saved_cccd', cccd);

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => MainScreen(citizen: citizen),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã xảy ra lỗi: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Radial Gradient Background (Exact VNeID colors extracted via python)
          Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.0, -0.4),
                radius: 1.0,
                colors: [
                  Color(0xFFA42723), // Extracted center glow color
                  Color(0xFF560C0B), // Extracted bottom/edge dark color
                ],
              ),
            ),
          ),
          // Drum pattern background (watermark)
          Positioned(
            top: -MediaQuery.of(context).size.width * 0.15,
            left: -MediaQuery.of(context).size.width * 0.15,
            right: -MediaQuery.of(context).size.width * 0.15,
            child: Opacity(
              opacity: 0.20,
              child: Image.asset(
                'assets/images/Trongdong.png',
                fit: BoxFit.contain,
              ),
            ),
          ),
          SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          const SizedBox(height: 60),
                          Image.asset(
                            'assets/images/STAL.png',
                            width: 100,
                            height: 100,
                            fit: BoxFit.contain,
                          ).animate().fade(delay: 200.ms).scale(delay: 200.ms),
                          const SizedBox(height: 16),
                          ShaderMask(
                            blendMode: BlendMode.srcIn,
                            shaderCallback: (bounds) => const LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Color(0xFFFFF29A), // Light gold at top
                                Color(0xFFCD9118), // Deep gold at bottom
                              ],
                            ).createShader(bounds),
                            child: const Text(
                              'Smart Traffic',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.5,
                              ),
                            ),
                          ).animate().fade(delay: 300.ms).slideY(begin: 0.2),
                          
                          const SizedBox(height: 4),
                          const Text(
                            '(concept)',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.white70,
                              fontStyle: FontStyle.italic,
                              letterSpacing: 1.5,
                            ),
                          ).animate().fade(delay: 400.ms).slideY(begin: 0.2),

                          const Spacer(), // Pushes the following content to the bottom
                          
                          // Introduction text
                          const Text(
                            'Hỗ trợ tra cứu phạt nguội, vi phạm an toàn giao thông trực tuyến cho người dân, cung cấp các tiện ích giao thông thông minh và an toàn.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.white,
                              height: 1.5,
                            ),
                          ).animate().fade(delay: 500.ms),
                          
                          const SizedBox(height: 32),

                          // CCCD Input
                          TextFormField(
                            controller: _cccdController,
                            keyboardType: TextInputType.number,
                            maxLength: 12,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 2.0,
                              color: Colors.white,
                            ),
                            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: Colors.black.withValues(alpha: 0.2),
                              prefixIcon: const Icon(FluentIcons.contact_card_24_regular, color: Colors.white70),
                              labelText: 'Số định danh cá nhân (CCCD)',
                              labelStyle: const TextStyle(color: Colors.white70),
                              hintText: '001095000123',
                              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
                              counterText: '',
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Colors.white30),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Color(0xFFF5C543), width: 2),
                              ),
                              errorStyle: const TextStyle(color: Color(0xFFFF8A80)),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) return 'Vui lòng nhập số CCCD';
                              if (value.length != 12) return 'CCCD phải đủ 12 chữ số';
                              return null;
                            },
                          ).animate().fade(delay: 700.ms).slideY(begin: 0.2),
                          
                          const SizedBox(height: 16),
                          
                          // Login Button
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: ElevatedButton(
                              onPressed: _isLoading
                                  ? null
                                  : () {
                                      if (_formKey.currentState!.validate()) {
                                        _submitCccd(_cccdController.text);
                                      }
                                    },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFC62828), // Red button
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                elevation: 2,
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      height: 24,
                                      width: 24,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Text(
                                      'Đăng nhập',
                                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                    ),
                            ),
                          ).animate().fade(delay: 900.ms).slideY(begin: 0.2),
                          
                          const SizedBox(height: 24),
                          const Text(
                            'Tài khoản mẫu thử nghiệm:\n001095000123 (Đỗ Phú Hưng) | 002096000456 (Trần Thị Minh)',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.white54,
                              height: 1.5,
                            ),
                          ).animate().fade(delay: 1000.ms),

                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
