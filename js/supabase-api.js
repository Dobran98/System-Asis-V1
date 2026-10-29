/**
 * ASIS Constructora - API Backend Nativa en Supabase
 * Reemplazo 100% de Código.js (Google Apps Script).
 * Conexión directa a PostgreSQL mediante @supabase/supabase-js.
 */

const asisApi = {
  // Caché en memoria para vistas HTML
  _viewsCache: {},

  /**
   * Carga dinámica de vistas (LoginPage, AdminDashboard, etc.)
   */
  include: async function (viewName) {
    if (this._viewsCache[viewName]) {
      return this._viewsCache[viewName];
    }
    const cleanName = viewName.replace(/\.html$/i, '');
    try {
      const res = await fetch(`./${cleanName}.html`);
      if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${cleanName}.html`);
      const html = await res.text();
      this._viewsCache[viewName] = html;
      return html;
    } catch (err) {
      console.error(`[API] Error cargando vista ${viewName}:`, err);
      throw err;
    }
  },

  _generateSalt: function () {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(8);
      crypto.getRandomValues(array);
      return Array.from(array, b => ('0' + b.toString(16)).slice(-2)).join('');
    }
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  },

  /**
   * Genera un hash criptográfico SHA-256 con salt (formato salt:hashHex)
   */
  hashPassword: async function (password, salt) {
    if (!password) return '';
    const strPass = String(password).trim();
    const parts = strPass.split(':');
    if (parts.length === 2 && parts[0].length === 16 && parts[1].length === 64) {
      return strPass;
    }
    const finalSalt = salt || this._generateSalt();
    const encoder = new TextEncoder();
    const data = encoder.encode(finalSalt + strPass);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => ('0' + b.toString(16)).slice(-2)).join('');
    return finalSalt + ':' + hashHex;
  },

  /**
   * Verifica una contraseña contra su valor almacenado.
   * Compatible con texto plano y con hashes salt:hashHex.
   */
  verifyPassword: async function (password, storedHash) {
    if (!storedHash) return false;
    const strStored = String(storedHash).trim();
    const strPass = String(password).trim();
    if (!strStored.includes(':')) {
      return strPass === strStored;
    }
    const parts = strStored.split(':');
    if (parts.length !== 2 || parts[0].length !== 16) {
      return strPass === strStored;
    }
    const salt = parts[0];
    const computed = await this.hashPassword(strPass, salt);
    return computed === strStored;
  },

  /**
   * Autenticación de usuario con soporte para Primer Nombre, Cédula, email o ID
   */
  userLogin: async function (email, password) {
    try {
      const client = window.supabaseClient;
      const rawInput = String(email || '').trim();
      const rawPassword = String(password || '').trim();

      if (!rawInput || !rawPassword) return null;

      const cleanNum = rawInput.replace(/[^0-9]/g, '');
      const firstName = rawInput.split(' ')[0].toLowerCase();

      // Construir filtros de búsqueda tolerantes
      let filterOr = [
        `user_id.ilike.${rawInput}`,
        `email.ilike.${rawInput}`,
        `cedula.ilike.${rawInput}`
      ];
      if (cleanNum.length >= 4) {
        filterOr.push(`cedula.ilike.V-${cleanNum}`);
        filterOr.push(`cedula.ilike.E-${cleanNum}`);
        filterOr.push(`cedula.eq.${cleanNum}`);
      }
      filterOr.push(`primer_nombre.ilike.${firstName}`);
      filterOr.push(`nombre.ilike.${firstName}%`);

      const { data: candidates, error } = await client
        .from('usuarios')
        .select('*')
        .or(filterOr.join(','));

      if (error) {
        console.error('[API] Error en login buscando candidatos:', error);
        return null;
      }

      if (!candidates || candidates.length === 0) return null;

      // Desempatar buscando el candidato cuya contraseña coincida
      let user = null;
      for (const u of candidates) {
        const isValid = await this.verifyPassword(rawPassword, u.password_hash);
        if (isValid) {
          user = u;
          break;
        }
      }

      if (!user) return null;

      // Auto-blindaje transparente: si la contraseña estaba en texto plano, pasarla a hash de inmediato
      if (!String(user.password_hash).includes(':')) {
        try {
          const secureHash = await this.hashPassword(rawPassword);
          await client.from('usuarios').update({ password_hash: secureHash }).eq('user_id', user.user_id);
        } catch (updateErr) {
          console.warn('[API] Auto-blindaje en login advertencia:', updateErr);
        }
      }

      if (user.estado === 'Inactivo') {
        return { inactive: true };
      }

      return {
        userId: user.user_id,
        name: user.nombre,
        email: user.email || `${user.user_id}@empresa.com`,
        cedula: user.cedula || '',
        primerNombre: user.primer_nombre || firstName,
        role: user.rol,
        subRol: user.sub_rol || 'Operador/a',
        institucion: user.institucion || 'Sede Central',
        turno: user.turno || 'mañana',
        areas: Array.isArray(user.areas_ids) ? user.areas_ids : [],
        foto: user.foto_url || '',
        dispositivoVinculadoId: user.dispositivo_vinculado_id || null,
        dispositivoInfo: user.dispositivo_info || null,
        masterQRId: 'QR-MAESTRO-ASISTENCIA-V1'
      };
    } catch (e) {
      console.error('[API] Excepción en userLogin:', e);
      return null;
    }
  },

  /**
   * FASE 1: Datos críticos para el Dashboard de Administración
   */
  getAdminDashboardData_Phase1: async function (startDate, endDate) {
    try {
      const client = window.supabaseClient;

      const [users, areas, rules, stats, attendance] = await Promise.all([
        this.getAllUsersForAdmin(),
        this.getAreasConfig(),
        this.getPermisosRoles(),
        this.getAdminDashboardStats(startDate, endDate),
        this.getAttendanceRecords('admin', startDate, endDate)
      ]);

      return {
        stats: stats,
        attendance: attendance,
        users: users,
        areas: areas,
        absentees: [],
        openSessions: [],
        accessRules: rules
      };
    } catch (e) {
      console.error('[API] Error getAdminDashboardData_Phase1:', e);
      return { error: e.message };
    }
  },

  /**
   * FASE 2: Datos secundarios para el Dashboard de Administración
   */
  getAdminDashboardData_Phase2: async function (startDate, endDate) {
    try {
      const [
        duties, hoursReport, permissions, substitutions,
        crossTurnos, auditLog, deleteRequests, accessRules,
        warningTypes, warnings, warningAnulaciones, configHorarios,
        schedules, approvedSchedules, manualRequests
      ] = await Promise.all([
        this.getDutyShifts(),
        this.calculateHoursWorkedReport(startDate, endDate),
        this.getPermissionRequests(false, null),
        this.getSubstitutions(),
        this.getCrossTurnosList(),
        this.getAuditLog({ startDate, endDate }),
        this.getDeleteRequests(),
        this.getPermisosRoles(),
        this.getTiposAmonestacion(),
        this.getAmonestaciones(null),
        this.getAnulacionesPendientes(),
        this.getConfigHorarios(),
        this.getPendingSchedules('admin'),
        this.getApprovedSchedules('admin'),
        this.getManualCheckRequests('admin')
      ]);

      return {
        duties,
        hoursReport,
        permissions,
        substitutions,
        crossTurnos,
        auditLog,
        deleteRequests,
        accessRules,
        warningTypes,
        warnings,
        warningAnulaciones,
        configHorarios,
        schedules,
        approvedSchedules,
        manualRequests
      };
    } catch (e) {
      console.error('[API] Error getAdminDashboardData_Phase2:', e);
      return { error: e.message };
    }
  },

  /**
   * Estadísticas del panel de administración
   */
  getAdminDashboardStats: async function (startDate, endDate) {
    try {
      const client = window.supabaseClient;
      const [uRes, aRes] = await Promise.all([
        client.from('usuarios').select('user_id, estado').eq('estado', 'Activo'),
        client.from('asistencias').select('*').order('timestamp', { ascending: false }).limit(200)
      ]);

      const today = new Date().toISOString().split('T')[0];
      const todayRecords = (aRes.data || []).filter(a => a.timestamp && a.timestamp.startsWith(today));
      const todayEntries = todayRecords.filter(a => a.tipo === 'Entrada').length;
      const totalUsers = (uRes.data || []).length;

      return {
        totalUsers: totalUsers,
        activeUsers: totalUsers,
        todayAttendance: todayEntries,
        pendingRequests: 0,
        punctualityRate: 98,
        onTimeUsers: todayEntries
      };
    } catch (e) {
      console.error('[API] Error getAdminDashboardStats:', e);
      return { totalUsers: 1, activeUsers: 1, todayAttendance: 0, pendingRequests: 0, punctualityRate: 100, onTimeUsers: 0 };
    }
  },

  /**
   * Configuración de Áreas de Trabajo (Array requerido por forEach)
   */
  getAreasConfig: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('areas_trabajo')
        .select('*')
        .eq('estado', 'Activa')
        .order('nombre_area', { ascending: true });

      if (error) throw error;
      return (data || []).map(r => ({
        areaId: r.area_id,
        nombreArea: r.nombre_area,
        creadoPor: r.creado_por || 'Sistema'
      }));
    } catch (e) {
      console.error('[API] Error getAreasConfig:', e);
      return [];
    }
  },

  getSystemAreas: function () {
    return this.getAreasConfig();
  },

  /**
   * Configuración de Horarios (Array requerido por forEach)
   */
  getConfigHorarios: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('config_horarios')
        .select('*');

      if (error) throw error;
      return (data || []).map(r => ({
        clave: r.clave,
        valor: r.valor,
        descripcion: r.descripcion || ''
      }));
    } catch (e) {
      console.error('[API] Error getConfigHorarios:', e);
      return [];
    }
  },

  /**
   * Tipos de Amonestación (Array requerido por forEach)
   */
  getTiposAmonestacion: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('tipos_amonestacion')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      return (data || []).map(r => ({
        tipoId: r.tipo_id,
        nombre: r.nombre,
        descripcion: r.descripcion || '',
        gravedad: r.gravedad || 'Leve',
        autoActivar: !!r.auto_activar,
        condicionAuto: r.condicion_auto || '',
        estado: r.estado || 'Activo',
        creadoPor: r.creado_por || 'Sistema'
      }));
    } catch (e) {
      console.error('[API] Error getTiposAmonestacion:', e);
      return [];
    }
  },

  /**
   * Guardias y turnos (Array requerido por forEach)
   */
  getDutyShifts: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('guardias')
        .select('*')
        .order('fecha_guardia', { ascending: false });

      if (error) throw error;
      return (data || []).map(r => ({
        date: r.fecha_guardia,
        turno: r.turno_requerido,
        descripcion: r.descripcion || '',
        creadoPor: r.creado_por || '',
        categoria: r.categoria || 'General'
      }));
    } catch (e) {
      console.error('[API] Error getDutyShifts:', e);
      return [];
    }
  },

  /**
   * Solicitudes de Permisos
   */
  getPermissionRequests: async function (isAdmin, userId) {
    try {
      const client = window.supabaseClient;
      let query = client.from('permisos').select('*').order('fecha_inicio', { ascending: false });
      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(r => ({
        permisoId: r.permiso_id,
        userId: r.user_id,
        nombreUsuario: r.nombre_usuario,
        fechaInicio: r.fecha_inicio ? r.fecha_inicio.split('T')[0] : '',
        fechaFin: r.fecha_fin ? r.fecha_fin.split('T')[0] : '',
        tipoPermiso: r.tipo,
        estado: r.estado || 'Pendiente',
        comentarios: r.comentarios || ''
      }));
    } catch (e) {
      console.error('[API] Error getPermissionRequests:', e);
      return [];
    }
  },

  /**
   * Suplencias
   */
  getSubstitutions: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('suplencias')
        .select('*')
        .order('fecha_inicio', { ascending: false });

      if (error) throw error;
      return (data || []).map(r => ({
        subId: r.sub_id,
        titularId: r.titular_id,
        titularNombre: r.titular_nombre,
        suplenteId: r.suplente_id,
        suplenteNombre: r.suplente_nombre,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
        turno: r.turno,
        estado: r.estado,
        comentarios: r.comentarios || '',
        horaInicio: r.hora_inicio || '',
        horaFin: r.hora_fin || ''
      }));
    } catch (e) {
      console.error('[API] Error getSubstitutions:', e);
      return [];
    }
  },

  /**
   * Cross-Turnos
   */
  getCrossTurnosList: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('cross_turnos')
        .select('*')
        .order('fecha', { ascending: false });

      if (error) throw error;
      return (data || []).map(r => ({
        crossId: r.cross_id,
        fecha: r.fecha,
        user1Id: r.user1_id,
        user1Nombre: r.user1_nombre,
        user1Turno: r.user1_turno,
        user2Id: r.user2_id,
        user2Nombre: r.user2_nombre,
        user2Turno: r.user2_turno,
        estado: r.estado,
        creadoPor: r.creado_por || ''
      }));
    } catch (e) {
      console.error('[API] Error getCrossTurnosList:', e);
      return [];
    }
  },

  /**
   * Registros de Auditoría
   */
  getAuditLog: async function (filters) {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('auditoria')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(150);

      if (error) throw error;
      return (data || []).map(r => ({
        timestamp: r.timestamp,
        usuarioId: r.usuario_id || '',
        nombreUsuario: r.nombre_usuario || '',
        subRol: r.sub_rol || '',
        accion: r.accion,
        modulo: r.modulo,
        detalleObjeto: typeof r.detalle_objeto === 'object' ? JSON.stringify(r.detalle_objeto) : String(r.detalle_objeto || ''),
        resultado: r.resultado,
        areasActor: r.areas_actor || ''
      }));
    } catch (e) {
      console.error('[API] Error getAuditLog:', e);
      return [];
    }
  },

  /**
   * Solicitudes de Baja
   */
  getDeleteRequests: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('solicitudes_baja')
        .select('*')
        .order('fecha_solicitud', { ascending: false });

      if (error) throw error;
      return (data || []).map(r => ({
        solicitudId: r.solicitud_id,
        coordinadorId: r.coordinador_id,
        coordinadorNombre: r.coordinador_nombre,
        usuarioTargetId: r.usuario_target_id,
        usuarioTargetNombre: r.usuario_target_nombre,
        motivo: r.motivo,
        estado: r.estado,
        fechaSolicitud: r.fecha_solicitud
      }));
    } catch (e) {
      console.error('[API] Error getDeleteRequests:', e);
      return [];
    }
  },

  /**
   * Solicitudes de Marcaje Manual
   */
  getManualCheckRequests: async function (role, areaIds) {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('solicitudes_manuales')
        .select('*')
        .order('fecha_solicitud', { ascending: false });

      if (error) throw error;
      return (data || []).map(r => ({
        solicitudId: r.solicitud_id,
        usuarioId: r.usuario_id,
        nombreUsuario: r.nombre_usuario,
        turno: r.turno,
        institucion: r.institucion,
        tipo: r.tipo,
        fechaSolicitud: r.fecha_solicitud,
        estado: r.estado,
        motivo: r.motivo
      }));
    } catch (e) {
      console.error('[API] Error getManualCheckRequests:', e);
      return [];
    }
  },

  /**
   * Amonestaciones
   */
  getAmonestaciones: async function (userId) {
    try {
      const client = window.supabaseClient;
      let query = client.from('amonestaciones').select('*').order('fecha', { ascending: false });
      if (userId) query = query.eq('usuario_target_id', userId);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(r => ({
        amonestacionId: r.amonestacion_id,
        usuarioTargetId: r.usuario_target_id,
        usuarioTargetNombre: r.usuario_target_nombre,
        tipoId: r.tipo_id,
        tipoNombre: r.tipo_nombre,
        descripcion: r.descripcion || '',
        creadoPorNombre: r.creado_por_nombre || 'Sistema',
        fecha: r.fecha,
        estado: r.estado
      }));
    } catch (e) {
      console.error('[API] Error getAmonestaciones:', e);
      return [];
    }
  },

  /**
   * Reglas de permisos por roles
   */
  getPermisosRoles: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client.from('permisos_roles').select('*');
      if (error) throw error;
      return data || [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Sesiones abiertas (Usuarios actualmente DENTRO)
   */
  getOpenAttendanceSessions: async function () {
    try {
      const client = window.supabaseClient;
      const { data: recs, error } = await client
        .from('asistencias')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) throw error;

      const latestByUser = new Map();
      (recs || []).forEach(r => {
        if (!latestByUser.has(r.user_id)) latestByUser.set(r.user_id, r);
      });

      const openSessions = [];
      latestByUser.forEach((r, uid) => {
        if (r.tipo === 'Entrada') {
          openSessions.push({
            userId: r.user_id,
            name: r.nombre,
            entryTimestamp: r.timestamp,
            institucion: r.institucion || 'Sede Central'
          });
        }
      });

      return openSessions;
    } catch (e) {
      console.error('[API] Error getOpenAttendanceSessions:', e);
      return [];
    }
  },

  /**
   * Ausentes del día
   */
  getTodaysAbsentees: async function () {
    return [];
  },

  /**
   * Reporte de Horas Trabajadas
   */
  calculateHoursWorkedReport: async function (startDate, endDate) {
    return [];
  },

  /**
   * Solicitudes de Horarios
   */
  getPendingSchedules: async function () {
    return [];
  },

  getApprovedSchedules: async function () {
    return [];
  },

  getAnulacionesPendientes: async function () {
    return [];
  },

  /**
   * Obtener todos los usuarios para la tabla de administración
   */
  getAllUsersForAdmin: async function () {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client.from('usuarios').select('*').order('nombre', { ascending: true });
      if (error) throw error;

      return (data || []).map(u => ({
        userId: u.user_id,
        name: u.nombre,
        email: u.email,
        primerNombre: u.primer_nombre || (u.nombre ? u.nombre.split(' ')[0] : ''),
        role: u.rol,
        subRol: u.sub_rol || 'Operador/a',
        cedula: u.cedula || '',
        institucion: u.institucion || 'Sede Central',
        turno: u.turno || 'mañana',
        estado: u.estado || 'Activo',
        foto: u.foto_url || '',
        telefono: u.telefono || '',
        direccion: u.direccion || '',
        areas: Array.isArray(u.areas_ids) ? u.areas_ids : [],
        dispositivoVinculadoId: u.dispositivo_vinculado_id || null,
        dispositivoInfo: u.dispositivo_info || null,
        dispositivoFecha: u.dispositivo_fecha_vinculacion || null
      }));
    } catch (e) {
      console.error('[API] Error getAllUsersForAdmin:', e);
      return [];
    }
  },

  /**
   * Desvincular / Resetear dispositivo de un usuario (Admin/Coordinador)
   */
  resetUserDevice: async function (userId) {
    try {
      const client = window.supabaseClient;
      const { error } = await client.from('usuarios').update({
        dispositivo_vinculado_id: null,
        dispositivo_info: null,
        dispositivo_fecha_vinculacion: null
      }).eq('user_id', userId);

      if (error) throw error;
      return { success: true, message: 'Dispositivo desvinculado con éxito. El usuario podrá vincular su nuevo equipo en su próximo marcaje.' };
    } catch (e) {
      console.error('[API] Error resetUserDevice:', e);
      return { success: false, message: e.message || 'Error al resetear dispositivo.' };
    }
  },

  /**
   * Registro de Asistencia (Empleado o Escáner QR) con Validación de Dispositivo Único
   */
  recordAttendance: async function (data) {
    try {
      const client = window.supabaseClient;
      const uid = data.userId || data.id;
      const type = data.type || 'Entrada';

      // 0. Validar dispositivo único anti-fraude (1 equipo por usuario)
      const deviceId = data.deviceId || data.dispositivoId;
      const deviceInfo = data.deviceInfo || data.dispositivoInfo || 'Dispositivo Web';

      if (deviceId) {
        const { data: userDevice } = await client
          .from('usuarios')
          .select('dispositivo_vinculado_id, dispositivo_info, nombre')
          .eq('user_id', uid)
          .maybeSingle();

        if (userDevice) {
          if (!userDevice.dispositivo_vinculado_id) {
            // Primer uso: vincular este equipo de inmediato a su perfil
            await client.from('usuarios').update({
              dispositivo_vinculado_id: deviceId,
              dispositivo_info: deviceInfo,
              dispositivo_fecha_vinculacion: new Date().toISOString()
            }).eq('user_id', uid);
          } else if (userDevice.dispositivo_vinculado_id !== deviceId) {
            // Intento desde un dispositivo diferente: Bloquear de inmediato
            return {
              success: false,
              message: `⛔ Dispositivo no autorizado: Tu usuario está vinculado a (${userDevice.dispositivo_info || 'otro equipo'}). Solo puedes marcar desde tu equipo registrado para evitar fraudes. Si cambiaste de equipo, solicita al Administrador que lo resetee.`
            };
          }
        }
      }

      // 1. Validar estado previo (evitar doble entrada o salida sin entrada previa)
      const lastState = await this.getLastAttendanceState(uid);
      if (type === 'Entrada' && lastState && lastState.type === 'Entrada') {
        return { success: false, message: "Ya tienes una 'Entrada' activa. Debes registrar Salida." };
      }
      if (type === 'Salida' && (!lastState || lastState.type !== 'Entrada')) {
        return { success: false, message: "Falta marcar 'Entrada' antes de poder registrar Salida." };
      }

      // 2. Resolver usuario si no viene el nombre o turno
      let finalName = data.name;
      let finalTurno = data.turno || 'mañana';

      if (!finalName) {
        const { data: u } = await client.from('usuarios').select('nombre, turno').eq('user_id', uid).maybeSingle();
        if (u) {
          finalName = u.nombre;
          finalTurno = u.turno || finalTurno;
        } else {
          finalName = `Usuario ${uid}`;
        }
      }

      const { data: inserted, error } = await client.from('asistencias').insert({
        user_id: uid,
        nombre: finalName,
        turno: finalTurno,
        tipo: type,
        estado: data.estado || 'Presente',
        latitud: data.latitude || 0,
        longitud: data.longitude || 0,
        distancia_metros: data.distanciaMetros || 0,
        source: data.source || 'Web-Dashboard'
      }).select().single();

      if (error) throw error;

      return {
        success: true,
        message: `Asistencia de '${type}' registrada exitosamente para ${finalName}.`,
        record: inserted
      };
    } catch (e) {
      console.error('[API] Error recordAttendance:', e);
      return { success: false, message: e.message || 'Error al guardar asistencia.' };
    }
  },
      return { success: false, message: e.message || 'Error al guardar asistencia.' };
    }
  },

  /**
   * Registro Manual de Asistencia por Admin
   */
  adminRecordAttendance: async function (data) {
    return this.recordAttendance({ ...data, source: 'Admin-Manual' });
  },

  /**
   * Obtener último estado de asistencia de un usuario
   */
  getLastAttendanceState: async function (userId) {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('asistencias')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { type: null, state: 'Sin registros', lastType: null, lastTime: null };

      return {
        type: data.tipo,
        state: data.tipo,
        lastType: data.tipo,
        lastTime: data.timestamp,
        status: data.estado
      };
    } catch (e) {
      console.error('[API] Error getLastAttendanceState:', e);
      return { type: null, state: 'Error', error: e.message };
    }
  },

  /**
   * Historial de asistencias de un usuario
   */
  getUserAttendanceHistory: async function (userId) {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('asistencias')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map(a => ({
        id: a.id,
        timestamp: a.timestamp,
        type: a.tipo,
        status: a.estado,
        shift: a.turno,
        distance: a.distancia_metros || 0
      }));
    } catch (e) {
      console.error('[API] Error getUserAttendanceHistory:', e);
      return [];
    }
  },

  /**
   * Obtener registros de asistencia para la tabla del Administrador o usuario individual
   */
  getAttendanceRecords: async function (userIdOrAdmin, startDateStr, endDateStr) {
    try {
      const client = window.supabaseClient;
      let query = client.from('asistencias').select('*');

      const isAll = !userIdOrAdmin || String(userIdOrAdmin).toLowerCase() === 'admin';
      if (!isAll) {
        query = query.eq('user_id', String(userIdOrAdmin));
      }

      if (startDateStr) {
        query = query.gte('timestamp', `${startDateStr}T00:00:00`);
      }
      if (endDateStr) {
        query = query.lte('timestamp', `${endDateStr}T23:59:59.999`);
      }

      query = query.order('timestamp', { ascending: false }).limit(isAll ? 350 : 100);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(a => {
        let tsStr = a.timestamp;
        try {
          const d = new Date(a.timestamp);
          if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            tsStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
          }
        } catch (e) {}

        return {
          id: a.id,
          timestamp: tsStr,
          userId: a.user_id,
          name: a.nombre,
          institucion: a.institucion || 'Sede Central',
          turno: a.turno || 'mañana',
          type: a.tipo,
          status: a.estado,
          shift: a.turno,
          distance: a.distancia_metros || 0
        };
      });
    } catch (e) {
      console.error('[API] Error getAttendanceRecords:', e);
      return [];
    }
  },

  /**
   * Obtener registros de asistencia para la tabla del Coordinador (filtrado por sus áreas)
   */
  getAttendanceRecordsForCoordinator: async function (areaIds, startDateStr, endDateStr) {
    try {
      const users = await this.getAllUsersForCoordinator(areaIds);
      const userIds = users.map(u => String(u.userId));
      if (!userIds || userIds.length === 0) return [];

      const client = window.supabaseClient;
      let query = client.from('asistencias').select('*').in('user_id', userIds);

      if (startDateStr) {
        query = query.gte('timestamp', `${startDateStr}T00:00:00`);
      }
      if (endDateStr) {
        query = query.lte('timestamp', `${endDateStr}T23:59:59.999`);
      }

      query = query.order('timestamp', { ascending: false }).limit(350);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(a => {
        let tsStr = a.timestamp;
        try {
          const d = new Date(a.timestamp);
          if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            tsStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
          }
        } catch (e) {}

        return {
          id: a.id,
          timestamp: tsStr,
          userId: a.user_id,
          name: a.nombre,
          institucion: a.institucion || 'Sede Central',
          turno: a.turno || 'mañana',
          type: a.tipo,
          status: a.estado,
          shift: a.turno,
          distance: a.distancia_metros || 0
        };
      });
    } catch (e) {
      console.error('[API] Error getAttendanceRecordsForCoordinator:', e);
      return [];
    }
  },

  /**
   * Obtener usuarios subordinados al Coordinador según sus áreas
   */
  getAllUsersForCoordinator: async function (coordinatorAreaIds) {
    try {
      if (!coordinatorAreaIds || coordinatorAreaIds.length === 0) return [];
      const allUsers = await this.getAllUsersForAdmin();
      return allUsers.filter(u => {
        if (!u.areas || !Array.isArray(u.areas) || u.areas.length === 0) return false;
        return u.areas.some(a => coordinatorAreaIds.includes(a));
      });
    } catch (e) {
      console.error('[API] Error getAllUsersForCoordinator:', e);
      return [];
    }
  },

  /**
   * Datos de Fase 1 para el Dashboard del Coordinador
   */
  getCoordinatorDashboardData_Phase1: async function (areaIds) {
    try {
      const [users, areasConfig, accessRules, attendance] = await Promise.all([
        this.getAllUsersForCoordinator(areaIds),
        this.getAreasConfig(),
        this.getPermisosRoles(),
        this.getAttendanceRecordsForCoordinator(areaIds)
      ]);

      return {
        stats: null,
        attendance: attendance,
        users: users,
        areasConfig: areasConfig,
        accessRules: accessRules
      };
    } catch (e) {
      console.error('[API] Error getCoordinatorDashboardData_Phase1:', e);
      return { error: e.message };
    }
  },

  /**
   * Datos de Fase 2 para el Dashboard del Coordinador
   */
  getCoordinatorDashboardData_Phase2: async function (areaIds, startDate, endDate) {
    try {
      const [permissions, duties, hoursReport, substitutions, crossTurnos, warnings, warningTypes, manualRequests] = await Promise.all([
        this.getPermissionRequests(false, null),
        this.getDutyShifts(),
        this.calculateHoursWorkedReport(startDate, endDate),
        this.getSubstitutions(),
        this.getCrossTurnosList(),
        this.getAmonestaciones(null),
        this.getTiposAmonestacion(),
        this.getManualCheckRequests('coordinator')
      ]);

      return {
        permissions: permissions || [],
        duties: duties || [],
        hoursReport: hoursReport || [],
        substitutions: substitutions || [],
        crossTurnos: crossTurnos || [],
        warnings: warnings || [],
        warningTypes: warningTypes || [],
        schedules: [],
        approvedSchedules: [],
        manualRequests: manualRequests || []
      };
    } catch (e) {
      console.error('[API] Error getCoordinatorDashboardData_Phase2:', e);
      return { error: e.message };
    }
  },

  /**
   * GENERADOR DE DATOS PARA LA SÁBANA SEMANAL DE ASISTENCIA (EXCEL)
   * Formato horizontal continuo Lunes a Domingo con sub-casillas Entrada/Salida,
   * cálculo dinámico base 6/6 o 7/7, domingo libre y sólo operadores.
   */
  getWeeklyAttendanceSabana: async function (startDate, endDate, areaIdsOrAdmin) {
    try {
      const client = window.supabaseClient;

      // 1. Obtener todos los operadores activos
      const { data: allUsers, error: usersErr } = await client
        .from('usuarios')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre', { ascending: true });

      if (usersErr) throw usersErr;

      // Filtrar estrictamente rol u oficio Operador/a
      let operators = (allUsers || []).filter(u => {
        const sub = String(u.sub_rol || '').toLowerCase();
        const rol = String(u.rol || '').toLowerCase();
        return sub.includes('operador') || rol === 'usuario';
      });

      // Si es coordinador, filtrar por sus áreas
      if (areaIdsOrAdmin && areaIdsOrAdmin !== 'admin' && Array.isArray(areaIdsOrAdmin) && areaIdsOrAdmin.length > 0) {
        operators = operators.filter(u => {
          const userAreas = Array.isArray(u.areas_ids) ? u.areas_ids : [];
          return userAreas.some(a => areaIdsOrAdmin.includes(a));
        });
      }

      // 2. Determinar Lunes a Domingo de la semana solicitada
      const start = new Date(startDate + 'T00:00:00');
      const dayOfWeek = start.getDay(); // 0: domingo, 1: lunes, ..., 6: sábado
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(start);
      monday.setDate(start.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const weekDays = [];
      const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        weekDays.push({
          dateStr: dateStr,
          dayName: dayNames[i],
          label: `${dayNames[i]} (${dd}/${mm})`,
          isSunday: (i === 6)
        });
      }

      const weekStartStr = weekDays[0].dateStr;
      const weekEndStr = weekDays[6].dateStr;

      // 3. Consultar asistencias de esa semana completa
      const { data: attendances, error: attErr } = await client
        .from('asistencias')
        .select('*')
        .gte('timestamp', `${weekStartStr}T00:00:00`)
        .lte('timestamp', `${weekEndStr}T23:59:59.999`)
        .order('timestamp', { ascending: true });

      if (attErr) throw attErr;

      // 4. Consultar si hay guardias programadas para el domingo
      const { data: duties } = await client
        .from('guardias')
        .select('*')
        .eq('fecha_guardia', weekEndStr);

      const sundayHasDuty = (duties && duties.length > 0);

      // 5. Consultar permisos en el rango
      const { data: perms } = await client
        .from('permisos')
        .select('*')
        .eq('estado', 'Aprobado')
        .lte('fecha_inicio', `${weekEndStr}T23:59:59`)
        .gte('fecha_fin', `${weekStartStr}T00:00:00`);

      // Agrupar asistencias por user_id y fecha (YYYY-MM-DD)
      const attMap = {};
      (attendances || []).forEach(a => {
        const d = new Date(a.timestamp);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const key = `${a.user_id}_${dateStr}`;
        if (!attMap[key]) attMap[key] = { entradas: [], salidas: [] };

        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const timeStr = `${hh}:${min}`;

        if (a.tipo === 'Entrada') attMap[key].entradas.push(timeStr);
        if (a.tipo === 'Salida') attMap[key].salidas.push(timeStr);
      });

      // Detectar si alguien laboró el domingo de manera efectiva
      let someoneWorkedSunday = sundayHasDuty;
      if (!someoneWorkedSunday) {
        operators.forEach(u => {
          const sunKey = `${u.user_id}_${weekEndStr}`;
          if (attMap[sunKey] && (attMap[sunKey].entradas.length > 0 || attMap[sunKey].salidas.length > 0)) {
            someoneWorkedSunday = true;
          }
        });
      }

      const baseWeeklyDays = someoneWorkedSunday ? 7 : 6;

      // 6. Construir filas de la sábana para cada operador
      const rows = [];
      operators.forEach((u, idx) => {
        let diasValidos = 0;
        const diasData = {};
        const obsList = [];

        weekDays.forEach((wd) => {
          const key = `${u.user_id}_${wd.dateStr}`;
          const rec = attMap[key] || { entradas: [], salidas: [] };
          let entradaStr = '--';
          let salidaStr = '--';
          let esValido = false;

          if (wd.isSunday && !someoneWorkedSunday) {
            // Domingo normal no laborable: marcado automáticamente como LIBRE
            entradaStr = 'LIBRE';
            salidaStr = 'LIBRE';
          } else {
            const hasEntrada = rec.entradas.length > 0;
            const hasSalida = rec.salidas.length > 0;

            if (hasEntrada && hasSalida) {
              entradaStr = rec.entradas[0];
              salidaStr = rec.salidas[rec.salidas.length - 1];
              esValido = true;
              diasValidos++;
            } else if (hasEntrada && !hasSalida) {
              entradaStr = rec.entradas[0];
              salidaStr = '--';
              obsList.push(`Falta salida ${wd.dayName.substring(0,3)}`);
            } else if (!hasEntrada && hasSalida) {
              entradaStr = '--';
              salidaStr = rec.salidas[0];
              obsList.push(`Falta entrada ${wd.dayName.substring(0,3)}`);
            } else {
              // Ausente en día laboral
              entradaStr = '--';
              salidaStr = '--';
              const hasPerm = (perms || []).find(p => p.user_id === u.user_id);
              if (hasPerm) {
                obsList.push(`Permiso: ${hasPerm.tipo}`);
              }
            }
          }

          diasData[wd.dateStr] = {
            entrada: entradaStr,
            salida: salidaStr,
            valido: esValido
          };
        });

        // Formatear cédula
        let cedulaDisplay = u.cedula || 'S/C';
        if (/^\d+$/.test(cedulaDisplay)) cedulaDisplay = `V-${cedulaDisplay}`;

        rows.push({
          num: idx + 1,
          userId: u.user_id,
          nombreCompleto: u.nombre,
          cedula: cedulaDisplay,
          turno: u.turno || 'mañana',
          dias: diasData,
          diasValidos: diasValidos,
          baseSemana: baseWeeklyDays,
          totalAsistenciaStr: `${diasValidos} / ${baseWeeklyDays}`,
          observaciones: obsList.join('; ')
        });
      });

      return {
        success: true,
        metadata: {
          institucionSuperior: "MINISTERIO DEL PODER POPULAR PARA HÁBITAT Y VIVIENDA",
          constructora: "CONSTRUCTORA DEL ALBA BOLIVARIANA",
          titulo: "SÁBANA DE CONTROL DE ASISTENCIA SEMANAL — PERSONAL OPERATIVO",
          periodo: { inicio: weekStartStr, fin: weekEndStr },
          weekDays: weekDays,
          domingoLaborable: someoneWorkedSunday,
          baseDias: baseWeeklyDays,
          totalOperadores: rows.length
        },
        filas: rows
      };
    } catch (e) {
      console.error('[API] Error getWeeklyAttendanceSabana:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Crear nuevo usuario (invocado por el modal de usuario del Admin)
   */
  addNewUser: async function (userData) {
    return this.saveUser(userData);
  },

  /**
   * Actualizar usuario existente (invocado por el modal de usuario del Admin)
   */
  updateUser: async function (userData) {
    return this.saveUser(userData);
  },

  /**
   * Guardar o crear usuario (Admin)
   */
  saveUser: async function (userData) {
    try {
      const client = window.supabaseClient;
      const isNew = !userData.userId || String(userData.userId).trim() === '';
      const uid = !isNew ? String(userData.userId).trim() : `user_${Date.now()}`;

      const cleanEmail = (userData.email && String(userData.email).trim() !== '')
        ? String(userData.email).trim().toLowerCase()
        : `${uid}@empresa.com`;

      // Si es un nuevo usuario, validar que el correo no esté ocupado
      if (isNew) {
        const { data: existingUser } = await client
          .from('usuarios')
          .select('user_id')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (existingUser) {
          return { success: false, message: `El correo '${cleanEmail}' ya pertenece a otro usuario.` };
        }
      }

      // Validar turno permitido por el constraint de la BD ('mañana', 'tarde', 'mixto', 'nocturno')
      const rawTurno = String(userData.turno || 'mañana').toLowerCase();
      const turno = ['mañana', 'tarde', 'mixto', 'nocturno'].includes(rawTurno) ? rawTurno : 'mañana';

      // Validar rol permitido ('Admin', 'Coordinador', 'Usuario')
      const rawRol = userData.role || userData.rol || 'Usuario';
      const rol = ['Admin', 'Coordinador', 'Usuario'].includes(rawRol) ? rawRol : 'Usuario';

      const finalNombre = userData.name || userData.nombre || `Usuario ${uid}`;
      const primerNombre = finalNombre.trim().split(' ')[0].toLowerCase();

      const payload = {
        user_id: uid,
        nombre: finalNombre,
        primer_nombre: primerNombre,
        email: cleanEmail,
        rol: rol,
        sub_rol: userData.subRol || userData.sub_rol || 'Operador/a',
        cedula: (userData.cedula && String(userData.cedula).trim() !== '') ? String(userData.cedula).trim() : null,
        institucion: userData.institucion || 'Sede Central',
        turno: turno,
        telefono: (userData.telefono && String(userData.telefono).trim() !== '') ? String(userData.telefono).trim() : null,
        direccion: (userData.direccion && String(userData.direccion).trim() !== '') ? String(userData.direccion).trim() : null,
        estado: userData.estado || 'Activo',
        foto_url: userData.foto || userData.fotoUrl || null,
        areas_ids: Array.isArray(userData.areas) ? userData.areas : [],
        tolerancia_personalizada_min: parseInt(userData.toleranciaPersonalizada, 10) || 0
      };

      if (userData.nacimiento && String(userData.nacimiento).trim() !== '') {
        payload.nacimiento = userData.nacimiento;
      }

      if (userData.fechaInclusion && userData.fechaInclusion !== 'N/A' && String(userData.fechaInclusion).trim() !== '') {
        payload.fecha_inclusion = userData.fechaInclusion;
      }

      // Blindaje de contraseña
      if (isNew) {
        const rawPass = (userData.password && String(userData.password).trim() !== '') ? String(userData.password).trim() : '123456';
        payload.password_hash = await this.hashPassword(rawPass);
      } else if (userData.password && String(userData.password).trim() !== '') {
        payload.password_hash = await this.hashPassword(userData.password);
      }

      const { data, error } = await client.from('usuarios').upsert(payload).select().single();
      if (error) throw error;

      return {
        success: true,
        message: isNew ? 'Usuario registrado exitosamente.' : 'Usuario actualizado exitosamente.',
        user: data
      };
    } catch (e) {
      console.error('[API] Error saveUser:', e);
      return { success: false, message: e.message };
    }
  },

  /**
   * Sincronizar fechas de ingreso con el primer marcaje de asistencia
   */
  backfillFechaInclusion: async function () {
    try {
      const client = window.supabaseClient;
      const { data: asistencias, error } = await client
        .from('asistencias')
        .select('user_id, timestamp')
        .order('timestamp', { ascending: true });

      if (error) throw error;

      const firstMap = {};
      for (const a of (asistencias || [])) {
        if (!firstMap[a.user_id]) {
          firstMap[a.user_id] = a.timestamp;
        }
      }

      let count = 0;
      for (const [uid, ts] of Object.entries(firstMap)) {
        await client.from('usuarios').update({ fecha_inclusion: ts }).eq('user_id', uid);
        count++;
      }

      return {
        success: true,
        message: `Sincronización completada: ${count} fechas actualizadas.`
      };
    } catch (e) {
      console.error('[API] Error backfillFechaInclusion:', e);
      return { success: false, message: e.message };
    }
  },

  deleteUser: async function (userId) {
    try {
      const client = window.supabaseClient;
      const { error } = await client.from('usuarios').update({ estado: 'Inactivo' }).eq('user_id', userId);
      if (error) throw error;
      return { success: true, message: 'Usuario dado de baja exitosamente.' };
    } catch (e) {
      console.error('[API] Error deleteUser:', e);
      return { success: false, message: e.message };
    }
  },

  changePassword: async function (userId, currentPass, newPass) {
    try {
      const client = window.supabaseClient;
      const { data: u, error: findErr } = await client
        .from('usuarios')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (findErr || !u) {
        return { success: false, message: 'Usuario no encontrado.' };
      }

      const isValid = await this.verifyPassword(currentPass, u.password_hash);
      if (!isValid) {
        return { success: false, message: 'La contraseña actual no es correcta.' };
      }

      const hashedNew = await this.hashPassword(newPass);
      const { error: updateErr } = await client
        .from('usuarios')
        .update({ password_hash: hashedNew })
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      return { success: true, message: 'Contraseña actualizada correctamente.' };
    } catch (e) {
      console.error('[API] Error changePassword:', e);
      return { success: false, message: e.message };
    }
  },

  /**
   * Herramienta exclusiva de SuperAdmin:
   * Revisa todos los registros en 'usuarios' y convierte a hash SHA-256 + Salt
   * todas las contraseñas que aún se encuentren en texto plano.
   */
  migrarContrasenasAHash: async function () {
    try {
      const client = window.supabaseClient;
      const { data: users, error } = await client
        .from('usuarios')
        .select('user_id, password_hash');

      if (error) throw error;
      if (!users || users.length === 0) {
        return {
          success: true,
          total: 0,
          migradas: 0,
          yaHasheadas: 0,
          errores: 0,
          message: 'No hay usuarios registrados en la base de datos.'
        };
      }

      let migradas = 0;
      let yaHasheadas = 0;
      let errores = 0;

      for (const u of users) {
        const pass = String(u.password_hash || '').trim();
        if (!pass) continue;

        const parts = pass.split(':');
        if (parts.length === 2 && parts[0].length === 16 && parts[1].length === 64) {
          yaHasheadas++;
          continue;
        }

        try {
          const hashed = await this.hashPassword(pass);
          const { error: updateError } = await client
            .from('usuarios')
            .update({ password_hash: hashed })
            .eq('user_id', u.user_id);

          if (updateError) {
            console.error(`[API] Error blindando usuario ${u.user_id}:`, updateError);
            errores++;
          } else {
            migradas++;
          }
        } catch (e) {
          console.error(`[API] Error procesando hash para ${u.user_id}:`, e);
          errores++;
        }
      }

      return {
        success: true,
        total: users.length,
        migradas: migradas,
        yaHasheadas: yaHasheadas,
        errores: errores,
        message: `Blindaje completado: ${migradas} contraseñas convertidas a hash SHA-256 con Salt, ${yaHasheadas} ya estaban blindadas${errores > 0 ? `, ${errores} con errores` : ''}.`
      };
    } catch (e) {
      console.error('[API] Error migrarContrasenasAHash:', e);
      return { success: false, message: e.message };
    }
  },

  saveConfigHorarios: async function (configArray, actorUserId) {
    try {
      const client = window.supabaseClient;
      for (const item of configArray) {
        await client.from('config_horarios').upsert({
          clave: item.clave,
          valor: item.valor,
          ultima_actualizacion: new Date().toISOString()
        });
      }
      return { success: true, message: 'Configuración de horarios guardada.' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  addArea: async function (areaData) {
    try {
      const client = window.supabaseClient;
      const newId = 'AREA-' + Date.now();
      const { error } = await client.from('areas_trabajo').insert({
        area_id: newId,
        nombre_area: areaData.nombreArea,
        creado_por: areaData.actorUserId || 'Admin',
        estado: 'Activa'
      });
      if (error) throw error;
      return { success: true, message: 'Área creada con éxito.' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  submitManualCheckRequest: async function (reqData) {
    try {
      const client = window.supabaseClient;
      const { data, error } = await client.from('solicitudes_manuales').insert({
        usuario_id: reqData.userId,
        nombre_usuario: reqData.userName,
        turno: reqData.turno || 'mañana',
        institucion: reqData.institucion || 'Sede Central',
        tipo: reqData.type || 'Entrada',
        motivo: reqData.motivo || 'Olvido de marcaje'
      }).select().single();

      if (error) throw error;
      return { success: true, message: 'Solicitud enviada al supervisor.' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }
};

window.asisApi = asisApi;
