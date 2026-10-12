# Dashboard · ESP32 monitoring dashboard

A responsive local monitoring console with six sensor channels, live trend charts, module health, connection recovery, simulated demo data, and CSV export. No database or cloud service is required.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use **Explore demo** to preview simulated telemetry, or **Connect device** for real measurements.

## Connect to the ESP32 access point

1. Configure the ESP32 firmware to create a Wi-Fi access point.
2. Join that Wi-Fi network from the computer running the dashboard.
3. Keep the Next.js server running on that computer and open http://localhost:3000.
4. In connection settings, enter the firmware endpoint (default: http://192.168.4.1/api/readings).
5. Save and connect. The browser requests fresh readings every two seconds after the preceding request completes; failed requests time out after four seconds and retry automatically.

This repository contains the dashboard, not sensor-specific ESP32 firmware. Its default sensor names are an integration contract and must be mapped to your actual hardware. The dashboard cannot configure the computer's Wi-Fi network or flash the board.

## Firmware API contract

Respond to GET /api/readings with HTTP 200, Content-Type: application/json, Cache-Control: no-store, and a JSON object such as:

```json
{
  "sensors": {
    "soilMoisture": 36.0,
    "rainfall": 2.4,
    "tilt": 3.2,
    "vibration": 0.04,
    "temperature": 27.6,
    "humidity": 68.0
  },
  "modules": {
    "soilProbe": true,
    "rainGauge": true,
    "imu": true,
    "environment": true,
    "buzzer": true
  },
  "uptime": 120
}
```

Units: soil moisture and humidity are percentages, rainfall is mm/hour, tilt is degrees relative to your calibrated baseline, vibration is g, temperature is Celsius, uptime is seconds. An optional numeric rssi property can provide signal strength in dBm if the firmware has a meaningful measurement available.

- Send numeric values, not numeric strings.
- Omit unavailable sensor values or send null. Never substitute zero in firmware for a failed sensor; real zero measurements are valid.
- At least one finite sensor value is required for a successful packet.
- Module booleans indicate availability, not alarm activation. Missing module statuses display Unknown.
- Enable CORS for the dashboard's exact origin, e.g. Access-Control-Allow-Origin: http://localhost:3000. Use the actual origin when opening the dashboard from another host.
- The firmware must acquire current readings for each response. The dashboard records receipt time; it cannot independently detect firmware replaying stale measurements.

## Connection behavior

The dashboard fetches the ESP32 directly from the browser. A cloud server cannot reach your local access point. An HTTPS-hosted dashboard may block requests to an HTTP device, and browsers can require local network permission. Local development is the intended setup.

A phone opening the dashboard must also be able to reach the computer hosting Next.js. Connecting to the ESP32's access point alone does not host this Next.js application on the microcontroller. AP-only Wi-Fi may have no internet; the UI uses no external fonts or assets.

Failed requests clear the displayed readings to zero placeholders and mark them No data. Chart gaps and blank CSV values represent missing data; they are not recorded as valid zero measurements. Stop/disconnect cancels in-flight requests. Switching between real and simulated monitoring starts a fresh chart session so sources are not mixed.

Charts retain up to 900 samples in memory. The 5/15/30 minute controls filter the current session's available samples. Export before refreshing or starting a new session if you want to keep your readings. Settings and history reset on page reload.

## Safety assessment

Dashboard displays telemetry, not a validated landslide prediction. Safety classification and automatic alarms are intentionally unconfigured until site-specific thresholds and calibrated sensor hardware are supplied. Disconnected devices never display a safe condition. Demo values are always labeled simulated.

## Validation

```sh
npm run lint
npx tsc --noEmit --incremental false
npm run build
```
