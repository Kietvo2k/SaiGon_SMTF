/*
 * esp32s3_traffic_wifi.ino
 * ESP32-S3 (WiFi) - BỘ ĐIỀU KHIỂN ĐÈN GIAO THÔNG ngã tư 2 pha (dọc / ngang)
 *
 * Đây là BẢN CHUYỂN ĐỔI của arduino_mega_ethernet.ino sang ESP32-S3 dùng WiFi
 * thay cho Ethernet Shield. LOGIC ĐÈN + GIAO THỨC TCP giữ NGUYÊN so với bản
 * Mega (không đổi cmd, không đổi field JSON) - chỉ đổi lớp mạng (WiFi Station
 * thay Ethernet) và số chân GPIO (ESP32-S3 có sơ đồ chân khác Mega).
 * File gốc arduino_mega_ethernet.ino KHÔNG bị đụng tới, vẫn giữ nguyên.
 *
 * VAI TRÒ: giống bản Mega - điều khiển đèn + LED 7 đoạn đếm ngược, thời gian
 * đèn xanh THÍCH ỨNG theo số xe laptop gửi về qua WiFi.
 *
 * Luồng:
 *   Laptop (main.py) đếm xe bằng AI -> gửi COUNT cho ESP32 qua WiFi
 *   ESP32 điều khiển đèn + LED 7 đoạn -> đẩy trạng thái đèn (LIGHT) về laptop
 *   Laptop dùng trạng thái đèn để bắt lỗi vượt đèn đỏ -> lưu Excel
 *
 * Giao thức TCP (port 8080) GIỐNG BẢN MEGA, mỗi lệnh 1 dòng JSON kết thúc '\n':
 *   Laptop -> ESP32:
 *     {"cmd":"COUNT","vertical":<int>,"horizontal":<int>}
 *     {"cmd":"PING"}   {"cmd":"STATS"}
 *     {"cmd":"VIOLATION","plate":"...","type":"...","ts":"..."}   (kêu còi/relay)
 *   ESP32 -> Laptop:
 *     {"status":"LIGHT","vertical":"red|green|yellow","horizontal":"...",
 *      "t_v":<s>,"t_h":<s>,"g_v":<s>,"g_h":<s>,"c_v":<n>,"c_h":<n>}
 *     {"status":"PONG"}
 *     {"status":"OK","violations":N}
 *
 * MẠNG: ESP32-S3 kết nối WiFi STATION vào hotspot A50 (điện thoại 4G của user).
 *   SSID: A50   |   Mật khẩu: 11111111
 * IP được cấp DHCP tự động - MỞ SERIAL MONITOR (115200 baud) SAU KHI NẠP để
 * xem dòng "[WIFI] Da ket noi! IP: ..." rồi dùng đúng IP đó ở:
 *   python main.py --arduino <IP_ESP32_IN_RA>
 *
 * LƯU Ý QUAN TRỌNG (client isolation): một số hotspot 4G (kể cả A50, theo
 * ghi nhận trước đây trên chính hotspot này) có thể chặn 2 thiết bị cùng nối
 * hotspot nói chuyện trực tiếp với nhau. Nếu ESP32 lên WiFi được (có IP, xem
 * trong Serial) nhưng laptop KHÔNG ping/TCP tới được ESP32, đó là do
 * isolation - cần vào Cài đặt > Điểm phát sóng trên điện thoại tắt tính năng
 * này (nếu có), hoặc đổi cả ESP32 và laptop sang cùng 1 mạng WiFi khác không
 * chặn client-to-client.
 *
 * KHÔNG cần thư viện ngoài ngoài WiFi.h (có sẵn trong ESP32 Arduino core).
 * LED 7 đoạn 74HC595 là TÙY CHỌN, giống bản Mega.
 *
 * PHẦN CỨNG (ESP32-S3 logic 3.3V, khác Mega 5V - LƯU Ý khi đấu):
 *   - Đèn LED 3 màu có điện trở sẵn: chạy trực tiếp 3.3V vẫn sáng (hơi yếu hơn 5V).
 *   - Module 74HC595 / còi / relay: đa số module rẻ nhận mức 3.3V làm HIGH
 *     hợp lệ, cứ nối GPIO thẳng vào DATA/CLOCK/LATCH. Nếu module không chạy
 *     ổn, thử cấp VCC riêng cho module đó bằng đúng mức điện áp module cần
 *     (3.3V hoặc 5V) nhưng vẫn giữ chân điều khiển nối vào GPIO ESP32.
 */

#include <WiFi.h>

// ===================== CẤU HÌNH WIFI (ĐỔI CHO KHỚP MẠNG) =====================
const char* WIFI_SSID = "A50";
const char* WIFI_PASS = "11111111";
const uint16_t TCP_PORT = 8080;
WiFiServer server(TCP_PORT);

// ===================== CHÂN ĐÈN 2 TRỤC (ESP32-S3 GPIO) =====================
// Trục DỌC (Bắc-Nam) và NGANG (Đông-Tây). 4 hướng gộp theo trục.
// Chọn GPIO an toàn trên ESP32-S3 (tránh chân strap 0/3/45/46, chân boot,
// và chân USB/Flash/PSRAM nội bộ). Đổi số nếu board bạn có sơ đồ khác.
#define V_RED     4
#define V_YELLOW  5
#define V_GREEN   6
#define H_RED     7
#define H_YELLOW  8
#define H_GREEN   9
#define PIN_BUZZER 10   // còi báo vi phạm
#define PIN_RELAY  11   // relay
#define PIN_STATUS 12   // LED trạng thái (tuỳ chọn, để trống không nối cũng được)

// ===================== LED 7 ĐOẠN 74HC595 (TÙY CHỌN) =====================
// Bỏ comment để dùng module 2-digit đếm ngược (giống bản Mega).
#define USE_7SEG
#ifdef USE_7SEG
  // Trục dọc
  #define DATA_V  13
  #define CLOCK_V 14
  #define LATCH_V 15
  // Trục ngang
  #define DATA_H  16
  #define CLOCK_H 17
  #define LATCH_H 18
  // Mã LED 7 đoạn anode chung (0-9), đảo bit như bản Mega
  byte digitCode[10] = {
    ~0b00111111, ~0b00000110, ~0b01011011, ~0b01001111,
    ~0b01100110, ~0b01101101, ~0b01111101, ~0b00000111,
    ~0b01111111, ~0b01101111
  };
#endif

// ===================== LCD I2C (TÙY CHỌN) =====================
// #define USE_LCD
#ifdef USE_LCD
  #include <Wire.h>
  #include <LiquidCrystal_I2C.h>
  LiquidCrystal_I2C lcd(0x27, 20, 4);
#endif

// ===================== THAM SỐ ĐÈN (GIỐNG BẢN MEGA) =====================
const int   T_YELLOW      = 3;    // giây đèn vàng
const int   T_GREEN_MIN   = 5;    // xanh tối thiểu
const int   T_GREEN_MAX   = 25;   // xanh tối đa
const int   T_GREEN_BASE  = 10;   // xanh mặc định khi cân bằng
const int   COUNT_DIFF_TH = 3;    // chênh lệch xe >= ngưỡng thì ưu tiên tuyến đông
const unsigned long ALERT_MS = 3000;  // còi kêu 3s mỗi vi phạm
const unsigned long WIFI_RETRY_MS = 5000;  // thử lại WiFi mỗi 5s nếu rớt mạng

// ===================== TRẠNG THÁI =====================
enum Phase { V_GO, V_YEL, H_GO, H_YEL };
Phase phase = V_GO;
unsigned long phaseStart = 0;      // millis bắt đầu pha
int  phaseDuration = T_GREEN_BASE; // giây của pha hiện tại

int  countV = 0, countH = 0;       // số xe nhận từ laptop
int  greenV = T_GREEN_BASE, greenH = T_GREEN_BASE;  // thời gian xanh mỗi trục

unsigned long violationCount = 0;
unsigned long buzzerOffAt = 0;
unsigned long lastWifiRetry = 0;
String recvBuf = "";
WiFiClient activeClient;       // client đang kết nối (để đẩy LIGHT)

// ===================== LED 7 ĐOẠN =====================
#ifdef USE_7SEG
void displayNumber(int number, int dataPin, int clockPin, int latchPin) {
  if (number < 0) number = 0;
  if (number > 99) number = 99;
  int tens = number / 10, ones = number % 10;
  digitalWrite(latchPin, LOW);
  shiftOut(dataPin, clockPin, MSBFIRST, digitCode[ones]);
  shiftOut(dataPin, clockPin, MSBFIRST, digitCode[tens]);
  digitalWrite(latchPin, HIGH);
}
#endif

void showCountdown(int tV, int tH) {
#ifdef USE_7SEG
  displayNumber(tV, DATA_V, CLOCK_V, LATCH_V);
  displayNumber(tH, DATA_H, CLOCK_H, LATCH_H);
#endif
}

// ===================== ĐẶT ĐÈN THEO PHA =====================
void setLights(bool vR, bool vY, bool vG, bool hR, bool hY, bool hG) {
  digitalWrite(V_RED, vR); digitalWrite(V_YELLOW, vY); digitalWrite(V_GREEN, vG);
  digitalWrite(H_RED, hR); digitalWrite(H_YELLOW, hY); digitalWrite(H_GREEN, hG);
}

// Trạng thái đèn hiện tại của mỗi trục (để gửi laptop)
const char* vState() {
  if (phase == V_GO)  return "green";
  if (phase == V_YEL) return "yellow";
  return "red";
}
const char* hState() {
  if (phase == H_GO)  return "green";
  if (phase == H_YEL) return "yellow";
  return "red";
}

// ===================== TÍNH THỜI GIAN XANH THÍCH ỨNG =====================
// Giống bản Mega: chia tỉ lệ theo số xe mỗi trục, kẹp [MIN, MAX], không có
// xe thì về mức BASE cân bằng.
void computeGreenTimes() {
  int total = countV + countH;
  if (total <= 0) {
    greenV = T_GREEN_BASE; greenH = T_GREEN_BASE;
    return;
  }
  int budget = 2 * T_GREEN_BASE;
  int gV = (int)((long)budget * countV / total);
  int gH = budget - gV;
  if (gV < T_GREEN_MIN) gV = T_GREEN_MIN;
  if (gV > T_GREEN_MAX) gV = T_GREEN_MAX;
  if (gH < T_GREEN_MIN) gH = T_GREEN_MIN;
  if (gH > T_GREEN_MAX) gH = T_GREEN_MAX;
  greenV = gV; greenH = gH;
}

// ===================== ĐẨY TRẠNG THÁI ĐÈN VỀ LAPTOP =====================
void pushLight() {
  if (!activeClient || !activeClient.connected()) return;
  int tV = 0, tH = 0;
  int remain = phaseDuration - (int)((millis() - phaseStart) / 1000);
  if (remain < 0) remain = 0;
  if (phase == V_GO)  { tV = remain; tH = remain + T_YELLOW; }
  else if (phase == V_YEL) { tV = remain; tH = remain; }
  else if (phase == H_GO)  { tH = remain; tV = remain + T_YELLOW; }
  else { tH = remain; tV = remain; }
  activeClient.print("{\"status\":\"LIGHT\",\"vertical\":\"");
  activeClient.print(vState());
  activeClient.print("\",\"horizontal\":\"");
  activeClient.print(hState());
  activeClient.print("\",\"t_v\":"); activeClient.print(tV);
  activeClient.print(",\"t_h\":");   activeClient.print(tH);
  activeClient.print(",\"g_v\":");   activeClient.print(greenV);
  activeClient.print(",\"g_h\":");   activeClient.print(greenH);
  activeClient.print(",\"c_v\":");   activeClient.print(countV);
  activeClient.print(",\"c_h\":");   activeClient.print(countH);
  activeClient.print("}\n");
}

// ===================== CHUYỂN PHA =====================
void enterPhase(Phase p) {
  phase = p;
  phaseStart = millis();
  switch (p) {
    case V_GO:  setLights(0,0,1, 1,0,0); phaseDuration = greenV;  break; // dọc xanh
    case V_YEL: setLights(0,1,0, 1,0,0); phaseDuration = T_YELLOW; break; // dọc vàng
    case H_GO:  setLights(1,0,0, 0,0,1); phaseDuration = greenH;  break; // ngang xanh
    case H_YEL: setLights(1,0,0, 0,1,0); phaseDuration = T_YELLOW; break; // ngang vàng
  }
  Serial.print("[PHA] V="); Serial.print(vState());
  Serial.print(" H=");      Serial.print(hState());
  Serial.print(" dur=");    Serial.println(phaseDuration);
  pushLight();
}

void advancePhase() {
  switch (phase) {
    case V_GO:  enterPhase(V_YEL); break;
    case V_YEL: computeGreenTimes(); enterPhase(H_GO); break; // áp count trước pha ngang
    case H_GO:  enterPhase(H_YEL); break;
    case H_YEL: computeGreenTimes(); enterPhase(V_GO); break; // áp count trước pha dọc
  }
}

// ===================== PARSE JSON TAY (GIỐNG BẢN MEGA) =====================
String jsonGetStr(const String& json, const String& key) {
  String pat = "\"" + key + "\"";
  int k = json.indexOf(pat);
  if (k < 0) return "";
  int colon = json.indexOf(':', k + pat.length());
  if (colon < 0) return "";
  int i = colon + 1;
  while (i < (int)json.length() && (json[i] == ' ' || json[i] == '\t')) i++;
  if (i >= (int)json.length()) return "";
  if (json[i] == '"') {
    int end = json.indexOf('"', i + 1);
    if (end < 0) return "";
    return json.substring(i + 1, end);
  }
  int end = i;
  while (end < (int)json.length() &&
         json[end] != ',' && json[end] != '}' && json[end] != ' ') end++;
  return json.substring(i, end);
}

int jsonGetInt(const String& json, const String& key) {
  String v = jsonGetStr(json, key);
  return v.length() ? v.toInt() : 0;
}

// ===================== XỬ LÝ 1 LỆNH (GIAO THỨC GIỐNG BẢN MEGA) =====================
void handleCommand(const String& line, WiFiClient& client) {
  String cmd = jsonGetStr(line, "cmd");
  if (cmd.length() == 0) return;

  if (cmd == "PING") {
    client.print("{\"status\":\"PONG\"}\n");
    pushLight();                       // gửi luôn trạng thái đèn hiện tại

  } else if (cmd == "COUNT") {
    countV = jsonGetInt(line, "vertical");
    countH = jsonGetInt(line, "horizontal");
    Serial.print("[COUNT] doc="); Serial.print(countV);
    Serial.print(" ngang=");      Serial.println(countH);
    client.print("{\"status\":\"OK\",\"vertical\":" + String(countV) +
                 ",\"horizontal\":" + String(countH) + "}\n");

  } else if (cmd == "VIOLATION") {
    violationCount++;
    digitalWrite(PIN_BUZZER, HIGH);
    digitalWrite(PIN_RELAY,  HIGH);
    buzzerOffAt = millis() + ALERT_MS;
    String plate = jsonGetStr(line, "plate");
    Serial.print("[VI PHAM] #"); Serial.print(violationCount);
    Serial.print(" bien="); Serial.println(plate);
    client.print("{\"status\":\"OK\",\"violations\":" + String(violationCount) + "}\n");

  } else if (cmd == "STATS") {
    client.print("{\"status\":\"OK\",\"violations\":" + String(violationCount) +
                 ",\"vertical\":\"" + vState() +
                 "\",\"horizontal\":\"" + hState() + "\"}\n");

  } else {
    client.print("{\"status\":\"ERR\",\"msg\":\"unknown cmd\"}\n");
  }
}

// ===================== KẾT NỐI WIFI =====================
void connectWifi() {
  Serial.print("[WIFI] Dang ket noi den "); Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[WIFI] Da ket noi! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WIFI] Ket noi thất bai, se tu thu lai...");
  }
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  pinMode(V_RED, OUTPUT); pinMode(V_YELLOW, OUTPUT); pinMode(V_GREEN, OUTPUT);
  pinMode(H_RED, OUTPUT); pinMode(H_YELLOW, OUTPUT); pinMode(H_GREEN, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT); pinMode(PIN_RELAY, OUTPUT); pinMode(PIN_STATUS, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_RELAY, LOW);

#ifdef USE_7SEG
  pinMode(DATA_V, OUTPUT); pinMode(CLOCK_V, OUTPUT); pinMode(LATCH_V, OUTPUT);
  pinMode(DATA_H, OUTPUT); pinMode(CLOCK_H, OUTPUT); pinMode(LATCH_H, OUTPUT);
#endif
#ifdef USE_LCD
  Wire.begin(); lcd.init(); lcd.backlight();
#endif

  connectWifi();
  server.begin();
  Serial.print("[NET] TCP server tai porta "); Serial.println(TCP_PORT);
  digitalWrite(PIN_STATUS, HIGH);

  enterPhase(V_GO);   // bắt đầu chu kỳ: trục dọc xanh
}

// ===================== LOOP =====================
void loop() {
  // 0) Tự reconnect WiFi nếu rớt mạng (hotspot A50 có thể chập chờn)
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry >= WIFI_RETRY_MS) {
      lastWifiRetry = millis();
      Serial.println("[WIFI] Mat ket noi, dang thu lai...");
      connectWifi();
    }
  }

  // 1) Nhận client + đọc lệnh
  WiFiClient client = server.available();
  if (client) {
    activeClient = client;
    while (client.available()) {
      char c = client.read();
      if (c == '\n') {
        handleCommand(recvBuf, client);
        recvBuf = "";
      } else if (c != '\r') {
        recvBuf += c;
      }
    }
  }

  // 2) Tắt còi/relay sau ALERT_MS
  if (buzzerOffAt != 0 && millis() >= buzzerOffAt) {
    digitalWrite(PIN_BUZZER, LOW);
    digitalWrite(PIN_RELAY, LOW);
    buzzerOffAt = 0;
  }

  // 3) Máy trạng thái đèn (non-blocking)
  unsigned long elapsedMs = millis() - phaseStart;
  int remain = phaseDuration - (int)(elapsedMs / 1000);
  if (remain < 0) remain = 0;

  // Hiển thị đếm ngược LED 7 đoạn: trục đang xanh/vàng đếm remain,
  // trục kia hiển thị remain + thời gian vàng còn lại của trục này.
  if (phase == V_GO || phase == V_YEL)
    showCountdown(remain, remain + (phase == V_GO ? T_YELLOW : 0));
  else
    showCountdown(remain + (phase == H_GO ? T_YELLOW : 0), remain);

  if (elapsedMs >= (unsigned long)phaseDuration * 1000UL) {
    advancePhase();
  }
}
