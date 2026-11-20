/*
 * ESP32 Industrial Motor Health Monitoring System
 * 
 * Sensors:
 * - Temperature: DS18B20 (GPIO 4)
 * - Vibration: ADXL345 (I2C: SDA=GPIO21, SCL=GPIO22)
 * - Current: ACS712-30A (GPIO 34)
 * - Voltage: ZMPT101B (GPIO 35)
 * - RPM: IR Sensor (GPIO 18, Interrupt)
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Pin Definitions
#define ONE_WIRE_BUS 4
#define CURRENT_PIN 34
#define VOLTAGE_PIN 35
#define RPM_PIN 18

// Initialize Sensors
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

// WebSocket Server on port 81
WebSocketsServer webSocket = WebSocketsServer(81);

// Variables for RPM calculation
volatile unsigned int rpmCount = 0;
unsigned long lastRpmTime = 0;
float currentRPM = 0;

void IRAM_ATTR rpm_interrupt() {
  rpmCount++;
}

// Variables for timing
unsigned long lastUpdate = 0;
const long updateInterval = 1000; // 1 second

// WebSocket event handler
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break;
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  // Initialize WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  // Initialize WebSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  
  // Initialize Sensors
  tempSensor.begin();
  if(!accel.begin()) {
    Serial.println("No ADXL345 detected. Check wiring!");
  }
  
  pinMode(CURRENT_PIN, INPUT);
  pinMode(VOLTAGE_PIN, INPUT);
  
  pinMode(RPM_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(RPM_PIN), rpm_interrupt, FALLING);
}

// Simulated/Placeholder functions for complex sensor readings
float readCurrent() {
  // Replace with actual RMS current calculation logic for ACS712
  int raw = analogRead(CURRENT_PIN);
  float voltage = (raw / 4095.0) * 3.3;
  return (voltage - 1.65) / 0.066; // Approximation for 30A version
}

float readVoltage() {
  // Replace with actual RMS voltage calculation logic for ZMPT101B
  int raw = analogRead(VOLTAGE_PIN);
  return raw * (450.0 / 4095.0); // Approximation
}

float readVibration() {
  // Replace with actual RMS velocity calculation
  sensors_event_t event; 
  accel.getEvent(&event);
  // Simplistic approximation
  return abs(event.acceleration.x) + abs(event.acceleration.y) + abs(event.acceleration.z);
}

void loop() {
  webSocket.loop();
  
  unsigned long now = millis();
  if (now - lastUpdate >= updateInterval) {
    lastUpdate = now;
    
    // Read Temperature
    tempSensor.requestTemperatures();
    float temp = tempSensor.getTempCByIndex(0);
    
    // Calculate RPM
    // rpmCount gives pulses per second if updateInterval is 1s
    // Assume 1 pulse per revolution
    currentRPM = (rpmCount * 60.0);
    rpmCount = 0; // reset for next interval
    
    // Read other sensors
    float current = readCurrent();
    float voltage = readVoltage();
    float vibration = readVibration();
    
    // Calculate Health Score (0-100)
    float health = 100.0;
    String status = "NORMAL";
    
    // Temp: 30% weight (normal <60, warning 60-75, critical >75)
    if (temp > 75) { health -= 30; status = "CRITICAL FAULT"; }
    else if (temp >= 60) { health -= 15; if(status != "CRITICAL FAULT") status = "WARNING"; }
    
    // Vibration: 30% weight (normal <2.8, warning 2.8-7.1, critical >7.1)
    if (vibration > 7.1) { health -= 30; status = "CRITICAL FAULT"; }
    else if (vibration >= 2.8) { health -= 15; if(status != "CRITICAL FAULT") status = "WARNING"; }
    
    // Current: 20% weight (normal <14.8, warning 14.8-18, critical >18)
    if (current > 18) { health -= 20; status = "CRITICAL FAULT"; }
    else if (current >= 14.8) { health -= 10; if(status != "CRITICAL FAULT") status = "WARNING"; }
    
    // Voltage: 10% weight (normal 400-430, critical <370 or >450)
    if (voltage < 370 || voltage > 450) { health -= 10; status = "CRITICAL FAULT"; }
    else if (voltage < 400 || voltage > 430) { health -= 5; if(status != "CRITICAL FAULT") status = "WARNING"; }
    
    // RPM: 10% weight (normal 1450-1500)
    if (currentRPM < 1450 || currentRPM > 1500) { health -= 10; if(status != "CRITICAL FAULT") status = "WARNING"; }
    
    // Ensure health is not negative
    if (health < 0) health = 0;
    
    // Create JSON payload
    StaticJsonDocument<256> doc;
    doc["temperature"] = temp;
    doc["vibration"] = vibration;
    doc["current"] = current;
    doc["voltage"] = voltage;
    doc["rpm"] = currentRPM;
    doc["health"] = health;
    doc["status"] = status;
    doc["timestamp"] = millis(); // Using millis() as a placeholder for actual timestamp
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Broadcast to all clients
    webSocket.broadcastTXT(jsonString);
    
    Serial.println(jsonString);
  }
}
