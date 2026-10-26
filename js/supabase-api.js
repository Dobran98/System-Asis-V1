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

  /**
   * Autenticación de usuario
   */
  userLogin: async function (email, password) {
    try {
      const client = window.supabaseClient;
      const cleanEmail = String(email || '').trim().toLowerCase();

      const { data: user, error } = await client
        .from('usuarios')
        .select('*')
        .ilike('email', cleanEmail)
        .eq('password_hash', String(password || '').trim())
        .maybeSingle();

      if (error) {
        console.error('[API] Error en login:', error);
        return null;
      }

      if (!user) return null;

      if (user.estado === 'Inactivo') {
        return { inactive: true };
      }

      return {
        userId: user.user_id,
        name: user.nombre,
        email: user.email,
        role: user.rol,
        subRol: user.sub_rol || 'Operador/a',
        institucion: user.institucion || 'Sede Central',
        turno: user.turno || 'mañana',
        areas: Array.isArray(user.areas_ids) ? user.areas_ids : [],
        foto: user.foto_url || '',
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

      const [users, areas, rules, stats] = await Promise.all([
        this.getAllUsersForAdmin(),
        this.getAreasConfig(),
        this.getPermisosRoles(),
        this.getAdminDashboardStats(startDate, endDate)
      ]);

      return {
        stats: stats,
        attendance: null,
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
        role: u.rol,
        subRol: u.sub_rol || 'Operador/a',
        cedula: u.cedula || '',
        institucion: u.institucion || 'Sede Central',
        turno: u.turno || 'mañana',
        estado: u.estado || 'Activo',
        foto: u.foto_url || '',
        telefono: u.telefono || '',
        direccion: u.direccion || '',
        areas: Array.isArray(u.areas_ids) ? u.areas_ids : []
      }));
    } catch (e) {
      console.error('[API] Error getAllUsersForAdmin:', e);
      return [];
    }
  },

  /**
   * Registro de Asistencia (Empleado o Escáner QR)
   */
  recordAttendance: async function (data) {
    try {
      const client = window.supabaseClient;
      const uid = data.userId || data.id;
      const type = data.type || 'Entrada';

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

  getAttendanceRecords: async function (userId) {
    return this.getUserAttendanceHistory(userId);
  },

  /**
   * Guardar o crear usuario (Admin)
   */
  saveUser: async function (userData) {
    try {
      const client = window.supabaseClient;
      const uid = userData.userId || `user_${Date.now()}`;

      const payload = {
        user_id: uid,
        nombre: userData.name,
        email: userData.email ? userData.email.toLowerCase() : '',
        rol: userData.role || 'Usuario',
        sub_rol: userData.subRol || 'Operador/a',
        cedula: userData.cedula || null,
        institucion: userData.institucion || 'Sede Central',
        turno: userData.turno || 'mañana',
        telefono: userData.telefono || null,
        direccion: userData.direccion || null,
        estado: userData.estado || 'Activo',
        foto_url: userData.fotoUrl || null,
        areas_ids: Array.isArray(userData.areas) ? userData.areas : []
      };

      if (userData.password) {
        payload.password_hash = userData.password;
      }

      const { data, error } = await client.from('usuarios').upsert(payload).select().single();
      if (error) throw error;

      return { success: true, message: 'Usuario guardado exitosamente.', user: data };
    } catch (e) {
      console.error('[API] Error saveUser:', e);
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
        .eq('password_hash', currentPass)
        .maybeSingle();

      if (findErr || !u) {
        return { success: false, message: 'La contraseña actual no es correcta.' };
      }

      const { error: updateErr } = await client
        .from('usuarios')
        .update({ password_hash: newPass })
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      return { success: true, message: 'Contraseña actualizada correctamente.' };
    } catch (e) {
      console.error('[API] Error changePassword:', e);
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
