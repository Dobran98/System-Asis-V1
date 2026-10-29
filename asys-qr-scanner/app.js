/**
 * ASIS QR Scanner Pro - Terminal Universal de Escaneo
 * Desplegable de forma independiente en Vercel.
 * Compatible con Google Apps Script, Node.js, Python, Laravel y cualquier API REST.
 */

// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const CONFIG_KEY = 'asis_scanner_config';
const USER_KEY = 'asis_saved_user';
const QUEUE_KEY = 'asis_offline_queue';
const HISTORY_KEY = 'asis_scan_history';

const defaultConfig = {
  endpointUrl: 'https://bitplsgoqipffkamdmnx.supabase.co',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpdHBsc2dvcWlwZmZrYW1kbW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDA5ODAsImV4cCI6MjEwODYxNjk4MH0.Dju5VAHt4vwdzsCzbis9S-Z0ZSS64XaMwGXryQ_EeZE',
  masterQRId: 'QR-MAESTRO-ASISTENCIA-V1',
  scanMode: 'master', // 'master' (empleado escanea QR sede) o 'badge' (tótem escanea carnet)
  soundEnabled: true,
  vibrateEnabled: true,
  autoSwitchType: true // cambia de Entrada a Salida automáticamente tras marcar
};

let config = { ...defaultConfig };
let currentType = 'Entrada'; // 'Entrada' | 'Salida'
let html5QrCode = null;
let currentCameraId = null;
let availableCameras = [];
let isScanning = false;
let isProcessing = false;
let torchActive = false;
let audioCtx = null;
let lastScannedCode = null;
let lastScanTimestamp = 0;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  readUrlParameters();
  initPWA();
  initUI();
  initNetworkListeners();
  updateOfflineBanner();
  renderHistory();
  startCamera();
});

// Cargar configuración de LocalStorage
function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      config = { ...defaultConfig, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error cargando configuración:', e);
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// Permitir preconfiguración mediante parámetros de URL
// Ej: https://tu-scanner.vercel.app/?endpoint=https://script.google.com/...&mode=badge&id=10234
function readUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  let changed = false;

  if (params.has('endpoint')) {
    config.endpointUrl = params.get('endpoint');
    changed = true;
  }
  if (params.has('key')) {
    config.apiKey = params.get('key');
    changed = true;
  }
  if (params.has('masterId')) {
    config.masterQRId = params.get('masterId');
    changed = true;
  }
  if (params.has('mode')) {
    config.scanMode = params.get('mode');
    changed = true;
  }
  if (params.has('type')) {
    const t = params.get('type');
    if (t === 'Entrada' || t === 'Salida') currentType = t;
  }

  // Si se pasa usuario por URL
  if (params.has('userId')) {
    const user = {
      userId: params.get('userId'),
      name: params.get('name') || `ID ${params.get('userId')}`
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  if (changed) saveConfig();
}

// ==========================================
// INTERFAZ DE USUARIO Y EVENTOS
// ==========================================
function initUI() {
  // Botones Tipo (Entrada / Salida)
  const btnEntrada = document.getElementById('btn-type-entrada');
  const btnSalida = document.getElementById('btn-type-salida');

  btnEntrada.addEventListener('click', () => setScanType('Entrada'));
  btnSalida.addEventListener('click', () => setScanType('Salida'));
  updateTypeButtonsUI();

  // Botón Cambiar Cámara
  document.getElementById('btn-flip-camera').addEventListener('click', toggleCamera);

  // Botón Linterna (Flash)
  document.getElementById('btn-toggle-torch').addEventListener('click', toggleTorch);

  // Botón Configuración
  document.getElementById('btn-open-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
  document.getElementById('btn-test-connection').addEventListener('click', handleTestConnection);

  // Botón Usuario (Modo Personal)
  document.getElementById('btn-change-user').addEventListener('click', openUserModal);
  document.getElementById('btn-close-user').addEventListener('click', closeUserModal);
  document.getElementById('btn-save-user').addEventListener('click', handleSaveUser);

  // Sincronizar cola offline manual
  document.getElementById('btn-sync-offline').addEventListener('click', syncOfflineQueue);
  document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

  updateUserCardUI();
  updateModeView();
}

function setScanType(type) {
  currentType = type;
  updateTypeButtonsUI();
}

function updateTypeButtonsUI() {
  const btnEntrada = document.getElementById('btn-type-entrada');
  const btnSalida = document.getElementById('btn-type-salida');

  if (currentType === 'Entrada') {
    btnEntrada.classList.add('active');
    btnSalida.classList.remove('active');
  } else {
    btnSalida.classList.add('active');
    btnEntrada.classList.remove('active');
  }
}

function updateModeView() {
  const userCard = document.getElementById('user-identity-card');
  const instructions = document.getElementById('scanner-instruction-text');

  if (config.scanMode === 'master') {
    // Modo Empleado: El empleado usa su móvil y apunta al QR de la obra
    userCard.style.display = 'flex';
    instructions.innerHTML = 'Apunta tu cámara al <strong>código QR oficial</strong> colocado en la sede u obra.';
  } else {
    // Modo Kiosco/Tótem: La tablet de la empresa escanea el carnet del empleado
    userCard.style.display = 'none';
    instructions.innerHTML = 'Pase el <strong>código QR de su carnet o credencial</strong> frente a la cámara.';
  }
}

function updateUserCardUI() {
  const user = getSavedUser();
  const userNameEl = document.getElementById('current-user-name');
  const userIdEl = document.getElementById('current-user-id');
  const avatarEl = document.getElementById('user-avatar-initials');

  if (user && user.userId) {
    userNameEl.textContent = user.name || 'Usuario Asys';
    userIdEl.textContent = `ID: ${user.userId}`;
    avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
  } else {
    userNameEl.textContent = 'Sin Identificar';
    userIdEl.textContent = 'Haz clic en Configurar';
    avatarEl.textContent = '?';
  }
}

function getSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// CÁMARA Y ESCÁNER QR
// ==========================================
async function startCamera() {
  if (isScanning) return;

  const readerContainer = document.getElementById('reader');
  readerContainer.innerHTML = '';

  try {
    html5QrCode = new Html5Qrcode('reader');

    // Obtener lista de cámaras
    try {
      availableCameras = await Html5Qrcode.getCameras();
    } catch (camErr) {
      console.warn('No se pudo enumerar cámaras explícitas:', camErr);
    }

    const cameraConfig = availableCameras.length > 0
      ? { facingMode: 'environment' }
      : { facingMode: 'environment' };

    const qrConfig = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    await html5QrCode.start(
      cameraConfig,
      qrConfig,
      onQrCodeSuccess,
      onQrCodeError
    );

    isScanning = true;
    document.getElementById('scanner-overlay').style.display = 'flex';
  } catch (err) {
    console.error('Error al inicializar cámara:', err);
    showToast('Error de Cámara', 'No se pudo acceder a la cámara. Verifique los permisos del navegador.', 'error');
  }
}

async function stopCamera() {
  if (!isScanning || !html5QrCode) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
    isScanning = false;
  } catch (e) {
    console.error('Error al detener cámara:', e);
  }
}

async function toggleCamera() {
  if (!html5QrCode || availableCameras.length < 2) {
    showToast('Cámara', 'No hay cámaras secundarias disponibles.', 'warning');
    return;
  }

  await stopCamera();
  // Invertir selección o ciclar
  const currentFacing = html5QrCode._currentCameraFacingMode === 'user' ? 'environment' : 'user';
  try {
    html5QrCode = new Html5Qrcode('reader');
    await html5QrCode.start(
      { facingMode: currentFacing },
      { fps: 15, qrbox: { width: 260, height: 260 } },
      onQrCodeSuccess,
      onQrCodeError
    );
    isScanning = true;
  } catch (err) {
    showToast('Error', 'No se pudo cambiar de cámara', 'error');
    startCamera();
  }
}

async function toggleTorch() {
  if (!html5QrCode || !isScanning) return;
  try {
    torchActive = !torchActive;
    await html5QrCode.applyVideoConstraints({
      advanced: [{ torch: torchActive }]
    });
    const btn = document.getElementById('btn-toggle-torch');
    btn.classList.toggle('active', torchActive);
  } catch (err) {
    showToast('Linterna', 'Tu dispositivo o cámara no soporta flash continuo.', 'warning');
  }
}

function onQrCodeError(error) {
  // Ignorar errores continuos de frame por segundo sin lectura
}

// ==========================================
// PROCESAMIENTO DEL CÓDIGO QR
// ==========================================
async function onQrCodeSuccess(decodedText) {
  // Antirrebote: Evitar lecturas duplicadas en menos de 3.5 segundos del mismo código
  const now = Date.now();
  if (isProcessing) return;
  if (lastScannedCode === decodedText && (now - lastScanTimestamp) < 3500) {
    return;
  }

  lastScannedCode = decodedText;
  lastScanTimestamp = now;
  isProcessing = true;

  setLoading(true);

  try {
    let parsedData = null;
    try {
      parsedData = JSON.parse(decodedText);
    } catch (e) {
      // Si no es JSON, considerarlo como ID directo en texto plano
      parsedData = { id: decodedText.trim(), userId: decodedText.trim() };
    }

    // Determinar lógica según el modo de escaneo
    if (config.scanMode === 'master') {
      // MODO PERSONAL: El QR escaneado debe ser el QR Maestro de la obra
      const expectedId = config.masterQRId || 'QR-MAESTRO-ASISTENCIA-V1';
      const scannedId = parsedData.id || parsedData.qrId || decodedText.trim();

      if (scannedId !== expectedId) {
        playFailureSound();
        triggerVibration([200, 100, 200]);
        showToast('QR Desconocido', 'El código escaneado no coincide con el QR maestro oficial de la constructora.', 'error');
        setLoading(false);
        isProcessing = false;
        return;
      }

      const user = getSavedUser();
      if (!user || !user.userId) {
        playFailureSound();
        showToast('Identificación Requerida', 'Debes configurar tu DNI / ID antes de marcar.', 'warning');
        openUserModal();
        setLoading(false);
        isProcessing = false;
        return;
      }

      await dispatchAttendanceRecord({
        userId: user.userId,
        name: user.name,
        type: currentType,
        source: 'Vercel-Scanner-Personal'
      });

    } else {
      // MODO KIOSCO / TÓTEM: El QR escaneado es el carnet o credencial del empleado
      const userId = parsedData.userId || parsedData.id || parsedData.dni || decodedText.trim();
      const userName = parsedData.name || parsedData.nombre || `Empleado ${userId}`;

      if (!userId || userId.length < 1) {
        playFailureSound();
        showToast('Carnet Inválido', 'El código QR del carnet no contiene un ID de usuario válido.', 'error');
        setLoading(false);
        isProcessing = false;
        return;
      }

      await dispatchAttendanceRecord({
        userId: String(userId),
        name: userName,
        type: currentType,
        source: 'Vercel-Scanner-Kiosk'
      });
    }

  } catch (processErr) {
    console.error('Error al procesar lectura:', processErr);
    playFailureSound();
    showToast('Error', 'No se pudo procesar la lectura: ' + processErr.message, 'error');
  } finally {
    setLoading(false);
    setTimeout(() => {
      isProcessing = false;
    }, 1500);
  }
}

// ==========================================
// SEGURIDAD Y VALIDACIÓN DE DISPOSITIVO ÚNICO
// ==========================================
function getOrCreateDeviceIdentifier() {
  let deviceId = localStorage.getItem('asis_device_token');
  if (!deviceId) {
    if (window.crypto && window.crypto.randomUUID) {
      deviceId = window.crypto.randomUUID();
    } else {
      deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
    }
    localStorage.setItem('asis_device_token', deviceId);
  }
  return deviceId;
}

function getDeviceHardwareInfo() {
  const ua = navigator.userAgent || '';
  let model = 'Terminal Web / PWA';
  if (/android/i.test(ua)) {
    const m = ua.match(/Android\s+([0-9\.]+);\s+([a-zA-Z0-9\s_-]+)\s+Build/);
    model = m && m[2] ? `Android (${m[2].trim()})` : 'Móvil Android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    model = 'Apple iOS (iPhone)';
  } else if (/windows/i.test(ua)) {
    model = 'Windows PC';
  } else if (/macintosh/i.test(ua)) {
    model = 'Mac OS';
  } else if (/linux/i.test(ua)) {
    model = 'Linux PC';
  }
  const screenRes = `${window.screen.width}x${window.screen.height}`;
  return `${model} [${screenRes}]`;
}

// ==========================================
// DESPACHADOR UNIVERSAL (MULTI-SISTEMA)
// ==========================================
async function dispatchAttendanceRecord(record) {
  const timestamp = new Date().toISOString();
  const payload = {
    action: 'recordAttendance',
    apiKey: config.apiKey || '',
    data: {
      userId: record.userId,
      name: record.name,
      type: record.type,
      deviceId: getOrCreateDeviceIdentifier(),
      deviceInfo: getDeviceHardwareInfo()
    },
    meta: {
      timestamp: timestamp,
      source: record.source,
      scannerUrl: window.location.origin
    }
  };

  // Si no hay endpoint configurado, mostrar advertencia
  if (!config.endpointUrl) {
    playFailureSound();
    showToast('Configuración Incompleta', 'Debe configurar la URL del Endpoint en los Ajustes (ícono de tuerca).', 'warning');
    openSettingsModal();
    return;
  }

  // Si estamos Offline, encolar directamente
  if (!navigator.onLine) {
    enqueueOfflineRecord(payload);
    playSuccessSound();
    triggerVibration([80, 40, 80]);
    showToast('Guardado Local (Sin Red)', `Asistencia de '${record.type}' guardada. Se sincronizará al recuperar internet.`, 'warning');
    addHistoryItem(record, 'offline');
    return;
  }

  try {
    // Si el destino es Supabase, insertar directamente mediante PostgREST API
    if (config.endpointUrl.includes('supabase.co')) {
      const baseUrl = config.endpointUrl.replace(/\/+$/, '');
      const headers = {
        'apikey': config.apiKey,
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };

      // 1. Resolver usuario desde Supabase si existe y comprobar estado previo
      let finalName = record.name;
      let finalTurno = 'mañana';
      try {
        const uRes = await fetch(`${baseUrl}/rest/v1/usuarios?user_id=eq.${encodeURIComponent(record.userId)}&select=*`, { headers });
        if (uRes.ok) {
          const uData = await uRes.json();
          if (uData && uData.length > 0) {
            finalName = uData[0].nombre || finalName;
            finalTurno = uData[0].turno || 'mañana';
          }
        }

        // Consultar la última marca del usuario para respetar transiciones DENTRO / FUERA
        const lastAttRes = await fetch(`${baseUrl}/rest/v1/asistencias?user_id=eq.${encodeURIComponent(record.userId)}&order=timestamp.desc&limit=1`, { headers });
        if (lastAttRes.ok) {
          const lastAtt = await lastAttRes.json();
          if (lastAtt && lastAtt.length > 0) {
            const lastType = lastAtt[0].tipo;
            if (record.type === 'Entrada' && lastType === 'Entrada') {
              playFailureSound();
              showToast('Atención', `Ya tienes una 'Entrada' activa (DENTRO). Debes registrar Salida.`, 'warning');
              addHistoryItem({ ...record, name: finalName }, 'denied');
              return;
            }
            if (record.type === 'Salida' && lastType !== 'Entrada') {
              playFailureSound();
              showToast('Atención', `Falta marcar 'Entrada' (actualmente FUERA).`, 'warning');
              addHistoryItem({ ...record, name: finalName }, 'denied');
              return;
            }
          } else if (record.type === 'Salida') {
            playFailureSound();
            showToast('Atención', `Falta marcar 'Entrada' previa.`, 'warning');
            addHistoryItem({ ...record, name: finalName }, 'denied');
            return;
          }
        }
      } catch (uErr) {
        console.warn('Verificación previa de usuario omitida:', uErr);
      }

      // 2. Insertar marca de asistencia
      const insertRes = await fetch(`${baseUrl}/rest/v1/asistencias`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: record.userId,
          nombre: finalName,
          turno: finalTurno,
          tipo: record.type,
          estado: 'Presente',
          source: record.source || 'Vercel-Scanner'
        })
      });

      if (!insertRes.ok) {
        const errJson = await insertRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Error HTTP ${insertRes.status}`);
      }

      playSuccessSound();
      triggerVibration([100, 50, 100]);
      showToast('¡Asistencia Registrada!', `Registro de '${record.type}' confirmado para ${finalName}.`, 'success');
      addHistoryItem({ ...record, name: finalName }, 'success');

      if (config.autoSwitchType && config.scanMode === 'master') {
        setScanType(record.type === 'Entrada' ? 'Salida' : 'Entrada');
      }
      return;
    }

    // Usar 'text/plain' para evitar preflight CORS (OPTIONS) hacia Google Apps Script
    const response = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      playSuccessSound();
      triggerVibration([100, 50, 100]);
      showToast('¡Asistencia Registrada!', result.message || `Registro de '${record.type}' confirmado para ${record.name}.`, 'success');
      addHistoryItem(record, 'success');

      // Auto-alternar Entrada/Salida si está activado
      if (config.autoSwitchType && config.scanMode === 'master') {
        setScanType(record.type === 'Entrada' ? 'Salida' : 'Entrada');
      }
    } else {
      playFailureSound();
      triggerVibration([300]);
      showToast('Denegado', result.message || 'El servidor rechazó el registro.', 'warning');
      addHistoryItem(record, 'denied');
    }

  } catch (networkErr) {
    console.warn('Error de red al enviar asistencia, guardando en cola offline:', networkErr);
    enqueueOfflineRecord(payload);
    playSuccessSound();
    triggerVibration([80, 40, 80]);
    showToast('Guardado Offline', `Falla temporal de red. Asistencia de '${record.type}' encolada para reintento automático.`, 'warning');
    addHistoryItem(record, 'offline');
  }
}

// ==========================================
// RESILIENCIA OFFLINE Y COLA DE ESPERA
// ==========================================
function enqueueOfflineRecord(payload) {
  try {
    const queue = getOfflineQueue();
    queue.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateOfflineBanner();
  } catch (e) {
    console.error('Error guardando en cola offline:', e);
  }
}

function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function updateOfflineBanner() {
  const queue = getOfflineQueue();
  const banner = document.getElementById('offline-banner');
  const countEl = document.getElementById('offline-count');

  if (queue.length > 0) {
    banner.style.display = 'flex';
    countEl.textContent = queue.length;
  } else {
    banner.style.display = 'none';
  }
}

async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  if (!navigator.onLine) {
    showToast('Sin Conexión', 'Aún no hay acceso a internet para sincronizar.', 'warning');
    return;
  }

  showToast('Sincronizando...', `Enviando ${queue.length} registros pendientes...`, 'warning');

  const remaining = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      const response = await fetch(config.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item)
      });
      const res = await response.json();
      if (res.success) {
        syncedCount++;
      } else {
        remaining.push(item);
      }
    } catch (err) {
      remaining.push(item);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  updateOfflineBanner();

  if (syncedCount > 0) {
    playSuccessSound();
    showToast('Sincronización Exitosa', `Se sincronizaron ${syncedCount} registros con el servidor.`, 'success');
  }
  if (remaining.length > 0) {
    showToast('Pendientes', `Quedan ${remaining.length} registros que se reintentarán luego.`, 'warning');
  }
}

function initNetworkListeners() {
  const updateBadge = () => {
    const badge = document.getElementById('connection-status-badge');
    const text = document.getElementById('connection-status-text');
    if (navigator.onLine) {
      badge.classList.remove('offline');
      text.textContent = 'En Línea';
      syncOfflineQueue();
    } else {
      badge.classList.add('offline');
      text.textContent = 'Sin Conexión';
    }
  };

  window.addEventListener('online', updateBadge);
  window.addEventListener('offline', updateBadge);
  updateBadge();
}

// ==========================================
// HISTORIAL LOCAL DE ESCANEOS RECIENTES
// ==========================================
function addHistoryItem(record, status) {
  try {
    let history = getHistory();
    history.unshift({
      name: record.name,
      userId: record.userId,
      type: record.type,
      status: status,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    // Conservar solo los últimos 15
    if (history.length > 15) history = history.slice(0, 15);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch (e) { }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list');
  const history = getHistory();

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-history">No hay escaneos recientes en esta sesión.</div>';
    return;
  }

  container.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-item-left">
        <span class="history-tag ${item.type.toLowerCase()}">${item.type}</span>
        <strong>${escapeHtml(item.name)}</strong>
      </div>
      <span class="history-time">${item.time}</span>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ==========================================
// SÍNTESIS DE AUDIO Y VIBRACIÓN HÁPTICA
// ==========================================
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSuccessSound() {
  if (!config.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    // Arpegio armónico ascendente moderno (880 Hz a 1760 Hz)
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) { }
}

function playFailureSound() {
  if (!config.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.25);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) { }
}

function triggerVibration(pattern) {
  if (!config.vibrateEnabled || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (e) { }
}

// ==========================================
// MODALES Y AJUSTES
// ==========================================
function openSettingsModal() {
  document.getElementById('input-endpoint-url').value = config.endpointUrl || '';
  document.getElementById('input-api-key').value = config.apiKey || '';
  document.getElementById('input-master-id').value = config.masterQRId || 'QR-MAESTRO-ASISTENCIA-V1';
  document.getElementById('select-scan-mode').value = config.scanMode || 'master';
  document.getElementById('check-sound').checked = !!config.soundEnabled;
  document.getElementById('check-vibrate').checked = !!config.vibrateEnabled;

  document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

function handleSaveSettings() {
  config.endpointUrl = document.getElementById('input-endpoint-url').value.trim();
  config.apiKey = document.getElementById('input-api-key').value.trim();
  config.masterQRId = document.getElementById('input-master-id').value.trim() || 'QR-MAESTRO-ASISTENCIA-V1';
  config.scanMode = document.getElementById('select-scan-mode').value;
  config.soundEnabled = document.getElementById('check-sound').checked;
  config.vibrateEnabled = document.getElementById('check-vibrate').checked;

  saveConfig();
  updateModeView();
  closeSettingsModal();
  showToast('Ajustes Guardados', 'Configuración actualizada correctamente.', 'success');
}

async function handleTestConnection() {
  const url = document.getElementById('input-endpoint-url').value.trim();
  if (!url) {
    showToast('Falta URL', 'Ingresa la URL del Web App de Google Apps Script o API.', 'warning');
    return;
  }

  showToast('Probando...', 'Enviando ping al servidor...', 'warning');

  try {
    // Si es una URL de Supabase, probar el endpoint REST de salud/configuracion
    if (url.includes('supabase.co')) {
      const baseUrl = url.replace(/\/+$/, '');
      const apiKey = document.getElementById('input-api-key').value.trim() || config.apiKey;
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/rest/v1/config_horarios?select=clave,valor&limit=1`, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      });
      const t1 = performance.now();
      const latency = Math.round(t1 - t0);

      if (res.ok) {
        playSuccessSound();
        showToast('¡Conexión Exitosa!', `Supabase PostgreSQL Activa y Operativa (Latencia: ${latency}ms)`, 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        playFailureSound();
        showToast('Error de Conexión', errData.message || `HTTP ${res.status}: Clave API o URL incorrecta.`, 'error');
      }
      return;
    }

    const t0 = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ping' })
    });
    const t1 = performance.now();
    const latency = Math.round(t1 - t0);
    const data = await res.json();

    if (data.success) {
      playSuccessSound();
      showToast('¡Conexión Exitosa!', `${data.message || 'OK'} (Latencia: ${latency}ms)`, 'success');
    } else {
      showToast('Respuesta Inválida', data.message || 'El servidor respondió con error.', 'error');
    }
  } catch (err) {
    playFailureSound();
    showToast('Error de Conexión', 'No se pudo comunicar con la URL indicada: ' + err.message, 'error');
  }
}

function openUserModal() {
  const user = getSavedUser() || {};
  document.getElementById('input-user-id').value = user.userId || '';
  document.getElementById('input-user-name').value = user.name || '';
  document.getElementById('user-modal').classList.add('active');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('active');
}

function handleSaveUser() {
  const userId = document.getElementById('input-user-id').value.trim();
  const name = document.getElementById('input-user-name').value.trim();

  if (!userId) {
    showToast('DNI/ID requerido', 'Por favor ingresa tu número de cédula o ID.', 'warning');
    return;
  }

  localStorage.setItem(USER_KEY, JSON.stringify({
    userId: userId,
    name: name || `ID ${userId}`
  }));

  updateUserCardUI();
  closeUserModal();
  showToast('Identidad Guardada', `Configurado para ${name || userId}`, 'success');
}

// ==========================================
// TOAST NOTIFICATIONS Y LOADERS
// ==========================================
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || '•'}</div>
    <div class="toast-content">
      <h5>${escapeHtml(title)}</h5>
      <p>${escapeHtml(message)}</p>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function setLoading(active) {
  const overlay = document.getElementById('loading-overlay');
  if (active) overlay.classList.add('active');
  else overlay.classList.remove('active');
}

// ==========================================
// PWA REGISTRATION
// ==========================================
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('ServiceWorker no disponible:', err);
      });
    });
  }
}
