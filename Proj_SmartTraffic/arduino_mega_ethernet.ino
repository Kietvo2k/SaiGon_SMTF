/*
 * Arduino Mega 2560 + Ethernet Shield W5100/W5500.
 * Two-axis adaptive traffic controller with two 74HC595 countdown displays.
 *
 * TCP JSON server: 192.168.16.201:8080
 * Each message is one JSON object terminated by '\n'.
 *
 * Supported laptop commands:
 *   {"cmd":"PING"}
 *   {"cmd":"COUNT","vertical":4,"horizontal":2}
 *   {"cmd":"VIOLATION","plate":"51A12345","type":"car","ts":"..."}
 *   {"cmd":"STATS"}
 *   {"cmd":"DEMO_RED","seconds":15}
 *
 * The sketch is compatible with jetson_comm.py when main.py is started with:
 *   python main.py --arduino 192.168.16.201 --arduino-port 8080
 */

#include <SPI.h>
#include <Ethernet.h>
#include <string.h>
#include <stdio.h>

// ===================== NETWORK =====================
byte MAC_ADDRESS[] = {0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0x01};
IPAddress MEGA_IP(192, 168, 16, 201);
IPAddress GATEWAY(192, 168, 16, 1);
IPAddress SUBNET(255, 255, 255, 0);

const uint16_t TCP_PORT = 8080;
const uint8_t ETHERNET_CS_PIN = 10;
const uint8_t SD_CS_PIN = 4;

EthernetServer server(TCP_PORT);
EthernetClient activeClient;

// ===================== TRAFFIC LIGHT OUTPUTS =====================
const uint8_t V_RED_PIN = 22;
const uint8_t V_YELLOW_PIN = 24;
const uint8_t V_GREEN_PIN = 26;

const uint8_t H_RED_PIN = 23;
const uint8_t H_YELLOW_PIN = 25;
const uint8_t H_GREEN_PIN = 27;

const uint8_t BUZZER_PIN = 9;
const uint8_t RELAY_PIN = 5;
const uint8_t STATUS_LED_PIN = 13;

// Change RELAY_ACTIVE_HIGH to false when the relay module is active LOW.
const bool LIGHT_ACTIVE_HIGH = true;
const bool RELAY_ACTIVE_HIGH = true;

// ===================== 74HC595 TWO-DIGIT DISPLAYS =====================
// Vertical display: SDI -> D2, SCLK -> D3, LOAD -> D28.
// Horizontal display: SDI -> D6, SCLK -> D7, LOAD -> D8.
// Never use D4 for LOAD: D4 is the Ethernet Shield SD-card chip select.
const bool ENABLE_7SEG = true;
const bool DISPLAY_COMMON_ANODE = true;
const bool DISPLAY_SWAP_DIGITS = false;

const uint8_t V_DISPLAY_DATA_PIN = 2;
const uint8_t V_DISPLAY_CLOCK_PIN = 3;
const uint8_t V_DISPLAY_LOAD_PIN = 28;

const uint8_t H_DISPLAY_DATA_PIN = 6;
const uint8_t H_DISPLAY_CLOCK_PIN = 7;
const uint8_t H_DISPLAY_LOAD_PIN = 8;

// Q0=a, Q1=b, Q2=c, Q3=d, Q4=e, Q5=f, Q6=g, Q7=decimal point.
const uint8_t DIGIT_SEGMENTS[10] = {
  B00111111, B00000110, B01011011, B01001111, B01100110,
  B01101101, B01111101, B00000111, B01111111, B01101111
};

// ===================== TIMING =====================
const int YELLOW_SECONDS = 3;
const int ALL_RED_SECONDS = 2;
const int GREEN_MIN_SECONDS = 5;
const int GREEN_BASE_SECONDS = 10;
const int GREEN_MAX_SECONDS = 25;
const int DEMO_RED_MAX_SECONDS = 120;

const unsigned long ALERT_MS = 3000UL;
const unsigned long LIGHT_PUSH_MS = 500UL;

// ===================== CONTROLLER STATE =====================
enum Phase {
  ALL_RED_TO_VERTICAL,
  VERTICAL_GREEN,
  VERTICAL_YELLOW,
  ALL_RED_TO_HORIZONTAL,
  HORIZONTAL_GREEN,
  HORIZONTAL_YELLOW
};

Phase phase = ALL_RED_TO_VERTICAL;
unsigned long phaseStartedAt = 0;
int phaseDurationSeconds = ALL_RED_SECONDS;

int countVertical = 0;
int countHorizontal = 0;
int greenVertical = GREEN_BASE_SECONDS;
int greenHorizontal = GREEN_BASE_SECONDS;

unsigned long violationCount = 0;
unsigned long alertOffAt = 0;
unsigned long lastLightPushAt = 0;

bool demoRedActive = false;
unsigned long demoRedOffAt = 0;

char receiveBuffer[192];
uint8_t receiveLength = 0;

// ===================== BASIC OUTPUT HELPERS =====================
void writeLight(uint8_t pin, bool on) {
  digitalWrite(pin, (on == LIGHT_ACTIVE_HIGH) ? HIGH : LOW);
}

void writeRelay(bool on) {
  digitalWrite(RELAY_PIN, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW);
}

void writeBuzzer(bool on) {
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

void setLights(bool vRed, bool vYellow, bool vGreen,
               bool hRed, bool hYellow, bool hGreen) {
  writeLight(V_RED_PIN, vRed);
  writeLight(V_YELLOW_PIN, vYellow);
  writeLight(V_GREEN_PIN, vGreen);
  writeLight(H_RED_PIN, hRed);
  writeLight(H_YELLOW_PIN, hYellow);
  writeLight(H_GREEN_PIN, hGreen);
}

// ===================== PHASE HELPERS =====================
bool demoRedIsActive() {
  if (!demoRedActive) {
    return false;
  }

  if ((long)(millis() - demoRedOffAt) >= 0) {
    demoRedActive = false;
    return false;
  }

  return true;
}

int demoRedRemainingSeconds() {
  if (!demoRedIsActive()) {
    return 0;
  }

  const unsigned long remainingMs = demoRedOffAt - millis();
  return (int)((remainingMs + 999UL) / 1000UL);
}

const char *verticalState() {
  if (demoRedIsActive()) {
    return "red";
  }

  if (phase == VERTICAL_GREEN) {
    return "green";
  }

  if (phase == VERTICAL_YELLOW) {
    return "yellow";
  }

  return "red";
}

const char *horizontalState() {
  if (demoRedIsActive()) {
    return "red";
  }

  if (phase == HORIZONTAL_GREEN) {
    return "green";
  }

  if (phase == HORIZONTAL_YELLOW) {
    return "yellow";
  }

  return "red";
}

int durationForPhase(Phase value) {
  switch (value) {
    case VERTICAL_GREEN:
      return greenVertical;
    case HORIZONTAL_GREEN:
      return greenHorizontal;
    case VERTICAL_YELLOW:
    case HORIZONTAL_YELLOW:
      return YELLOW_SECONDS;
    case ALL_RED_TO_VERTICAL:
    case ALL_RED_TO_HORIZONTAL:
    default:
      return ALL_RED_SECONDS;
  }
}

Phase nextPhase(Phase value) {
  switch (value) {
    case ALL_RED_TO_VERTICAL:
      return VERTICAL_GREEN;
    case VERTICAL_GREEN:
      return VERTICAL_YELLOW;
    case VERTICAL_YELLOW:
      return ALL_RED_TO_HORIZONTAL;
    case ALL_RED_TO_HORIZONTAL:
      return HORIZONTAL_GREEN;
    case HORIZONTAL_GREEN:
      return HORIZONTAL_YELLOW;
    case HORIZONTAL_YELLOW:
    default:
      return ALL_RED_TO_VERTICAL;
  }
}

int phaseRemainingSeconds() {
  const unsigned long elapsedMs = millis() - phaseStartedAt;
  const unsigned long durationMs = (unsigned long)phaseDurationSeconds * 1000UL;

  if (elapsedMs >= durationMs) {
    return 0;
  }

  return (int)((durationMs - elapsedMs + 999UL) / 1000UL);
}

int secondsUntilGreen(bool vertical) {
  if (demoRedIsActive()) {
    return demoRedRemainingSeconds();
  }

  const bool activeAxis = vertical
    ? (phase == VERTICAL_GREEN || phase == VERTICAL_YELLOW)
    : (phase == HORIZONTAL_GREEN || phase == HORIZONTAL_YELLOW);

  if (activeAxis) {
    return phaseRemainingSeconds();
  }

  unsigned long waitSeconds = (unsigned long)phaseRemainingSeconds();
  Phase probe = nextPhase(phase);

  while (true) {
    if ((vertical && probe == VERTICAL_GREEN) ||
        (!vertical && probe == HORIZONTAL_GREEN)) {
      break;
    }

    waitSeconds += (unsigned long)durationForPhase(probe);
    probe = nextPhase(probe);
  }

  return waitSeconds > 99UL ? 99 : (int)waitSeconds;
}

// ===================== ADAPTIVE GREEN TIME =====================
void computeGreenTimes() {
  const int total = countVertical + countHorizontal;

  if (total <= 0) {
    greenVertical = GREEN_BASE_SECONDS;
    greenHorizontal = GREEN_BASE_SECONDS;
    return;
  }

  const int budget = 2 * GREEN_BASE_SECONDS;
  int newVertical = (int)((long)budget * countVertical / total);
  int newHorizontal = budget - newVertical;

  newVertical = constrain(newVertical, GREEN_MIN_SECONDS, GREEN_MAX_SECONDS);
  newHorizontal = constrain(newHorizontal, GREEN_MIN_SECONDS, GREEN_MAX_SECONDS);

  greenVertical = newVertical;
  greenHorizontal = newHorizontal;
}

// ===================== 7-SEGMENT DISPLAY =====================
uint8_t encodedDigit(uint8_t digit) {
  const uint8_t raw = DIGIT_SEGMENTS[digit % 10];
  return DISPLAY_COMMON_ANODE ? (uint8_t)~raw : raw;
}

void displayNumber(uint8_t dataPin, uint8_t clockPin, uint8_t loadPin, int number) {
  if (!ENABLE_7SEG) {
    return;
  }

  number = constrain(number, 0, 99);
  const uint8_t tens = (uint8_t)(number / 10);
  const uint8_t ones = (uint8_t)(number % 10);

  digitalWrite(loadPin, LOW);

  // The first byte reaches the farther 74HC595 in the module chain.
  if (DISPLAY_SWAP_DIGITS) {
    shiftOut(dataPin, clockPin, MSBFIRST, encodedDigit(tens));
    shiftOut(dataPin, clockPin, MSBFIRST, encodedDigit(ones));
  } else {
    shiftOut(dataPin, clockPin, MSBFIRST, encodedDigit(ones));
    shiftOut(dataPin, clockPin, MSBFIRST, encodedDigit(tens));
  }

  digitalWrite(loadPin, HIGH);
}

void refreshDisplays() {
  displayNumber(V_DISPLAY_DATA_PIN, V_DISPLAY_CLOCK_PIN, V_DISPLAY_LOAD_PIN,
                secondsUntilGreen(true));
  displayNumber(H_DISPLAY_DATA_PIN, H_DISPLAY_CLOCK_PIN, H_DISPLAY_LOAD_PIN,
                secondsUntilGreen(false));
}

// ===================== TCP JSON PARSING =====================
bool jsonGetString(const char *json, const char *key, char *output, size_t outputSize) {
  char pattern[32];
  snprintf(pattern, sizeof(pattern), "\"%s\"", key);

  const char *position = strstr(json, pattern);
  if (position == NULL) {
    return false;
  }

  position = strchr(position + strlen(pattern), ':');
  if (position == NULL) {
    return false;
  }

  position++;
  while (*position == ' ' || *position == '\t') {
    position++;
  }

  size_t length = 0;
  if (*position == '"') {
    position++;
    while (*position != '\0' && *position != '"' && length < outputSize - 1) {
      output[length++] = *position++;
    }
  } else {
    while (*position != '\0' && *position != ',' && *position != '}' &&
           *position != ' ' && length < outputSize - 1) {
      output[length++] = *position++;
    }
  }

  output[length] = '\0';
  return length > 0;
}

int jsonGetInt(const char *json, const char *key) {
  char value[16];
  return jsonGetString(json, key, value, sizeof(value)) ? atoi(value) : 0;
}

// ===================== TCP RESPONSES =====================
void pushLightState() {
  if (!activeClient || !activeClient.connected()) {
    return;
  }

  activeClient.print(F("{\"status\":\"LIGHT\",\"vertical\":\""));
  activeClient.print(verticalState());
  activeClient.print(F("\",\"horizontal\":\""));
  activeClient.print(horizontalState());
  activeClient.print(F("\",\"t_v\":"));
  activeClient.print(secondsUntilGreen(true));
  activeClient.print(F(",\"t_h\":"));
  activeClient.print(secondsUntilGreen(false));
  activeClient.print(F(",\"g_v\":"));
  activeClient.print(greenVertical);
  activeClient.print(F(",\"g_h\":"));
  activeClient.print(greenHorizontal);
  activeClient.print(F(",\"c_v\":"));
  activeClient.print(countVertical);
  activeClient.print(F(",\"c_h\":"));
  activeClient.print(countHorizontal);
  activeClient.print(F(",\"demo_red\":"));
  activeClient.print(demoRedIsActive() ? F("true") : F("false"));
  activeClient.println(F("}"));
}

void sendStats(EthernetClient &client) {
  client.print(F("{\"status\":\"OK\",\"violations\":"));
  client.print(violationCount);
  client.print(F(",\"vertical\":\""));
  client.print(verticalState());
  client.print(F("\",\"horizontal\":\""));
  client.print(horizontalState());
  client.println(F("\"}"));
}

// ===================== COMMAND HANDLING =====================
void startDemoRed(int seconds) {
  seconds = constrain(seconds, 1, DEMO_RED_MAX_SECONDS);
  demoRedActive = true;
  demoRedOffAt = millis() + (unsigned long)seconds * 1000UL;
  setLights(true, false, false, true, false, false);
  refreshDisplays();
}

void handleCommand(const char *line, EthernetClient &client) {
  char command[20];

  if (!jsonGetString(line, "cmd", command, sizeof(command))) {
    client.println(F("{\"status\":\"ERR\",\"msg\":\"missing cmd\"}"));
    return;
  }

  if (strcmp(command, "PING") == 0) {
    client.println(F("{\"status\":\"PONG\"}"));
    pushLightState();
    return;
  }

  if (strcmp(command, "COUNT") == 0) {
    countVertical = constrain(jsonGetInt(line, "vertical"), 0, 99);
    countHorizontal = constrain(jsonGetInt(line, "horizontal"), 0, 99);

    Serial.print(F("[COUNT] vertical="));
    Serial.print(countVertical);
    Serial.print(F(" horizontal="));
    Serial.println(countHorizontal);

    client.print(F("{\"status\":\"OK\",\"vertical\":"));
    client.print(countVertical);
    client.print(F(",\"horizontal\":"));
    client.print(countHorizontal);
    client.println(F("}"));
    pushLightState();
    return;
  }

  if (strcmp(command, "VIOLATION") == 0) {
    char plate[24];
    violationCount++;
    writeBuzzer(true);
    writeRelay(true);
    alertOffAt = millis() + ALERT_MS;

    if (!jsonGetString(line, "plate", plate, sizeof(plate))) {
      strcpy(plate, "unknown");
    }

    Serial.print(F("[VIOLATION] #"));
    Serial.print(violationCount);
    Serial.print(F(" plate="));
    Serial.println(plate);

    client.print(F("{\"status\":\"OK\",\"violations\":"));
    client.print(violationCount);
    client.println(F("}"));
    return;
  }

  if (strcmp(command, "DEMO_RED") == 0) {
    const int seconds = constrain(jsonGetInt(line, "seconds"), 1, DEMO_RED_MAX_SECONDS);
    startDemoRed(seconds);
    client.print(F("{\"status\":\"OK\",\"demo_red\":"));
    client.print(seconds);
    client.println(F("}"));
    pushLightState();
    return;
  }

  if (strcmp(command, "STATS") == 0) {
    sendStats(client);
    pushLightState();
    return;
  }

  client.println(F("{\"status\":\"ERR\",\"msg\":\"unknown cmd\"}"));
}

void serviceTcp() {
  EthernetClient client = server.available();

  if (client) {
    activeClient = client;

    while (client.available() > 0) {
      const char input = (char)client.read();

      if (input == '\r') {
        continue;
      }

      if (input == '\n') {
        receiveBuffer[receiveLength] = '\0';
        if (receiveLength > 0) {
          handleCommand(receiveBuffer, client);
        }
        receiveLength = 0;
        continue;
      }

      if (receiveLength < sizeof(receiveBuffer) - 1) {
        receiveBuffer[receiveLength++] = input;
      } else {
        receiveLength = 0;
        client.println(F("{\"status\":\"ERR\",\"msg\":\"command too long\"}"));
      }
    }
  }

  if (activeClient && !activeClient.connected()) {
    activeClient.stop();
  }
}

// ===================== CONTROLLER =====================
void applyPhaseOutputs() {
  if (demoRedIsActive()) {
    setLights(true, false, false, true, false, false);
    return;
  }

  switch (phase) {
    case VERTICAL_GREEN:
      setLights(false, false, true, true, false, false);
      break;
    case VERTICAL_YELLOW:
      setLights(false, true, false, true, false, false);
      break;
    case HORIZONTAL_GREEN:
      setLights(true, false, false, false, false, true);
      break;
    case HORIZONTAL_YELLOW:
      setLights(true, false, false, false, true, false);
      break;
    case ALL_RED_TO_VERTICAL:
    case ALL_RED_TO_HORIZONTAL:
    default:
      setLights(true, false, false, true, false, false);
      break;
  }
}

void enterPhase(Phase next) {
  phase = next;

  if (phase == VERTICAL_GREEN || phase == HORIZONTAL_GREEN) {
    computeGreenTimes();
  }

  phaseDurationSeconds = durationForPhase(phase);
  phaseStartedAt = millis();
  applyPhaseOutputs();
  refreshDisplays();

  Serial.print(F("[PHASE] V="));
  Serial.print(verticalState());
  Serial.print(F(" H="));
  Serial.print(horizontalState());
  Serial.print(F(" duration="));
  Serial.println(phaseDurationSeconds);

  pushLightState();
}

void updateController() {
  if (demoRedActive) {
    if (demoRedIsActive()) {
      applyPhaseOutputs();
      return;
    }

    // Resume through the normal all-red safety phase after a demo override.
    enterPhase(ALL_RED_TO_VERTICAL);
    return;
  }

  const unsigned long elapsedMs = millis() - phaseStartedAt;
  if (elapsedMs >= (unsigned long)phaseDurationSeconds * 1000UL) {
    enterPhase(nextPhase(phase));
  }
}

// ===================== SETUP AND LOOP =====================
void setup() {
  Serial.begin(115200);

  pinMode(V_RED_PIN, OUTPUT);
  pinMode(V_YELLOW_PIN, OUTPUT);
  pinMode(V_GREEN_PIN, OUTPUT);
  pinMode(H_RED_PIN, OUTPUT);
  pinMode(H_YELLOW_PIN, OUTPUT);
  pinMode(H_GREEN_PIN, OUTPUT);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  writeBuzzer(false);
  writeRelay(false);
  digitalWrite(STATUS_LED_PIN, LOW);

  pinMode(V_DISPLAY_DATA_PIN, OUTPUT);
  pinMode(V_DISPLAY_CLOCK_PIN, OUTPUT);
  pinMode(V_DISPLAY_LOAD_PIN, OUTPUT);
  pinMode(H_DISPLAY_DATA_PIN, OUTPUT);
  pinMode(H_DISPLAY_CLOCK_PIN, OUTPUT);
  pinMode(H_DISPLAY_LOAD_PIN, OUTPUT);

  // Ethernet Shield reservations: do this before Ethernet.begin().
  pinMode(SD_CS_PIN, OUTPUT);
  digitalWrite(SD_CS_PIN, HIGH);
  pinMode(ETHERNET_CS_PIN, OUTPUT);
  digitalWrite(ETHERNET_CS_PIN, HIGH);
  pinMode(53, OUTPUT);

  Ethernet.init(ETHERNET_CS_PIN);
  Ethernet.begin(MAC_ADDRESS, MEGA_IP, GATEWAY, GATEWAY, SUBNET);
  server.begin();

  Serial.print(F("[NET] TCP server at "));
  Serial.print(Ethernet.localIP());
  Serial.print(':');
  Serial.println(TCP_PORT);

  digitalWrite(STATUS_LED_PIN, HIGH);

  // Safe power-up: hold both directions red first.
  enterPhase(ALL_RED_TO_VERTICAL);
}

void loop() {
  serviceTcp();

  if (alertOffAt != 0 && (long)(millis() - alertOffAt) >= 0) {
    writeBuzzer(false);
    writeRelay(false);
    alertOffAt = 0;
  }

  updateController();
  refreshDisplays();

  if (millis() - lastLightPushAt >= LIGHT_PUSH_MS) {
    lastLightPushAt = millis();
    pushLightState();
  }
}