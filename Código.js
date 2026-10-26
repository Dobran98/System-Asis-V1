/**
 * Sistema de Asistencia QR
 */

// =======================================================
// ================ CONFIGURACIÓN GLOBAL =================
// =======================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();
const USERS_SHEET = SS.getSheetByName("Usuarios");
const ATTENDANCE_SHEET = SS.getSheetByName("Asistencias");
const DUTY_SHEET = SS.getSheetByName("Guardias");
const PERMISSIONS_SHEET = SS.getSheetByName("Permisos");
const SUBSTITUTIONS_SHEET = SS.getSheetByName("Suplencias");

// Caché en memoria por Request (evita múltiples lecturas lentas a las hojas en una sola ejecución)
const _requestCache = {
  sheetValues: {},
  getValues: function (sheet) {
    if (!sheet) return [];
    var name = sheet.getName();
    if (!this.sheetValues[name]) {
      this.sheetValues[name] = sheet.getDataRange().getValues();
    }
    // Devolver una copia superficial del array exterior para evitar mutaciones directas (como data.shift())
    return [...this.sheetValues[name]];
  },
  clear: function (sheetName) {
    if (sheetName) {
      delete this.sheetValues[sheetName];
    } else {
      this.sheetValues = {};
    }
  }
};

function getSheetValues(sheet) {
  return _requestCache.getValues(sheet);
}

// =======================================================
// ========== HOJAS DEL NUEVO SISTEMA (LAZY) ===========
// =======================================================
function getAreasSheet_() {
  let sheet = SS.getSheetByName("AreasTrabajoConfig");
  if (!sheet) {
    sheet = SS.insertSheet("AreasTrabajoConfig");
    sheet.appendRow(["AreaId", "NombreArea", "FechaCreacion", "CreadoPor", "Estado"]);
    [["AREA-1", "Área A"], ["AREA-2", "Área B"], ["AREA-3", "Área C"], ["AREA-4", "Área D"]].forEach(function (a) {
      sheet.appendRow([a[0], a[1], new Date(), "Sistema", "Activa"]);
    });
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getAuditSheet_() {
  let sheet = SS.getSheetByName("Auditoria");
  if (!sheet) {
    sheet = SS.insertSheet("Auditoria");
    sheet.appendRow(["Timestamp", "UsuarioId", "NombreUsuario", "SubRol", "Accion", "Modulo", "DetalleObjeto", "Resultado", "AreasActor"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPermisosRolesSheet_() {
  let sheet = SS.getSheetByName("PermisosRoles");
  if (!sheet) {
    sheet = SS.insertSheet("PermisosRoles");
    sheet.appendRow(["ReglaId", "SubRol", "Modulo", "Accion", "Permitido", "CreadoPor", "FechaCreacion", "Descripcion"]);
    sheet.setFrozenRows(1);
    [["RULE-1", "Analista", "Asistencia", "VER_PROPIOS", true],
    ["RULE-2", "Analista", "Permisos", "SOLICITAR", true],
    ["RULE-3", "Analista", "Suplencias", "SOLICITAR", true],
    ["RULE-4", "Analista", "CrossTurno", "SOLICITAR", true]].forEach(function (r) {
      sheet.appendRow([r[0], r[1], r[2], r[3], r[4], "Sistema", new Date(), "Regla por defecto"]);
    });
  }
  return sheet;
}

function getDeleteRequestsSheet_() {
  let sheet = SS.getSheetByName("SolicitudesBaja");
  if (!sheet) {
    sheet = SS.insertSheet("SolicitudesBaja");
    sheet.appendRow(["SolicitudId", "CoordinadorId", "CoordinadorNombre", "UsuarioTargetId", "UsuarioTargetNombre", "Motivo", "Estado", "FechaSolicitud", "AdminResolutor", "FechaResolucion", "NotaAdmin"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getTiposAmonestacionSheet_() {
  let sheet = SS.getSheetByName("TiposAmonestacion");
  if (!sheet) {
    sheet = SS.insertSheet("TiposAmonestacion");
    sheet.appendRow(["TipoId", "Nombre", "Descripcion", "Gravedad", "AutoActivar", "CondicionAuto", "Estado", "CreadoPor", "FechaCreacion"]);
    sheet.setFrozenRows(1);
    // FUERA_DE_RANGO eliminado en v2.0 (GPS removido del sistema)
    const defaults = [
      ["TIPO-1", "No registró salida", "El usuario no registró su hora de salida al finalizar el turno.", "Leve", true, "NO_REGISTRO_SALIDA", "Activo", "Sistema", new Date()],
      ["TIPO-3", "Ausencia injustificada", "El usuario no se presentó al trabajo y no tiene permiso aprobado.", "Grave", true, "AUSENCIA_INJUSTIFICADA", "Activo", "Sistema", new Date()],
      ["TIPO-4", "Llegada tardía", "El usuario llegó más de la hora de tolerancia configurada después de su hora de entrada.", "Leve", true, "LLEGADA_RETARDADA", "Activo", "Sistema", new Date()]
    ];
    defaults.forEach(r => sheet.appendRow(r));
  }
  return sheet;
}

function getAmonestacionesSheet_() {
  let sheet = SS.getSheetByName("Amonestaciones");
  if (!sheet) {
    sheet = SS.insertSheet("Amonestaciones");
    sheet.appendRow(["AmonestacionId", "UsuarioTargetId", "UsuarioTargetNombre", "TipoId", "TipoNombre", "Descripcion", "CreadoPor", "CreadoPorNombre", "Fecha", "Estado", "Origen"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getConfigHorariosSheet_() {
  let sheet = SS.getSheetByName("ConfigHorarios");
  if (!sheet) {
    sheet = SS.insertSheet("ConfigHorarios");
    sheet.appendRow(["Clave", "Valor", "Descripcion", "UltimaActualizacion"]);
    sheet.setFrozenRows(1);
    const defaults = [
      ["HORA_ENTRADA_MANANA", "08:00", "Hora de entrada turno Mañana", new Date()],
      ["HORA_ENTRADA_TARDE", "14:00", "Hora de entrada turno Tarde", new Date()],
      ["HORA_ENTRADA_MIXTO", "08:00", "Hora de entrada turno Mixto", new Date()],
      ["HORA_SALIDA_MANANA", "14:00", "Hora de salida turno Mañana (cierre automático)", new Date()],
      ["HORA_SALIDA_TARDE", "19:00", "Hora de salida turno Tarde (cierre automático)", new Date()],
      ["HORA_SALIDA_MIXTO", "19:00", "Hora de salida turno Mixto (cierre automático)", new Date()],
      ["TOLERANCIA_RETARDO_MIN", "60", "Minutos de tolerancia antes de marcar llegada tardía", new Date()]
    ];
    defaults.forEach(r => sheet.appendRow(r));
  }
  return sheet;
}

function getSolicitudesAnulacionSheet_() {
  let sheet = SS.getSheetByName("SolicitudesAnulacion");
  if (!sheet) {
    sheet = SS.insertSheet("SolicitudesAnulacion");
    sheet.appendRow(["SolicitudId", "AmonestacionId", "CoordinadorId", "CoordinadorNombre", "Motivo", "Estado", "FechaSolicitud", "AdminResolutor", "FechaResolucion", "NotaAdmin"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getManualRequestsSheet_() {
  let sheet = SS.getSheetByName("SolicitudesManuales");
  if (!sheet) {
    sheet = SS.insertSheet("SolicitudesManuales");
    sheet.appendRow(["SolicitudId", "UsuarioId", "NombreUsuario", "Turno", "Institucion", "Tipo", "FechaSolicitud", "Estado", "ResolutorId", "FechaResolucion", "Motivo"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

const COMPANY_CONFIG = {
  // GPS eliminado en v2.0. Solo se conserva el ID del QR maestro.
  masterQRId: "QR-MAESTRO-ASISTENCIA-V1"
};
const CACHE = CacheService.getScriptCache();

// =======================================================
// ======== FUNCIONES PRINCIPALES Y UTILIDADES ===========
// =======================================================

/**
 * Menú personalizado nativo en la barra superior de Google Sheets.
 * Se activa automáticamente al abrir la hoja de cálculo.
 */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🛠️ Sistema ASIS')
      .addItem('✨ Estandarizar y Reordenar Encabezados', 'ejecutarEstandarizacionDesdeMenu')
      .addItem('🔍 Diagnóstico de Salud del Sistema', 'ejecutarDiagnosticoDesdeMenu')
      .addToUi();
  } catch (err) {
    // Modo Web App (sin interfaz de Sheet)
  }
}

/**
 * Ejecuta la estandarización y reordenamiento desde el menú de Google Sheets con confirmación.
 */
function ejecutarEstandarizacionDesdeMenu() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert(
    'Estandarización de Estructura de Datos',
    'Esta función reordenará los encabezados y registros de todas las hojas según el estándar canónico oficial del sistema.\n\n' +
    '🔒 IMPORTANTE: NO SE BORRA INFORMACIÓN.\n' +
    '• Se conservan todas las filas y datos registrados.\n' +
    '• Las columnas se reorganizan a su posición oficial.\n' +
    '• Columnas faltantes se añadirán con celdas vacías.\n' +
    '• Columnas adicionales que tengas se mantendrán al final.\n\n' +
    '¿Desea iniciar la reorganización?',
    ui.ButtonSet.YES_NO
  );

  if (respuesta !== ui.Button.YES) {
    ui.alert('Operación cancelada.');
    return;
  }

  const res = repararYEstandarizarSheetsConDatos();
  let resumen = `✅ Se procesaron las ${res.total} hojas del sistema.\n\n`;
  if (res.reordenadas && res.reordenadas.length > 0) {
    resumen += `• Hojas reordenadas/estandarizadas (${res.reordenadas.length}):\n  ${res.reordenadas.join(', ')}\n\n`;
  }
  if (res.creadas && res.creadas.length > 0) {
    resumen += `• Hojas nuevas creadas (${res.creadas.length}):\n  ${res.creadas.join(', ')}\n\n`;
  }
  resumen += 'Todos los registros y datos históricos han sido preservados intactos.';

  ui.alert('Resultado de la Estandarización', resumen, ui.ButtonSet.OK);
}

/**
 * Ejecuta el diagnóstico del sistema desde el menú de Google Sheets.
 */
function ejecutarDiagnosticoDesdeMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = diagnosticoDelSistema();
  const totalHojas = Object.keys(res.hojas || {}).length;
  const totalTriggers = (res.triggers || []).length;
  const errores = (res.errores || []).length;

  let msg = `Diagnóstico del Sistema ASIS:\n\n` +
    `• Hojas registradas: ${totalHojas}\n` +
    `• Triggers activos: ${totalTriggers}\n` +
    `• Estado de Caché: ${res.cache && res.cache.funcionando ? 'OK' : 'ERROR'}\n`;
  if (errores > 0) {
    msg += `\n⚠️ Alertas encontradas (${errores}):\n` + res.errores.join('\n');
  } else {
    msg += '\n✅ Salud del sistema óptima. Todos los módulos operativos.';
  }

  ui.alert('Diagnóstico de Salud', msg, ui.ButtonSet.OK);
}

function doGet(e) {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Sistema de Asistencia QR")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gateway HTTP POST para clientes externos (Escáner Vercel, APIs REST, ERPs y Webhooks).
 * Permite registrar asistencias y validar datos de forma remota y desacoplada.
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var body = {};
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: "Formato JSON no válido en el cuerpo de la petición."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var action = body.action || "recordAttendance";

    // 1. Healthcheck / Ping
    if (action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Gateway de Asistencia ASIS v2.0 Activo y Operativo",
        timestamp: new Date().toISOString(),
        masterQRId: COMPANY_CONFIG.masterQRId || "QR-MAESTRO-ASISTENCIA-V1"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Consulta de configuración para escáner
    if (action === "getConfig") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        masterQRId: COMPANY_CONFIG.masterQRId || "QR-MAESTRO-ASISTENCIA-V1",
        system: "ASIS-CONSTRUCTORA-V2"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Validar empleado por ID
    if (action === "validateUser") {
      var uid = body.userId || (body.data && body.data.userId);
      if (!uid) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: "Se requiere 'userId' para validar."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var user = getUserDetailsById(uid);
      if (user) {
        var lastState = getLastAttendanceState(uid);
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          user: {
            userId: user.userId,
            name: user.name,
            turno: user.turno,
            institucion: user.institucion
          },
          lastState: lastState
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: "Usuario no encontrado en la base de datos."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 4. Registro de Asistencia (por defecto)
    if (action === "recordAttendance") {
      var attendData = body.data || body;
      if (!attendData.userId || !attendData.type) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: "Datos incompletos. Se requiere 'userId' y 'type' (Entrada/Salida)."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // Si no viene el nombre, resolverlo automáticamente por el ID
      if (!attendData.name) {
        var userFound = getUserDetailsById(attendData.userId);
        if (userFound) {
          attendData.name = userFound.name;
        } else {
          attendData.name = "ID: " + attendData.userId;
        }
      }

      var result = recordAttendance(attendData);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Acción desconocida: " + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Error interno del servidor: " + (err.message || err.toString())
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function normalizeShift(turno) {
  const t = String(turno || "").trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t === "manana" || t === "mañana") return "mañana";
  if (t === "tarde") return "tarde";
  if (t === "mixto" || t === "m/t") return "mixto";
  return t;
}

function parseDateStringAsLocal(dateInput) {
  if (!dateInput) return null;
  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    if (isNaN(dateInput.getTime())) return null;
    return new Date(dateInput.getTime());
  }
  const dateString = String(dateInput).trim();
  if (dateString.includes('-')) {
    const parts = dateString.split('-');
    if (parts.length < 3) return new Date(dateInput);
    return new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
  }
  return new Date(dateInput);
}

// Lector de Fechas Blindado para Google Sheets
function safeGetDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }
  let str = String(val).trim();
  let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    let timeMatch = str.match(/\d{1,2}:\d{2}:\d{2}/);
    if (timeMatch) {
      let tParts = timeMatch[0].split(':');
      return new Date(year, month, day, parseInt(tParts[0] || 0), parseInt(tParts[1] || 0), parseInt(tParts[2] || 0));
    }
    return new Date(year, month, day);
  }
  let d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

// =======================================================
// ============= GESTIÓN DE AUTENTICACIÓN ================
// =======================================================

function userLogin(email, password) {
  try {
    const usersData = getUsersData();
    const user = usersData[email.toLowerCase()];
    if (user && verifyPassword(password, user.password)) {
      if (user.estado === 'Inactivo') {
        return { inactive: true };
      }
      return {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        foto: user.foto,
        subRol: user.subRol || 'Operador/a',
        areas: user.areas || [],
        masterQRId: COMPANY_CONFIG.masterQRId
      };
    }
    return null;
  } catch (e) {
    Logger.log(`Error en userLogin: ${e.message}`);
    return null;
  }
}

// =======================================================
// =========== GESTIÓN DE CIERRES OLVIDADOS ==============
// =======================================================

function garantizarValoresConfig_(sheet) {
  // GPS eliminado en v2.0: ya no se insertan claves GPS_LATITUD, GPS_LONGITUD, GPS_RADIO_METROS.
  // Los valores de horarios siguen gestionándose normalmente.
  _requestCache.clear(sheet.getName());
}

function getConfigHorariosMap_() {
  const sheet = getConfigHorariosSheet_();
  garantizarValoresConfig_(sheet);
  const values = getSheetValues(sheet).slice(1);
  const map = {};
  values.forEach(r => { if (r[0]) map[String(r[0])] = String(r[1]); });
  return map;
}

function getClosingHourForTurno_(turno, config) {
  const t = (turno || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  let timeStr;
  if (t === 'manana' || t === 'mañana') {
    timeStr = config['HORA_SALIDA_MANANA'] || '14:00';
  } else if (t === 'tarde') {
    timeStr = config['HORA_SALIDA_TARDE'] || '19:00';
  } else {
    timeStr = config['HORA_SALIDA_MIXTO'] || '19:00';
  }
  const parts = timeStr.split(':');
  return { hours: parseInt(parts[0], 10), minutes: parseInt(parts[1] || '0', 10) };
}

function autoCloseOpenAttendances() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const openSessions = getOpenAttendanceSessions(true);
    const config = getConfigHorariosMap_();
    openSessions.forEach(session => {
      const entryDate = new Date(session.entryTimestamp);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (entryDate < today) {
        const userDetails = getUserDetailsById(session.userId);
        if (userDetails) {
          const closing = getClosingHourForTurno_(userDetails.turno, config);
          const closingTime = new Date(entryDate);
          closingTime.setHours(closing.hours, closing.minutes, 0, 0);
          ATTENDANCE_SHEET.appendRow([
            closingTime, session.userId, userDetails.name, userDetails.turno,
            userDetails.institucion, 'Salida', null, null, 'Cierre Automático', null
          ]);
          // Actualizar inmediatamente el estado en caché
          CACHE.put(`last_state_${session.userId}`, JSON.stringify({ type: 'Salida' }), 300);
          // Amonestación automática por no registrar salida
          generarAmonestacionAutomatica_(session.userId, 'NO_REGISTRO_SALIDA');
        }
      }
    });
    CACHE.remove('open_sessions');
  } catch (e) {
    Logger.log("Error en autoCloseOpenAttendances: " + e.message);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) { }
  }
}

function setupAutoCloseTrigger() {
  try {
    // Eliminar triggers existentes de las dos funciones gestionadas
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'autoCloseOpenAttendances' ||
        t.getHandlerFunction() === 'checkAusenciasInjustificadas') {
        ScriptApp.deleteTrigger(t);
      }
    });
    // Trigger de cierre automático: cada día a las 23:55 (Apps Script no admite segundo exacto)
    ScriptApp.newTrigger('autoCloseOpenAttendances')
      .timeBased().atHour(23).nearMinute(55).everyDays(1).create();
    // Trigger de ausencias injustificadas: cada día a las 9:00 AM
    ScriptApp.newTrigger('checkAusenciasInjustificadas')
      .timeBased().atHour(9).nearMinute(0).everyDays(1).create();
    return { success: true, message: 'Triggers configurados: cierre automático a las 23:55 y verificación de ausencias a las 9:00 AM.' };
  } catch (e) {
    let msg = e.message;
    if (msg.includes('getProjectTriggers') || msg.includes('script.scriptapp') || msg.includes('permission') || msg.includes('permiso')) {
      msg = 'No tienes permiso para gestionar Triggers automáticos. El propietario o desarrollador del script debe abrir el editor de Google Apps Script y ejecutar manualmente la función "setupAutoCloseTrigger" una vez para conceder la autorización OAuth requerida para el ámbito "script.scriptapp".';
    }
    return { success: false, message: 'Error: ' + msg };
  }
}

function getEffectiveTurnoForDate(userId, dateStr) {
  try {
    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return null;
    let currentEffectiveTurno = String(userDetails.turno || "").trim();

    const sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) return currentEffectiveTurno;

    const timeZone = SS.getSpreadsheetTimeZone();
    const rows = sheet.getDataRange().getValues().slice(1);

    const allUsers = getAllUsersForAdmin();
    const usersMap = {};
    allUsers.forEach(u => { usersMap[String(u.userId)] = u; });

    for (const row of rows) {
      let date, u1, u2, estado;
      if (row.length > 4) {
        date = row[1]; u1 = row[2]; u2 = row[3]; estado = row[4];
      } else {
        date = row[0]; u1 = row[1]; u2 = row[2]; estado = "Aprobada";
      }

      if (estado === "Aprobada" && date) {
        const rowDateStr = Utilities.formatDate(safeGetDate(date), timeZone, 'yyyy-MM-dd');
        if (rowDateStr === dateStr) {
          if (String(u1) === String(userId)) {
            const partner = usersMap[String(u2)];
            if (partner) return String(partner.turno || "").trim();
          } else if (String(u2) === String(userId)) {
            const partner = usersMap[String(u1)];
            if (partner) return String(partner.turno || "").trim();
          }
        }
      }
    }
    return currentEffectiveTurno;
  } catch (e) {
    Logger.log("Error en getEffectiveTurnoForDate: " + e.message);
    return null;
  }
}

function checkAusenciasInjustificadas() {
  try {
    const timeZone = SS.getSpreadsheetTimeZone();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = Utilities.formatDate(yesterday, timeZone, 'yyyy-MM-dd');
    const yesterdayLocal = parseDateStringAsLocal(yesterdayStr);
    const dayOfWeek = yesterdayLocal.getDay(); // 0-6

    const dutyShiftsMap = new Map(DUTY_SHEET ? getDutyShifts().map(d => [d.date, { turno: d.turno, categoria: d.categoria }]) : []);
    const dutyShiftForDay = dutyShiftsMap.get(yesterdayStr);

    if (dutyShiftForDay && dutyShiftForDay.categoria === 'Feriado') return;
    if (!dutyShiftForDay && (dayOfWeek === 0 || dayOfWeek === 6)) return;

    const allUsers = getAllUsersForAdmin().filter(u => u.role !== 'Admin' && u.estado === 'Activo');
    const approvedPermissions = getApprovedPermissionsInRange(yesterdayStr, yesterdayStr);

    const presentUserIds = new Set();
    getSheetValues(ATTENDANCE_SHEET).slice(1).forEach(r => {
      const d = safeGetDate(r[0]);
      if (!d) return;
      if (Utilities.formatDate(d, timeZone, 'yyyy-MM-dd') === yesterdayStr && r[5] === 'Entrada') {
        presentUserIds.add(String(r[1]));
      }
    });

    const daysOfWeekMap = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
    const yesterdayDayName = daysOfWeekMap[dayOfWeek];

    allUsers.forEach(user => {
      const userId = String(user.userId);
      if (presentUserIds.has(userId)) return;

      const t = getEffectiveTurnoForDate(userId, yesterdayStr);
      if (!t || t.toLowerCase() === 'n/a') return;
      const tNorm = normalizeShift(t);

      let shouldWork = false;
      if (dutyShiftForDay) {
        const dutyNorm = normalizeShift(dutyShiftForDay.turno);
        if (dutyNorm === 'mixto') {
          shouldWork = (tNorm === 'mañana' || tNorm === 'tarde' || tNorm === 'mixto');
        } else {
          shouldWork = (tNorm === dutyNorm);
        }
      } else {
        shouldWork = (dayOfWeek >= 1 && dayOfWeek <= 5);
      }

      if (!shouldWork) return;

      // A) Suplencia
      const substitute = getActiveSubstituteFor(userId, yesterdayStr);
      if (substitute) return;

      // B) Permiso
      if (isUserOnLeave(yesterdayLocal, userId, approvedPermissions)) return;

      // C) Horario de clases (cubre totalidad o >=80% de jornada laboral)
      const approvedSchedules = getSchedulesHistory(userId).filter(s => s.estado === 'Aprobado');
      if (approvedSchedules.length > 0) {
        const activeSchedule = approvedSchedules[0];
        const slots = activeSchedule.cargaHoraria || [];
        const daySlots = slots.filter(s => String(s.dia || s.day).toLowerCase() === yesterdayDayName.toLowerCase());
        if (daySlots.length > 0) {
          const config = getConfigHorariosMap_();
          let startStr = '08:00', endStr = '14:00';
          if (tNorm === 'tarde') {
            startStr = config['HORA_ENTRADA_TARDE'] || '14:00';
            endStr = config['HORA_SALIDA_TARDE'] || '19:00';
          } else if (tNorm === 'mixto') {
            startStr = config['HORA_ENTRADA_MIXTO'] || '08:00';
            endStr = config['HORA_SALIDA_MIXTO'] || '19:00';
          } else {
            startStr = config['HORA_ENTRADA_MANANA'] || '08:00';
            endStr = config['HORA_SALIDA_MANANA'] || '14:00';
          }

          const startParts = startStr.split(':');
          const endParts = endStr.split(':');
          const shiftStartHour = parseInt(startParts[0], 10) + parseInt(startParts[1] || '0', 10) / 60;
          const shiftEndHour = parseInt(endParts[0], 10) + parseInt(endParts[1] || '0', 10) / 60;
          const shiftTotalHours = shiftEndHour - shiftStartHour;

          let classHoursInShift = 0;

          daySlots.forEach(slot => {
            const slotStartParts = slot.inicio.split(':');
            const slotEndParts = slot.fin.split(':');
            const slotStartDecimal = parseInt(slotStartParts[0], 10) + parseInt(slotStartParts[1] || '0', 10) / 60;
            const slotEndDecimal = parseInt(slotEndParts[0], 10) + parseInt(slotEndParts[1] || '0', 10) / 60;

            const overlapStart = Math.max(slotStartDecimal, shiftStartHour);
            const overlapEnd = Math.min(slotEndDecimal, shiftEndHour);
            if (overlapEnd > overlapStart) {
              classHoursInShift += (overlapEnd - overlapStart);
            }
          });

          const coverageRatio = classHoursInShift / shiftTotalHours;
          if (coverageRatio >= 0.8) {
            return; // Excusado
          }
        }
      }

      generarAmonestacionAutomatica_(userId, 'AUSENCIA_INJUSTIFICADA');
    });
  } catch (e) { Logger.log('Error en checkAusenciasInjustificadas: ' + e.message); }
}

function checkLlegadaRetardada(userId, entryTimestamp) {
  try {
    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return;

    const timeZone = SS.getSpreadsheetTimeZone();
    const actualEntry = new Date(entryTimestamp);
    const dateStr = Utilities.formatDate(actualEntry, timeZone, 'yyyy-MM-dd');

    const t = getEffectiveTurnoForDate(userId, dateStr);
    if (!t) return;
    const tNorm = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const config = getConfigHorariosMap_();
    let entryConfigKey;
    if (tNorm === 'manana' || tNorm === 'mañana') entryConfigKey = 'HORA_ENTRADA_MANANA';
    else if (tNorm === 'tarde') entryConfigKey = 'HORA_ENTRADA_TARDE';
    else entryConfigKey = 'HORA_ENTRADA_MIXTO';

    const configuredTime = config[entryConfigKey] || '08:00';
    const parts = configuredTime.split(':');

    const scheduledEntry = new Date(actualEntry);
    scheduledEntry.setHours(parseInt(parts[0], 10), parseInt(parts[1] || '0', 10), 0, 0);

    const diffMin = (actualEntry - scheduledEntry) / 60000;

    let userTolerance = userDetails.toleranciaPersonalizada;
    if (userTolerance === null || userTolerance === undefined || isNaN(userTolerance) || userTolerance === "") {
      userTolerance = parseInt(config['TOLERANCIA_RETARDO_MIN'] || '60', 10);
    }

    if (diffMin >= userTolerance) {
      // A) Permiso
      const approvedPermissions = getApprovedPermissionsInRange(dateStr, dateStr);
      if (isUserOnLeave(parseDateStringAsLocal(dateStr), userId, approvedPermissions)) {
        return;
      }

      // B) Horario de clases
      const approvedSchedules = getSchedulesHistory(userId).filter(s => s.estado === 'Aprobado');
      if (approvedSchedules.length > 0) {
        const activeSchedule = approvedSchedules[0];
        const slots = activeSchedule.cargaHoraria || [];
        const daysOfWeekMap = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
        const checkDayName = daysOfWeekMap[actualEntry.getDay()];

        const daySlots = slots.filter(s => String(s.dia || s.day).toLowerCase() === checkDayName.toLowerCase());
        const graceMinutes = activeSchedule.tiempoGracia || 0;

        for (const slot of daySlots) {
          const slotStartParts = slot.inicio.split(':');
          const slotEndParts = slot.fin.split(':');

          const slotStart = new Date(actualEntry);
          slotStart.setHours(parseInt(slotStartParts[0], 10), parseInt(slotStartParts[1] || '0', 10), 0, 0);

          const slotEnd = new Date(actualEntry);
          slotEnd.setHours(parseInt(slotEndParts[0], 10), parseInt(slotEndParts[1] || '0', 10), 0, 0);

          const limitTime = new Date(slotEnd.getTime() + (graceMinutes + userTolerance) * 60000);

          if (slotStart <= scheduledEntry && slotEnd >= new Date(scheduledEntry.getTime() - 30 * 60000)) {
            if (actualEntry <= limitTime) {
              return; // Excusado
            }
          }
        }
      }

      generarAmonestacionAutomatica_(userId, 'LLEGADA_RETARDADA');
    }
  } catch (e) { Logger.log('Error en checkLlegadaRetardada: ' + e.message); }
}



function getOpenAttendanceSessions(forTrigger = false) {
  try {
    const cacheKey = 'open_sessions';
    if (!forTrigger) {
      const cached = CACHE.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const allRecords = getSheetValues(ATTENDANCE_SHEET).slice(1);
    const lastUserRecord = new Map();
    allRecords.forEach(row => {
      const d = safeGetDate(row[0]);
      if (!d) return;
      const userId = String(row[1]);
      lastUserRecord.set(userId, {
        type: row[5],
        timestamp: d.toISOString()
      });
    });

    const openSessions = [];
    lastUserRecord.forEach((record, userId) => {
      if (record.type === 'Entrada') {
        const userDetails = getUserDetailsById(userId);
        if (userDetails) {
          openSessions.push({
            userId: userId,
            name: userDetails.name,
            entryTimestamp: record.timestamp,
            institucion: userDetails.institucion
          });
        }
      }
    });

    const sortedSessions = openSessions.sort((a, b) => new Date(a.entryTimestamp) - new Date(b.entryTimestamp));
    if (!forTrigger) CACHE.put(cacheKey, JSON.stringify(sortedSessions), 300);
    return sortedSessions;
  } catch (e) { return []; }
}

function adminForceClockOut(details, actorUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const { userId, dateTimeString } = details;
    if (!userId || !dateTimeString) return { success: false, message: 'Faltan datos.' };

    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return { success: false, message: `Usuario ID ${userId} no encontrado.` };

    const lastState = getLastAttendanceState(userId);
    if (!lastState || lastState.type !== 'Entrada') {
      return { success: false, message: `${userDetails.name} no tiene entrada activa.` };
    }

    ATTENDANCE_SHEET.appendRow([
      new Date(dateTimeString), userId, userDetails.name, userDetails.turno,
      userDetails.institucion, 'Salida', null, null, 'Cierre Manual', null
    ]);

    CACHE.put(`last_state_${userId}`, JSON.stringify({ type: 'Salida' }), 300);
    CACHE.remove('open_sessions');

    lock.releaseLock();

    if (actorUserId) {
      registrarAuditoria(actorUserId, 'MODIFICAR', 'Asistencias',
        `Cierre manual forzado para: ${userDetails.name} | Hora: ${dateTimeString}`, 'OK');
    }
    return { success: true, message: `Salida registrada para ${userDetails.name}.` };
  } catch (e) {
    return { success: false, message: `Error de concurrencia o proceso: ${e.message}` };
  } finally {
    try {
      lock.releaseLock();
    } catch (e) { }
  }
}

// =======================================================
// =========== GESTIÓN DE SUPLENCIAS =====================
// =======================================================

function checkForConflicts(titularId, suplenteId, startDateStr, endDateStr) {
  const start = parseDateStringAsLocal(startDateStr);
  const end = parseDateStringAsLocal(endDateStr);
  if (!start || !end) return { hasConflict: true, message: 'Fechas inválidas.' };
  end.setHours(23, 59, 59, 999);

  const usersToCheck = [{ id: titularId, name: 'El titular' }, { id: suplenteId, name: 'El suplente' }];

  if (SUBSTITUTIONS_SHEET) {
    const subs = SUBSTITUTIONS_SHEET.getDataRange().getValues().slice(1);
    for (const s of subs) {
      const estado = s[8];
      if (estado === 'Aprobada' || estado === 'Pendiente de Admin') {
        for (const user of usersToCheck) {
          if (String(s[1]) === String(user.id) || String(s[3]) === String(user.id)) {
            const sStart = safeGetDate(s[5]);
            const sEnd = safeGetDate(s[6]);
            if (sStart && sEnd) {
              sEnd.setHours(23, 59, 59, 999);
              if (start <= sEnd && end >= sStart) {
                return { hasConflict: true, message: `${user.name} ya tiene actividad en esas fechas.` };
              }
            }
          }
        }
      }
    }
  }

  if (DUTY_SHEET && suplenteId) {
    const duties = DUTY_SHEET.getDataRange().getValues().slice(1);
    const suplenteDetails = getUserDetailsById(suplenteId);
    if (suplenteDetails) {
      for (const duty of duties) {
        const dutyDate = safeGetDate(duty[0]);
        if (dutyDate && dutyDate >= start && dutyDate <= end && String(suplenteDetails.turno).toLowerCase() === String(duty[1]).toLowerCase()) {
          return { hasConflict: true, message: `El suplente tiene guardia obligatoria (${duty[1]}) asignada.` };
        }
      }
    }
  }
  return { hasConflict: false, message: '' };
}

function createSubstitution(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const { titularId, suplenteId, startDate, endDate, comentarios } = data;
    if (!titularId || !startDate || !endDate) return { success: false, message: 'Faltan datos.' };

    const titular = getUserDetailsById(titularId);
    if (!titular) return { success: false, message: 'Titular no encontrado.' };

    let datosSuplente = { userId: "", name: "POR DEFINIR", turno: "" };
    let estadoSolicitud = "Disponible";
    let tipoMovimiento = "Solicitud Abierta";
    let notaAdicional = "";

    if (suplenteId) {
      if (titularId === suplenteId) return { success: false, message: 'No puedes cubrirte a ti mismo.' };
      const suplenteEncontrado = getUserDetailsById(suplenteId);
      if (!suplenteEncontrado) return { success: false, message: 'Suplente inválido.' };

      if (titular.turno === suplenteEncontrado.turno) {
        return { success: false, message: `Error: La suplencia debe ser estrictamente entre operadores de turnos diferentes. Ambos son de ${titular.turno}.` };
      }

      datosSuplente = suplenteEncontrado;
      estadoSolicitud = "Pendiente de Admin";

      const conflictCheck = checkForConflicts(titularId, suplenteId, startDate, endDate);
      if (conflictCheck.hasConflict) return { success: false, message: conflictCheck.message };

      tipoMovimiento = "Cruce de Turno";
      notaAdicional = `[CRUCE: ${datosSuplente.turno} cubre a ${titular.turno}]`;
    }

    const subID = new Date().getTime().toString();
    const newRow = [
      subID, titularId, titular.name,
      datosSuplente.userId, datosSuplente.name,
      parseDateStringAsLocal(startDate), parseDateStringAsLocal(endDate),
      titular.turno, estadoSolicitud,
      (comentarios || "") + notaAdicional, new Date(),
      datosSuplente.turno, tipoMovimiento
    ];

    const sheet = SS.getSheetByName("Suplencias");
    if (!sheet) return { success: false, message: 'No existe hoja Suplencias.' };
    sheet.appendRow(newRow);

    if (data.actorUserId) {
      registrarAuditoria(data.actorUserId, 'CREAR', 'Suplencias', `Suplencia ID ${subID} creada para titular: ${titular.name} | Suplente: ${datosSuplente.name}`, 'OK');
    }

    return { success: true, message: suplenteId ? 'Enviada a aprobación.' : 'Publicada en Bolsa.' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getOpenRequests() {
  try {
    if (!SUBSTITUTIONS_SHEET) return [];
    const timeZone = SS.getSpreadsheetTimeZone();
    return SUBSTITUTIONS_SHEET.getDataRange().getValues().slice(1)
      .filter(row => row[3] === "" && row[8] === "Disponible" && safeGetDate(row[5]))
      .map(row => ({
        idSolicitud: row[0],
        titularName: row[2],
        solicitante: row[2],
        fechaInicio: Utilities.formatDate(safeGetDate(row[5]), timeZone, 'yyyy-MM-dd'),
        fechaFin: Utilities.formatDate(safeGetDate(row[6]), timeZone, 'yyyy-MM-dd'),
        turno: row[7],
        comentarios: row[9]
      }));
  } catch (e) { return []; }
}

function acceptRequest(reqId, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const range = SUBSTITUTIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(reqId));

    if (rowIndex === -1) return { success: false, message: 'Solicitud no encontrada.' };

    const requestRow = values[rowIndex];
    const titularId = String(requestRow[1]);

    if (requestRow[3] !== "" || requestRow[8] !== "Disponible") {
      return { success: false, message: 'Guardia ya tomada.' };
    }
    if (titularId === String(userId)) return { success: false, message: 'Es tu propia guardia.' };

    const suplente = getUserDetailsById(userId);
    const titular = getUserDetailsById(titularId);
    if (!suplente || !titular) return { success: false, message: 'Error de usuario.' };

    if (titular.turno === suplente.turno) {
      return { success: false, message: `Error: Debes ser de un turno diferente al titular para cubrirlo.` };
    }

    const conflict = checkForConflicts(titularId, userId, requestRow[5], requestRow[6]);
    if (conflict.hasConflict) return { success: false, message: conflict.message };

    const sheet = SUBSTITUTIONS_SHEET;
    const r = rowIndex + 1;

    sheet.getRange(r, 4).setValue(suplente.userId);
    sheet.getRange(r, 5).setValue(suplente.name);
    sheet.getRange(r, 9).setValue("Pendiente de Admin");
    sheet.getRange(r, 12).setValue(suplente.turno);
    sheet.getRange(r, 13).setValue("Cruce de Turno");

    return { success: true, message: 'Guardia aceptada. Pendiente de Admin.' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

function getSubstitutions() {
  try {
    if (!SUBSTITUTIONS_SHEET) return [];
    const timeZone = SS.getSpreadsheetTimeZone();
    return getSheetValues(SUBSTITUTIONS_SHEET).slice(1)
      .filter(row => safeGetDate(row[5]) && safeGetDate(row[6]))
      .map(row => ({
        subId: row[0],
        titularId: row[1],
        titularName: row[2],
        suplenteId: row[3],
        suplenteName: row[4],
        startDate: Utilities.formatDate(safeGetDate(row[5]), timeZone, 'yyyy-MM-dd'),
        endDate: Utilities.formatDate(safeGetDate(row[6]), timeZone, 'yyyy-MM-dd'),
        titularTurno: row[7] || 'N/A',
        estado: row[8],
        comentarios: row[9] || ''
      })).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  } catch (e) { return []; }
}

function getUserSubstitutionInfo(userId) {
  const allSubs = getSubstitutions();
  const myTitular = allSubs.filter(s => String(s.titularId) === String(userId));
  const mySuplente = allSubs.filter(s => String(s.suplenteId) === String(userId));

  return {
    pendingMyApproval: myTitular.filter(s => s.estado === 'Pendiente de Titular'),
    iAmCovering: mySuplente.filter(s => s.estado === 'Aprobada' || s.estado === 'Pendiente de Admin'),
    iAmBeingCovered: myTitular.filter(s => s.estado === 'Aprobada' || s.estado === 'Pendiente de Admin')
  };
}

function approveSubstitutionByTitular(subId, userId) {
  try {
    const range = SUBSTITUTIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(subId));
    if (rowIndex === -1) return { success: false, message: 'No encontrada.' };

    const subData = values[rowIndex];
    if (String(subData[1]) !== String(userId)) return { success: false, message: 'Solo titular aprueba.' };
    if (subData[8] !== 'Pendiente de Titular') return { success: false, message: 'Estado inválido.' };

    SUBSTITUTIONS_SHEET.getRange(rowIndex + 1, 9).setValue('Pendiente de Admin');
    return { success: true, message: 'Aprobada. Pendiente de Admin.' };
  } catch (e) { return { success: false, message: e.message }; }
}

function updateSubstitutionStatus(subId, newStatus, currentUserId) {
  try {
    const range = SUBSTITUTIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(subId));
    if (rowIndex === -1) return { success: false, message: 'No encontrada.' };

    const subData = values[rowIndex];
    const userDetails = getUserDetailsById(currentUserId);
    const isTitular = String(subData[1]) === String(currentUserId);
    const isAdmin = userDetails.role === 'Admin';
    const currentState = subData[8];

    let canUpdate = false;
    if (newStatus === 'Rechazada') {
      if (isTitular && currentState === 'Pendiente de Titular') canUpdate = true;
      if (isAdmin && (currentState === 'Pendiente de Titular' || currentState === 'Pendiente de Admin')) canUpdate = true;
    } else if (newStatus === 'Aprobada') {
      if (isAdmin && currentState === 'Pendiente de Admin') canUpdate = true;
    }

    if (canUpdate) {
      SUBSTITUTIONS_SHEET.getRange(rowIndex + 1, 9).setValue(newStatus);
      if (currentUserId) {
        const accion = newStatus === 'Aprobada' ? 'APROBAR' : 'RECHAZAR';
        registrarAuditoria(currentUserId, accion, 'Suplencias', `Suplencia ID ${subId} marcada como ${newStatus} para titular: ${subData[2]}`, 'OK');
      }
      return { success: true, message: `Estado: ${newStatus}.` };
    } else {
      return { success: false, message: 'No autorizado.' };
    }
  } catch (e) { return { success: false, message: e.message }; }
}

function deleteSubstitution(subId, actorUserId) {
  try {
    const range = SUBSTITUTIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(subId));
    if (rowIndex === -1) return { success: false, message: 'No encontrada.' };
    if (values[rowIndex][8] === 'Aprobada') return { success: false, message: 'Ya aprobada.' };
    const deletedRow = values[rowIndex];
    SUBSTITUTIONS_SHEET.deleteRow(rowIndex + 1);
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'ELIMINAR', 'Suplencias', `Suplencia ID ${subId} eliminada para titular: ${deletedRow[2]}`, 'OK');
    }
    return { success: true, message: 'Eliminada.' };
  } catch (e) { return { success: false, message: e.message }; }
}

function getActiveSubstituteFor(userId, dateStr) {
  try {
    if (!SUBSTITUTIONS_SHEET) return null;
    const tz = SS.getSpreadsheetTimeZone();
    const checkDate = Utilities.formatDate(parseDateStringAsLocal(dateStr), tz, 'yyyy-MM-dd');
    const rows = SUBSTITUTIONS_SHEET.getDataRange().getValues().slice(1);

    for (const row of rows) {
      if (!row[5] || !row[6]) continue;
      if (row[8] !== "Aprobada") continue;
      const titularId = String(row[1]);
      const startDate = Utilities.formatDate(safeGetDate(row[5]), tz, 'yyyy-MM-dd');
      const endDate = Utilities.formatDate(safeGetDate(row[6]), tz, 'yyyy-MM-dd');

      if (titularId === String(userId) && checkDate >= startDate && checkDate <= endDate) {
        return { suplenteId: row[3], suplenteName: row[4] };
      }
    }
    return null;
  } catch (e) { return null; }
}

// =======================================================
// ================ GESTIÓN DE PERMISOS ==================
// =======================================================

function getPermissionRequests(isUser, userId) {
  try {
    if (!PERMISSIONS_SHEET) return [];
    const timeZone = SS.getSpreadsheetTimeZone();
    let permissions = getSheetValues(PERMISSIONS_SHEET).slice(1).filter(r => safeGetDate(r[3]) && safeGetDate(r[4]));
    if (isUser) permissions = permissions.filter(row => String(row[1]) === String(userId));
    return permissions.map(row => ({
      permisoId: row[0], userId: row[1], userName: row[2],
      fechaInicio: Utilities.formatDate(safeGetDate(row[3]), timeZone, 'yyyy-MM-dd'),
      fechaFin: Utilities.formatDate(safeGetDate(row[4]), timeZone, 'yyyy-MM-dd'),
      tipoPermiso: row[5], estado: row[6], comentarios: row[7]
    })).sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
  } catch (e) { return []; }
}

function requestPermissionForUser(data) {
  try {
    const { userId, name, startDate, endDate, type, comments } = data;
    if (!userId || !startDate || !endDate || !type) return { success: false, message: 'Faltan datos.' };

    const reqStart = parseDateStringAsLocal(startDate);
    const reqMonth = reqStart.getMonth();
    const reqYear = reqStart.getFullYear();

    const allPerms = PERMISSIONS_SHEET.getDataRange().getValues().slice(1);
    const permsInMonth = allPerms.filter(row => {
      if (String(row[1]) !== String(userId) || !row[3]) return false;
      const status = row[6];
      if (status === 'Rechazado' || status === 'Rechazada') return false;
      const pDate = safeGetDate(row[3]);
      if (!pDate) return false;
      return pDate.getMonth() === reqMonth && pDate.getFullYear() === reqYear;
    });

    if (permsInMonth.length >= 3) {
      return { success: false, message: '⚠️ Límite excedido: Solo puedes solicitar 3 permisos por mes.' };
    }

    PERMISSIONS_SHEET.appendRow([
      new Date().getTime().toString(), userId, name, reqStart, parseDateStringAsLocal(endDate),
      type, 'Pendiente', comments || '', new Date()
    ]);
    return { success: true, message: 'Solicitud enviada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function adminCreatePermission(data) {
  try {
    const { userId, startDate, endDate, type, comments } = data;
    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return { success: false, message: 'Usuario no encontrado.' };
    PERMISSIONS_SHEET.appendRow([
      new Date().getTime().toString(), userId, userDetails.name, parseDateStringAsLocal(startDate),
      parseDateStringAsLocal(endDate), type, 'Aprobado', comments || '', new Date()
    ]);
    return { success: true, message: 'Permiso creado y aprobado.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function updatePermissionStatus(permisoId, newStatus) {
  try {
    const range = PERMISSIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(permisoId));
    if (rowIndex === -1) return { success: false, message: 'No encontrado.' };
    PERMISSIONS_SHEET.getRange(rowIndex + 1, 7).setValue(newStatus);
    return { success: true, message: `Estado actualizado a '${newStatus}'.` };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function deletePermissionRequest(permisoId) {
  try {
    const range = PERMISSIONS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(row => String(row[0]) === String(permisoId));
    if (rowIndex === -1) return { success: false, message: 'No encontrada.' };
    PERMISSIONS_SHEET.deleteRow(rowIndex + 1);
    return { success: true, message: 'Eliminada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ==================== REPORTES =========================
// =======================================================

// --- FUNCIONES AUXILIARES PARA REPORTES (AHORA INCLUIDAS CORRECTAMENTE) ---
function getApprovedPermissionsInRange(startDate, endDate) {
  const permissionsMap = new Map();
  if (!PERMISSIONS_SHEET) return permissionsMap;
  const start = parseDateStringAsLocal(startDate);
  const end = parseDateStringAsLocal(endDate);
  end.setHours(23, 59, 59, 999);

  getSheetValues(PERMISSIONS_SHEET).slice(1).forEach(row => {
    if (row[6] !== 'Aprobado') return;
    const permStartDate = safeGetDate(row[3]);
    const permEndDate = safeGetDate(row[4]);
    if (!permStartDate || !permEndDate) return;
    permEndDate.setHours(23, 59, 59, 999);

    if (start <= permEndDate && end >= permStartDate) {
      const userId = String(row[1]);
      if (!permissionsMap.has(userId)) permissionsMap.set(userId, []);
      permissionsMap.get(userId).push({ start: permStartDate, end: permEndDate });
    }
  });
  return permissionsMap;
}

function isUserOnLeave(checkDate, userId, permissionsMap) {
  if (!permissionsMap.has(String(userId))) return false;
  const userLeaves = permissionsMap.get(String(userId));
  for (const leave of userLeaves) {
    if (checkDate >= leave.start && checkDate <= leave.end) return true;
  }
  return false;
}

function getPermissionsLookupMap(startDate, endDate) {
  const lookupMap = new Map();
  if (!PERMISSIONS_SHEET) return lookupMap;
  const start = parseDateStringAsLocal(startDate);
  const end = parseDateStringAsLocal(endDate);
  end.setHours(23, 59, 59, 999);
  const timeZone = SS.getSpreadsheetTimeZone();

  getSheetValues(PERMISSIONS_SHEET).slice(1).forEach(row => {
    if (row[6] !== 'Aprobado') return;
    const permStartDate = safeGetDate(row[3]);
    const permEndDate = safeGetDate(row[4]);
    if (!permStartDate || !permEndDate) return;
    permEndDate.setHours(23, 59, 59, 999);

    if (start <= permEndDate && end >= permStartDate) {
      const userId = String(row[1]);
      const comments = `${row[5]}: ${row[7] || 'Sin comentarios'}`;
      let currentPermDate = new Date(permStartDate);
      while (currentPermDate <= permEndDate) {
        if (currentPermDate >= start && currentPermDate <= end) {
          const dateKey = Utilities.formatDate(currentPermDate, timeZone, 'yyyy-MM-dd');
          lookupMap.set(`${userId}-${dateKey}`, comments);
        }
        currentPermDate.setDate(currentPermDate.getDate() + 1);
      }
    }
  });
  return lookupMap;
}
// -------------------------------------------------------------------------

function getTodaysAbsentees() {
  try {
    const timeZone = SS.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
    const todayLocal = parseDateStringAsLocal(todayStr);
    const dayOfWeek = todayLocal.getDay();

    const dutyShiftsMap = new Map(DUTY_SHEET ? getDutyShifts().map(d => [d.date, { turno: d.turno, categoria: d.categoria }]) : []);
    const dutyShiftForDay = dutyShiftsMap.get(todayStr);

    if (dutyShiftForDay && dutyShiftForDay.categoria === 'Feriado') return [];
    if (!dutyShiftForDay && (dayOfWeek === 0 || dayOfWeek === 6)) return [];

    // MAPA DE CROSS TURNOS
    const crossMap = new Map();
    const crossSheet = SS.getSheetByName("CrossTurnos");
    if (crossSheet) {
      getSheetValues(crossSheet).slice(1).forEach(row => {
        let date, u1, u2, estado;
        if (row.length > 4) { date = row[1]; u1 = row[2]; u2 = row[3]; estado = row[4]; }
        else { date = row[0]; u1 = row[1]; u2 = row[2]; estado = "Aprobada"; }

        if (estado === "Aprobada" && date) {
          const dStr = Utilities.formatDate(safeGetDate(date), timeZone, 'yyyy-MM-dd');
          crossMap.set(`${dStr}_${u1}`, String(u2));
          crossMap.set(`${dStr}_${u2}`, String(u1));
        }
      });
    }

    const allUsers = getAllUsersForAdmin().filter(user => user.role !== 'Admin' && user.estado === 'Activo');

    const presentUserIds = new Set();
    getSheetValues(ATTENDANCE_SHEET).slice(1).forEach(r => {
      const d = safeGetDate(r[0]);
      if (!d) return;
      if (Utilities.formatDate(d, timeZone, 'yyyy-MM-dd') === todayStr && r[5] === 'Entrada') {
        presentUserIds.add(String(r[1]));
      }
    });

    const approvedPermissionsMap = getApprovedPermissionsInRange(todayStr, todayStr);

    return allUsers.filter(user => {
      if (presentUserIds.has(String(user.userId))) return false;
      if (isUserOnLeave(todayLocal, user.userId, approvedPermissionsMap)) return false;
      const substitute = getActiveSubstituteFor(user.userId, todayStr);
      if (substitute) return false;

      let currentEffectiveTurno = user.turno;

      const crossKey = `${todayStr}_${user.userId}`;
      if (crossMap.has(crossKey)) {
        const swappedId = crossMap.get(crossKey);
        const swappedUser = allUsers.find(u => String(u.userId) === swappedId);
        if (swappedUser) {
          currentEffectiveTurno = swappedUser.turno;
        }
      }

      const userShift = normalizeShift(currentEffectiveTurno);
      if (dutyShiftForDay) {
        const dutyNorm = normalizeShift(dutyShiftForDay.turno);
        if (dutyNorm === 'mixto') {
          return (userShift === 'mañana' || userShift === 'tarde' || userShift === 'mixto');
        } else {
          return userShift === dutyNorm;
        }
      } else {
        return (dayOfWeek >= 1 && dayOfWeek <= 5);
      }
    });
  } catch (e) {
    return [{ name: "⚠️ Error del Sistema", institucion: e.message, turno: "N/A" }];
  }
}

function getCompleteAttendanceReport(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const timeZone = SS.getSpreadsheetTimeZone();
  const usersDetailsMap = new Map(
    getAllUsersForAdmin().filter(u => u.role !== 'Admin' && u.estado === 'Activo').map(u => [String(u.userId), u])
  );

  const dutyShiftsMap = new Map(DUTY_SHEET ? getDutyShifts().map(d => [d.date, d]) : []);
  const permissionsLookup = getPermissionsLookupMap(startDate, endDate);

  const subMap = new Map();
  if (SUBSTITUTIONS_SHEET) {
    getSubstitutions().filter(s => s.estado === 'Aprobada').forEach(sub => {
      if (!sub.startDate || !sub.endDate) return;
      let currentDate = parseDateStringAsLocal(sub.startDate);
      const loopEndDate = parseDateStringAsLocal(sub.endDate);
      if (currentDate > loopEndDate) return;

      while (currentDate <= loopEndDate) {
        const dateStr = Utilities.formatDate(currentDate, timeZone, 'yyyy-MM-dd');
        const suplente = usersDetailsMap.get(sub.suplenteId);
        const nombreSuplente = suplente ? suplente.name : 'Suplente externo/Admin';

        const key = `${sub.titularId}-${dateStr}`;
        subMap.set(key, `Cubierto por ${nombreSuplente}`);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
  }

  const start = parseDateStringAsLocal(startDate);
  const end = parseDateStringAsLocal(endDate);
  end.setHours(23, 59, 59, 999);

  const attendanceRecordsMap = new Map();
  getSheetValues(ATTENDANCE_SHEET).slice(1).forEach(r => {
    const d = safeGetDate(r[0]);
    if (!d) return;
    if (d >= start && d <= end) {
      const key = `${String(r[1])}-${Utilities.formatDate(d, timeZone, 'yyyy-MM-dd')}`;
      if (!attendanceRecordsMap.has(key)) attendanceRecordsMap.set(key, []);
      attendanceRecordsMap.get(key).push({ type: r[5], time: Utilities.formatDate(d, timeZone, 'HH:mm:ss') });
    }
  });

  const report = [];
  let currentDate = new Date(start);

  while (currentDate <= end) {
    const dateStr = Utilities.formatDate(currentDate, timeZone, 'yyyy-MM-dd');
    const dayOfWeek = currentDate.getDay();
    const dutyShiftForDay = dutyShiftsMap.get(dateStr);

    usersDetailsMap.forEach((user, userId) => {
      const userTurnoNorm = normalizeShift(user.turno);
      const attendanceKey = `${userId}-${dateStr}`;
      let shouldInclude = false;

      if (dutyShiftForDay) {
        const dutyNorm = normalizeShift(dutyShiftForDay.turno);
        if (dutyNorm === 'mixto') {
          if (userTurnoNorm === 'mañana' || userTurnoNorm === 'tarde' || userTurnoNorm === 'mixto') shouldInclude = true;
        } else if (userTurnoNorm === dutyNorm) {
          shouldInclude = true;
        }
      } else {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          if (userTurnoNorm === 'mañana' || userTurnoNorm === 'tarde' || userTurnoNorm === 'mixto') shouldInclude = true;
        }
      }

      // Si la persona de hecho asistió, igual debe ser incluida en el reporte
      if (attendanceRecordsMap.has(attendanceKey)) {
        shouldInclude = true;
      }

      if (!shouldInclude) return;

      let horaEntrada = "", horaSalida = "", status = "Ausente", comments = "";

      if (subMap.has(attendanceKey)) {
        status = "Suplencia"; comments = subMap.get(attendanceKey);
      } else if (permissionsLookup.has(attendanceKey)) {
        status = "Permiso"; comments = permissionsLookup.get(attendanceKey);
      } else if (attendanceRecordsMap.has(attendanceKey)) {
        status = "Presente";
        const dailyRecords = attendanceRecordsMap.get(attendanceKey);
        const entries = dailyRecords.filter(rec => rec.type === 'Entrada').map(rec => rec.time).sort();
        const exits = dailyRecords.filter(rec => rec.type === 'Salida').map(rec => rec.time).sort();
        if (entries.length > 0) horaEntrada = entries[0];
        if (exits.length > 0) horaSalida = exits[exits.length - 1];
      } else if (dutyShiftForDay && dutyShiftForDay.categoria === 'Feriado') {
        status = "Feriado";
      }

      report.push({
        date: dateStr, horaEntrada, horaSalida, name: user.name,
        institucion: user.institucion, turno: user.turno || 'N/A',
        status, comentarios: comments,
        tipoDia: dutyShiftForDay ? (dutyShiftForDay.categoria || "Guardia") : "Día Laborable Normal (L-V)"
      });
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return report.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

// =======================================================
// ========= FUNCIONES DE UTILIDAD Y CRUD USUARIOS =======
// =======================================================

function getCompanyConfig() { return COMPANY_CONFIG; }

// =======================================================
// ======= UTILIDADES DE NORMALIZACIÓN DE DATOS ==========
// =======================================================

/**
 * Parsea el campo de áreas de forma robusta, manejando:
 * - Arrays JSON: ["AREA-1","AREA-2"]
 * - String simple: AREA-1
 * - Strings separados por coma: AREA-1,AREA-2
 * - Valores vacíos o nulos
 */
function parseAreasRobust(rawValue) {
  if (!rawValue || String(rawValue).trim() === '') return [];
  const str = String(rawValue).trim();
  // Intento 1: JSON Array
  if (str.startsWith('[')) {
    try { return JSON.parse(str); } catch (e) { }
  }
  // Intento 2: String separado por comas (sin corchetes)
  if (str.includes(',')) {
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }
  // Intento 3: String simple (una sola área)
  return [str];
}

/**
 * Normaliza los datos de la hoja de Usuarios para asegurar consistencia:
 * - Corrige SubRol con acentos incorrectos (ej. "Coordinador de Area" → "Coordinador de Área")
 * - Actualiza el Rol del usuario admin@empresa.com a SubRol "Coordinador General"
 * - Sincroniza el campo Rol (col E) con el SubRol correspondiente
 * Debe llamarse manualmente o desde un trigger de instalación.
 */
function normalizarDatosHoja() {
  try {
    const values = USERS_SHEET.getDataRange().getValues();
    const SUBROL_MAP = {
      'coordinador de area': 'Coordinador de Área',
      'coordinador de área': 'Coordinador de Área',
      'coordinador general': 'Coordinador General',
      'superadmin': 'SuperAdmin',
      'super admin': 'SuperAdmin',
      'operador/a': 'Operador/a',
      'operador': 'Operador/a',
      'analista': 'Analista',
      'informatico/a': 'Informático/a',
      'informático/a': 'Informático/a',
      'informatico': 'Informático/a',
      'informática': 'Informático/a',
      'informática/o': 'Informático/a',
      'informatica/o': 'Informático/a',
      'informatica': 'Informático/a'
    };
    let changesMade = 0;
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0]) continue; // fila vacía
      const currentSubRol = String(row[14] || '').trim();
      const currentRole = String(row[4] || '').trim();
      const normalizedKey = currentSubRol.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      let newSubRol = SUBROL_MAP[normalizedKey] || currentSubRol;
      let newRole = currentRole;

      // Determinar el Rol correcto según SubRol normalizado
      if (newSubRol === 'Coordinador General' || newSubRol === 'Coordinador de Área' || newSubRol === 'SuperAdmin') {
        newRole = 'Admin';
      } else {
        newRole = 'Usuario';
      }

      // Caso especial: SubRol vacío o 'N/A' en un usuario con Role=Admin → asignar Coordinador General
      if ((currentSubRol === '' || currentSubRol === 'N/A') && currentRole === 'Admin') {
        newSubRol = 'Coordinador General';
        newRole = 'Admin';
      }

      let rowChanged = false;
      if (newSubRol !== currentSubRol) {
        USERS_SHEET.getRange(i + 1, 15).setValue(newSubRol); // Columna O = SubRol
        rowChanged = true;
      }
      if (newRole !== currentRole) {
        USERS_SHEET.getRange(i + 1, 5).setValue(newRole); // Columna E = Rol
        rowChanged = true;
      }
      if (rowChanged) changesMade++;
    }

    // Verificar si existe al menos un SuperAdmin activo. Si no, crearlo.
    let hasSuperAdmin = false;
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0]) continue;
      const subRol = String(row[14] || '').trim();
      const estado = String(row[12] || 'Activo').trim();
      if (subRol === 'SuperAdmin' && estado === 'Activo') {
        hasSuperAdmin = true;
        break;
      }
    }

    if (!hasSuperAdmin) {
      const defaultEmail = 'superadmin@empresa.com';
      const emailExists = values.some(row => row[2] && String(row[2]).trim().toLowerCase() === defaultEmail);
      if (!emailExists) {
        const defaultSuperAdminRow = [
          new Date().getTime().toString(),
          "Super Administrador",
          defaultEmail,
          "SuperAdmin123*",
          "Admin",
          "V-00000000",
          "Sede Central",
          "0000-0000000",
          "Oficina Principal",
          "Mixto",
          new Date("1990-01-01"),
          "",
          "Activo",
          "[]",
          "SuperAdmin",
          "",
          new Date()
        ];
        USERS_SHEET.appendRow(defaultSuperAdminRow);
        changesMade++;
      }
    }

    CACHE.remove('users_data');
    Logger.log(`normalizarDatosHoja: ${changesMade} filas actualizadas.`);
    return { success: true, message: `Normalización completada. ${changesMade} registros actualizados.` };
  } catch (e) {
    Logger.log('Error en normalizarDatosHoja: ' + e.message);
    return { success: false, message: 'Error: ' + e.message };
  }
}

function parseCoordinate(val) {
  if (val === undefined || val === null) return null;

  if (typeof val === 'number') {
    let absVal = Math.abs(val);
    if (absVal > 180) {
      let sign = val < 0 ? -1 : 1;
      while (absVal > 180) {
        absVal /= 10;
      }
      return absVal * sign;
    }
    return val;
  }

  let str = String(val).trim();
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return null;

  if (str.indexOf(',') !== -1 && str.indexOf('.') === -1) {
    str = str.replace(',', '.');
  }

  if ((str.match(/\./g) || []).length > 1) {
    let sign = str.startsWith('-') ? -1 : 1;
    let digits = str.replace(/[^0-9]/g, '');
    let num = parseFloat(digits);
    if (!isNaN(num)) {
      while (num > 180) {
        num /= 10;
      }
      return num * sign;
    }
  }

  let parsed = parseFloat(str);
  if (isNaN(parsed)) return null;

  let absParsed = Math.abs(parsed);
  if (absParsed > 180) {
    let sign = parsed < 0 ? -1 : 1;
    while (absParsed > 180) {
      absParsed /= 10;
    }
    return absParsed * sign;
  }

  return parsed;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getUsersData() {
  const cacheKey = "users_data";
  const cachedData = CACHE.get(cacheKey);
  if (cachedData) return JSON.parse(cachedData);

  const timeZone = SS.getSpreadsheetTimeZone();
  const values = getSheetValues(USERS_SHEET);
  const usersObject = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const email = row[2];
    if (email) {
      let parsedAreas = parseAreasRobust(row[13]);
      let fechaInclusion = 'N/A';
      if (row[16] && String(row[16]).trim() !== '') {
        try {
          const d = safeGetDate(row[16]);
          if (d && d.getFullYear() > 1970) fechaInclusion = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
        } catch (e) { fechaInclusion = 'N/A'; }
      }
      usersObject[email.toLowerCase()] = {
        userId: row[0], name: row[1], email: email, password: row[3], role: row[4],
        cedula: row[5] || 'N/A', institucion: row[6] || 'N/A', telefono: row[7] || 'N/A',
        direccion: row[8] || 'N/A', turno: row[9] || 'N/A',
        foto: row[11] || "", estado: row[12] || "Activo",
        areas: parsedAreas,
        subRol: row[14] || "Operador/a",
        toleranciaPersonalizada: row[15] !== undefined && row[15] !== "" && !isNaN(parseInt(row[15], 10)) ? parseInt(row[15], 10) : null,
        fechaInclusion: fechaInclusion
      };
    }
  }
  CACHE.put(cacheKey, JSON.stringify(usersObject), 3600);
  return usersObject;
}

function getAllUsersForAdmin() {
  const timeZone = SS.getSpreadsheetTimeZone();
  const users = getSheetValues(USERS_SHEET).slice(1)
    .filter(r => {
      if (!r[0]) return false;
      const subRolNorm = String(r[14] || '').trim().toLowerCase();
      // Ocultar SuperAdmin en la gestión de usuarios
      if (subRolNorm === 'superadmin' || subRolNorm === 'super admin') return false;
      return true;
    })
    .map(r => {
      let nacDate = 'N/A';
      if (r[10] && String(r[10]).trim() !== '') {
        try {
          let d = safeGetDate(r[10]);
          if (d && d.getFullYear() > 1970) nacDate = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
        } catch (e) { nacDate = 'N/A'; }
      }
      let parsedAreas = parseAreasRobust(r[13]);
      let fechaInclusion = 'N/A';
      if (r[16] && String(r[16]).trim() !== '') {
        try {
          const d = safeGetDate(r[16]);
          if (d && d.getFullYear() > 1970) fechaInclusion = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
        } catch (e) { fechaInclusion = 'N/A'; }
      }
      return {
        userId: r[0], name: r[1], email: r[2], role: r[4] || 'Usuario',
        cedula: r[5] || 'N/A', institucion: r[6] || 'N/A', telefono: r[7] || 'N/A',
        direccion: r[8] || 'N/A', turno: r[9] || 'N/A',
        nacimiento: nacDate, foto: r[11] || '', estado: r[12] || 'Activo',
        areas: parsedAreas,
        subRol: r[14] || 'Operador/a',
        toleranciaPersonalizada: r[15] !== undefined && r[15] !== "" && !isNaN(parseInt(r[15], 10)) ? parseInt(r[15], 10) : null,
        fechaInclusion: fechaInclusion
      };
    });
  return users;
}

function changeUserPassword(userId, currentPassword, newPassword) {
  try {
    if (!userId) {
      throw new Error("Identificación de usuario ausente.");
    }
    if (!currentPassword || !newPassword) {
      throw new Error("Campos de contraseña incompletos.");
    }
    if (newPassword.length < 4) {
      throw new Error("La nueva contraseña debe tener al menos 4 caracteres.");
    }

    const values = USERS_SHEET.getDataRange().getValues();
    let rowIndex = -1;
    let currentDbPass = "";

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(userId)) {
        rowIndex = i;
        currentDbPass = String(values[i][3]);
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Usuario no encontrado.");
    }

    if (!verifyPassword(currentPassword, currentDbPass)) {
      throw new Error("La contraseña actual es incorrecta.");
    }

    // Actualizar la contraseña en la columna D (columna 4)
    USERS_SHEET.getRange(rowIndex + 1, 4).setValue(hashPassword(newPassword));

    // Limpiar cachés
    CACHE.remove("users_data");
    CACHE.remove("all_users_for_admin");
    _requestCache.clear("Usuarios");

    // Registrar en auditoría
    registrarAuditoria(userId, "MODIFICAR", "Configuración Personal", "Cambió su contraseña de acceso", "OK");

    return { success: true, message: "Contraseña actualizada con éxito." };
  } catch (e) {
    Logger.log("Error en changeUserPassword: " + e.message);
    return { success: false, message: e.message };
  }
}

// Filtra usuarios por área(s) de un coordinador
function getAllUsersForCoordinator(coordinatorAreaIds) {
  if (!coordinatorAreaIds || coordinatorAreaIds.length === 0) return [];
  const allUsers = getAllUsersForAdmin();
  return allUsers.filter(function (u) {
    if (!u.areas || u.areas.length === 0) return false;
    return u.areas.some(function (a) { return coordinatorAreaIds.indexOf(a) !== -1; });
  });
}

function getUserDetailsById(userId) {
  try {
    const users = getUsersData();
    for (const email in users) {
      if (String(users[email].userId) === String(userId)) {
        return users[email];
      }
    }
  } catch (e) {
    Logger.log("Error buscando en cache getUserDetailsById: " + e.message);
  }
  const allUsers = getAllUsersForAdmin();
  return allUsers.find(u => String(u.userId) === String(userId)) || null;
}

/**
 * Sube una foto de perfil a Google Drive de forma robusta.
 * ESTADO DEL CÓDIGO: FACTORIZADO
 */
function uploadProfilePhoto(base64Data, filename, mimeType, targetFolderId = null) {
  try {
    // 1. Limpieza de datos: Remover el encabezado Data-URI si el frontend lo envía
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    // 2. Preparación del Blob
    const decodedData = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decodedData, mimeType, filename);

    // 3. Interacción con Drive (con fallback robusto)
    let folder;
    const folderId = targetFolderId || "16RltG04i9dvj2UC24QHpvFYXQowF57ld";
    try {
      folder = DriveApp.getFolderById(folderId);
      folder.getName(); // Forzar verificación de acceso de lectura/escritura
    } catch (err) {
      // Si el ID de carpeta no es accesible, se busca o crea una carpeta propia
      const fallbackName = "Asistencias_Horarios";
      const folders = DriveApp.getFoldersByName(fallbackName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(fallbackName);
      }
    }
    const file = folder.createFile(blob);

    // 4. Configuración de visibilidad para la Web App (con fallback si las políticas del dominio restringen compartir públicamente)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingErr) {
      Logger.log("No se pudo establecer el permiso público de la imagen: " + sharingErr.message);
    }

    // 5. Retorno de datos de éxito con URL optimizada
    return {
      success: true,
      fileId: file.getId(),
      url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w500`
    };

  } catch (e) {
    // Registro interno en Stackdriver para depuración
    console.error("Error crítico en uploadProfilePhoto: ", e);

    // Retorno controlado hacia el frontend
    return {
      success: false,
      message: "Error técnico al procesar la imagen: " + e.message
    };
  }
}

function addNewUser(userData) {
  try {
    const allUsers = USERS_SHEET.getDataRange().getValues();
    if (allUsers.some(row => row[2] && row[2].toLowerCase() === userData.email.toLowerCase())) {
      return { success: false, message: 'El email ya existe.' };
    }
    const nacDate = userData.nacimiento ? parseDateStringAsLocal(userData.nacimiento) : "";
    const areasJson = JSON.stringify(userData.areas || []);
    const subRol = userData.subRol || "Operador/a";
    // fechaInclusion: si se proporciona, usarla; si no, usar la fecha actual de creación
    const fechaInclusion = userData.fechaInclusion ? parseDateStringAsLocal(userData.fechaInclusion) : new Date();
    const finalHashedPassword = hashPassword(userData.password || "123456");
    USERS_SHEET.appendRow([
      new Date().getTime().toString(), userData.name, userData.email, finalHashedPassword,
      userData.role, userData.cedula, userData.institucion, userData.telefono,
      userData.direccion, userData.turno, nacDate, userData.foto || "", userData.estado || "Activo",
      areasJson, subRol, userData.toleranciaPersonalizada || "", fechaInclusion
    ]);
    CACHE.remove('users_data'); CACHE.remove('all_users_for_admin');
    try {
      normalizarDatosHoja();
    } catch (err) {
      Logger.log("Error normalizando en addNewUser: " + err.message);
    }
    if (userData.actorUserId) {
      registrarAuditoria(userData.actorUserId, 'CREAR', 'Usuarios',
        `Usuario creado: ${userData.name} (${userData.email}) | Sub-Rol: ${subRol} | Áreas: ${areasJson} | Fecha Inclusión: ${fechaInclusion}`, 'OK');
    }
    return { success: true, message: 'Usuario añadido.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function updateUser(userData) {
  try {
    const range = USERS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(userData.userId));
    if (rowIndex === -1) return { success: false, message: 'Usuario no encontrado.' };

    const password = userData.password ? hashPassword(userData.password) : values[rowIndex][3];
    const nacDate = userData.nacimiento ? parseDateStringAsLocal(userData.nacimiento) : "";
    const finalFoto = userData.foto || values[rowIndex][11] || "";
    const finalEstado = userData.estado || values[rowIndex][12] || "Activo";
    const areasJson = userData.areas !== undefined ? JSON.stringify(userData.areas) : (values[rowIndex][13] || "[]");
    const finalSubRol = userData.subRol || values[rowIndex][14] || "Operador/a";
    const toleranciaPersonalizada = userData.toleranciaPersonalizada !== undefined ? userData.toleranciaPersonalizada : (values[rowIndex][15] !== undefined ? values[rowIndex][15] : "");
    // Preservar o actualizar fechaInclusion (col 17, índice 16). Se puede editar si se envía desde el frontend.
    let finalFechaInclusion = values[rowIndex][16] || "";
    if (userData.fechaInclusion && userData.fechaInclusion !== 'N/A') {
      finalFechaInclusion = parseDateStringAsLocal(userData.fechaInclusion);
    }

    const updatedRow = [
      userData.userId, userData.name, userData.email, password, userData.role,
      userData.cedula, userData.institucion, userData.telefono, userData.direccion,
      userData.turno, nacDate, finalFoto, finalEstado,
      areasJson, finalSubRol, toleranciaPersonalizada, finalFechaInclusion
    ];
    USERS_SHEET.getRange(rowIndex + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
    CACHE.remove('users_data'); CACHE.remove('all_users_for_admin');
    try {
      normalizarDatosHoja();
    } catch (err) {
      Logger.log("Error normalizando en updateUser: " + err.message);
    }
    if (userData.actorUserId) {
      registrarAuditoria(userData.actorUserId, 'MODIFICAR', 'Usuarios',
        `Usuario editado: ${userData.name} (ID: ${userData.userId}) | Sub-Rol: ${finalSubRol} | Áreas: ${areasJson}`, 'OK');
    }
    return { success: true, message: 'Usuario actualizado.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function deleteUser(userId, actorUserId) {
  try {
    // Verificación de seguridad: solo Coordinador General puede eliminar usuarios directamente
    if (actorUserId) {
      const actor = getUserDetailsById(actorUserId);
      if (actor) {
        const actorSubRolNorm = String(actor.subRol || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (actorSubRolNorm === 'coordinador de area') {
          return { success: false, message: 'Los Coordinadores de Área no pueden eliminar usuarios directamente. Utilice el módulo de Solicitudes de Baja.' };
        }
      }
    }
    const range = USERS_SHEET.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(userId));
    if (rowIndex === -1) return { success: false, message: 'Usuario no encontrado.' };
    const deletedName = values[rowIndex][1];
    USERS_SHEET.deleteRow(rowIndex + 1);
    CACHE.remove('users_data');
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'ELIMINAR', 'Usuarios', `Usuario eliminado: ${deletedName} (ID: ${userId})`, 'OK');
    }
    return { success: true, message: 'Usuario eliminado correctamente.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function getLastAttendanceState(userId, forceFresh = false) {
  const cacheKey = `last_state_${userId}`;
  if (!forceFresh) {
    try {
      const cached = CACHE.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      Logger.log("Error leyendo cache last_state: " + e.message);
    }
  }
  try {
    const values = getSheetValues(ATTENDANCE_SHEET);
    for (let i = values.length - 1; i > 0; i--) {
      if (String(values[i][1]) === String(userId)) {
        const state = { type: values[i][5] };
        CACHE.put(cacheKey, JSON.stringify(state), 300); // 5 minutos
        return state;
      }
    }
    return null;
  } catch (e) { return null; }
}

function recordAttendance(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const lastState = getLastAttendanceState(data.userId);
    if (data.type === 'Entrada' && lastState && lastState.type === 'Entrada') {
      return { success: false, message: "Ya tienes una 'Entrada' activa." };
    }
    if (data.type === 'Salida' && (!lastState || lastState.type === 'Salida')) {
      return { success: false, message: "Falta marcar 'Entrada'." };
    }

    const userDetails = getUserDetailsById(data.userId);
    if (!userDetails) {
      return { success: false, message: "Usuario no encontrado." };
    }
    const now = new Date();

    // GPS eliminado en v2.0. Se escriben campos vacíos para preservar la estructura histórica de columnas.
    ATTENDANCE_SHEET.appendRow([
      now, data.userId, data.name, userDetails.turno, userDetails.institucion,
      data.type, "", "", "Correcto", 0
    ]);

    CACHE.put(`last_state_${data.userId}`, JSON.stringify({ type: data.type }), 300);
    CACHE.remove('open_sessions');

    Logger.log(`[Asistencia v2.0] Usuario: ${data.name} (ID: ${data.userId}) | Tipo: ${data.type} | Estado: Correcto`);

    lock.releaseLock();

    // Ya no se verifica FUERA_DE_RANGO (GPS eliminado)
    if (data.type === 'Entrada') {
      checkLlegadaRetardada(data.userId, now.toISOString());
    }

    return { success: true, message: `Asistencia de '${data.type}' registrada.` };
  } catch (e) {
    return { success: false, message: `Error de concurrencia o proceso: ${e.message}` };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}


function adminRecordAttendance(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const lastState = getLastAttendanceState(data.userId);
    if (data.type === 'Entrada' && lastState && lastState.type === 'Entrada') return { success: false, message: `Ya tiene entrada.` };
    if (data.type === 'Salida' && (!lastState || lastState.type === 'Salida')) return { success: false, message: `No tiene entrada previa.` };

    const userDetails = getUserDetailsById(data.userId);
    if (!userDetails) return { success: false, message: `Usuario no encontrado.` };

    ATTENDANCE_SHEET.appendRow([
      new Date(), data.userId, data.name, userDetails.turno, userDetails.institucion,
      data.type, COMPANY_CONFIG.lat, COMPANY_CONFIG.lon, "Registro Manual", 0
    ]);

    CACHE.put(`last_state_${data.userId}`, JSON.stringify({ type: data.type }), 300);
    CACHE.remove('open_sessions');

    lock.releaseLock();

    if (data.actorUserId) {
      registrarAuditoria(
        data.actorUserId,
        'CREAR',
        'Asistencias',
        `Registro manual de ${data.type} para: ${data.name} (ID: ${data.userId})`,
        'OK'
      );
    }

    return { success: true, message: `Asistencia registrada.` };
  } catch (e) {
    return { success: false, message: `Error de concurrencia o proceso: ${e.message}` };
  } finally {
    try {
      lock.releaseLock();
    } catch (e) { }
  }
}

function getAttendanceRecords(userIdOrAdmin, startDateStr = null, endDateStr = null) {
  try {
    const sheet = SS.getSheetByName("Asistencias");
    const data = getSheetValues(sheet);
    const headers = data.shift();

    const timeZone = SS.getSpreadsheetTimeZone();
    const IDX = { TIMESTAMP: 0, USER_ID: 1, NAME: 2, TURNO: 3, INSTITUCION: 4, TYPE: 5, STATUS: 8, DISTANCE: 9 };

    const userIdOrAdminStr = userIdOrAdmin ? String(userIdOrAdmin).toLowerCase() : '';
    const isUser = (userIdOrAdminStr !== 'admin');

    let records = (userIdOrAdminStr === 'admin')
      ? data
      : data.filter(row => String(row[IDX.USER_ID]) === String(userIdOrAdmin));

    if (isUser) {
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      fourWeeksAgo.setHours(0, 0, 0, 0);
      records = records.filter(row => {
        const d = safeGetDate(row[IDX.TIMESTAMP]);
        return d && d >= fourWeeksAgo;
      });
    }

    if (startDateStr && endDateStr) {
      const start = parseDateStringAsLocal(startDateStr);
      const end = parseDateStringAsLocal(endDateStr);
      end.setHours(23, 59, 59, 999);

      records = records.filter(row => {
        const d = safeGetDate(row[IDX.TIMESTAMP]);
        if (!d) return false;
        return d >= start && d <= end;
      });
      if (!isUser && records.length > 350) {
        records = records.slice(-350);
      }
    } else if (!isUser) {
      records = records.slice(-350);
    }

    return records.map(row => {
      const d = safeGetDate(row[IDX.TIMESTAMP]);
      return {
        timestamp: d ? Utilities.formatDate(d, timeZone, "yyyy-MM-dd HH:mm:ss") : "N/A",
        userId: String(row[IDX.USER_ID]),
        name: row[IDX.NAME],
        turno: row[IDX.TURNO] || 'N/D',
        institucion: row[IDX.INSTITUCION] || 'N/D',
        type: row[IDX.TYPE],
        status: row[IDX.STATUS],
        distance: row[IDX.DISTANCE]
      };
    }).reverse();

  } catch (e) {
    Logger.log(e);
    return [];
  }
}

// =======================================================
// ================= GESTIÓN DE GUARDIAS =================
// =======================================================

function getDutyShifts() {
  try {
    if (!DUTY_SHEET) return [];
    const timeZone = SS.getSpreadsheetTimeZone();
    return getSheetValues(DUTY_SHEET).slice(1)
      .filter(row => row[0] && row[1])
      .map(row => {
        const d = safeGetDate(row[0]);
        if (!d) return null;
        return {
          date: Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'),
          turno: row[1],
          descripcion: row[2] || "",
          creadoPor: row[3] || "",
          categoria: row[4] ? String(row[4]).trim() : ""
        };
      }).filter(item => item !== null);
  } catch (e) { return []; }
}

function addDutyShift(dutyData) {
  try {
    if (!dutyData.date || !dutyData.turno || !dutyData.descripcion || !dutyData.categoria) return { success: false, message: 'Faltan datos.' };
    const existingDuties = getDutyShifts();
    if (existingDuties.some(duty => duty.date === dutyData.date)) return { success: false, message: 'Ya existe guardia en esa fecha.' };
    DUTY_SHEET.appendRow([
      parseDateStringAsLocal(dutyData.date),
      dutyData.turno,
      dutyData.descripcion,
      dutyData.creadoPor || 'Administrador',
      dutyData.categoria
    ]);
    if (dutyData.actorUserId) {
      registrarAuditoria(dutyData.actorUserId, 'CREAR', 'Guardias', `Guardia creada para el ${dutyData.date} (${dutyData.turno})`, 'OK');
    }
    return { success: true, message: 'Guardia añadida.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function deleteDutyShift(dutyDateString, actorUserId) {
  try {
    const allDuties = DUTY_SHEET.getDataRange().getValues();
    const timeZone = SS.getSpreadsheetTimeZone();
    const rowIndexToDelete = allDuties.findIndex((row, index) => {
      const d = safeGetDate(row[0]);
      return index > 0 && d && Utilities.formatDate(d, timeZone, 'yyyy-MM-dd') === dutyDateString;
    });
    if (rowIndexToDelete !== -1) {
      const deletedRow = allDuties[rowIndexToDelete];
      DUTY_SHEET.deleteRow(rowIndexToDelete + 1);
      if (actorUserId) {
        registrarAuditoria(actorUserId, 'ELIMINAR', 'Guardias', `Guardia de la fecha ${dutyDateString} (${deletedRow[1]}) eliminada`, 'OK');
      }
      return { success: true, message: 'Guardia eliminada.' };
    } else { return { success: false, message: 'Guardia no encontrada.' }; }
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ============= FUNCIONES AUXILIARES REPORTE ============
// =======================================================

function getAdminDashboardStats(startDate, endDate) {
  try {
    const users = getUsersData();
    const totalUsers = Object.keys(users).filter(key => {
      const u = users[key];
      return u.role && u.role.toLowerCase() !== 'admin' && u.estado === 'Activo';
    }).length;
    const allRecords = getSheetValues(ATTENDANCE_SHEET).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");
    const todayChecks = allRecords.filter(r => {
      const d = safeGetDate(r[0]);
      return d && Utilities.formatDate(d, timeZone, "yyyy-MM-dd") === todayStr;
    }).length;
    let filteredRecords = allRecords;
    if (startDate && endDate) {
      const start = parseDateStringAsLocal(startDate);
      const end = parseDateStringAsLocal(endDate);
      end.setHours(23, 59, 59, 999);
      filteredRecords = allRecords.filter(r => {
        const d = safeGetDate(r[0]);
        return d && d >= start && d <= end;
      });
    }
    const totalChecks = filteredRecords.length;
    const outsideRangeChecks = filteredRecords.filter(r => r[8] === "Fuera de Rango").length;
    return { totalUsers, todayChecks, totalChecks, outsideRangeChecks };
  } catch (e) { return { totalUsers: 0, todayChecks: 0, totalChecks: 0, outsideRangeChecks: 0 }; }
}

function getDetailedHoursReport(userId, startDate, endDate) {
  try {
    if (!startDate || !endDate) return { workedDays: [], absentDates: [] };
    const timeZone = SS.getSpreadsheetTimeZone();

    const userDetails = getUserDetailsById(userId) || {};
    let originalTurno = userDetails.turno || 'N/A';

    const dutyShiftsMap = new Map();
    if (DUTY_SHEET) {
      DUTY_SHEET.getDataRange().getValues().slice(1).forEach(row => {
        const d = safeGetDate(row[0]);
        if (d && row[1]) {
          dutyShiftsMap.set(Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), {
            turno: row[1],
            categoria: row[4] ? String(row[4]).trim() : ""
          });
        }
      });
    }

    const crossMap = new Map();
    const crossSheet = SS.getSheetByName("CrossTurnos");
    if (crossSheet) {
      crossSheet.getDataRange().getValues().slice(1).forEach(row => {
        let date, u1, u2, estado;
        if (row.length > 4) { date = row[1]; u1 = row[2]; u2 = row[3]; estado = row[4]; }
        else { date = row[0]; u1 = row[1]; u2 = row[2]; estado = "Aprobada"; }
        const dObj = safeGetDate(date);
        if (estado === "Aprobada" && dObj) {
          const dateStr = Utilities.formatDate(dObj, timeZone, 'yyyy-MM-dd');
          crossMap.set(`${dateStr}_${u1}`, String(u2));
          crossMap.set(`${dateStr}_${u2}`, String(u1));
        }
      });
    }

    const usersDetailsMap = new Map();
    const usersData = USERS_SHEET.getDataRange().getValues().slice(1);
    usersData.forEach(row => {
      if (row[0] && row[4] && row[4].toLowerCase() !== 'admin') {
        usersDetailsMap.set(String(row[0]), { turno: row[9] || 'N/A' });
      }
    });

    const personalWorkDays = new Set();
    let currentDate = parseDateStringAsLocal(startDate);
    const finalDate = parseDateStringAsLocal(endDate);

    while (currentDate <= finalDate) {
      const dateString = Utilities.formatDate(currentDate, timeZone, 'yyyy-MM-dd');
      const dayOfWeek = currentDate.getDay();
      const dutyShiftForDay = dutyShiftsMap.get(dateString);

      let currentEffectiveTurno = originalTurno;
      const crossKey = `${dateString}_${userId}`;
      if (crossMap.has(crossKey)) {
        const swappedUserId = crossMap.get(crossKey);
        if (usersDetailsMap.has(swappedUserId)) {
          currentEffectiveTurno = usersDetailsMap.get(swappedUserId).turno;
        }
      }

      const userTurnoNorm = normalizeShift(currentEffectiveTurno);
      if (dutyShiftForDay) {
        if (dutyShiftForDay.categoria === 'Feriado') {
          // Feriado: no es día laborable obligatoriamente
        } else {
          const dutyNorm = normalizeShift(dutyShiftForDay.turno);
          if (dutyNorm === 'mixto') {
            if (userTurnoNorm === 'mañana' || userTurnoNorm === 'tarde' || userTurnoNorm === 'mixto') personalWorkDays.add(dateString);
          } else if (userTurnoNorm === dutyNorm) {
            personalWorkDays.add(dateString);
          }
        }
      } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (userTurnoNorm === 'mañana' || userTurnoNorm === 'tarde' || userTurnoNorm === 'mixto') {
          personalWorkDays.add(dateString);
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const allRecords = ATTENDANCE_SHEET.getDataRange().getValues().slice(1);
    const startDateObj = parseDateStringAsLocal(startDate);
    const endDateObj = parseDateStringAsLocal(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    const dailyData = {};
    const workedDaysSet = new Set();

    allRecords.forEach(row => {
      const d = safeGetDate(row[0]);
      if (!d) return;
      if (String(row[1]) !== String(userId)) return;
      if (d < startDateObj || d > endDateObj) return;

      const dateString = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
      const timeString = Utilities.formatDate(d, timeZone, 'HH:mm:ss');
      if (!dailyData[dateString]) dailyData[dateString] = { records: [], totalMillis: 0, entries: [], exits: [] };
      dailyData[dateString].records.push({ timestamp: d, type: row[5], timeString });
      workedDaysSet.add(dateString);
    });

    const detailedReport = [];
    for (const date in dailyData) {
      const day = dailyData[date];
      day.records.sort((a, b) => a.timestamp - b.timestamp);
      let lastEntryTime = null;
      day.records.forEach(record => {
        if (record.type === 'Entrada') {
          day.entries.push(record.timeString);
          if (!lastEntryTime) lastEntryTime = record.timestamp;
        } else if (record.type === 'Salida') {
          day.exits.push(record.timeString);
          if (lastEntryTime) {
            day.totalMillis += record.timestamp.getTime() - lastEntryTime.getTime();
            lastEntryTime = null;
          }
        }
      });
      detailedReport.push({ date: date, totalHours: parseFloat((day.totalMillis / (1000 * 60 * 60)).toFixed(2)), entries: day.entries.join(', '), exits: day.exits.join(', ') });
    }

    const absentDates = [...personalWorkDays].filter(day => !workedDaysSet.has(day)).sort();
    return { workedDays: detailedReport.sort((a, b) => new Date(b.date) - new Date(a.date)), absentDates: absentDates };
  } catch (error) {
    Logger.log(`Error en getDetailedHoursReport: ${error}`);
    return { workedDays: [], absentDates: [] };
  }
}

function calculateHoursWorkedReport(startDate, endDate) {
  try {
    if (!startDate || !endDate) return [];
    const timeZone = SS.getSpreadsheetTimeZone();
    const configHorarios = getConfigHorariosMap_();

    function getTimeInMinutes(val) {
      if (val instanceof Date) {
        const formatted = Utilities.formatDate(val, timeZone, "HH:mm");
        const parts = formatted.split(":");
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      }
      const str = String(val || "").trim();
      const match = str.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
      if (str.includes(" ")) {
        try {
          const d = new Date(str);
          if (!isNaN(d.getTime())) {
            const formatted = Utilities.formatDate(d, timeZone, "HH:mm");
            const parts = formatted.split(":");
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
          }
        } catch (e) { }
      }
      return 0;
    }

    function getShiftDurationHours(turno) {
      const userShift = normalizeShift(turno);
      let startVal, endVal;
      if (userShift === "mañana") {
        startVal = configHorarios["HORA_ENTRADA_MANANA"] || "08:00";
        endVal = configHorarios["HORA_SALIDA_MANANA"] || "14:00";
      } else if (userShift === "tarde") {
        startVal = configHorarios["HORA_ENTRADA_TARDE"] || "14:00";
        endVal = configHorarios["HORA_SALIDA_TARDE"] || "19:00";
      } else if (userShift === "mixto") {
        startVal = configHorarios["HORA_ENTRADA_MIXTO"] || "08:00";
        endVal = configHorarios["HORA_SALIDA_MIXTO"] || "19:00";
      } else {
        return 0;
      }
      const startMin = getTimeInMinutes(startVal);
      const endMin = getTimeInMinutes(endVal);
      return Math.max(0, endMin - startMin) / 60;
    }

    function calculateCompensationMillis(entryTime, exitTime, userTurno) {
      const userShift = normalizeShift(userTurno);
      let compStartVal, compEndVal;

      if (userShift === "mañana") {
        compStartVal = configHorarios["HORA_ENTRADA_TARDE"] || "14:00";
        compEndVal = configHorarios["HORA_SALIDA_TARDE"] || "19:00";
      } else if (userShift === "tarde") {
        compStartVal = configHorarios["HORA_ENTRADA_MANANA"] || "08:00";
        compEndVal = configHorarios["HORA_SALIDA_MANANA"] || "14:00";
      } else {
        return 0;
      }

      const compStartMin = getTimeInMinutes(compStartVal);
      const compEndMin = getTimeInMinutes(compEndVal);

      const entryStr = Utilities.formatDate(entryTime, timeZone, "HH:mm");
      const [entryH, entryM] = entryStr.split(":").map(Number);
      const entryMin = entryH * 60 + entryM;

      const exitStr = Utilities.formatDate(exitTime, timeZone, "HH:mm");
      const [exitH, exitM] = exitStr.split(":").map(Number);
      const exitMin = exitH * 60 + exitM;

      const overlapMin = Math.max(entryMin, compStartMin);
      const overlapMax = Math.min(exitMin, compEndMin);

      if (overlapMax > overlapMin) {
        return (overlapMax - overlapMin) * 60 * 1000;
      }
      return 0;
    }

    const usersDetailsMap = new Map();
    const usersData = getSheetValues(USERS_SHEET).slice(1);
    usersData.forEach(row => {
      if (row[0] && row[4] && row[4].toLowerCase() !== 'admin') {
        const estado = row[12] || 'Activo';
        if (estado === 'Activo') {
          let fInc = 'N/A';
          try {
            const dVal = row[16]; // Columna Q (índice 16)
            if (dVal instanceof Date) {
              fInc = Utilities.formatDate(dVal, timeZone, 'yyyy-MM-dd');
            } else if (dVal && String(dVal).trim() !== '') {
              fInc = Utilities.formatDate(safeGetDate(dVal), timeZone, 'yyyy-MM-dd');
            }
          } catch (e) { }

          usersDetailsMap.set(String(row[0]), {
            name: row[1],
            institucion: row[6] || 'N/A',
            turno: row[9] || 'N/A',
            fechaInclusion: fInc
          });
        }
      }
    });

    const dutyShiftsMap = new Map();
    if (DUTY_SHEET) {
      getSheetValues(DUTY_SHEET).slice(1).forEach(row => {
        const d = safeGetDate(row[0]);
        if (d && row[1]) {
          dutyShiftsMap.set(Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), {
            turno: row[1],
            categoria: row[4] ? String(row[4]).trim() : ""
          });
        }
      });
    }

    const crossMap = new Map();
    const crossSheet = SS.getSheetByName("CrossTurnos");
    if (crossSheet) {
      getSheetValues(crossSheet).slice(1).forEach(row => {
        let date, u1, u2, estado;
        if (row.length > 4) { date = row[1]; u1 = row[2]; u2 = row[3]; estado = row[4]; }
        else { date = row[0]; u1 = row[1]; u2 = row[2]; estado = "Aprobada"; }
        const dObj = safeGetDate(date);
        if (estado === "Aprobada" && dObj) {
          const dateStr = Utilities.formatDate(dObj, timeZone, 'yyyy-MM-dd');
          crossMap.set(`${dateStr}_${u1}`, String(u2));
          crossMap.set(`${dateStr}_${u2}`, String(u1));
        }
      });
    }

    const userWorkDays = new Map();
    const userExpectedHoursMap = new Map();
    usersDetailsMap.forEach((details, userId) => {
      userWorkDays.set(userId, new Set());
      userExpectedHoursMap.set(userId, 0);
    });

    let currentDate = parseDateStringAsLocal(startDate);
    const finalDate = parseDateStringAsLocal(endDate);

    while (currentDate <= finalDate) {
      const dayOfWeek = currentDate.getDay();
      const dateString = Utilities.formatDate(currentDate, timeZone, 'yyyy-MM-dd');
      const dutyShiftForDay = dutyShiftsMap.get(dateString);

      usersDetailsMap.forEach((details, userId) => {
        // Ignorar días antes de la fecha de inclusión del operador
        if (details.fechaInclusion && details.fechaInclusion !== 'N/A') {
          const incDate = parseDateStringAsLocal(details.fechaInclusion);
          if (currentDate < incDate) return;
        }

        let currentEffectiveTurno = details.turno;

        const crossKey = `${dateString}_${userId}`;
        if (crossMap.has(crossKey)) {
          const swappedUserId = crossMap.get(crossKey);
          if (usersDetailsMap.has(swappedUserId)) {
            currentEffectiveTurno = usersDetailsMap.get(swappedUserId).turno;
          }
        }

        const userShift = normalizeShift(currentEffectiveTurno);
        let shouldWork = false;
        if (dutyShiftForDay) {
          if (dutyShiftForDay.categoria === 'Feriado') {
            return; // Los feriados no son obligatorios
          }
          const dutyNorm = normalizeShift(dutyShiftForDay.turno);
          if (dutyNorm === 'mixto') {
            if (userShift === 'mañana' || userShift === 'tarde' || userShift === 'mixto') {
              shouldWork = true;
            }
          } else if (userShift === dutyNorm) {
            shouldWork = true;
          }
        } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          if (userShift === 'mañana' || userShift === 'tarde' || userShift === 'mixto') {
            shouldWork = true;
          }
        }

        if (shouldWork) {
          userWorkDays.get(userId).add(dateString);
          const duration = getShiftDurationHours(currentEffectiveTurno);
          userExpectedHoursMap.set(userId, userExpectedHoursMap.get(userId) + duration);
        }
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const allRecords = getSheetValues(ATTENDANCE_SHEET).slice(1);
    const userWorkData = {};
    const startDateObj = parseDateStringAsLocal(startDate);
    const endDateObj = parseDateStringAsLocal(endDate);
    endDateObj.setHours(23, 59, 59, 999);

    allRecords.forEach(row => {
      const d = safeGetDate(row[0]);
      if (!d) return;
      if (d < startDateObj || d > endDateObj) return;
      const userId = String(row[1]);
      if (!usersDetailsMap.has(userId)) return;

      if (!userWorkData[userId]) {
        userWorkData[userId] = { totalMillis: 0, compensationMillis: 0, daysWorked: new Set() };
      }

      if (row[5] === 'Entrada') {
        userWorkData[userId].lastEntry = d;
      } else if (row[5] === 'Salida' && userWorkData[userId].lastEntry) {
        const entryTime = userWorkData[userId].lastEntry;
        const exitTime = d;
        const durationMillis = exitTime.getTime() - entryTime.getTime();

        userWorkData[userId].totalMillis += durationMillis;
        userWorkData[userId].daysWorked.add(Utilities.formatDate(entryTime, timeZone, 'yyyy-MM-dd'));

        const details = usersDetailsMap.get(userId);
        const compMillis = calculateCompensationMillis(entryTime, exitTime, details.turno);
        userWorkData[userId].compensationMillis += compMillis;

        delete userWorkData[userId].lastEntry;
      }
    });

    const report = [];
    usersDetailsMap.forEach((details, userId) => {
      const workedDaysSet = userWorkData[userId] ? userWorkData[userId].daysWorked : new Set();
      const totalMillis = userWorkData[userId] ? userWorkData[userId].totalMillis : 0;
      const compensationMillis = userWorkData[userId] ? userWorkData[userId].compensationMillis : 0;

      const personalWorkDays = userWorkDays.get(userId);
      const absentDays = new Set([...personalWorkDays].filter(day => !workedDaysSet.has(day)));

      const expectedHours = userExpectedHoursMap.get(userId) || 0;
      const workedHours = totalMillis / (1000 * 60 * 60);
      const workedMinutes = totalMillis / (1000 * 60);
      const owedHours = Math.max(0, expectedHours - workedHours);
      const owedMinutes = Math.max(0, (expectedHours * 60) - workedMinutes);

      const horasCompensadas = compensationMillis / (1000 * 60 * 60);
      const minutosCompensadas = compensationMillis / (1000 * 60);

      report.push({
        userId: userId,
        name: details.name,
        institucion: details.institucion,
        turno: details.turno,
        daysWorked: workedDaysSet.size,
        totalHours: parseFloat(workedHours.toFixed(2)),
        horasTrabajadas: parseFloat(workedHours.toFixed(2)),
        horasAdeudantes: parseFloat(owedHours.toFixed(2)),
        minutosTrabajados: Math.round(workedMinutes),
        minutosAdeudantes: Math.round(owedMinutes),
        horasCompensadas: parseFloat(horasCompensadas.toFixed(2)),
        minutosCompensadas: Math.round(minutosCompensadas),
        absentDaysCount: absentDays.size,
        absentDates: [...absentDays].sort()
      });
    });
    return report;
  } catch (error) {
    Logger.log(`Error en calculateHoursWorkedReport: ${error}`);
    return [];
  }
}

// =======================================================
// =============== CROSS DE TURNO ========================
// =======================================================

function registerCrossTurno(dateStr, user1Id, user2Id, actorUserId) {
  try {
    const u1 = getUserDetailsById(user1Id);
    const u2 = getUserDetailsById(user2Id);
    if (!u1 || !u2) return { success: false, message: "Usuarios no encontrados." };
    if (u1.turno === u2.turno) {
      return { success: false, message: `Error: El Cross de turno debe ser estrictamente entre operadores de turnos diferentes. Ambos son de ${u1.turno}.` };
    }
    let sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) {
      sheet = SS.insertSheet("CrossTurnos");
      sheet.appendRow(["CrossID", "Fecha", "Usuario 1 ID", "Usuario 2 ID", "Estado", "Solicitante", "Fecha Registro"]);
    }
    const crossId = "CR-" + new Date().getTime();
    sheet.appendRow([crossId, parseDateStringAsLocal(dateStr), user1Id, user2Id, "Aprobada", "Administrador", new Date()]);
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'CREAR', 'CrossTurno', `Cross de turno creado entre ${u1.name} y ${u2.name} para el ${dateStr}`, 'OK');
    }
    return { success: true, message: "Cross de turno registrado y aprobado." };
  } catch (e) { return { success: false, message: "Error: " + e.message }; }
}

function requestCrossTurnoUser(data) {
  try {
    const { userId, partnerId, dateStr } = data;
    const u1 = getUserDetailsById(userId);
    const u2 = getUserDetailsById(partnerId);
    if (!u1 || !u2) return { success: false, message: "Usuarios no encontrados." };
    if (u1.turno === u2.turno) {
      return { success: false, message: `Error: El Cross de turno debe ser estrictamente entre operadores de turnos diferentes. Ambos son de ${u1.turno}.` };
    }
    let sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) {
      sheet = SS.insertSheet("CrossTurnos");
      sheet.appendRow(["CrossID", "Fecha", "Usuario 1 ID", "Usuario 2 ID", "Estado", "Solicitante", "Fecha Registro"]);
    }
    const crossId = "CR-" + new Date().getTime();
    sheet.appendRow([crossId, parseDateStringAsLocal(dateStr), userId, partnerId, "Pendiente de Admin", u1.name, new Date()]);
    registrarAuditoria(userId, 'CREAR', 'CrossTurno', `Usuario solicitó Cross con ${u2.name} para el ${dateStr}`, 'OK');
    return { success: true, message: "Solicitud enviada para aprobación del Administrador." };
  } catch (e) { return { success: false, message: "Error: " + e.message }; }
}

function getCrossTurnosList() {
  try {
    const sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) return [];
    const data = getSheetValues(sheet);
    if (data.length <= 1) return [];

    const usersMap = {};
    const usersData = getSheetValues(USERS_SHEET).slice(1);
    usersData.forEach(row => { if (row[0]) usersMap[String(row[0])] = { name: row[1], turno: row[9] }; });

    const timeZone = SS.getSpreadsheetTimeZone();
    const crosses = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      let crossId, date, u1, u2, estado, requester;
      if (row.length > 4) {
        crossId = row[0]; date = row[1]; u1 = row[2]; u2 = row[3]; estado = row[4]; requester = row[5] || 'Usuario';
      } else {
        crossId = `old|${new Date(row[0]).getTime()}|${row[1]}|${row[2]}`; date = row[0]; u1 = row[1]; u2 = row[2]; estado = 'Aprobada'; requester = 'Administrador';
      }
      const u1Details = usersMap[String(u1)] || { name: 'Usuario 1', turno: 'N/A' };
      const u2Details = usersMap[String(u2)] || { name: 'Usuario 2', turno: 'N/A' };
      const dObj = safeGetDate(date);

      crosses.push({
        crossId: crossId,
        date: dObj ? Utilities.formatDate(dObj, timeZone, 'yyyy-MM-dd') : 'N/A',
        u1Name: u1Details.name, u1Turno: u1Details.turno,
        u2Name: u2Details.name, u2Turno: u2Details.turno,
        estado: estado, requester: requester
      });
    }
    return crosses.reverse();
  } catch (e) { return []; }
}

function updateCrossStatus(crossId, newStatus, actorUserId) {
  try {
    const sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) return { success: false, message: "Hoja de Cross no existe." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(crossId)) {
        sheet.getRange(i + 1, 5).setValue(newStatus);
        if (actorUserId) {
          registrarAuditoria(actorUserId, newStatus === 'Aprobada' ? 'APROBAR' : 'RECHAZAR', 'CrossTurno', `Cross de turno ID ${crossId} marcado como ${newStatus}`, 'OK');
        }
        return { success: true, message: `Cross de turno ${newStatus.toLowerCase()}.` };
      }
    }
    return { success: false, message: "Registro no encontrado." };
  } catch (e) { return { success: false, message: e.message }; }
}

function deleteCrossTurno(crossId, actorUserId) {
  try {
    const sheet = SS.getSheetByName("CrossTurnos");
    if (!sheet) return { success: false, message: "No existe la hoja de Cross." };
    const data = sheet.getDataRange().getValues();
    const timeZone = SS.getSpreadsheetTimeZone();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(crossId)) {
        sheet.deleteRow(i + 1);
        if (actorUserId) {
          registrarAuditoria(actorUserId, 'ELIMINAR', 'CrossTurno', `Cross de turno ID ${crossId} eliminado`, 'OK');
        }
        return { success: true, message: "Cross de turno eliminado correctamente." };
      }
      if (String(crossId).startsWith('old|')) {
        const parts = crossId.split('|');
        const targetDateStr = Utilities.formatDate(new Date(parseInt(parts[1])), timeZone, 'yyyy-MM-dd');
        const d = safeGetDate(data[i][0]);
        if (!d) continue;
        const rowDateStr = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
        if (rowDateStr === targetDateStr && String(data[i][1]) === parts[2] && String(data[i][2]) === parts[3]) {
          sheet.deleteRow(i + 1);
          if (actorUserId) {
            registrarAuditoria(actorUserId, 'ELIMINAR', 'CrossTurno', `Cross de turno ID ${crossId} eliminado`, 'OK');
          }
          return { success: true, message: "Cross de turno eliminado correctamente." };
        }
      }
    }
    return { success: false, message: "No se encontró el registro del Cross." };
  } catch (e) { return { success: false, message: "Error: " + e.message }; }
}

// =======================================================
// ============= AUDITORÍA CENTRALIZADA ==================
// =======================================================

function registrarAuditoria(actorUserId, accion, modulo, detalle, resultado) {
  try {
    const actor = getUserDetailsById(actorUserId);
    if (!actor) return;
    const auditSheet = getAuditSheet_();
    const areasStr = actor.areas && actor.areas.length > 0 ? actor.areas.join(', ') : 'Global';
    auditSheet.appendRow([
      new Date(), actorUserId, actor.name,
      actor.subRol || actor.role,
      accion, modulo, detalle, resultado, areasStr
    ]);
  } catch (e) {
    Logger.log('Error en registrarAuditoria: ' + e.message);
  }
}

function getAuditLog(filters) {
  try {
    const auditSheet = getAuditSheet_();
    const data = getSheetValues(auditSheet).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();
    let rows = data;

    if (filters) {
      if (filters.startDate) {
        const start = parseDateStringAsLocal(filters.startDate);
        rows = rows.filter(function (r) { const d = safeGetDate(r[0]); return d && d >= start; });
      }
      if (filters.endDate) {
        const end = parseDateStringAsLocal(filters.endDate);
        end.setHours(23, 59, 59, 999);
        rows = rows.filter(function (r) { const d = safeGetDate(r[0]); return d && d <= end; });
      }
      if (filters.modulo) rows = rows.filter(function (r) { return r[5] === filters.modulo; });
      if (filters.accion) rows = rows.filter(function (r) { return r[4] === filters.accion; });
      if (filters.areaId) rows = rows.filter(function (r) { return String(r[8]).indexOf(filters.areaId) !== -1; });
      if (filters.userId) rows = rows.filter(function (r) { return String(r[1]) === String(filters.userId); });
    }

    return rows.map(function (r) {
      const d = safeGetDate(r[0]);
      return {
        timestamp: d ? Utilities.formatDate(d, timeZone, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        usuarioId: r[1], nombreUsuario: r[2], subRol: r[3],
        accion: r[4], modulo: r[5], detalle: r[6],
        resultado: r[7], areasActor: r[8]
      };
    }).reverse();
  } catch (e) { return []; }
}

// =======================================================
// ============= CRUD ÁREAS DE TRABAJO ===================
// =======================================================

function getAreasConfig() {
  try {
    const sheet = getAreasSheet_();
    return getSheetValues(sheet).slice(1)
      .filter(function (r) { return r[0] && r[4] === 'Activa'; })
      .map(function (r) {
        return { areaId: r[0], nombreArea: r[1], creadoPor: r[3] };
      });
  } catch (e) { return []; }
}

function addArea(areaData) {
  try {
    if (!areaData.nombreArea || !areaData.actorUserId) return { success: false, message: 'Faltan datos.' };
    const sheet = getAreasSheet_();
    const existing = sheet.getDataRange().getValues().slice(1);
    const exists = existing.some(function (r) {
      return String(r[1]).toLowerCase() === String(areaData.nombreArea).toLowerCase() && r[4] === 'Activa';
    });
    if (exists) return { success: false, message: 'Ya existe un área con ese nombre.' };
    const newId = 'AREA-' + new Date().getTime();
    sheet.appendRow([newId, areaData.nombreArea, new Date(), areaData.actorUserId, 'Activa']);
    registrarAuditoria(areaData.actorUserId, 'CREAR', 'Areas', `Área creada: ${areaData.nombreArea} (ID: ${newId})`, 'OK');
    return { success: true, message: 'Área creada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function updateAreaName(areaId, newName, actorUserId) {
  try {
    if (!areaId || !newName) return { success: false, message: 'Faltan datos.' };
    const sheet = getAreasSheet_();
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(function (r, i) { return i > 0 && r[0] === areaId; });
    if (rowIndex === -1) return { success: false, message: 'Área no encontrada.' };
    const oldName = data[rowIndex][1];
    sheet.getRange(rowIndex + 1, 2).setValue(newName);
    registrarAuditoria(actorUserId, 'MODIFICAR', 'Areas', `Área renombrada: "${oldName}" → "${newName}" (ID: ${areaId})`, 'OK');
    return { success: true, message: 'Área actualizada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function deleteArea(areaId, actorUserId) {
  try {
    const sheet = getAreasSheet_();
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(function (r, i) { return i > 0 && r[0] === areaId; });
    if (rowIndex === -1) return { success: false, message: 'Área no encontrada.' };
    const areaName = data[rowIndex][1];
    sheet.getRange(rowIndex + 1, 5).setValue('Inactiva'); // Soft delete
    registrarAuditoria(actorUserId, 'ELIMINAR', 'Areas', `Área desactivada: ${areaName} (ID: ${areaId})`, 'OK');
    return { success: true, message: 'Área desactivada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function garantizarReglasPermisos_(sheet) {
  const values = sheet.getDataRange().getValues();
  const existingKeys = new Set(values.slice(1).map(r => `${String(r[1]).trim().toLowerCase()}|${String(r[2]).trim().toLowerCase()}|${String(r[3]).trim().toLowerCase()}`));

  const defaultRules = [
    // Operador/a
    ["Operador/a", "UserDashboard", "asistencia", true, "Ver y escanear asistencia (Operador)"],
    ["Operador/a", "UserDashboard", "permisos", false, "Solicitar permisos (Operador)"],
    ["Operador/a", "UserDashboard", "suplencias", false, "Solicitar suplencias (Operador)"],
    ["Operador/a", "UserDashboard", "crossturno", false, "Solicitar cross de turno (Operador)"],
    ["Operador/a", "UserDashboard", "user-warnings", true, "Ver sus amonestaciones (Operador)"],
    ["Operador/a", "UserDashboard", "horarios", false, "Cargar horarios de clase (Operador)"],

    // Analista
    ["Analista", "UserDashboard", "asistencia", true, "Ver y escanear asistencia (Analista)"],
    ["Analista", "UserDashboard", "permisos", true, "Solicitar permisos (Analista)"],
    ["Analista", "UserDashboard", "suplencias", true, "Solicitar suplencias (Analista)"],
    ["Analista", "UserDashboard", "crossturno", true, "Solicitar cross de turno (Analista)"],
    ["Analista", "UserDashboard", "user-warnings", true, "Ver sus amonestaciones (Analista)"],
    ["Analista", "UserDashboard", "horarios", true, "Cargar horarios de clase (Analista)"],

    // Informático/a
    ["Informático/a", "UserDashboard", "asistencia", true, "Ver y escanear asistencia (Informático/a)"],
    ["Informático/a", "UserDashboard", "permisos", true, "Solicitar permisos (Informático/a)"],
    ["Informático/a", "UserDashboard", "suplencias", true, "Solicitar suplencias (Informático/a)"],
    ["Informático/a", "UserDashboard", "crossturno", true, "Solicitar cross de turno (Informático/a)"],
    ["Informático/a", "UserDashboard", "user-warnings", true, "Ver sus amonestaciones (Informático/a)"],
    ["Informático/a", "UserDashboard", "horarios", true, "Cargar horarios de clase (Informático/a)"],

    // Coordinador de Área
    ["Coordinador de Área", "CoordDashboard", "dashboard", true, "Acceso a Dashboard de área"],
    ["Coordinador de Área", "CoordDashboard", "users", true, "Gestión de personal de área"],
    ["Coordinador de Área", "CoordDashboard", "permissions", true, "Ver/gestionar permisos de área"],
    ["Coordinador de Área", "CoordDashboard", "duties", true, "Ver/gestionar guardias de área"],
    ["Coordinador de Área", "CoordDashboard", "hours-report", true, "Reporte de horas de área"],
    ["Coordinador de Área", "CoordDashboard", "suplencias", true, "Ver/gestionar suplencias de área"],
    ["Coordinador de Área", "CoordDashboard", "warnings", true, "Ver/gestionar amonestaciones de área"],
    ["Coordinador de Área", "CoordDashboard", "schedules", true, "Validación de horarios de área"],
    ["Coordinador de Área", "CoordDashboard", "reports", true, "Reportes e informes de área"],
    ["Coordinador de Área", "CoordDashboard", "manual-requests", true, "Solicitudes de registro de área"],

    // Coordinador General
    ["Coordinador General", "AdminDashboard", "dashboard", true, "Acceso a Dashboard general"],
    ["Coordinador General", "AdminDashboard", "users", true, "Gestión de usuarios general"],
    ["Coordinador General", "AdminDashboard", "permissions", true, "Gestión de permisos general"],
    ["Coordinador General", "AdminDashboard", "duties", true, "Gestión de guardias general"],
    ["Coordinador General", "AdminDashboard", "hours-report", true, "Reporte de horas general"],
    ["Coordinador General", "AdminDashboard", "suplencias", true, "Gestión de suplencias general"],
    ["Coordinador General", "AdminDashboard", "areas", true, "Configurar áreas de trabajo"],
    ["Coordinador General", "AdminDashboard", "warnings", true, "Gestión de amonestaciones general"],
    ["Coordinador General", "AdminDashboard", "audit", false, "Acceso a bitácora de auditoría"],
    ["Coordinador General", "AdminDashboard", "delete-requests", true, "Aprobar solicitudes de baja"],
    ["Coordinador General", "AdminDashboard", "access-rules", false, "Configurar permisos de acceso"],
    ["Coordinador General", "AdminDashboard", "admin-schedules", true, "Validación de horarios general"],
    ["Coordinador General", "AdminDashboard", "reports", false, "Reportes e informes general"],
    ["Coordinador General", "AdminDashboard", "manual-requests", true, "Solicitudes de registro general"]
  ];

  let added = false;
  let counter = new Date().getTime();
  defaultRules.forEach(r => {
    const key = `${r[0].toLowerCase()}|${r[1].toLowerCase()}|${r[2].toLowerCase()}`;
    if (!existingKeys.has(key)) {
      sheet.appendRow([
        "RULE-" + (counter++),
        r[0], // SubRol
        r[1], // Modulo
        r[2], // Accion
        r[3], // Permitido
        "Sistema", // CreadoPor
        new Date(), // FechaCreacion
        r[4] // Descripcion
      ]);
      added = true;
    }
  });

  if (added) {
    _requestCache.clear(sheet.getName());
  }
}

function getPermisosRoles() {
  try {
    const sheet = getPermisosRolesSheet_();
    garantizarReglasPermisos_(sheet);
    return getSheetValues(sheet).slice(1)
      .filter(function (r) { return r[0]; })
      .map(function (r) {
        return {
          reglaId: r[0], subRol: r[1], modulo: r[2], accion: r[3],
          permitido: r[4] === true || r[4] === 'TRUE', creadoPor: r[5],
          fechaCreacion: r[6] ? String(r[6]).split(' ')[0] : '',
          descripcion: r[7] || ''
        };
      });
  } catch (e) { return []; }
}

function setPermisoRol(data) {
  try {
    if (!data.subRol || !data.modulo || !data.accion || !data.actorUserId) {
      return { success: false, message: 'Faltan datos.' };
    }
    const sheet = getPermisosRolesSheet_();
    const rows = sheet.getDataRange().getValues();
    const rowIndex = rows.findIndex(function (r, i) {
      return i > 0 && r[1] === data.subRol && r[2] === data.modulo && r[3] === data.accion;
    });
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex + 1, 5).setValue(data.permitido);
    } else {
      const newId = 'RULE-' + new Date().getTime();
      sheet.appendRow([newId, data.subRol, data.modulo, data.accion, data.permitido,
        data.actorUserId, new Date(), data.descripcion || '']);
    }
    registrarAuditoria(data.actorUserId, 'MODIFICAR', 'PermisosRoles',
      `Regla: ${data.subRol} | ${data.modulo}.${data.accion} → ${data.permitido ? 'PERMITIDO' : 'DENEGADO'}`, 'OK');
    return { success: true, message: 'Regla de acceso actualizada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ======= SOLICITUDES DE BAJA (Coordinadores) ===========
// =======================================================

function createDeleteRequest(data) {
  try {
    if (!data.coordinadorId || !data.usuarioTargetId || !data.motivo) {
      return { success: false, message: 'Faltan datos obligatorios.' };
    }
    const coordinador = getUserDetailsById(data.coordinadorId);
    const target = getUserDetailsById(data.usuarioTargetId);
    if (!coordinador || !target) return { success: false, message: 'Usuario no encontrado.' };

    // Verificar que el coordinador tiene en su área al usuario target
    const sharedArea = (target.areas || []).some(function (a) {
      return (coordinador.areas || []).indexOf(a) !== -1;
    });
    if (!sharedArea) return { success: false, message: 'El usuario no pertenece a tu área.' };

    const sheet = getDeleteRequestsSheet_();
    const solicitudId = 'BAJA-' + new Date().getTime();
    sheet.appendRow([
      solicitudId, data.coordinadorId, coordinador.name,
      data.usuarioTargetId, target.name,
      data.motivo, 'Pendiente', new Date(), '', '', ''
    ]);
    registrarAuditoria(data.coordinadorId, 'CREAR', 'SolicitudesBaja',
      `Solicitud de baja para: ${target.name} (ID: ${data.usuarioTargetId}) | Motivo: ${data.motivo}`, 'OK');
    return { success: true, message: 'Solicitud de baja enviada al Administrador.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function getDeleteRequests() {
  try {
    const sheet = getDeleteRequestsSheet_();
    const timeZone = SS.getSpreadsheetTimeZone();
    return getSheetValues(sheet).slice(1)
      .filter(function (r) { return r[0]; })
      .map(function (r) {
        const d = safeGetDate(r[7]);
        return {
          solicitudId: r[0], coordinadorId: r[1], coordinadorNombre: r[2],
          usuarioTargetId: r[3], usuarioTargetNombre: r[4], motivo: r[5],
          estado: r[6], fechaSolicitud: d ? Utilities.formatDate(d, timeZone, 'yyyy-MM-dd HH:mm') : 'N/A',
          adminResolutor: r[8] || '', notaAdmin: r[10] || ''
        };
      }).reverse();
  } catch (e) { return []; }
}

function resolveDeleteRequest(solicitudId, decision, adminId, notaAdmin) {
  try {
    const sheet = getDeleteRequestsSheet_();
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(function (r, i) { return i > 0 && String(r[0]) === String(solicitudId); });
    if (rowIndex === -1) return { success: false, message: 'Solicitud no encontrada.' };

    const reqRow = data[rowIndex];
    const targetId = reqRow[3];
    const targetName = reqRow[4];
    const adminDetails = getUserDetailsById(adminId);
    const adminName = adminDetails ? adminDetails.name : 'Admin';

    if (decision === 'Aprobada') {
      // Eliminar físicamente el usuario
      const delResult = deleteUser(targetId);
      if (!delResult.success) return { success: false, message: 'No se pudo eliminar el usuario: ' + delResult.message };
    }

    sheet.getRange(rowIndex + 1, 7).setValue(decision);
    sheet.getRange(rowIndex + 1, 9).setValue(adminName);
    sheet.getRange(rowIndex + 1, 10).setValue(new Date());
    sheet.getRange(rowIndex + 1, 11).setValue(notaAdmin || '');

    registrarAuditoria(adminId, decision === 'Aprobada' ? 'ELIMINAR' : 'RECHAZAR', 'SolicitudesBaja',
      `Solicitud ${solicitudId} | Usuario: ${targetName} | Decisión: ${decision} | Nota: ${notaAdmin || 'N/A'}`, 'OK');

    return { success: true, message: `Solicitud ${decision.toLowerCase()}. ${decision === 'Aprobada' ? 'Usuario eliminado.' : ''}` };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ========= COORDINATOR FILTERED DATA BACKEND HELPERS ===
// =======================================================

function getAttendanceRecordsForCoordinator(areaIds, startDateStr, endDateStr) {
  try {
    const allRecords = getAttendanceRecords('admin', startDateStr, endDateStr);
    const users = getAllUsersForCoordinator(areaIds);
    const userIds = new Set(users.map(u => String(u.userId)));
    return allRecords.filter(r => userIds.has(String(r.userId)));
  } catch (e) { return []; }
}

function getPermissionRequestsForCoordinator(areaIds) {
  try {
    const allPerms = getPermissionRequests(false, null);
    const users = getAllUsersForCoordinator(areaIds);
    const userIds = new Set(users.map(u => String(u.userId)));
    return allPerms.filter(p => userIds.has(String(p.userId)));
  } catch (e) { return []; }
}

function calculateHoursWorkedReportForCoordinator(areaIds, startDate, endDate) {
  try {
    const allReports = calculateHoursWorkedReport(startDate, endDate);
    const users = getAllUsersForCoordinator(areaIds);
    const userIds = new Set(users.map(u => String(u.userId)));
    return allReports.filter(r => userIds.has(String(r.userId)));
  } catch (e) { return []; }
}

function getSubstitutionsForCoordinator(areaIds) {
  try {
    const allSubs = getSubstitutions();
    const users = getAllUsersForCoordinator(areaIds);
    const userIds = new Set(users.map(u => String(u.userId)));
    return allSubs.filter(s => userIds.has(String(s.titularId)) || userIds.has(String(s.suplenteId)));
  } catch (e) { return []; }
}

function getCoordDashboardStats(areaIds) {
  try {
    const users = getAllUsersForCoordinator(areaIds);
    const totalUsers = users.length;

    const timeZone = SS.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");
    const allRecords = getSheetValues(ATTENDANCE_SHEET).slice(1);
    const userIds = new Set(users.map(u => String(u.userId)));

    const todayChecks = allRecords.filter(r => {
      const d = safeGetDate(r[0]);
      return d && Utilities.formatDate(d, timeZone, "yyyy-MM-dd") === todayStr && userIds.has(String(r[1]));
    }).length;

    const allPerms = getPermissionRequests(false, null);
    const pendingPerms = allPerms.filter(p => p.estado === 'Pendiente' && userIds.has(String(p.userId))).length;

    const allSubs = getSubstitutions();
    const pendingSubs = allSubs.filter(s => (s.estado === 'Pendiente de Admin' || s.estado === 'Pendiente') && (userIds.has(String(s.titularId)) || userIds.has(String(s.suplenteId)))).length;

    return { totalUsers, todayChecks, pendingPerms, pendingSubs };
  } catch (e) {
    return { totalUsers: 0, todayChecks: 0, pendingPerms: 0, pendingSubs: 0 };
  }
}

// =======================================================
// ======= CONFIG HORARIOS =================================
// =======================================================

function getConfigHorarios() {
  try {
    const sheet = getConfigHorariosSheet_();
    garantizarValoresConfig_(sheet);
    const values = getSheetValues(sheet).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();
    return values.filter(r => r[0]).map(r => {
      let valStr = '';
      if (r[1] instanceof Date) {
        valStr = Utilities.formatDate(r[1], timeZone, 'HH:mm');
      } else {
        valStr = String(r[1]);
      }
      return {
        clave: String(r[0]),
        valor: valStr,
        descripcion: String(r[2] || '')
      };
    });
  } catch (e) { return []; }
}

function saveConfigHorarios(configArray, actorUserId) {
  try {
    const sheet = getConfigHorariosSheet_();
    const values = sheet.getDataRange().getValues();
    configArray.forEach(item => {
      const rowIndex = values.findIndex(r => String(r[0]) === String(item.clave));
      if (rowIndex > 0) {
        sheet.getRange(rowIndex + 1, 2, 1, 2).setValues([[item.valor, new Date()]]);
      }
    });
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'MODIFICAR', 'ConfigHorarios',
        `Configuración de horarios actualizada: ${configArray.map(c => c.clave + '=' + c.valor).join(', ')}`, 'OK');
    }
    return { success: true, message: 'Configuración de horarios guardada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ======= TIPOS DE AMONESTACIÓN ===========================
// =======================================================

function getTiposAmonestacion() {
  try {
    const sheet = getTiposAmonestacionSheet_();
    const values = getSheetValues(sheet).slice(1);
    return values.filter(r => r[0]).map(r => ({
      tipoId: String(r[0]),
      nombre: String(r[1]),
      descripcion: String(r[2] || ''),
      gravedad: String(r[3]),
      autoActivar: r[4] === true || r[4] === 'TRUE',
      condicionAuto: String(r[5] || ''),
      estado: String(r[6]),
      creadoPor: String(r[7] || '')
    }));
  } catch (e) { return []; }
}

function saveTipoAmonestacion(data, actorUserId) {
  try {
    const sheet = getTiposAmonestacionSheet_();
    if (data.tipoId) {
      // Editar existente
      const values = sheet.getDataRange().getValues();
      const rowIndex = values.findIndex(r => String(r[0]) === String(data.tipoId));
      if (rowIndex === -1) return { success: false, message: 'Tipo no encontrado.' };
      sheet.getRange(rowIndex + 1, 2, 1, 6).setValues([[
        data.nombre, data.descripcion, data.gravedad,
        data.autoActivar === true || data.autoActivar === 'true',
        data.condicionAuto || '', data.estado || 'Activo'
      ]]);
      if (actorUserId) registrarAuditoria(actorUserId, 'MODIFICAR', 'TiposAmonestacion', `Tipo editado: ${data.nombre} (${data.tipoId})`, 'OK');
      return { success: true, message: 'Tipo actualizado.' };
    } else {
      // Crear nuevo
      const allValues = sheet.getDataRange().getValues();
      const newId = 'TIPO-' + (allValues.length);
      sheet.appendRow([
        newId, data.nombre, data.descripcion, data.gravedad,
        data.autoActivar === true || data.autoActivar === 'true',
        data.condicionAuto || '', 'Activo', actorUserId || 'Sistema', new Date()
      ]);
      if (actorUserId) registrarAuditoria(actorUserId, 'CREAR', 'TiposAmonestacion', `Nuevo tipo creado: ${data.nombre} (${newId})`, 'OK');
      return { success: true, message: 'Tipo creado.' };
    }
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function deleteTipoAmonestacion(tipoId, actorUserId) {
  try {
    const sheet = getTiposAmonestacionSheet_();
    const values = sheet.getDataRange().getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(tipoId));
    if (rowIndex === -1) return { success: false, message: 'Tipo no encontrado.' };
    sheet.getRange(rowIndex + 1, 7).setValue('Inactivo');
    if (actorUserId) registrarAuditoria(actorUserId, 'ELIMINAR', 'TiposAmonestacion', `Tipo desactivado: ${values[rowIndex][1]} (${tipoId})`, 'OK');
    return { success: true, message: 'Tipo desactivado.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// ======= AMONESTACIONES ==================================
// =======================================================

function generarAmonestacionAutomatica_(userId, condicion) {
  try {
    const tipos = getTiposAmonestacion();
    const tipo = tipos.find(t => t.estado === 'Activo' && t.autoActivar && t.condicionAuto === condicion);
    if (!tipo) return;
    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return;
    const sheet = getAmonestacionesSheet_();
    const newId = 'AMON-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([
      newId, userId, userDetails.name, tipo.tipoId, tipo.nombre,
      `Amonestación automática: ${tipo.descripcion}`,
      'SISTEMA', 'Sistema', new Date(), 'Activa', 'Automática'
    ]);
  } catch (e) { Logger.log('Error en generarAmonestacionAutomatica_: ' + e.message); }
}

function getAmonestaciones(filtros) {
  try {
    const sheet = getAmonestacionesSheet_();
    const tz = SS.getSpreadsheetTimeZone();
    let rows = getSheetValues(sheet).slice(1).filter(r => r[0]);
    if (filtros) {
      if (filtros.userId) rows = rows.filter(r => String(r[1]) === String(filtros.userId));
      if (filtros.estado) rows = rows.filter(r => String(r[9]) === filtros.estado);
      if (filtros.tipoId) rows = rows.filter(r => String(r[3]) === filtros.tipoId);
      if (filtros.startDate && filtros.endDate) {
        const start = parseDateStringAsLocal(filtros.startDate);
        const end = parseDateStringAsLocal(filtros.endDate);
        end.setHours(23, 59, 59, 999);
        rows = rows.filter(r => { const d = safeGetDate(r[8]); return d && d >= start && d <= end; });
      }
    }
    return rows.map(r => ({
      amonestacionId: r[0], userId: r[1], userName: r[2],
      tipoId: r[3], tipoNombre: r[4], descripcion: r[5],
      creadoPorId: r[6], creadoPorNombre: r[7],
      fecha: safeGetDate(r[8]) ? Utilities.formatDate(safeGetDate(r[8]), tz, 'yyyy-MM-dd HH:mm') : 'N/A',
      estado: r[9], origen: r[10]
    }));
  } catch (e) { return []; }
}

function getAmonestacionesForCoordinator(areaIds) {
  try {
    const users = getAllUsersForCoordinator(areaIds);
    const userIds = new Set(users.map(u => String(u.userId)));
    return getAmonestaciones(null).filter(a => userIds.has(String(a.userId)));
  } catch (e) { return []; }
}

function crearAmonestacion(data, actorUserId) {
  try {
    const userDetails = getUserDetailsById(data.userId);
    if (!userDetails) return { success: false, message: 'Usuario no encontrado.' };
    const tipos = getTiposAmonestacion();
    const tipo = tipos.find(t => t.tipoId === data.tipoId);
    if (!tipo) return { success: false, message: 'Tipo de amonestación no encontrado.' };
    const actorDetails = getUserDetailsById(actorUserId);
    const sheet = getAmonestacionesSheet_();
    const newId = 'AMON-' + new Date().getTime();
    sheet.appendRow([
      newId, data.userId, userDetails.name, tipo.tipoId, tipo.nombre,
      data.descripcion || '',
      actorUserId, actorDetails ? actorDetails.name : 'N/A',
      new Date(), 'Activa', 'Manual'
    ]);
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'CREAR', 'Amonestaciones',
        `Amonestación ${newId} creada para: ${userDetails.name} | Tipo: ${tipo.nombre}`, 'OK');
    }
    return { success: true, message: 'Amonestación registrada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function anularAmonestacion(amonId, actorUserId, nota) {
  try {
    const sheet = getAmonestacionesSheet_();
    const values = sheet.getDataRange().getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(amonId));
    if (rowIndex === -1) return { success: false, message: 'Amonestación no encontrada.' };
    sheet.getRange(rowIndex + 1, 10).setValue('Anulada');
    if (nota) {
      sheet.getRange(rowIndex + 1, 6).setValue((values[rowIndex][5] || '') + ` [ANULADA: ${nota}]`);
    }
    if (actorUserId) {
      registrarAuditoria(actorUserId, 'MODIFICAR', 'Amonestaciones',
        `Amonestación ${amonId} anulada para: ${values[rowIndex][2]} | Nota: ${nota || 'N/A'}`, 'OK');
    }
    return { success: true, message: 'Amonestación anulada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// === SOLICITUDES DE ANULACIÓN DE AMONESTACIONES ========
// =======================================================

function solicitarAnulacionAmonestacion(data, coordinadorId) {
  try {
    const coordDetails = getUserDetailsById(coordinadorId);
    const sheet = getSolicitudesAnulacionSheet_();
    const newId = 'SOLAN-' + new Date().getTime();
    sheet.appendRow([
      newId, data.amonestacionId, coordinadorId,
      coordDetails ? coordDetails.name : 'N/A',
      data.motivo, 'Pendiente', new Date(), '', '', ''
    ]);
    registrarAuditoria(coordinadorId, 'CREAR', 'SolicitudesAnulacion',
      `Solicitud de anulación para amonestación ${data.amonestacionId} | Motivo: ${data.motivo}`, 'OK');
    return { success: true, message: 'Solicitud de anulación enviada.' };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

function getAnulacionesPendientes() {
  try {
    const sheet = getSolicitudesAnulacionSheet_();
    const tz = SS.getSpreadsheetTimeZone();
    return getSheetValues(sheet).slice(1).filter(r => r[0] && r[5] === 'Pendiente').map(r => ({
      solicitudId: r[0], amonestacionId: r[1],
      coordinadorId: r[2], coordinadorNombre: r[3],
      motivo: r[4], estado: r[5],
      fechaSolicitud: safeGetDate(r[6]) ? Utilities.formatDate(safeGetDate(r[6]), tz, 'yyyy-MM-dd HH:mm') : 'N/A'
    }));
  } catch (e) { return []; }
}

function resolverAnulacion(data, adminId) {
  try {
    const sheet = getSolicitudesAnulacionSheet_();
    const values = sheet.getDataRange().getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(data.solicitudId));
    if (rowIndex === -1) return { success: false, message: 'Solicitud no encontrada.' };
    sheet.getRange(rowIndex + 1, 6, 1, 5).setValues([[
      data.decision, adminId, new Date(), data.nota || ''
    ]]);
    if (data.decision === 'Aprobada') {
      anularAmonestacion(values[rowIndex][1], adminId, `Anulada por solicitud del coordinador ${values[rowIndex][3]}`);
    }
    registrarAuditoria(adminId, data.decision === 'Aprobada' ? 'APROBAR' : 'RECHAZAR', 'SolicitudesAnulacion',
      `Solicitud ${data.solicitudId} | Decisión: ${data.decision} | Nota: ${data.nota || 'N/A'}`, 'OK');
    return { success: true, message: `Solicitud ${data.decision.toLowerCase()}.` };
  } catch (e) { return { success: false, message: 'Error: ' + e.message }; }
}

// =======================================================
// === GESTIÓN DE HORARIOS DE CLASE (HORARIOSCLASES) =====
// =======================================================

function getHorariosClasesSheet_() {
  let sheet = SS.getSheetByName("HorariosClases");
  if (!sheet) {
    sheet = SS.insertSheet("HorariosClases");
    sheet.appendRow(["HorarioId", "UsuarioId", "NombreUsuario", "ImagenUrl", "CargaHoraria", "Estado", "FechaSolicitud", "AdminResolutor", "FechaResolucion", "NotaAdmin", "TiempoGracia"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function submitUserSchedule(data) {
  try {
    const { userId, base64Image, filename, mimeType, slotsJson } = data;
    if (!userId || !base64Image || !filename || !mimeType) {
      return { success: false, message: "Faltan datos obligatorios." };
    }
    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return { success: false, message: "Usuario no encontrado." };

    // Subir la imagen a Drive a la carpeta de Horarios
    const uploadRes = uploadProfilePhoto(base64Image, filename, mimeType, "1rOOsIo3pcd_RS28oAN9thoRERZDBjiRd");
    if (!uploadRes.success) return { success: false, message: "Error al subir la imagen: " + uploadRes.message };

    const sheet = getHorariosClasesSheet_();
    const schedId = "SCHED-" + new Date().getTime();

    sheet.appendRow([
      schedId, userId, userDetails.name, uploadRes.url, slotsJson || "[]",
      "Pendiente", new Date(), "", "", "", ""
    ]);

    registrarAuditoria(userId, 'CREAR', 'HorariosClases', `Usuario solicitó aprobación de horario de clases (ID: ${schedId})`, 'OK');
    return { success: true, message: "Horario de clases cargado correctamente y enviado a validación." };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  }
}

function getPendingSchedules(areaIdsOrAdmin) {
  try {
    const sheet = getHorariosClasesSheet_();
    const rows = getSheetValues(sheet).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();

    let filteredRows = rows.filter(r => r[0]);

    const usersMap = {};
    const allUsers = getAllUsersForAdmin();
    allUsers.forEach(u => {
      usersMap[String(u.userId)] = u;
    });

    if (areaIdsOrAdmin === 'admin') {
      filteredRows = filteredRows.filter(r => r[5] === 'Pendiente' || r[5] === 'Pre-Aprobado');
    } else {
      const areaIds = areaIdsOrAdmin || [];
      filteredRows = filteredRows.filter(r => {
        if (r[5] !== 'Pendiente') return false;
        const u = usersMap[String(r[1])];
        if (!u || !u.areas) return false;
        return u.areas.some(a => areaIds.indexOf(a) !== -1);
      });
    }

    return filteredRows.map(r => {
      const d = safeGetDate(r[6]);
      const user = usersMap[String(r[1])] || {};
      return {
        scheduleId: r[0],
        userId: r[1],
        userName: r[2],
        userAreas: user.areas ? user.areas.join(', ') : 'N/D',
        imagenUrl: r[3],
        cargaHoraria: JSON.parse(r[4] || '[]'),
        estado: r[5],
        fechaSolicitud: d ? Utilities.formatDate(d, timeZone, 'yyyy-MM-dd HH:mm') : 'N/A',
        adminResolutor: r[7] || '',
        fechaResolucion: r[8] ? Utilities.formatDate(safeGetDate(r[8]), timeZone, 'yyyy-MM-dd HH:mm') : '',
        notaAdmin: r[9] || '',
        tiempoGracia: r[10] !== "" && r[10] !== undefined && !isNaN(parseInt(r[10], 10)) ? parseInt(r[10], 10) : 0
      };
    }).reverse();
  } catch (e) {
    Logger.log("Error en getPendingSchedules: " + e.message);
    return [];
  }
}

function getSchedulesHistory(userId) {
  try {
    const sheet = getHorariosClasesSheet_();
    const rows = sheet.getDataRange().getValues().slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();

    return rows.filter(r => r[0] && String(r[1]) === String(userId))
      .map(r => {
        const d = safeGetDate(r[6]);
        const dRes = safeGetDate(r[8]);
        return {
          scheduleId: r[0],
          userId: r[1],
          userName: r[2],
          imagenUrl: r[3],
          cargaHoraria: JSON.parse(r[4] || '[]'),
          estado: r[5],
          fechaSolicitud: d ? Utilities.formatDate(d, timeZone, 'yyyy-MM-dd HH:mm') : 'N/A',
          adminResolutor: r[7] || '',
          fechaResolucion: dRes ? Utilities.formatDate(dRes, timeZone, 'yyyy-MM-dd HH:mm') : '',
          notaAdmin: r[9] || '',
          tiempoGracia: r[10] !== "" && r[10] !== undefined && !isNaN(parseInt(r[10], 10)) ? parseInt(r[10], 10) : 0
        };
      }).reverse();
  } catch (e) {
    return [];
  }
}

function resolveSchedule(scheduleId, decision, actorUserId, comment, tiempoGracia) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getHorariosClasesSheet_();
    const range = sheet.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(scheduleId));
    if (rowIndex === -1) return { success: false, message: "Solicitud no encontrada." };

    const actor = getUserDetailsById(actorUserId);
    if (!actor) return { success: false, message: "Actor no encontrado." };

    let newStatus = 'Rechazado';
    if (decision === 'Aprobada') {
      const subRolNorm = String(actor.subRol || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (subRolNorm === 'coordinador general' || subRolNorm === 'superadmin') {
        newStatus = 'Aprobado';
      } else if (subRolNorm === 'coordinador de area') {
        newStatus = 'Pre-Aprobado';
      } else {
        newStatus = actor.role === 'Admin' ? 'Aprobado' : 'Pre-Aprobado';
      }
    }

    const r = rowIndex + 1;
    sheet.getRange(r, 6).setValue(newStatus); // Estado
    sheet.getRange(r, 8).setValue(actor.name); // Resolutor
    sheet.getRange(r, 9).setValue(new Date()); // FechaResolucion
    sheet.getRange(r, 10).setValue(comment || ""); // NotaAdmin
    sheet.getRange(r, 11).setValue(tiempoGracia !== undefined && tiempoGracia !== "" && !isNaN(parseInt(tiempoGracia, 10)) ? parseInt(tiempoGracia, 10) : ""); // TiempoGracia

    registrarAuditoria(actorUserId, decision === 'Aprobada' ? 'APROBAR' : 'RECHAZAR', 'HorariosClases',
      `Solicitud de horario ${scheduleId} resuelta como ${newStatus} por ${actor.name}. Tiempo de gracia: ${tiempoGracia || 0} min.`, 'OK');

    return { success: true, message: `Horario resuelto como ${newStatus.toLowerCase()}.` };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// =======================================================
// === BACKFILL FECHA DE INCLUSIÓN (una sola vez) =========
// =======================================================

/**
 * Rellena la columna FechaInclusion (col Q, índice 16) para usuarios existentes
 * usando su primera asistencia registrada. Si no hay asistencias, usa la fecha actual.
 * Debe ejecutarse UNA VEZ desde el editor de Apps Script.
 */
function backfillFechaInclusion() {
  try {
    const timeZone = SS.getSpreadsheetTimeZone();
    const usersData = USERS_SHEET.getDataRange().getValues();

    // Construir mapa de primera asistencia por userId
    const firstAttendanceMap = new Map();
    const attendanceRows = ATTENDANCE_SHEET.getDataRange().getValues().slice(1);
    attendanceRows.forEach(row => {
      const userId = String(row[1]);
      const d = safeGetDate(row[0]);
      if (!d || !userId) return;
      if (!firstAttendanceMap.has(userId) || d < firstAttendanceMap.get(userId)) {
        firstAttendanceMap.set(userId, d);
      }
    });

    let updated = 0;
    for (let i = 1; i < usersData.length; i++) {
      const row = usersData[i];
      if (!row[0]) continue; // fila vacía

      // Si ya tiene fechaInclusion válida, no tocar
      if (row[16] && String(row[16]).trim() !== '') {
        const existing = safeGetDate(row[16]);
        if (existing && existing.getFullYear() > 1970) continue;
      }

      const userId = String(row[0]);
      const firstDate = firstAttendanceMap.get(userId) || new Date();
      USERS_SHEET.getRange(i + 1, 17).setValue(firstDate);
      updated++;
    }
    CACHE.remove('users_data');
    Logger.log(`backfillFechaInclusion completado: ${updated} usuarios actualizados.`);
    return { success: true, message: `Backfill completado. ${updated} usuarios actualizados con fecha de inclusión.` };
  } catch (e) {
    Logger.log('Error en backfillFechaInclusion: ' + e.message);
    return { success: false, message: 'Error: ' + e.message };
  }
}

// =======================================================
// === BATCH DASHBOARD DATA LOADING BUNDLES ==============
// =======================================================

// ---- FASE 1: Datos críticos para render inmediato ----
function getAdminDashboardData_Phase1(startDate, endDate) {
  try {
    return {
      stats: null,
      attendance: null,
      users: getAllUsersForAdmin(),
      areas: getAreasConfig(),
      absentees: null,
      openSessions: null,
      accessRules: getPermisosRoles()
    };
  } catch (e) {
    Logger.log("Error en getAdminDashboardData_Phase1: " + e.message);
    return { error: e.message };
  }
}

// ---- FASE 2: Datos secundarios cargados en background ----
function getAdminDashboardData_Phase2(startDate, endDate) {
  try {
    return {
      duties: getDutyShifts(),
      hoursReport: calculateHoursWorkedReport(startDate, endDate),
      permissions: getPermissionRequests(false, null),
      substitutions: getSubstitutions(),
      crossTurnos: getCrossTurnosList(),
      auditLog: getAuditLog({ startDate: startDate, endDate: endDate }),
      deleteRequests: getDeleteRequests(),
      accessRules: getPermisosRoles(),
      warningTypes: getTiposAmonestacion(),
      warnings: getAmonestaciones(null),
      warningAnulaciones: getAnulacionesPendientes(),
      configHorarios: getConfigHorarios(),
      schedules: getPendingSchedules('admin'),
      approvedSchedules: getApprovedSchedules('admin'),
      manualRequests: getManualCheckRequests('admin')
    };
  } catch (e) {
    Logger.log("Error en getAdminDashboardData_Phase2: " + e.message);
    return { error: e.message };
  }
}

// ---- Recarga ligera solo para cambio de filtros de fecha ----
function refreshAdminDashboardFiltered(startDate, endDate) {
  try {
    return {
      stats: getAdminDashboardStats(startDate, endDate),
      attendance: getAttendanceRecords('admin', startDate, endDate),
      hoursReport: calculateHoursWorkedReport(startDate, endDate)
    };
  } catch (e) {
    Logger.log("Error en refreshAdminDashboardFiltered: " + e.message);
    return { error: e.message };
  }
}

// ---- Coordinador FASE 1 ----
function getCoordinatorDashboardData_Phase1(areaIds) {
  try {
    return {
      stats: null,
      attendance: null,
      users: getAllUsersForCoordinator(areaIds),
      areasConfig: getAreasConfig(),
      accessRules: getPermisosRoles()
    };
  } catch (e) {
    Logger.log("Error en getCoordinatorDashboardData_Phase1: " + e.message);
    return { error: e.message };
  }
}

// ---- Coordinador FASE 2 ----
function getCoordinatorDashboardData_Phase2(areaIds, startDate, endDate) {
  try {
    return {
      permissions: getPermissionRequestsForCoordinator(areaIds),
      duties: getDutyShifts(),
      hoursReport: calculateHoursWorkedReportForCoordinator(areaIds, startDate, endDate),
      substitutions: getSubstitutionsForCoordinator(areaIds),
      crossTurnos: getCrossTurnosList(),
      warnings: getAmonestacionesForCoordinator(areaIds),
      warningTypes: getTiposAmonestacion(),
      schedules: getPendingSchedules(areaIds),
      approvedSchedules: getApprovedSchedules(areaIds),
      manualRequests: getManualCheckRequests('coordinator', areaIds)
    };
  } catch (e) {
    Logger.log("Error en getCoordinatorDashboardData_Phase2: " + e.message);
    return { error: e.message };
  }
}

// ---- Recarga ligera Coordinador para filtros de fecha ----
function refreshCoordinatorDashboardFiltered(areaIds, startDate, endDate) {
  try {
    return {
      stats: getCoordDashboardStats(areaIds),
      attendance: getAttendanceRecordsForCoordinator(areaIds, startDate, endDate),
      hoursReport: calculateHoursWorkedReportForCoordinator(areaIds, startDate, endDate)
    };
  } catch (e) {
    Logger.log("Error en refreshCoordinatorDashboardFiltered: " + e.message);
    return { error: e.message };
  }
}

// ---- Funciones legacy (compatibilidad con llamadas existentes) ----
function getAdminDashboardData(startDate, endDate) {
  try {
    const p1 = getAdminDashboardData_Phase1(startDate, endDate);
    const p2 = getAdminDashboardData_Phase2(startDate, endDate);
    if (p1.error) return p1;
    return Object.assign({}, p1, p2);
  } catch (e) {
    Logger.log("Error en getAdminDashboardData: " + e.message);
    return { error: e.message };
  }
}

function getCoordinatorDashboardData(areaIds, startDate, endDate) {
  try {
    return {
      stats: getCoordDashboardStats(areaIds),
      attendance: getAttendanceRecordsForCoordinator(areaIds, startDate, endDate),
      users: getAllUsersForCoordinator(areaIds),
      permissions: getPermissionRequestsForCoordinator(areaIds),
      duties: getDutyShifts(),
      hoursReport: calculateHoursWorkedReportForCoordinator(areaIds, startDate, endDate),
      substitutions: getSubstitutionsForCoordinator(areaIds),
      crossTurnos: getCrossTurnosList(),
      warnings: getAmonestacionesForCoordinator(areaIds),
      warningTypes: getTiposAmonestacion(),
      schedules: getPendingSchedules(areaIds),
      approvedSchedules: getApprovedSchedules(areaIds),
      areasConfig: getAreasConfig()
    };
  } catch (e) {
    Logger.log("Error en getCoordinatorDashboardData: " + e.message);
    return { error: e.message };
  }
}

function getUserDashboardData(userId) {
  try {
    return {
      attendance: getAttendanceRecords(userId),
      permissions: getPermissionRequests(true, userId),
      substitutionInfo: getUserSubstitutionInfo(userId),
      crossTurnos: getCrossTurnosList(),
      warnings: getAmonestaciones({ userId: userId }),
      areasConfig: getAreasConfig(),
      schedulesHistory: getSchedulesHistory(userId),
      lastState: getLastAttendanceState(userId),
      companyConfig: getCompanyConfig(),
      users: getAllUsersForAdmin(),
      marketRequests: getOpenRequests(),
      accessRules: getPermisosRoles()
    };
  } catch (e) {
    Logger.log("Error en getUserDashboardData: " + e.message);
    return { error: e.message };
  }
}

function getFullUserAttendanceRecords(userId) {
  try {
    const sheet = SS.getSheetByName("Asistencias");
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();

    const timeZone = SS.getSpreadsheetTimeZone();
    const IDX = { TIMESTAMP: 0, USER_ID: 1, NAME: 2, TURNO: 3, INSTITUCION: 4, TYPE: 5, STATUS: 8, DISTANCE: 9 };

    let records = data.filter(row => String(row[IDX.USER_ID]) === String(userId));

    return records.map(row => {
      const d = safeGetDate(row[IDX.TIMESTAMP]);
      return {
        timestamp: d ? Utilities.formatDate(d, timeZone, "yyyy-MM-dd HH:mm:ss") : "N/A",
        userId: String(row[IDX.USER_ID]),
        name: row[IDX.NAME],
        turno: row[IDX.TURNO] || 'N/D',
        institucion: row[IDX.INSTITUCION] || 'N/D',
        type: row[IDX.TYPE],
        status: row[IDX.STATUS],
        distance: row[IDX.DISTANCE]
      };
    }).reverse();
  } catch (e) {
    Logger.log(e);
    return [];
  }
}

function getApprovedSchedules(areaIdsOrAdmin) {
  try {
    const sheet = getHorariosClasesSheet_();
    const rows = getSheetValues(sheet).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();

    const allUsers = getAllUsersForAdmin().filter(u => u.estado === 'Activo');
    const usersMap = {};
    allUsers.forEach(u => { usersMap[String(u.userId)] = u; });

    let targetUsers = allUsers;
    if (areaIdsOrAdmin !== 'admin') {
      const areaIds = areaIdsOrAdmin || [];
      targetUsers = allUsers.filter(u => u.areas && u.areas.some(a => areaIds.indexOf(a) !== -1));
    }
    const targetUserIds = new Set(targetUsers.map(u => String(u.userId)));

    const latestApprovedMap = new Map();
    rows.forEach(r => {
      if (!r[0]) return;
      const userId = String(r[1]);
      const estado = String(r[5]);
      if (estado === 'Aprobado' && targetUserIds.has(userId)) {
        latestApprovedMap.set(userId, r);
      }
    });

    const result = [];
    latestApprovedMap.forEach((r, userId) => {
      const d = safeGetDate(r[6]);
      const user = usersMap[userId] || {};
      result.push({
        scheduleId: r[0],
        userId: r[1],
        userName: r[2],
        userAreas: user.areas ? user.areas.join(', ') : 'N/D',
        imagenUrl: r[3],
        cargaHoraria: JSON.parse(r[4] || '[]'),
        estado: r[5],
        fechaSolicitud: d ? Utilities.formatDate(d, timeZone, 'yyyy-MM-dd HH:mm') : 'N/A',
        adminResolutor: r[7] || '',
        fechaResolucion: r[8] ? Utilities.formatDate(safeGetDate(r[8]), timeZone, 'yyyy-MM-dd HH:mm') : '',
        notaAdmin: r[9] || '',
        tiempoGracia: r[10] !== "" && r[10] !== undefined && !isNaN(parseInt(r[10], 10)) ? parseInt(r[10], 10) : 0
      });
    });

    return result;
  } catch (e) {
    Logger.log("Error en getApprovedSchedules: " + e.message);
    return [];
  }
}

function updateApprovedScheduleGraceAndNotes(scheduleId, tiempoGracia, notaAdmin, actorUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getHorariosClasesSheet_();
    const range = sheet.getDataRange();
    const values = range.getValues();
    const rowIndex = values.findIndex(r => String(r[0]) === String(scheduleId));
    if (rowIndex === -1) return { success: false, message: "Horario no encontrado." };

    const r = rowIndex + 1;
    sheet.getRange(r, 10).setValue(notaAdmin || ""); // NotaAdmin
    sheet.getRange(r, 11).setValue(tiempoGracia !== undefined && tiempoGracia !== "" && !isNaN(parseInt(tiempoGracia, 10)) ? parseInt(tiempoGracia, 10) : ""); // TiempoGracia

    const actor = getUserDetailsById(actorUserId);
    const userName = values[rowIndex][2];

    registrarAuditoria(actorUserId, 'MODIFICAR', 'HorariosClases',
      `Horario ID ${scheduleId} de ${userName} editado por ${actor ? actor.name : 'N/A'}. Nuevo tiempo gracia: ${tiempoGracia} min.`, 'OK');

    return { success: true, message: "Horario actualizado correctamente." };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// =======================================================
// ===== MOTOR DE REPORTES COMPRENSIVOS (Fase 3) =========
// =======================================================

/**
 * Genera todos los datos necesarios para los informes del sistema.
 * @param {string} startDate - Fecha de inicio en formato 'yyyy-MM-dd'
 * @param {string} endDate - Fecha de fin en formato 'yyyy-MM-dd'
 * @param {string|Array} areaIdsOrAdmin - 'admin' para todos, o array de IDs de área
 * @returns {Object} Objeto JSON con todos los datos del reporte procesados
 */
function generateComprehensiveReport(startDate, endDate, areaIdsOrAdmin) {
  try {
    const timeZone = SS.getSpreadsheetTimeZone();
    const isAdmin = (areaIdsOrAdmin === 'admin');

    // -- Datos de usuarios para el reporte --
    const allUsers = getAllUsersForAdmin().filter(u => u.estado === 'Activo' && u.role !== 'Admin');
    let targetUsers = allUsers;
    if (!isAdmin && Array.isArray(areaIdsOrAdmin) && areaIdsOrAdmin.length > 0) {
      targetUsers = allUsers.filter(u => u.areas && u.areas.some(a => areaIdsOrAdmin.indexOf(a) !== -1));
    }
    const targetUserIds = new Set(targetUsers.map(u => String(u.userId)));
    const usersMap = {};
    targetUsers.forEach(u => { usersMap[String(u.userId)] = u; });

    // -- Calcular días laborables del período --
    const startObj = parseDateStringAsLocal(startDate);
    const endObj = parseDateStringAsLocal(endDate);
    endObj.setHours(23, 59, 59, 999);

    const dutyShiftsMap = new Map();
    if (DUTY_SHEET) {
      DUTY_SHEET.getDataRange().getValues().slice(1).forEach(row => {
        const d = safeGetDate(row[0]);
        if (d && row[1]) {
          dutyShiftsMap.set(Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), {
            turno: row[1],
            categoria: row[4] ? String(row[4]).trim() : ""
          });
        }
      });
    }

    // Calcular días laborables globales en el período (excluyendo feriados)
    const allWorkDates = [];
    let tempDate = new Date(startObj);
    while (tempDate <= endObj) {
      const dateStr = Utilities.formatDate(tempDate, timeZone, 'yyyy-MM-dd');
      const dow = tempDate.getDay();
      const duty = dutyShiftsMap.get(dateStr);
      if (duty) {
        if (duty.categoria !== 'Feriado') {
          allWorkDates.push(dateStr);
        }
      } else if (dow >= 1 && dow <= 5) {
        allWorkDates.push(dateStr);
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // -- Permisos aprobados en el rango --
    const permissionsLookup = getPermissionsLookupMap(startDate, endDate);
    const permissionsMap = getApprovedPermissionsInRange(startDate, endDate);

    // -- Datos de asistencia en el rango --
    const attendanceRows = ATTENDANCE_SHEET.getDataRange().getValues().slice(1);

    // Mapa de asistencia por usuario-fecha con registros de entrada/salida
    const attendanceByUserDate = new Map();
    attendanceRows.forEach(row => {
      const d = safeGetDate(row[0]);
      if (!d) return;
      if (d < startObj || d > endObj) return;
      const userId = String(row[1]);
      if (!targetUserIds.has(userId)) return;
      const dateStr = Utilities.formatDate(d, timeZone, 'yyyy-MM-dd');
      const timeStr = Utilities.formatDate(d, timeZone, 'HH:mm:ss');
      const key = `${userId}-${dateStr}`;
      if (!attendanceByUserDate.has(key)) attendanceByUserDate.set(key, { entries: [], exits: [], records: [] });
      const rec = attendanceByUserDate.get(key);
      rec.records.push({ type: row[5], time: timeStr, timestamp: d, status: row[8] });
      if (row[5] === 'Entrada') rec.entries.push({ time: timeStr, timestamp: d, status: row[8] });
      else if (row[5] === 'Salida') rec.exits.push({ time: timeStr, timestamp: d, status: row[8] });
    });

    // -- 1. AMONESTACIONES --
    const amonestacionesData = getAmonestaciones(null).filter(a => {
      if (!targetUserIds.has(String(a.userId))) return false;
      if (!a.fecha || a.fecha === 'N/A') return false;
      const d = new Date(a.fecha);
      return d >= startObj && d <= endObj;
    });
    const amonPorTipo = {};
    amonestacionesData.forEach(a => {
      const tipo = a.tipoNombre || 'Desconocido';
      if (!amonPorTipo[tipo]) amonPorTipo[tipo] = { tipo, cantidad: 0, usuarios: new Set() };
      amonPorTipo[tipo].cantidad++;
      amonPorTipo[tipo].usuarios.add(a.userName);
    });
    const amonResumenTipos = Object.values(amonPorTipo).map(t => ({ tipo: t.tipo, cantidad: t.cantidad, usuarios: [...t.usuarios].join(', ') }));

    // -- 2. INASISTENCIAS por usuario --
    const inasistenciasDetalle = [];
    targetUsers.forEach(user => {
      const userId = String(user.userId);
      // Fecha de inclusión: usar la fecha más temprana (fechaInclusion del usuario, o startDate si no hay)
      let effectiveStart = startObj;
      if (user.fechaInclusion && user.fechaInclusion !== 'N/A') {
        const incDate = parseDateStringAsLocal(user.fechaInclusion);
        if (incDate > startObj) effectiveStart = incDate;
      }

      const userShift = normalizeShift(user.turno);
      let personalWorkDays = 0;
      let diasAusente = 0;
      const ausencias = [];

      allWorkDates.forEach(dateStr => {
        const dateObj = parseDateStringAsLocal(dateStr);
        if (dateObj < effectiveStart) return;
        const duty = dutyShiftsMap.get(dateStr);
        let shouldWork = false;
        if (duty) {
          if (duty.categoria === 'Feriado') {
            shouldWork = false;
          } else {
            const dutyNorm = normalizeShift(duty.turno);
            if (dutyNorm === 'mixto') {
              shouldWork = (userShift === 'mañana' || userShift === 'tarde' || userShift === 'mixto');
            } else {
              shouldWork = (userShift === dutyNorm);
            }
          }
        } else {
          const dow = dateObj.getDay();
          shouldWork = (dow >= 1 && dow <= 5) && (userShift === 'mañana' || userShift === 'tarde' || userShift === 'mixto');
        }
        if (!shouldWork) return;
        personalWorkDays++;

        const key = `${userId}-${dateStr}`;
        const hasAttendance = attendanceByUserDate.has(key);
        const hasPermission = isUserOnLeave(dateObj, userId, permissionsMap);
        if (!hasAttendance && !hasPermission) {
          diasAusente++;
          ausencias.push(dateStr);
        }
      });

      inasistenciasDetalle.push({
        userId, nombre: user.name, institucion: user.institucion || 'N/A',
        turno: user.turno || 'N/A',
        fechaInclusion: user.fechaInclusion || 'N/A',
        diasLaborables: personalWorkDays,
        diasAusente, diasPresente: personalWorkDays - diasAusente,
        porcentajeAsistencia: personalWorkDays > 0 ? parseFloat(((personalWorkDays - diasAusente) / personalWorkDays * 100).toFixed(1)) : 0,
        fechasAusencia: ausencias.join(', ')
      });
    });

    // -- 3. LLEGADAS TARDE --
    const llegadasTardeDetalle = [];
    const configHorarios = getConfigHorariosMap_();

    targetUsers.forEach(user => {
      const userId = String(user.userId);
      const userShift = normalizeShift(user.turno);
      let entryConfigKey = 'HORA_ENTRADA_MANANA';
      if (userShift === 'tarde') entryConfigKey = 'HORA_ENTRADA_TARDE';
      else if (userShift === 'mixto') entryConfigKey = 'HORA_ENTRADA_MIXTO';
      const configuredEntryStr = configHorarios[entryConfigKey] || '08:00';
      const entryParts = configuredEntryStr.split(':');

      const tolerancia = user.toleranciaPersonalizada !== null && user.toleranciaPersonalizada !== undefined
        ? user.toleranciaPersonalizada
        : parseInt(configHorarios['TOLERANCIA_RETARDO_MIN'] || '60', 10);

      attendanceRows.forEach(row => {
        if (String(row[1]) !== userId) return;
        if (row[5] !== 'Entrada') return;
        const d = safeGetDate(row[0]);
        if (!d || d < startObj || d > endObj) return;

        const scheduledEntry = new Date(d);
        scheduledEntry.setHours(parseInt(entryParts[0], 10), parseInt(entryParts[1] || '0', 10), 0, 0);
        const diffMin = (d - scheduledEntry) / 60000;
        if (diffMin >= tolerancia) {
          llegadasTardeDetalle.push({
            userId, nombre: user.name, fecha: Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'),
            horaEntrada: Utilities.formatDate(d, timeZone, 'HH:mm'),
            horaProgramada: configuredEntryStr,
            retrasoMinutos: Math.round(diffMin),
            status: row[8] || ''
          });
        }
      });
    });

    // Acumulado de retraso por usuario
    const retrasoAcumulado = {};
    llegadasTardeDetalle.forEach(l => {
      if (!retrasoAcumulado[l.userId]) retrasoAcumulado[l.userId] = { nombre: l.nombre, totalMinutos: 0, incidencias: 0 };
      retrasoAcumulado[l.userId].totalMinutos += l.retrasoMinutos;
      retrasoAcumulado[l.userId].incidencias++;
    });

    // -- 4. PERMISOS --
    const permisosData = PERMISSIONS_SHEET ? PERMISSIONS_SHEET.getDataRange().getValues().slice(1).filter(row => {
      if (!targetUserIds.has(String(row[1]))) return false;
      if (row[6] !== 'Aprobado') return false;
      const d = safeGetDate(row[3]);
      return d && d >= startObj && d <= endObj;
    }) : [];

    const permisosPorTipo = {};
    const permisosPorMesUsuario = {};
    permisosData.forEach(row => {
      const tipo = String(row[5] || 'Otro');
      const userId = String(row[1]);
      const d = safeGetDate(row[3]);
      const mes = d ? Utilities.formatDate(d, timeZone, 'yyyy-MM') : 'N/A';

      if (!permisosPorTipo[tipo]) permisosPorTipo[tipo] = 0;
      permisosPorTipo[tipo]++;

      const mesKey = `${userId}-${mes}`;
      if (!permisosPorMesUsuario[mesKey]) permisosPorMesUsuario[mesKey] = { userId, nombre: usersMap[userId] ? usersMap[userId].name : userId, mes, tipos: {}, total: 0 };
      permisosPorMesUsuario[mesKey].total++;
      if (!permisosPorMesUsuario[mesKey].tipos[tipo]) permisosPorMesUsuario[mesKey].tipos[tipo] = 0;
      permisosPorMesUsuario[mesKey].tipos[tipo]++;
    });

    const permisosTiposArr = Object.entries(permisosPorTipo).map(([tipo, cnt]) => ({ tipo, cantidad: cnt }));
    const permisosMesArr = Object.values(permisosPorMesUsuario).map(pm => ({
      userId: pm.userId, nombre: pm.nombre, mes: pm.mes, total: pm.total,
      tiposStr: Object.entries(pm.tipos).map(([t, c]) => `${t}(${c})`).join(', ')
    })).sort((a, b) => a.mes.localeCompare(b.mes) || a.nombre.localeCompare(b.nombre));

    // -- 5. CROSS DE TURNO --
    const crossData = getCrossTurnosList().filter(c => {
      if (!c.date || c.date === 'N/A') return false;
      return c.date >= startDate && c.date <= endDate && c.estado === 'Aprobada';
    });
    const crossPorUsuario = {};
    crossData.forEach(c => {
      [{ id_: c.u1Name, name_: c.u1Name }, { id_: c.u2Name, name_: c.u2Name }].forEach((u, idx) => {
        const nombre = u.name_;
        if (!crossPorUsuario[nombre]) crossPorUsuario[nombre] = { nombre, haCubierto: 0, loCubrieron: 0 };
        if (idx === 0) crossPorUsuario[nombre].haCubierto++;
        else crossPorUsuario[nombre].loCubrieron++;
      });
    });

    // -- 6. HORAS TRABAJADAS --
    const horasTrabajadas = calculateHoursWorkedReport(startDate, endDate).filter(r => targetUserIds.has(String(r.userId)));

    // -- 7. ANOMALÍAS --
    const sinSalida = [];
    const registroManual = [];
    const fueraDeRango = [];

    attendanceRows.forEach(row => {
      const d = safeGetDate(row[0]);
      if (!d || d < startObj || d > endObj) return;
      const userId = String(row[1]);
      if (!targetUserIds.has(userId)) return;
      const status = String(row[8] || '');
      const tipo = String(row[5] || '');
      if (status === 'Cierre Automático') sinSalida.push({ userId, nombre: row[2], fecha: Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), hora: Utilities.formatDate(d, timeZone, 'HH:mm') });
      if (status === 'Registro Manual') registroManual.push({ userId, nombre: row[2], tipo, fecha: Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), hora: Utilities.formatDate(d, timeZone, 'HH:mm') });
      if (status === 'Fuera de Rango') fueraDeRango.push({ userId, nombre: row[2], tipo, fecha: Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'), hora: Utilities.formatDate(d, timeZone, 'HH:mm'), distancia: row[9] || 0 });
    });

    // -- 8. GUARDIAS --
    const guardiasEnPeriodo = getDutyShifts().filter(d => d.date >= startDate && d.date <= endDate);
    const guardiaDetalle = guardiasEnPeriodo.map(g => {
      const presentesEnGuardia = new Set();
      allWorkDates.forEach(dateStr => {
        if (dateStr !== g.date) return;
        targetUsers.forEach(user => {
          const key = `${user.userId}-${dateStr}`;
          if (attendanceByUserDate.has(key)) presentesEnGuardia.add(user.name);
        });
      });
      return {
        fecha: g.date, turno: g.turno, categoria: g.categoria || 'Guardia',
        descripcion: g.descripcion || '',
        asistentes: presentesEnGuardia.size,
        nombresAsistentes: [...presentesEnGuardia].join(', ')
      };
    });

    return {
      metadata: {
        generadoEl: Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd HH:mm:ss'),
        periodo: { inicio: startDate, fin: endDate },
        totalOperadores: targetUsers.length,
        diasLaborablesGlobales: allWorkDates.length
      },
      amonestaciones: {
        resumen: { total: amonestacionesData.length, porTipo: amonResumenTipos },
        detalle: amonestacionesData.map(a => ({ nombre: a.userName, tipo: a.tipoNombre, gravedad: '', fecha: a.fecha, descripcion: a.descripcion, estado: a.estado, origen: a.origen }))
      },
      inasistencias: {
        resumen: { totalDiasAusentes: inasistenciasDetalle.reduce((s, r) => s + r.diasAusente, 0), operadoresConAusencias: inasistenciasDetalle.filter(r => r.diasAusente > 0).length },
        detalle: inasistenciasDetalle
      },
      llegadasTarde: {
        resumen: { totalIncidencias: llegadasTardeDetalle.length, acumuladoPorUsuario: Object.values(retrasoAcumulado) },
        detalle: llegadasTardeDetalle
      },
      permisos: {
        resumen: { total: permisosData.length, porTipo: permisosTiposArr },
        detalleMensual: permisosMesArr
      },
      crossTurno: {
        resumen: { total: crossData.length },
        detalle: crossData,
        porUsuario: Object.values(crossPorUsuario)
      },
      horasTrabajadas: {
        detalle: horasTrabajadas.map(h => ({
          nombre: h.name,
          institucion: h.institucion,
          turno: h.turno,
          diasTrabajados: h.daysWorked,
          diasAusentes: h.absentDaysCount,
          horasTrabajadas: h.horasTrabajadas,
          horasAdeudantes: h.horasAdeudantes,
          minutosTrabajados: h.minutosTrabajados,
          minutosAdeudantes: h.minutosAdeudantes,
          horasCompensadas: h.horasCompensadas,
          minutosCompensadas: h.minutosCompensadas
        }))
      },
      anomalias: {
        sinSalida, registroManual, fueraDeRango
      },
      guardias: {
        resumen: { total: guardiasEnPeriodo.length },
        detalle: guardiaDetalle
      }
    };
  } catch (e) {
    Logger.log('Error en generateComprehensiveReport: ' + e.message);
    return { error: e.message };
  }
}

// =======================================================
// === GESTIÓN DE SOLICITUDES DE REGISTRO MANUAL =========
// =======================================================

function submitManualCheckRequest(data) {
  try {
    const { userId, type, reason } = data;
    if (!userId || !type || !reason) return { success: false, message: 'Faltan datos requeridos.' };

    const userDetails = getUserDetailsById(userId);
    if (!userDetails) return { success: false, message: 'Usuario no encontrado.' };

    const sheet = getManualRequestsSheet_();
    const rows = getSheetValues(sheet).slice(1);
    const timeZone = SS.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');

    const hasPending = rows.some(r => {
      if (String(r[1]) !== String(userId) || String(r[5]) !== type || String(r[7]) !== 'Pendiente') return false;
      const d = safeGetDate(r[6]);
      return d && Utilities.formatDate(d, timeZone, 'yyyy-MM-dd') === todayStr;
    });

    if (hasPending) {
      return { success: false, message: `Ya tienes una solicitud de '${type}' pendiente para el día de hoy.` };
    }

    const newId = 'MREQ-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);

    sheet.appendRow([
      newId,
      userId,
      userDetails.name,
      userDetails.turno,
      userDetails.institucion,
      type,
      new Date(),
      'Pendiente',
      '',
      '',
      reason
    ]);

    _requestCache.clear("SolicitudesManuales");

    return { success: true, message: 'Solicitud enviada correctamente.' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function getManualCheckRequests(roleOrUser, extra) {
  try {
    const sheet = getManualRequestsSheet_();
    const timeZone = SS.getSpreadsheetTimeZone();
    const rows = getSheetValues(sheet).slice(1);

    let filtered = rows.filter(r => r[0]);

    if (roleOrUser === 'user') {
      const userId = String(extra);
      filtered = filtered.filter(r => String(r[1]) === userId);
    } else if (roleOrUser === 'coordinator') {
      const areaIds = extra || [];
      const coordUsers = getAllUsersForCoordinator(areaIds);
      const coordUserIds = new Set(coordUsers.map(u => String(u.userId)));
      filtered = filtered.filter(r => coordUserIds.has(String(r[1])));
    }

    return filtered.map(r => {
      const dateSol = safeGetDate(r[6]);
      const dateRes = safeGetDate(r[9]);
      return {
        solicitudId: String(r[0]),
        userId: String(r[1]),
        nombreUsuario: String(r[2]),
        turno: String(r[3]),
        institucion: String(r[4]),
        tipo: String(r[5]),
        fechaSolicitud: dateSol ? Utilities.formatDate(dateSol, timeZone, 'yyyy-MM-dd HH:mm') : 'N/A',
        estado: String(r[7]),
        resolutorId: String(r[8] || ''),
        fechaResolucion: dateRes ? Utilities.formatDate(dateRes, timeZone, 'yyyy-MM-dd HH:mm') : '',
        motivo: String(r[10] || '')
      };
    }).reverse();
  } catch (e) {
    Logger.log("Error en getManualCheckRequests: " + e.message);
    return [];
  }
}

function resolveManualCheckRequest(solicitudId, decision, actorUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (!solicitudId || !decision || !actorUserId) return { success: false, message: 'Faltan datos requeridos.' };

    const sheet = getManualRequestsSheet_();
    const rows = sheet.getDataRange().getValues();
    const rowIndex = rows.findIndex(r => String(r[0]) === String(solicitudId));
    if (rowIndex === -1) {
      lock.releaseLock();
      return { success: false, message: 'Solicitud no encontrada.' };
    }

    const row = rows[rowIndex];
    const status = String(row[7]);
    if (status !== 'Pendiente') {
      lock.releaseLock();
      return { success: false, message: `La solicitud ya fue resuelta anteriormente (Estado: ${status}).` };
    }

    const userId = String(row[1]);
    const userName = String(row[2]);
    const type = String(row[5]);

    sheet.getRange(rowIndex + 1, 8, 1, 3).setValues([[decision, actorUserId, new Date()]]);

    _requestCache.clear("SolicitudesManuales");

    if (decision === 'Aprobada') {
      const userDetails = getUserDetailsById(userId);
      if (!userDetails) {
        lock.releaseLock();
        return { success: false, message: 'No se pudo registrar la asistencia porque el usuario no existe.' };
      }

      ATTENDANCE_SHEET.appendRow([
        new Date(),
        userId,
        userName,
        userDetails.turno,
        userDetails.institucion,
        type,
        "",
        "",
        "Registro Manual",
        0
      ]);

      CACHE.put(`last_state_${userId}`, JSON.stringify({ type: type }), 300);
      CACHE.remove('open_sessions');
      _requestCache.clear("Asistencias");
    }

    lock.releaseLock();

    const actorUser = getUserDetailsById(actorUserId) || { name: 'Admin/Coordinador' };
    registrarAuditoria(
      actorUserId,
      decision === 'Aprobada' ? 'APROBAR' : 'RECHAZAR',
      'SolicitudesManuales',
      `Solicitud manual de ${type} para: ${userName} (ID: ${userId}) - Resuelto como: ${decision} por ${actorUser.name}`,
      'OK'
    );

    return { success: true, message: `Solicitud de registro manual ${decision === 'Aprobada' ? 'aprobada y registrada' : 'rechazada'} correctamente.` };
  } catch (e) {
    try { lock.releaseLock(); } catch (err) { }
    return { success: false, message: 'Error en resolveManualCheckRequest: ' + e.message };
  }
}

// =======================================================
// ===== FASE 3: ESTANDARIZACIÓN DE BASE DE DATOS ========
// =======================================================

/**
 * Verifica la estructura de todas las hojas del sistema comparando
 * contra la definición canónica esperada (según SYSTEM ASIS V1).
 * @return {Array} Lista de resultados de verificación por hoja
 */
function verificarEstructuraSheets() {
  const ESTRUCTURA_ESPERADA = {
    "Usuarios": ["UserId", "Nombre", "Email", "Password", "Rol", "Cedula", "Institucion",
      "Telefono", "Direccion", "Turno", "Nacimiento", "FotoURL", "Estado", "AreasIds",
      "SubRol", "ToleranciaPersonalizadaMin", "FechaInclusion"],
    "Asistencias": ["Timestamp", "UserId", "Nombre", "Turno", "Institucion",
      "Tipo", "Latitud", "Longitud", "Estado", "DistanciaMetros"],
    "Guardias": ["FechaGuardia", "TurnoRequerido", "Descripcion", "CreadoPor",
      "Categoria", "Timestamp"],
    "Permisos": ["PermisoId", "UserId", "NombreUsuario", "FechaInicio", "FechaFin",
      "Tipo", "Estado", "Comentarios", "ResolutorId", "FechaResolucion"],
    "Suplencias": ["SubId", "TitularId", "TitularNombre", "SuplenteId", "SuplenteNombre",
      "FechaInicio", "FechaFin", "Turno", "Estado", "Comentarios", "HoraInicio",
      "HoraFin", "TimestampCreacion"],
    "CrossTurnos": ["CrossId", "Fecha", "User1Id", "User1Nombre", "User1Turno",
      "User2Id", "User2Nombre", "User2Turno", "Estado", "CreadoPor",
      "TimestampCreacion", "ResolutorId", "FechaResolucion"],
    "AreasTrabajoConfig": ["AreaId", "NombreArea", "FechaCreacion", "CreadoPor", "Estado"],
    "Auditoria": ["Timestamp", "UsuarioId", "NombreUsuario", "SubRol", "Accion",
      "Modulo", "DetalleObjeto", "Resultado", "AreasActor"],
    "PermisosRoles": ["ReglaId", "SubRol", "Modulo", "Accion", "Permitido",
      "CreadoPor", "FechaCreacion", "Descripcion"],
    "SolicitudesBaja": ["SolicitudId", "CoordinadorId", "CoordinadorNombre",
      "UsuarioTargetId", "UsuarioTargetNombre", "Motivo", "Estado",
      "FechaSolicitud", "AdminResolutor", "FechaResolucion", "NotaAdmin"],
    "TiposAmonestacion": ["TipoId", "Nombre", "Descripcion", "Gravedad",
      "AutoActivar", "CondicionAuto", "Estado", "CreadoPor", "FechaCreacion"],
    "Amonestaciones": ["AmonestacionId", "UsuarioTargetId", "UsuarioTargetNombre",
      "TipoId", "TipoNombre", "Descripcion", "CreadoPorId", "CreadoPorNombre",
      "Fecha", "Estado", "Origen"],
    "ConfigHorarios": ["Clave", "Valor"],
    "SolicitudesAnulacion": ["SolicitudId", "AmonestacionId", "CoordinadorId",
      "CoordinadorNombre", "Motivo", "Estado", "FechaSolicitud",
      "AdminResolutor", "FechaResolucion", "NotaAdmin"],
    "SolicitudesManuales": ["SolicitudId", "UsuarioId", "NombreUsuario", "Turno",
      "Institucion", "Tipo", "FechaSolicitud", "Estado", "ResolutorId",
      "FechaResolucion", "Motivo"],
    "HorariosClases": ["HorarioId", "UsuarioId", "NombreUsuario", "ImagenUrl",
      "CargaHorariaJson", "FechaSolicitud", "Estado", "ResolutorId",
      "FechaResolucion", "ComentarioResolutor", "TiempoGraciaMinutos"]
  };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultados = [];

  for (const [nombreHoja, columnasEsperadas] of Object.entries(ESTRUCTURA_ESPERADA)) {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      resultados.push({
        hoja: nombreHoja,
        estado: "FALTANTE",
        detalle: "La hoja no existe en el libro.",
        columnasEsperadas: columnasEsperadas.length,
        columnasActuales: 0,
        columnasFaltantes: columnasEsperadas,
        columnasExtra: [],
        filas: 0
      });
      continue;
    }

    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      resultados.push({
        hoja: nombreHoja,
        estado: "VACIA",
        detalle: "La hoja existe pero está vacía.",
        columnasEsperadas: columnasEsperadas.length,
        columnasActuales: 0,
        columnasFaltantes: columnasEsperadas,
        columnasExtra: [],
        filas: 0
      });
      continue;
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(h => String(h).trim());

    const faltantes = columnasEsperadas.filter(c => !headers.includes(c));
    const sobrantes = headers.filter(h => h && !columnasEsperadas.includes(h));
    const desordenadas = [];

    for (let i = 0; i < Math.min(headers.length, columnasEsperadas.length); i++) {
      if (headers[i] !== columnasEsperadas[i]) {
        desordenadas.push({ posicion: i + 1, esperada: columnasEsperadas[i], actual: headers[i] });
      }
    }

    resultados.push({
      hoja: nombreHoja,
      estado: (faltantes.length === 0 && sobrantes.length === 0 && desordenadas.length === 0) ? "OK" : "DISCREPANCIA",
      columnasFaltantes: faltantes,
      columnasExtra: sobrantes,
      columnasDesordenadas: desordenadas,
      columnasEsperadas: columnasEsperadas.length,
      columnasActuales: headers.filter(h => h).length,
      filas: Math.max(0, sheet.getLastRow() - 1)
    });
  }

  return resultados;
}

/**
 * Repara y estandariza la estructura de las hojas:
 * Reordena las columnas según el estándar canónico oficial SIN BORRAR DATOS,
 * creando hojas faltantes y preservando todos los registros.
 * @return {Object} Resumen de la reparación
 */
function repararEstructuraSheets() {
  return repararYEstandarizarSheetsConDatos();
}

/**
 * Normaliza un encabezado para comparación tolerante a tildes, mayúsculas y espacios.
 */
function normalizarEncabezado_(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Motor central de estandarización: Reordena encabezados y registros existentes
 * según la estructura canónica oficial SIN PERDER NINGUNA INFORMACIÓN.
 * @return {Object} Resumen de la operación
 */
function repararYEstandarizarSheetsConDatos() {
  const ESTRUCTURA_CANONICA = {
    "Usuarios": ["UserId", "Nombre", "Email", "Password", "Rol", "Cedula", "Institucion",
      "Telefono", "Direccion", "Turno", "Nacimiento", "FotoURL", "Estado", "AreasIds",
      "SubRol", "ToleranciaPersonalizadaMin", "FechaInclusion"],
    "Asistencias": ["Timestamp", "UserId", "Nombre", "Turno", "Institucion",
      "Tipo", "Latitud", "Longitud", "Estado", "DistanciaMetros"],
    "Guardias": ["FechaGuardia", "TurnoRequerido", "Descripcion", "CreadoPor",
      "Categoria", "Timestamp"],
    "Permisos": ["PermisoId", "UserId", "NombreUsuario", "FechaInicio", "FechaFin",
      "Tipo", "Estado", "Comentarios", "ResolutorId", "FechaResolucion"],
    "Suplencias": ["SubId", "TitularId", "TitularNombre", "SuplenteId", "SuplenteNombre",
      "FechaInicio", "FechaFin", "Turno", "Estado", "Comentarios", "HoraInicio",
      "HoraFin", "TimestampCreacion"],
    "CrossTurnos": ["CrossId", "Fecha", "User1Id", "User1Nombre", "User1Turno",
      "User2Id", "User2Nombre", "User2Turno", "Estado", "CreadoPor",
      "TimestampCreacion", "ResolutorId", "FechaResolucion"],
    "AreasTrabajoConfig": ["AreaId", "NombreArea", "FechaCreacion", "CreadoPor", "Estado"],
    "Auditoria": ["Timestamp", "UsuarioId", "NombreUsuario", "SubRol", "Accion",
      "Modulo", "DetalleObjeto", "Resultado", "AreasActor"],
    "PermisosRoles": ["ReglaId", "SubRol", "Modulo", "Accion", "Permitido",
      "CreadoPor", "FechaCreacion", "Descripcion"],
    "SolicitudesBaja": ["SolicitudId", "CoordinadorId", "CoordinadorNombre",
      "UsuarioTargetId", "UsuarioTargetNombre", "Motivo", "Estado",
      "FechaSolicitud", "AdminResolutor", "FechaResolucion", "NotaAdmin"],
    "TiposAmonestacion": ["TipoId", "Nombre", "Descripcion", "Gravedad",
      "AutoActivar", "CondicionAuto", "Estado", "CreadoPor", "FechaCreacion"],
    "Amonestaciones": ["AmonestacionId", "UsuarioTargetId", "UsuarioTargetNombre",
      "TipoId", "TipoNombre", "Descripcion", "CreadoPorId", "CreadoPorNombre",
      "Fecha", "Estado", "Origen"],
    "ConfigHorarios": ["Clave", "Valor"],
    "SolicitudesAnulacion": ["SolicitudId", "AmonestacionId", "CoordinadorId",
      "CoordinadorNombre", "Motivo", "Estado", "FechaSolicitud",
      "AdminResolutor", "FechaResolucion", "NotaAdmin"],
    "SolicitudesManuales": ["SolicitudId", "UsuarioId", "NombreUsuario", "Turno",
      "Institucion", "Tipo", "FechaSolicitud", "Estado", "ResolutorId",
      "FechaResolucion", "Motivo"],
    "HorariosClases": ["HorarioId", "UsuarioId", "NombreUsuario", "ImagenUrl",
      "CargaHorariaJson", "FechaSolicitud", "Estado", "ResolutorId",
      "FechaResolucion", "ComentarioResolutor", "TiempoGraciaMinutos"]
  };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reordenadas = [];
  const creadas = [];
  const detalles = [];

  for (const [nombreHoja, columnasEsperadas] of Object.entries(ESTRUCTURA_CANONICA)) {
    let sheet = ss.getSheetByName(nombreHoja);

    // 1. Si no existe la hoja, crearla
    if (!sheet) {
      inicializarHojaSegura_(nombreHoja);
      creadas.push(nombreHoja);
      detalles.push(`• Hoja [${nombreHoja}]: Creada con sus ${columnasEsperadas.length} columnas.`);
      continue;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    // 2. Si la hoja existe pero no tiene columnas o filas
    if (lastCol === 0 || lastRow === 0) {
      sheet.getRange(1, 1, 1, columnasEsperadas.length).setValues([columnasEsperadas]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, columnasEsperadas.length).setFontWeight("bold");
      creadas.push(nombreHoja);
      detalles.push(`• Hoja [${nombreHoja}]: Encabezados oficiales insertados.`);
      continue;
    }

    // 3. La hoja existe y tiene encabezados / datos
    const dataMatrix = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const oldHeaders = dataMatrix[0].map(h => String(h).trim());
    const dataRows = dataMatrix.slice(1);

    // Mapeo tolerante de encabezados existentes
    const oldColMap = {};
    oldHeaders.forEach((h, idx) => {
      const norm = normalizarEncabezado_(h);
      if (norm && oldColMap[norm] === undefined) {
        oldColMap[norm] = idx;
      }
    });

    // Columnas finales = Canónicas requeridas + Cualquier columna extra previa (para jamás perder datos)
    const finalHeaders = [...columnasEsperadas];
    oldHeaders.forEach((h) => {
      const norm = normalizarEncabezado_(h);
      const esCanonico = columnasEsperadas.some(c => normalizarEncabezado_(c) === norm);
      if (!esCanonico && h) {
        finalHeaders.push(h);
      }
    });

    // Reordenar cada fila respetando los datos originales
    const newMatrix = [finalHeaders];
    for (let r = 0; r < dataRows.length; r++) {
      const oldRow = dataRows[r];
      const newRow = [];
      for (let c = 0; c < finalHeaders.length; c++) {
        const headerName = finalHeaders[c];
        const norm = normalizarEncabezado_(headerName);
        const oldIdx = oldColMap[norm];
        if (oldIdx !== undefined && oldIdx < oldRow.length) {
          newRow.push(oldRow[oldIdx]);
        } else {
          newRow.push("");
        }
      }
      newMatrix.push(newRow);
    }

    // Limpiar contenido previo y escribir la matriz reordenada
    const maxCols = Math.max(lastCol, finalHeaders.length);
    const maxRows = Math.max(lastRow, newMatrix.length);
    sheet.getRange(1, 1, maxRows, maxCols).clearContent();
    sheet.getRange(1, 1, newMatrix.length, finalHeaders.length).setValues(newMatrix);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, finalHeaders.length).setFontWeight("bold");

    reordenadas.push(nombreHoja);
    detalles.push(`• Hoja [${nombreHoja}]: ${dataRows.length} registros conservados, ${finalHeaders.length} columnas ordenadas.`);
  }

  // Limpiar cachés del sistema para reflejar inmediatamente las columnas
  try {
    CACHE.remove('users_data');
    CACHE.remove('all_users_for_admin');
    CACHE.remove('open_sessions');
    _requestCache.clear();
  } catch (e) { }

  return {
    success: true,
    total: Object.keys(ESTRUCTURA_CANONICA).length,
    reordenadas: reordenadas,
    creadas: creadas,
    detalles: detalles,
    mensaje: `Se reordenaron ${reordenadas.length} hojas y se preservaron todos los datos intactos. Hojas creadas: ${creadas.length}.`
  };
}

/**
 * Inicializa una hoja por nombre usando las funciones lazy existentes del sistema.
 * @param {string} nombreHoja - Nombre de la hoja a crear
 */
function inicializarHojaSegura_(nombreHoja) {
  const LAZY_MAP = {
    "AreasTrabajoConfig": getAreasSheet_,
    "Auditoria": getAuditSheet_,
    "PermisosRoles": getPermisosRolesSheet_,
    "TiposAmonestacion": getTiposAmonestacionSheet_,
    "Amonestaciones": getAmonestacionesSheet_,
    "ConfigHorarios": getConfigHorariosSheet_,
    "SolicitudesAnulacion": getSolicitudesAnulacionSheet_,
    "SolicitudesManuales": getManualRequestsSheet_,
    "HorariosClases": getHorariosClasesSheet_,
    "SolicitudesBaja": getDeleteRequestsSheet_
  };

  if (LAZY_MAP[nombreHoja]) {
    LAZY_MAP[nombreHoja]();
  } else {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      sheet = ss.insertSheet(nombreHoja);
    }
    if (sheet.getLastRow() === 0) {
      const ESTRUCTURA = {
        "Usuarios": ["UserId", "Nombre", "Email", "Password", "Rol", "Cedula", "Institucion", "Telefono", "Direccion", "Turno", "Nacimiento", "FotoURL", "Estado", "AreasIds", "SubRol", "ToleranciaPersonalizadaMin", "FechaInclusion"],
        "Asistencias": ["Timestamp", "UserId", "Nombre", "Turno", "Institucion", "Tipo", "Latitud", "Longitud", "Estado", "DistanciaMetros"],
        "Guardias": ["FechaGuardia", "TurnoRequerido", "Descripcion", "CreadoPor", "Categoria", "Timestamp"],
        "Permisos": ["PermisoId", "UserId", "NombreUsuario", "FechaInicio", "FechaFin", "Tipo", "Estado", "Comentarios", "ResolutorId", "FechaResolucion"],
        "Suplencias": ["SubId", "TitularId", "TitularNombre", "SuplenteId", "SuplenteNombre", "FechaInicio", "FechaFin", "Turno", "Estado", "Comentarios", "HoraInicio", "HoraFin", "TimestampCreacion"],
        "CrossTurnos": ["CrossId", "Fecha", "User1Id", "User1Nombre", "User1Turno", "User2Id", "User2Nombre", "User2Turno", "Estado", "CreadoPor", "TimestampCreacion", "ResolutorId", "FechaResolucion"]
      };
      if (ESTRUCTURA[nombreHoja]) {
        sheet.appendRow(ESTRUCTURA[nombreHoja]);
      }
      sheet.setFrozenRows(1);
    }
    Logger.log(`[Estandarización] Hoja creada/inicializada: ${nombreHoja}`);
  }
}

// =======================================================
// ===== FASE 4: DIAGNÓSTICO DEL SISTEMA =================
// =======================================================

/**
 * Función de diagnóstico integral que verifica la salud del sistema.
 * Solo accesible para SuperAdmin.
 * @return {Object} Resultado completo del diagnóstico
 */
function diagnosticoDelSistema() {
  const resultados = {
    timestamp: new Date().toISOString(),
    hojas: {},
    triggers: [],
    cache: {},
    errores: []
  };

  // 1. Inventario de hojas
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  sheets.forEach(function (s) {
    resultados.hojas[s.getName()] = {
      filas: s.getLastRow(),
      columnas: s.getLastColumn()
    };
  });

  // 2. Triggers activos
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    resultados.triggers.push({
      funcion: t.getHandlerFunction(),
      tipo: String(t.getEventType()),
      fuente: String(t.getTriggerSource())
    });
  });

  // 3. Test de caché
  const testKey = '_dx_' + Date.now();
  CACHE.put(testKey, 'ok', 10);
  resultados.cache.funcionando = (CACHE.get(testKey) === 'ok');
  CACHE.remove(testKey);

  // 4. Verificar hojas requeridas
  const hojasRequeridas = [
    "Usuarios", "Asistencias", "Guardias", "Permisos", "Suplencias",
    "CrossTurnos", "AreasTrabajoConfig", "Auditoria", "PermisosRoles",
    "SolicitudesBaja", "TiposAmonestacion", "Amonestaciones",
    "ConfigHorarios", "SolicitudesAnulacion", "SolicitudesManuales",
    "HorariosClases"
  ];
  hojasRequeridas.forEach(function (nombre) {
    if (!ss.getSheetByName(nombre)) {
      resultados.errores.push("Hoja faltante: " + nombre);
    }
  });

  // 5. Verificar que los triggers esenciales estén instalados
  const funcionesEsenciales = ['autoCloseOpenAttendances', 'checkAusenciasInjustificadas'];
  const triggerFunciones = resultados.triggers.map(t => t.funcion);
  funcionesEsenciales.forEach(function (fn) {
    if (!triggerFunciones.includes(fn)) {
      resultados.errores.push("Trigger faltante: " + fn);
    }
  });

  return resultados;
}

// =======================================================
// ===== FASE 5: SEGURIDAD — HASHING DE CONTRASEÑAS ======
// =======================================================

/**
 * Genera un hash SHA-256 con salt para almacenamiento seguro de contraseñas.
 * @param {string} password - Contraseña en texto plano
 * @param {string} [salt] - Salt opcional (se genera automáticamente si no se provee)
 * @return {string} Hash en formato "salt:hashHex"
 */
function hashPassword(password, salt) {
  if (!password) return "";
  if (typeof password === 'string' && password.includes(':') && password.split(':')[0].length === 16) {
    return password;
  }
  if (!salt) {
    salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  }
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password,
    Utilities.Charset.UTF_8
  );
  const hashHex = rawHash.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
  return salt + ':' + hashHex;
}

/**
 * Verifica una contraseña contra su hash almacenado.
 * Compatible hacia atrás con contraseñas en texto plano (para migración gradual).
 * @param {string} password - Contraseña ingresada por el usuario
 * @param {string} storedHash - Hash almacenado en la hoja Usuarios
 * @return {boolean} true si la contraseña es correcta
 */
function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!String(storedHash).includes(':')) {
    // Compatibilidad: contraseña en texto plano (pre-migración)
    return String(password) === String(storedHash);
  }
  const salt = String(storedHash).split(':')[0];
  return hashPassword(String(password), salt) === String(storedHash);
}

/**
 * EJECUTAR UNA SOLA VEZ: Migra todas las contraseñas en texto plano a hashes SHA-256+Salt.
 * Ejecutar desde el editor de Apps Script como función independiente.
 * @return {Object} Resultado de la migración
 */
function migrarContrasenasAHash() {
  const sheet = USERS_SHEET;
  const data = sheet.getDataRange().getValues();
  let migradas = 0;
  let yaHasheadas = 0;
  let errores = 0;

  for (let i = 1; i < data.length; i++) {
    const password = String(data[i][3] || ''); // Columna Password (índice 3)
    if (!password) continue;

    if (password.includes(':') && password.split(':')[0].length === 16) {
      yaHasheadas++;
      continue; // Ya está hasheada
    }

    try {
      const hashed = hashPassword(password);
      sheet.getRange(i + 1, 4).setValue(hashed);
      migradas++;
    } catch (e) {
      Logger.log(`[Migración Hash] Error en fila ${i + 1}: ${e.message}`);
      errores++;
    }
  }

  Logger.log(`[Migración Hash] Completada: ${migradas} migradas, ${yaHasheadas} ya hasheadas, ${errores} errores.`);
  return {
    success: true,
    migradas: migradas,
    yaHasheadas: yaHasheadas,
    errores: errores,
    mensaje: `Migración completada: ${migradas} contraseñas hasheadas correctamente.`
  };
}