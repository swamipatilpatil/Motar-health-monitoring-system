/**
 * Industrial Motor Health Monitoring System - Frontend Script
 * Supports TWO data modes:
 *   1. Demo Simulation — preset modes with random fluctuations (original behavior)
 *   2. Live Sensor — real-time WebSocket data from ESP32 microcontroller
 */

document.addEventListener('DOMContentLoaded', () => {
    // =====================================================================
    //  STATE VARIABLES
    // =====================================================================
    let isLiveUpdating = true;
    let currentMode = 'normal';      // Demo modes: 'normal', 'warning', 'fault'
    let dataSource = 'demo';         // 'demo' or 'live'
    let updateInterval = null;
    let websocket = null;
    let wsReconnectTimer = null;
    let wsReconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    // =====================================================================
    //  DEMO MODE PRESETS (original simulation data)
    // =====================================================================
    const presets = {
        normal: {
            motorStatus: 'NORMAL', runningBadge: 'RUNNING', runningClass: 'running',
            health: 95, healthLabel: 'GOOD', healthBadge: 'EXCELLENT', healthBadgeClass: 'badge-success',
            predictiveStatus: 'No Anomaly Detected', predictiveClass: 'text-green',
            riskLevel: 'Low Risk', riskClass: 'text-green',
            tempBase: 42.5, tempVariance: 1.2,
            vibrationBase: 1.82, vibrationVariance: 0.25,
            vibrationClass: 'Good (Class I)', vibrationTextClass: 'text-green',
            currentBase: 12.4, currentVariance: 0.5,
            voltageBase: 415.2, voltageVariance: 2.5,
            rpmBase: 1482, rpmVariance: 6, loadFactor: 76
        },
        warning: {
            motorStatus: 'WARNING', runningBadge: 'HIGH LOAD', runningClass: 'warning',
            health: 74, healthLabel: 'WARNING', healthBadge: 'DEGRADED', healthBadgeClass: 'badge-warning',
            predictiveStatus: 'High Thermal & Vibration Load', predictiveClass: 'text-yellow',
            riskLevel: 'Moderate Risk', riskClass: 'text-yellow',
            tempBase: 71.8, tempVariance: 2.5,
            vibrationBase: 4.85, vibrationVariance: 0.4,
            vibrationClass: 'Unsatisfactory (Class III)', vibrationTextClass: 'text-yellow',
            currentBase: 15.8, currentVariance: 0.7,
            voltageBase: 398.5, voltageVariance: 4.0,
            rpmBase: 1450, rpmVariance: 10, loadFactor: 92
        },
        fault: {
            motorStatus: 'CRITICAL FAULT', runningBadge: 'OVERHEAT', runningClass: 'fault',
            health: 38, healthLabel: 'CRITICAL', healthBadge: 'ACTION REQUIRED', healthBadgeClass: 'badge-danger',
            predictiveStatus: 'Bearing Failure Imminent', predictiveClass: 'text-red',
            riskLevel: 'HIGH RISK (CRITICAL)', riskClass: 'text-red',
            tempBase: 88.4, tempVariance: 3.5,
            vibrationBase: 9.60, vibrationVariance: 0.8,
            vibrationClass: 'Unacceptable (Class IV)', vibrationTextClass: 'text-red',
            currentBase: 20.4, currentVariance: 1.2,
            voltageBase: 382.0, voltageVariance: 6.0,
            rpmBase: 1395, rpmVariance: 15, loadFactor: 118
        }
    };

    // =====================================================================
    //  DOM ELEMENT REFERENCES
    // =====================================================================
    const dateEl = document.getElementById('current-date');
    const timeEl = document.getElementById('current-time');

    // Motor State Summary
    const healthPercentEl = document.getElementById('val-health-percent');
    const healthBadgeEl = document.getElementById('health-badge');
    const gaugeProgressEl = document.getElementById('gauge-progress');
    const predictiveStatusEl = document.getElementById('predictive-status');
    const motorStatusBadgeEl = document.getElementById('val-motor-status');
    const loadProgressFillEl = document.getElementById('load-progress-fill');
    const loadFactorTextEl = document.getElementById('val-load-factor');

    // Telemetry Cards
    const cardMotorStatusEl = document.getElementById('card-motor-status');
    const valTempEl = document.getElementById('val-temperature');
    const valVibrationEl = document.getElementById('val-vibration');
    const vibrationClassEl = document.getElementById('vibration-class');
    const valCurrentEl = document.getElementById('val-current');
    const valVoltageEl = document.getElementById('val-voltage');
    const valRpmEl = document.getElementById('val-rpm');
    const cardValHealthEl = document.getElementById('card-val-health');
    const cardHealthLabelEl = document.getElementById('card-health-label');
    const riskLevelValEl = document.getElementById('risk-level-val');

    // Controls
    const toggleSimBtn = document.getElementById('toggle-sim-btn');
    const presetButtons = document.querySelectorAll('.preset-btn');
    const enableNotifBtn = document.getElementById('enable-notifications-btn');
    const notifBtnText = document.getElementById('notif-btn-text');
    const dataSourceLabel = document.getElementById('data-source-label');

    // ESP32 Connection Panel
    const esp32IpInput = document.getElementById('esp32-ip');
    const connectBtn = document.getElementById('connect-btn');
    const connectBtnIcon = document.getElementById('connect-btn-icon');
    const connectBtnText = document.getElementById('connect-btn-text');
    const connStatusDot = document.getElementById('conn-status-dot');
    const connStatusText = document.getElementById('conn-status-text');
    const modeDemoBtn = document.getElementById('mode-demo');
    const modeLiveBtn = document.getElementById('mode-live');

    let lastNotifTime = 0;
    const NOTIF_COOLDOWN_MS = 12000;

    // =====================================================================
    //  BROWSER PUSH NOTIFICATION SYSTEM
    // =====================================================================
    function checkNotificationPermission() {
        if (!enableNotifBtn) return;
        if (!("Notification" in window)) {
            notifBtnText.textContent = "Not Supported";
            enableNotifBtn.disabled = true;
            return;
        }
        if (Notification.permission === 'granted') {
            enableNotifBtn.classList.add('granted');
            enableNotifBtn.classList.remove('denied');
            notifBtnText.textContent = "Alerts Active";
        } else if (Notification.permission === 'denied') {
            enableNotifBtn.classList.add('denied');
            enableNotifBtn.classList.remove('granted');
            notifBtnText.textContent = "Alerts Blocked";
        } else {
            enableNotifBtn.classList.remove('granted', 'denied');
            notifBtnText.textContent = "Enable Push Alerts";
        }
    }

    if (enableNotifBtn) {
        enableNotifBtn.addEventListener('click', async () => {
            if (!("Notification" in window)) { alert("Browser push notifications are not supported."); return; }
            if (Notification.permission === 'granted') {
                sendPushNotification("Notification System Active", "Motor Health Alert System is connected!");
                return;
            }
            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                checkNotificationPermission();
                if (permission === 'granted') {
                    sendPushNotification("Alerts Enabled", "You will now receive desktop push alerts for motor faults.");
                }
            } else {
                alert("Notifications are blocked. Please allow them in your browser settings.");
            }
        });
    }
    checkNotificationPermission();

    function sendPushNotification(title, body) {
        if (!("Notification" in window) || Notification.permission !== 'granted') return;
        const now = Date.now();
        if (now - lastNotifTime < NOTIF_COOLDOWN_MS) return;
        lastNotifTime = now;
        try { new Notification(title, { body, tag: 'motor-health-alert', renotify: true }); }
        catch (e) { console.error("Notification Error:", e); }
    }

    // =====================================================================
    //  CRITICAL ALERT BANNER + CONTINUOUS ALARM
    // =====================================================================
    const criticalBannerEl = document.getElementById('critical-alert-banner');
    const criticalBannerTitleEl = document.getElementById('critical-banner-title');
    const criticalBannerDescEl = document.getElementById('critical-banner-desc');
    const dismissAlertBtn = document.getElementById('dismiss-alert-btn');

    let continuousAlarmInterval = null;
    let isAlarmRinging = false;

    if (dismissAlertBtn) {
        dismissAlertBtn.addEventListener('click', () => {
            if (criticalBannerEl) criticalBannerEl.classList.add('hidden');
            stopContinuousAlarmSound();
        });
    }

    const soundSelectorEl = document.getElementById('sound-selector');
    const testSoundBtnEl = document.getElementById('test-sound-btn');

    function playEmergencyAlarmSound(styleOverride = null) {
        try {
            const style = styleOverride || (soundSelectorEl ? soundSelectorEl.value : 'industrial_beep');
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();

            if (style === 'siren') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.35);
                gain.gain.setValueAtTime(0.85, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(); osc.stop(ctx.currentTime + 0.35);
            } else if (style === 'chime') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(1760, ctx.currentTime);
                gain.gain.setValueAtTime(0.9, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(); osc.stop(ctx.currentTime + 0.5);
            } else {
                const now = ctx.currentTime;
                const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
                osc1.type = 'square'; osc1.frequency.setValueAtTime(1400, now);
                gain1.gain.setValueAtTime(0.8, now);
                gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
                osc1.connect(gain1); gain1.connect(ctx.destination);
                osc1.start(now); osc1.stop(now + 0.12);

                const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
                osc2.type = 'square'; osc2.frequency.setValueAtTime(1750, now + 0.15);
                gain2.gain.setValueAtTime(0.8, now + 0.15);
                gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
                osc2.connect(gain2); gain2.connect(ctx.destination);
                osc2.start(now + 0.15); osc2.stop(now + 0.28);
            }
        } catch (e) { console.log("Audio blocked by browser autoplay policy."); }
    }

    function startContinuousAlarmSound() {
        if (isAlarmRinging) return;
        isAlarmRinging = true;
        playEmergencyAlarmSound();
        continuousAlarmInterval = setInterval(() => {
            if (isAlarmRinging) playEmergencyAlarmSound();
            else stopContinuousAlarmSound();
        }, 650);
    }

    function stopContinuousAlarmSound() {
        isAlarmRinging = false;
        if (continuousAlarmInterval) { clearInterval(continuousAlarmInterval); continuousAlarmInterval = null; }
        if (testSoundBtnEl) { testSoundBtnEl.textContent = "▶ Test Sound"; testSoundBtnEl.classList.remove('active-alarm'); }
    }

    function triggerCriticalPushAlert(data) {
        if (criticalBannerEl) {
            criticalBannerEl.classList.remove('hidden');
            if (criticalBannerTitleEl) criticalBannerTitleEl.textContent = `🚨 CRITICAL FAULT: MOTOR AT ${data.health}% HEALTH!`;
            if (criticalBannerDescEl) criticalBannerDescEl.textContent = `Critical threshold breached! Temp: ${data.temp}°C | Vibration: ${data.vibration} mm/s | Current: ${data.current} A. Emergency shutdown recommended.`;
        }
        startContinuousAlarmSound();
        sendPushNotification("🚨 CRITICAL MOTOR FAULT ALERT!", `HEALTH: ${data.health}% | TEMP: ${data.temp}°C | VIB: ${data.vibration} mm/s | CURRENT: ${data.current}A`);
    }

    // =====================================================================
    //  CLOCK
    // =====================================================================
    function updateClock() {
        const now = new Date();
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // =====================================================================
    //  HELPERS
    // =====================================================================
    function getRandomValue(base, variance, decimals = 1) {
        return (base + (Math.random() * 2 - 1) * variance).toFixed(decimals);
    }

    function setGaugeProgress(percent) {
        const circumference = 326.7;
        const offset = circumference - (percent / 100) * circumference;
        if (gaugeProgressEl) {
            gaugeProgressEl.style.strokeDashoffset = offset;
            gaugeProgressEl.style.stroke = percent >= 80 ? 'var(--status-green)' : percent >= 60 ? 'var(--status-yellow)' : 'var(--status-red)';
        }
    }

    // =====================================================================
    //  HEALTH CALCULATION FROM RAW SENSOR DATA (used in Live mode)
    // =====================================================================
    function calculateHealthFromSensors(temp, vibration, current, voltage, rpm) {
        // Temperature score (30% weight) — Normal <60°C, Warning 60-75°C, Critical >75°C
        let tempScore;
        if (temp <= 50) tempScore = 100;
        else if (temp <= 60) tempScore = 100 - ((temp - 50) / 10) * 20;
        else if (temp <= 75) tempScore = 80 - ((temp - 60) / 15) * 40;
        else if (temp <= 90) tempScore = 40 - ((temp - 75) / 15) * 30;
        else tempScore = Math.max(0, 10 - ((temp - 90) / 10) * 10);

        // Vibration score (30% weight) — ISO 10816: Good <2.8, Unsatisfactory 2.8-7.1, Unacceptable >7.1
        let vibScore;
        if (vibration <= 1.8) vibScore = 100;
        else if (vibration <= 2.8) vibScore = 100 - ((vibration - 1.8) / 1.0) * 15;
        else if (vibration <= 4.5) vibScore = 85 - ((vibration - 2.8) / 1.7) * 25;
        else if (vibration <= 7.1) vibScore = 60 - ((vibration - 4.5) / 2.6) * 30;
        else vibScore = Math.max(0, 30 - ((vibration - 7.1) / 3) * 30);

        // Current score (20% weight) — Normal <14.8A, Warning 14.8-18A, Critical >18A
        let currScore;
        if (current <= 12) currScore = 100;
        else if (current <= 14.8) currScore = 100 - ((current - 12) / 2.8) * 15;
        else if (current <= 18) currScore = 85 - ((current - 14.8) / 3.2) * 35;
        else currScore = Math.max(0, 50 - ((current - 18) / 5) * 50);

        // Voltage score (10% weight) — Normal 400-430V
        let voltScore;
        if (voltage >= 400 && voltage <= 430) voltScore = 100;
        else if (voltage >= 390 && voltage < 400) voltScore = 80;
        else if (voltage > 430 && voltage <= 440) voltScore = 80;
        else if (voltage >= 370 && voltage < 390) voltScore = 50;
        else if (voltage > 440 && voltage <= 450) voltScore = 50;
        else voltScore = 20;

        // RPM score (10% weight) — Normal 1450-1500
        let rpmScore;
        if (rpm >= 1460 && rpm <= 1500) rpmScore = 100;
        else if (rpm >= 1440 && rpm < 1460) rpmScore = 80;
        else if (rpm >= 1420 && rpm < 1440) rpmScore = 60;
        else if (rpm >= 1400 && rpm < 1420) rpmScore = 40;
        else rpmScore = 20;

        // Weighted average
        const health = Math.round(
            tempScore * 0.30 +
            vibScore * 0.30 +
            currScore * 0.20 +
            voltScore * 0.10 +
            rpmScore * 0.10
        );

        return Math.min(100, Math.max(0, health));
    }

    function getStatusFromHealth(health) {
        if (health >= 80) return { status: 'NORMAL', badge: 'RUNNING', badgeClass: 'running', label: 'GOOD', badgeText: 'EXCELLENT', badgeCls: 'badge-success', predStatus: 'No Anomaly Detected', predClass: 'text-green', risk: 'Low Risk', riskCls: 'text-green' };
        if (health >= 55) return { status: 'WARNING', badge: 'HIGH LOAD', badgeClass: 'warning', label: 'WARNING', badgeText: 'DEGRADED', badgeCls: 'badge-warning', predStatus: 'Elevated Stress Detected', predClass: 'text-yellow', risk: 'Moderate Risk', riskCls: 'text-yellow' };
        return { status: 'CRITICAL FAULT', badge: 'OVERHEAT', badgeClass: 'fault', label: 'CRITICAL', badgeText: 'ACTION REQUIRED', badgeCls: 'badge-danger', predStatus: 'Bearing Failure Imminent', predClass: 'text-red', risk: 'HIGH RISK (CRITICAL)', riskCls: 'text-red' };
    }

    function getVibrationClassification(vibration) {
        if (vibration <= 2.8) return { text: 'Good (Class I)', cls: 'text-green' };
        if (vibration <= 7.1) return { text: 'Unsatisfactory (Class III)', cls: 'text-yellow' };
        return { text: 'Unacceptable (Class IV)', cls: 'text-red' };
    }

    // =====================================================================
    //  UNIFIED DASHBOARD UPDATE — works for BOTH demo and live data
    // =====================================================================
    function updateDashboard(temp, vibration, current, voltage, rpm, health, statusInfo) {
        const vibClass = getVibrationClassification(parseFloat(vibration));

        // Calculate load factor from current (relative to rated 14.8A)
        const loadFactor = Math.round((parseFloat(current) / 14.8) * 100);

        // Header & Summary Card
        if (healthPercentEl) healthPercentEl.textContent = `${health}%`;
        setGaugeProgress(health);

        if (healthBadgeEl) { healthBadgeEl.textContent = statusInfo.badgeText; healthBadgeEl.className = `badge ${statusInfo.badgeCls}`; }
        if (predictiveStatusEl) { predictiveStatusEl.textContent = statusInfo.predStatus; predictiveStatusEl.className = `meta-val ${statusInfo.predClass}`; }
        if (motorStatusBadgeEl) { motorStatusBadgeEl.textContent = statusInfo.badge; motorStatusBadgeEl.className = `state-badge ${statusInfo.badgeClass}`; }

        if (loadProgressFillEl) {
            loadProgressFillEl.style.width = `${Math.min(100, loadFactor)}%`;
            loadProgressFillEl.style.background = loadFactor > 100 ? 'var(--status-red)' : loadFactor > 85 ? 'var(--status-yellow)' : 'linear-gradient(90deg, var(--primary-cyan), var(--primary-blue))';
        }
        if (loadFactorTextEl) loadFactorTextEl.textContent = `${loadFactor}%`;

        // Card 1: Motor Status
        if (cardMotorStatusEl) {
            cardMotorStatusEl.textContent = statusInfo.status;
            const modeClass = health >= 80 ? 'normal' : health >= 55 ? 'warning' : 'fault';
            cardMotorStatusEl.className = `metric-value status-text-${modeClass}`;
        }

        // Card 2: Temperature
        if (valTempEl) {
            valTempEl.textContent = temp;
            valTempEl.className = temp > 80 ? 'metric-value text-red' : temp > 65 ? 'metric-value text-yellow' : 'metric-value';
        }

        // Card 3: Vibration
        if (valVibrationEl) {
            valVibrationEl.textContent = vibration;
            valVibrationEl.className = vibration > 7 ? 'metric-value text-red' : vibration > 4 ? 'metric-value text-yellow' : 'metric-value';
        }
        if (vibrationClassEl) { vibrationClassEl.textContent = vibClass.text; vibrationClassEl.className = `footer-val ${vibClass.cls}`; }

        // Card 4: Current
        if (valCurrentEl) {
            valCurrentEl.textContent = current;
            valCurrentEl.className = current > 18 ? 'metric-value text-red' : current > 14.8 ? 'metric-value text-yellow' : 'metric-value';
        }

        // Card 5: Voltage
        if (valVoltageEl) valVoltageEl.textContent = voltage;

        // Card 6: RPM
        if (valRpmEl) {
            valRpmEl.textContent = rpm;
            valRpmEl.className = rpm < 1420 ? 'metric-value text-yellow' : 'metric-value';
        }

        // Card 7: Health
        if (cardValHealthEl) cardValHealthEl.textContent = `${health}%`;
        if (cardHealthLabelEl) { cardHealthLabelEl.textContent = statusInfo.label; cardHealthLabelEl.className = `metric-unit ${statusInfo.predClass}`; }
        if (riskLevelValEl) { riskLevelValEl.textContent = statusInfo.risk; riskLevelValEl.className = `footer-val ${statusInfo.riskCls}`; }

        // Critical alerts
        if (health <= 50 || temp >= 80 || vibration >= 7.0) {
            triggerCriticalPushAlert({ health, temp, vibration, current, voltage, rpm });
        } else if (health >= 80) {
            if (criticalBannerEl && !criticalBannerEl.classList.contains('hidden')) criticalBannerEl.classList.add('hidden');
            stopContinuousAlarmSound();
        } else if (temp > 68 || vibration > 4.5) {
            sendPushNotification("⚠️ Motor High Load Warning", `Temp: ${temp}°C | Vibration: ${vibration} mm/s`);
        }
    }

    // =====================================================================
    //  DEMO MODE — Simulation Telemetry Update
    // =====================================================================
    function updateTelemetryDemo() {
        if (dataSource !== 'demo') return;
        const config = presets[currentMode];

        const temp = getRandomValue(config.tempBase, config.tempVariance, 1);
        const vibration = getRandomValue(config.vibrationBase, config.vibrationVariance, 2);
        const current = getRandomValue(config.currentBase, config.currentVariance, 1);
        const voltage = getRandomValue(config.voltageBase, config.voltageVariance, 1);
        const rpm = Math.round(parseFloat(getRandomValue(config.rpmBase, config.rpmVariance, 0)));
        const healthFluc = Math.min(100, Math.max(10, Math.round(config.health + (Math.random() * 2 - 1))));

        const statusInfo = {
            status: config.motorStatus, badge: config.runningBadge, badgeClass: config.runningClass,
            label: config.healthLabel, badgeText: config.healthBadge, badgeCls: config.healthBadgeClass,
            predStatus: config.predictiveStatus, predClass: config.predictiveClass,
            risk: config.riskLevel, riskCls: config.riskClass
        };

        updateDashboard(temp, vibration, current, voltage, rpm, healthFluc, statusInfo);
    }

    // =====================================================================
    //  LIVE MODE — Update from ESP32 sensor JSON
    // =====================================================================
    function updateFromSensorData(sensorData) {
        const temp = parseFloat(sensorData.temperature || 0).toFixed(1);
        const vibration = parseFloat(sensorData.vibration || 0).toFixed(2);
        const current = parseFloat(sensorData.current || 0).toFixed(1);
        const voltage = parseFloat(sensorData.voltage || 0).toFixed(1);
        const rpm = Math.round(sensorData.rpm || 0);

        // Use ESP32-calculated health if available, otherwise calculate locally
        const health = sensorData.health != null
            ? Math.round(sensorData.health)
            : calculateHealthFromSensors(parseFloat(temp), parseFloat(vibration), parseFloat(current), parseFloat(voltage), rpm);

        const statusInfo = getStatusFromHealth(health);
        updateDashboard(temp, vibration, current, voltage, rpm, health, statusInfo);
    }

    // =====================================================================
    //  WEBSOCKET CLIENT — Connects to ESP32
    // =====================================================================
    function connectToESP32() {
        const ip = esp32IpInput ? esp32IpInput.value.trim() : '';
        if (!ip) { alert('Please enter the ESP32 IP address (e.g., 192.168.1.100)'); return; }

        // Update UI to connecting state
        setConnectionStatus('connecting');

        const wsUrl = `ws://${ip}:81/`;
        console.log(`[WebSocket] Connecting to ${wsUrl}...`);

        try {
            websocket = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[WebSocket] Failed to create connection:', e);
            setConnectionStatus('offline');
            return;
        }

        websocket.onopen = () => {
            console.log('[WebSocket] ✅ Connected to ESP32!');
            wsReconnectAttempts = 0;
            setConnectionStatus('online');

            // Auto-switch to live mode on successful connection
            switchDataSource('live');
        };

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (dataSource === 'live') {
                    updateFromSensorData(data);
                }
            } catch (e) {
                console.warn('[WebSocket] Invalid JSON received:', event.data);
            }
        };

        websocket.onclose = (event) => {
            console.log(`[WebSocket] ❌ Connection closed (code: ${event.code})`);
            setConnectionStatus('offline');

            // Auto-fallback to demo mode
            if (dataSource === 'live') {
                switchDataSource('demo');
                console.log('[WebSocket] Auto-switched to Demo mode.');
            }

            // Attempt reconnect if not manually disconnected
            if (event.code !== 1000 && wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                wsReconnectAttempts++;
                const delay = Math.min(3000 * wsReconnectAttempts, 15000);
                console.log(`[WebSocket] Reconnecting in ${delay / 1000}s... (attempt ${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                wsReconnectTimer = setTimeout(connectToESP32, delay);
            }
        };

        websocket.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };
    }

    function disconnectFromESP32() {
        wsReconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
        if (websocket) {
            websocket.close(1000, 'User disconnected');
            websocket = null;
        }
        setConnectionStatus('offline');
        switchDataSource('demo');
    }

    function setConnectionStatus(status) {
        if (!connStatusDot || !connStatusText || !connectBtn) return;

        connStatusDot.className = `conn-dot ${status}`;
        connectBtn.classList.remove('connected', 'connecting');

        if (status === 'online') {
            connStatusText.textContent = 'Connected';
            connStatusText.className = 'conn-status-label online';
            connectBtnIcon.textContent = '🔌';
            connectBtnText.textContent = 'Disconnect';
            connectBtn.classList.add('connected');
        } else if (status === 'connecting') {
            connStatusText.textContent = 'Connecting...';
            connStatusText.className = 'conn-status-label connecting';
            connectBtnIcon.textContent = '⏳';
            connectBtnText.textContent = 'Connecting...';
            connectBtn.classList.add('connecting');
        } else {
            connStatusText.textContent = 'Disconnected';
            connStatusText.className = 'conn-status-label';
            connectBtnIcon.textContent = '⚡';
            connectBtnText.textContent = 'Connect';
        }
    }

    // =====================================================================
    //  DATA SOURCE MODE SWITCHING (Demo ↔ Live)
    // =====================================================================
    function switchDataSource(source) {
        dataSource = source;

        // Update toggle buttons
        if (modeDemoBtn && modeLiveBtn) {
            modeDemoBtn.classList.toggle('active', source === 'demo');
            modeLiveBtn.classList.toggle('active', source === 'live');
        }

        // Update data source label
        if (dataSourceLabel) {
            dataSourceLabel.innerHTML = source === 'live'
                ? 'Real-time Readings &amp; Diagnostics — <strong style="color: #10b981;">📡 Live Sensor Data</strong>'
                : 'Real-time Readings &amp; Diagnostics — <strong>🎮 Demo Mode</strong>';
        }

        if (source === 'demo') {
            // Restart demo simulation if not already running
            startLiveSimulation();
        } else {
            // Stop demo simulation — live data comes via WebSocket
            stopLiveSimulation();
        }
    }

    // =====================================================================
    //  SIMULATION TIMER MANAGEMENT
    // =====================================================================
    function startLiveSimulation() {
        if (!updateInterval && dataSource === 'demo') {
            updateTelemetryDemo();
            updateInterval = setInterval(updateTelemetryDemo, 1500);
        }
    }

    function stopLiveSimulation() {
        if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    }

    // Start demo mode by default
    startLiveSimulation();

    // =====================================================================
    //  EVENT LISTENERS
    // =====================================================================

    // Connect/Disconnect button
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                disconnectFromESP32();
            } else {
                connectToESP32();
            }
        });
    }

    // Allow Enter key in IP input to connect
    if (esp32IpInput) {
        esp32IpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') connectToESP32();
        });
    }

    // Demo/Live mode toggle buttons
    if (modeDemoBtn) {
        modeDemoBtn.addEventListener('click', () => {
            switchDataSource('demo');
        });
    }
    if (modeLiveBtn) {
        modeLiveBtn.addEventListener('click', () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                switchDataSource('live');
            } else {
                alert('Please connect to ESP32 first before switching to Live Sensor mode.');
            }
        });
    }

    // Preset control buttons (demo mode)
    presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            if (mode && presets[mode]) {
                presetButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentMode = mode;
                if (dataSource === 'demo') updateTelemetryDemo();
            }
        });
    });

    // Pause/Play toggle
    if (toggleSimBtn) {
        toggleSimBtn.addEventListener('click', () => {
            isLiveUpdating = !isLiveUpdating;
            if (isLiveUpdating) {
                if (dataSource === 'demo') startLiveSimulation();
                toggleSimBtn.classList.add('active');
                toggleSimBtn.querySelector('.toggle-icon').textContent = '⏸';
                toggleSimBtn.querySelector('.toggle-text').textContent = 'Pause Live Updates';
            } else {
                stopLiveSimulation();
                toggleSimBtn.classList.remove('active');
                toggleSimBtn.querySelector('.toggle-icon').textContent = '▶';
                toggleSimBtn.querySelector('.toggle-text').textContent = 'Resume Live Updates';
            }
        });
    }

    // Mobile bottom nav buttons
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.currentTarget.dataset.mode;
            if (mode && presets[mode]) {
                mobileNavBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                presetButtons.forEach(b => b.classList.remove('active'));
                const matchDesktop = document.querySelector(`.preset-btn[data-mode="${mode}"]`);
                if (matchDesktop) matchDesktop.classList.add('active');
                currentMode = mode;
                if (dataSource === 'demo') updateTelemetryDemo();
            }
        });
    });

    // Sync mobile buttons when desktop buttons clicked
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            mobileNavBtns.forEach(b => b.classList.remove('active'));
            const matchMobile = document.querySelector(`.mobile-nav-btn[data-mode="${mode}"]`);
            if (matchMobile) matchMobile.classList.add('active');
        });
    });

    // Test sound button
    if (testSoundBtnEl) {
        testSoundBtnEl.addEventListener('click', () => {
            if (isAlarmRinging) {
                stopContinuousAlarmSound();
            } else {
                startContinuousAlarmSound();
                testSoundBtnEl.textContent = "⏹ Stop Continuous Alarm";
            }
        });
    }
});
