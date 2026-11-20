# Industrial Motor Health Monitoring - Wiring Guide

This guide will help you connect the sensors to your ESP32 microcontroller for the Motor Health Monitoring project.

## ⚠️ SAFETY WARNINGS ⚠️
> [!DANGER]
> This project involves working with AC Mains voltage and high currents.
> - ALWAYS disconnect the power source before touching ANY wiring.
> - Do not expose live AC wires. Use proper insulation, heat shrink tubing, or terminal blocks.
> - Have your college instructor or a qualified electrician review your AC connections before powering on.
> - Keep the low-voltage ESP32 electronics physically separated from high-voltage AC components.

## 1. Pin Connection Table

| Sensor | Sensor Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **DS18B20 (Temperature)** | VCC | 3.3V | Require 4.7kΩ pull-up resistor between Data and VCC |
| | Data | GPIO 4 | |
| | GND | GND | |
| **ADXL345 (Vibration)** | VCC | 3.3V | |
| | GND | GND | |
| | SDA | GPIO 21 | I2C Data |
| | SCL | GPIO 22 | I2C Clock |
| **ACS712-30A (Current)** | VCC | 5V | **Must use 5V** (ESP32 analog input is max 3.3V, use a voltage divider!) |
| | OUT | GPIO 34 | Analog in. Connect via voltage divider (e.g., 2kΩ / 3kΩ) to protect ESP32 |
| | GND | GND | |
| **ZMPT101B (Voltage)** | VCC | 5V | **Must use 5V** (ESP32 analog input max 3.3V, use voltage divider) |
| | OUT | GPIO 35 | Analog in. Connect via voltage divider. |
| | GND | GND | |
| **IR Sensor (RPM)** | VCC | 3.3V or 5V | Depends on module. Ensure OUT is 3.3V logic or use logic level converter |
| | OUT | GPIO 18 | Digital interrupt pin |
| | GND | GND | |

## 2. Power Supply Requirements
- The ESP32 requires a stable 5V input via the Micro-USB/USB-C port or the VIN/5V pin.
- Some sensors (ACS712, ZMPT101B) require 5V. Ensure your power supply can provide enough current (at least 1A recommended).
- Ensure a common GND among all components.

## 3. Step-by-Step Connection Instructions
1. **Prepare the Breadboard**: Place the ESP32 on the breadboard. Connect the 3.3V and GND pins to the power rails.
2. **Temperature Sensor**: Connect the DS18B20. Place a 4.7kΩ resistor between the Data line and 3.3V. Connect Data to GPIO 4.
3. **Vibration Sensor**: Connect ADXL345 SDA to GPIO 21 and SCL to GPIO 22. Provide 3.3V and GND.
4. **Current & Voltage Sensors**: Connect the 5V power and GND. *Crucial*: Use a voltage divider (e.g., 10k resistor from sensor out to ESP32 pin, 20k resistor from ESP32 pin to GND) to drop the 5V signal to a safe ~3.3V level for GPIO 34 and 35.
5. **RPM Sensor**: Connect the IR sensor OUT to GPIO 18. Adjust the onboard potentiometer to set the detection threshold.
6. **AC Connections (DO NOT DO THIS WHILE PLUGGED IN)**: 
   - Pass one phase wire of the motor *through* the ACS712 sensor.
   - Connect the AC lines in parallel to the ZMPT101B input terminals.

## 4. Required Arduino Libraries
Open Arduino IDE, go to **Sketch > Include Library > Manage Libraries**, and install:
1. `WebSockets` by Links2004
2. `OneWire` by Paul Stoffregen
3. `DallasTemperature` by Miles Burton
4. `Adafruit ADXL345` by Adafruit
5. `Adafruit Unified Sensor` by Adafruit (dependency for ADXL345)
6. `ArduinoJson` by Benoit Blanchon

## 5. Uploading Code to ESP32
1. Install the ESP32 board manager in Arduino IDE.
2. Select your specific ESP32 board (e.g., "DOIT ESP32 DEVKIT V1").
3. Select the correct COM port.
4. Update the `ssid` and `password` variables in the `.ino` file with your WiFi credentials.
5. Click **Upload**. (If it says "Connecting...", hold the `BOOT` button on the ESP32 until upload starts).

## 6. Finding the ESP32 IP Address
1. Open the Arduino IDE **Serial Monitor** (magnifying glass icon in the top right).
2. Set the baud rate to **115200**.
3. Press the `EN` or `RST` button on the ESP32 to reset it.
4. The Serial Monitor will print "Connecting to WiFi..." and then display the IP Address (e.g., `192.168.1.100`).
5. Your WebSocket server will be available at `ws://<IP_ADDRESS>:81`.
