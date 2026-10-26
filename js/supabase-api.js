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
      
      const [usersRes, areasRes, rulesRes, attendRes] = await Promise.all([
        client.from('usuarios').select('*').order('nombre', { ascending: true }),
        client.from('areas_trabajo').select('*').order('nombre_area', { ascending: true }),
        client.from('permisos_roles').select('*'),
        client.from('asistencias').select('*').order('timestamp', { ascending: false }).limit(200)
      ]);

      const rawUsers = usersRes.data || [];
      const users = rawUsers.map(u => ({
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

      const areas = (areasRes.data || []).map(a => ({
        id: a.area_id,
        name: a.nombre_area,
        estado: a.estado
      }));

      const attendance = (attendRes.data || []).map(a => ({
        id: a.id,
        userId: a.user_id,
        name: a.nombre,
        timestamp: a.timestamp,
        type: a.tipo,
        status: a.estado,
        shift: a.turno,
        institution: a.institucion,
        distance: a.distancia_metros || 0
      }));

      const totalUsers = users.length;
      const today = new Date().toISOString().split('T')[0];
      const todayRecords = attendance.filter(a => a.timestamp && a.timestamp.startsWith(today));
      const todayEntries = todayRecords.filter(a => a.type === 'Entrada').length;

      return {
        stats: {
          totalUsers: totalUsers,
          activeUsers: users.filter(u => u.estado === 'Activo').length,
          todayAttendance: todayEntries,
          pendingRequests: 0
        },
        attendance: attendance,
        users: users,
        areas: areas,
        absentees: [],
        openSessions: [],
        accessRules: rulesRes.data || []
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
      const client = window.supabaseClient;

      const [
        dutiesRes, permissionsRes, subsRes, crossRes,
        auditRes, warnTypesRes, warningsRes, configRes, manualRes
      ] = await Promise.all([
        client.from('guardias').select('*').order('fecha_guardia', { ascending: false }).limit(50),
        client.from('permisos').select('*').order('fecha_inicio', { ascending: false }).limit(50),
        client.from('suplencias').select('*').order('fecha_inicio', { ascending: false }).limit(50),
        client.from('cross_turnos').select('*').order('fecha', { ascending: false }).limit(50),
        client.from('auditoria').select('*').order('timestamp', { ascending: false }).limit(100),
        client.from('tipos_amonestacion').select('*'),
        client.from('amonestaciones').select('*').order('fecha', { ascending: false }).limit(50),
        client.from('config_horarios').select('*'),
        client.from('solicitudes_manuales').select('*').order('fecha_solicitud', { ascending: false }).limit(50)
      ]);

      const configMap = {};
      (configRes.data || []).forEach(c => { configMap[c.clave] = c.valor; });

      return {
        duties: dutiesRes.data || [],
        hoursReport: [],
        permissions: permissionsRes.data || [],
        substitutions: subsRes.data || [],
        crossTurnos: crossRes.data || [],
        auditLog: auditRes.data || [],
        deleteRequests: [],
        warningTypes: warnTypesRes.data || [],
        warnings: warningsRes.data || [],
        warningAnulaciones: [],
        configHorarios: configMap,
        schedules: [],
        approvedSchedules: [],
        manualRequests: manualRes.data || []
      };
    } catch (e) {
      console.error('[API] Error getAdminDashboardData_Phase2:', e);
      return { error: e.message };
    }
  },

  /**
   * Refresco de asistencias filtradas por rango de fecha
   */
  refreshAdminDashboardFiltered: async function (startDate, endDate) {
    try {
      const client = window.supabaseClient;
      let query = client.from('asistencias').select('*').order('timestamp', { ascending: false });

      if (startDate) {
        query = query.gte('timestamp', `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte('timestamp', `${endDate}T23:59:59.999Z`);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;

      const attendance = (data || []).map(a => ({
        id: a.id,
        userId: a.user_id,
        name: a.nombre,
        timestamp: a.timestamp,
        type: a.tipo,
        status: a.estado,
        shift: a.turno,
        institution: a.institucion,
        distance: a.distancia_metros || 0
      }));

      return {
        stats: {
          totalFiltered: attendance.length,
          entries: attendance.filter(a => a.type === 'Entrada').length,
          exits: attendance.filter(a => a.type === 'Salida').length
        },
        attendance: attendance,
        hoursReport: []
      };
    } catch (e) {
      console.error('[API] Error en refreshAdminDashboardFiltered:', e);
      return { error: e.message };
    }
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

      // Resolver usuario si no viene el nombre o turno
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
      if (!data) return { state: 'Sin registros', lastType: null, lastTime: null };

      return {
        state: data.tipo,
        lastType: data.tipo,
        lastTime: data.timestamp,
        status: data.estado
      };
    } catch (e) {
      console.error('[API] Error getLastAttendanceState:', e);
      return { state: 'Error', error: e.message };
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

  /**
   * Eliminar o desactivar usuario
   */
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

  /**
   * Cambio de contraseña
   */
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

  /**
   * Obtener configuración de horarios
   */
  getConfigHorarios: async function () {
    try {
      const client = window.supabaseClient;
      const { data } = await client.from('config_horarios').select('*');
      const map = {};
      (data || []).forEach(c => { map[c.clave] = c.valor; });
      return map;
    } catch (e) {
      return {};
    }
  },

  /**
   * Obtener áreas de trabajo
   */
  getSystemAreas: async function () {
    try {
      const client = window.supabaseClient;
      const { data } = await client.from('areas_trabajo').select('*').order('nombre_area');
      return data || [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Solicitudes manuales de asistencia
   */
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
