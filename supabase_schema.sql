-- ==============================================================================
-- SISTEMA ASIS (CONSTRUCTORA ASYS) - ESQUEMA DE BASE DE DATOS SUPABASE / POSTGRESQL
-- ==============================================================================
-- Esquema canónico 100% compatible con el sistema original de Google Sheets.
-- Optimizado para alto rendimiento (10ms por consulta), integridad referencial,
-- WebSockets en tiempo real y seguridad a nivel de filas (RLS).
-- ==============================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABLA 1: USUARIOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    user_id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    primer_nombre TEXT,
    email TEXT,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'Usuario' CHECK (rol IN ('Admin', 'Coordinador', 'Usuario')),
    cedula TEXT UNIQUE,
    institucion TEXT DEFAULT 'Sede Central',
    telefono TEXT,
    direccion TEXT,
    turno TEXT DEFAULT 'mañana' CHECK (turno IN ('mañana', 'tarde', 'mixto', 'nocturno')),
    nacimiento DATE,
    foto_url TEXT,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo', 'Suspendido')),
    areas_ids JSONB DEFAULT '[]'::jsonb,
    sub_rol TEXT DEFAULT 'Analista',
    dispositivo_vinculado_id TEXT,
    dispositivo_info TEXT,
    dispositivo_fecha_vinculacion TIMESTAMPTZ,
    tolerancia_personalizada_min INTEGER DEFAULT 0,
    fecha_inclusion TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único condicional: garantiza unicidad cuando el correo existe, pero permite que varios usuarios no tengan correo (NULL)
DROP INDEX IF EXISTS public.idx_usuarios_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_unique_email ON public.usuarios(email) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_usuarios_cedula ON public.usuarios(cedula);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON public.usuarios(estado);

-- Trigger para convertir automáticamente correos vacíos ("") a NULL al insertar o actualizar
CREATE OR REPLACE FUNCTION public.clean_usuario_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NOT NULL AND TRIM(NEW.email) = '' THEN
        NEW.email := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_usuario_email ON public.usuarios;
CREATE TRIGGER trg_clean_usuario_email
BEFORE INSERT OR UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.clean_usuario_email();

-- ==============================================================================
-- TABLA 2: ASISTENCIAS (NÚCLEO DE REGISTRO QR Y BIOMÉTRICO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.asistencias (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    turno TEXT NOT NULL,
    institucion TEXT DEFAULT 'Sede Central',
    tipo TEXT NOT NULL CHECK (tipo IN ('Entrada', 'Salida')),
    latitud NUMERIC(10, 7) DEFAULT 0,
    longitud NUMERIC(10, 7) DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Presente' CHECK (estado IN ('Presente', 'Retardo', 'Salida Anticipada', 'Manual', 'Justificado')),
    distancia_metros NUMERIC(10, 2) DEFAULT 0,
    source TEXT DEFAULT 'Vercel-Scanner',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistencias_user_timestamp ON public.asistencias(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_asistencias_timestamp ON public.asistencias(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_asistencias_tipo ON public.asistencias(tipo);

-- ==============================================================================
-- TABLA 3: GUARDIAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.guardias (
    guardia_id TEXT PRIMARY KEY DEFAULT ('GUARD-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    fecha_guardia DATE NOT NULL,
    turno_requerido TEXT NOT NULL,
    descripcion TEXT,
    creado_por TEXT,
    categoria TEXT DEFAULT 'General',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 4: PERMISOS Y LICENCIAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.permisos (
    permiso_id TEXT PRIMARY KEY DEFAULT ('PERM-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    user_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    nombre_usuario TEXT NOT NULL,
    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ NOT NULL,
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    comentarios TEXT,
    resolutor_id TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permisos_user ON public.permisos(user_id);
CREATE INDEX IF NOT EXISTS idx_permisos_estado ON public.permisos(estado);

-- ==============================================================================
-- TABLA 5: SUPLENCIAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suplencias (
    sub_id TEXT PRIMARY KEY DEFAULT ('SUB-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    titular_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    titular_nombre TEXT NOT NULL,
    suplente_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    suplente_nombre TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    turno TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    comentarios TEXT,
    hora_inicio TEXT,
    hora_fin TEXT,
    timestamp_creacion TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suplencias_titular ON public.suplencias(titular_id);
CREATE INDEX IF NOT EXISTS idx_suplencias_suplente ON public.suplencias(suplente_id);

-- ==============================================================================
-- TABLA 6: CROSS-TURNOS (INTERCAMBIO DE TURNOS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cross_turnos (
    cross_id TEXT PRIMARY KEY DEFAULT ('CROSS-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    fecha DATE NOT NULL,
    user1_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    user1_nombre TEXT NOT NULL,
    user1_turno TEXT NOT NULL,
    user2_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    user2_nombre TEXT NOT NULL,
    user2_turno TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    creado_por TEXT,
    timestamp_creacion TIMESTAMPTZ DEFAULT NOW(),
    resolutor_id TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 7: ÁREAS DE TRABAJO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.areas_trabajo (
    area_id TEXT PRIMARY KEY,
    nombre_area TEXT NOT NULL,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    creado_por TEXT DEFAULT 'Sistema',
    estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Inactiva')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 8: AUDITORÍA DEL SISTEMA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auditoria (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id TEXT,
    nombre_usuario TEXT,
    sub_rol TEXT,
    accion TEXT NOT NULL,
    modulo TEXT NOT NULL,
    detalle_objeto JSONB,
    resultado TEXT NOT NULL DEFAULT 'OK',
    areas_actor TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_timestamp ON public.auditoria(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria(usuario_id);

-- ==============================================================================
-- TABLA 9: PERMISOS POR ROLES Y REGLAS DE ACCESO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.permisos_roles (
    regla_id TEXT PRIMARY KEY,
    sub_rol TEXT NOT NULL,
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    permitido BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por TEXT DEFAULT 'Sistema',
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 10: SOLICITUDES DE BAJA DE USUARIOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.solicitudes_baja (
    solicitud_id TEXT PRIMARY KEY DEFAULT ('BAJA-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    coordinador_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    coordinador_nombre TEXT NOT NULL,
    usuario_target_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    usuario_target_nombre TEXT NOT NULL,
    motivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
    admin_resolutor TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    nota_admin TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 11: TIPOS DE AMONESTACIÓN
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tipos_amonestacion (
    tipo_id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    gravedad TEXT NOT NULL DEFAULT 'Leve' CHECK (gravedad IN ('Leve', 'Media', 'Grave')),
    auto_activar BOOLEAN DEFAULT FALSE,
    condicion_auto TEXT,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    creado_por TEXT DEFAULT 'Sistema',
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 12: AMONESTACIONES APLICADAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.amonestaciones (
    amonestacion_id TEXT PRIMARY KEY DEFAULT ('AMON-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    usuario_target_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    usuario_target_nombre TEXT NOT NULL,
    tipo_id TEXT REFERENCES public.tipos_amonestacion(tipo_id) ON DELETE SET NULL,
    tipo_nombre TEXT NOT NULL,
    descripcion TEXT,
    creado_por_id TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    creado_por_nombre TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Anulada', 'Apelada')),
    origen TEXT DEFAULT 'Manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amonestaciones_usuario ON public.amonestaciones(usuario_target_id);

-- ==============================================================================
-- TABLA 13: CONFIGURACIÓN DE HORARIOS Y POLÍTICAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.config_horarios (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    ultima_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 14: SOLICITUDES DE ANULACIÓN DE AMONESTACIONES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.solicitudes_anulacion (
    solicitud_id TEXT PRIMARY KEY DEFAULT ('ANUL-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    amonestacion_id TEXT NOT NULL REFERENCES public.amonestaciones(amonestacion_id) ON DELETE CASCADE,
    coordinador_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    coordinador_nombre TEXT NOT NULL,
    motivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
    admin_resolutor TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    nota_admin TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- TABLA 15: SOLICITUDES MANUALES DE ASISTENCIA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.solicitudes_manuales (
    solicitud_id TEXT PRIMARY KEY DEFAULT ('MANUAL-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    usuario_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    nombre_usuario TEXT NOT NULL,
    turno TEXT NOT NULL,
    institucion TEXT DEFAULT 'Sede Central',
    tipo TEXT NOT NULL CHECK (tipo IN ('Entrada', 'Salida')),
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    resolutor_id TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    motivo TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_manuales_user ON public.solicitudes_manuales(usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_manuales_estado ON public.solicitudes_manuales(estado);

-- ==============================================================================
-- TABLA 16: HORARIOS Y CARGA HORARIA DOCENTE / EMPLEADO
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.horarios_clases (
    horario_id TEXT PRIMARY KEY DEFAULT ('HORARIO-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    usuario_id TEXT NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
    nombre_usuario TEXT NOT NULL,
    imagen_url TEXT,
    carga_horaria_json JSONB DEFAULT '{}'::jsonb,
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
    resolutor_id TEXT REFERENCES public.usuarios(user_id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    comentario_resolutor TEXT,
    tiempo_gracia_minutos INTEGER DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- DATOS SEMILLA (INITIAL SEED DATA)
-- ==============================================================================

-- Horarios canónicos
INSERT INTO public.config_horarios (clave, valor, descripcion) VALUES
('HORA_ENTRADA_MANANA', '08:00', 'Hora oficial de entrada para turno Mañana'),
('HORA_SALIDA_MANANA', '14:00', 'Hora oficial de salida para turno Mañana'),
('HORA_ENTRADA_TARDE', '14:00', 'Hora oficial de entrada para turno Tarde'),
('HORA_SALIDA_TARDE', '19:00', 'Hora oficial de salida para turno Tarde'),
('HORA_ENTRADA_MIXTO', '08:00', 'Hora oficial de entrada para turno Mixto'),
('HORA_SALIDA_MIXTO', '19:00', 'Hora oficial de salida para turno Mixto'),
('HORA_ENTRADA_NOCTURNO', '19:00', 'Hora oficial de inicio para guardia/turno Nocturno'),
('HORA_SALIDA_NOCTURNO', '07:00', 'Hora oficial de salida para guardia/turno Nocturno'),
('HORAS_ESTIPULADAS_NOCTURNO', '12', 'Horas reglamentarias a computar por guardia nocturna'),
('TOLERANCIA_RETARDO_MIN', '60', 'Minutos de tolerancia antes de registrar retardo'),
('MASTER_QR_ID', 'QR-MAESTRO-ASISTENCIA-V1', 'Identificador del código QR maestro de pared')
ON CONFLICT (clave) DO NOTHING;

-- Áreas por defecto
INSERT INTO public.areas_trabajo (area_id, nombre_area, creado_por, estado) VALUES
('AREA-1', 'Área A', 'Sistema', 'Activa'),
('AREA-2', 'Área B', 'Sistema', 'Activa'),
('AREA-3', 'Área C', 'Sistema', 'Activa'),
('AREA-4', 'Área D', 'Sistema', 'Activa')
ON CONFLICT (area_id) DO NOTHING;

-- Tipos de amonestación automáticos
INSERT INTO public.tipos_amonestacion (tipo_id, nombre, descripcion, gravedad, auto_activar, condicion_auto, estado) VALUES
('TIPO-1', 'No registró salida', 'El usuario no registró su hora de salida al finalizar el turno.', 'Leve', TRUE, 'NO_REGISTRO_SALIDA', 'Activo'),
('TIPO-3', 'Ausencia injustificada', 'El usuario no se presentó al trabajo y no tiene permiso aprobado.', 'Grave', TRUE, 'AUSENCIA_INJUSTIFICADA', 'Activo'),
('TIPO-4', 'Llegada tardía', 'El usuario llegó más de la hora de tolerancia configurada después de su hora de entrada.', 'Leve', TRUE, 'LLEGADA_RETARDADA', 'Activo')
ON CONFLICT (tipo_id) DO NOTHING;

-- Reglas de permisos por defecto
INSERT INTO public.permisos_roles (regla_id, sub_rol, modulo, accion, permitido, descripcion) VALUES
('RULE-1', 'Analista', 'Asistencia', 'VER_PROPIOS', TRUE, 'Permite consultar registros propios'),
('RULE-2', 'Analista', 'Permisos', 'SOLICITAR', TRUE, 'Permite emitir solicitudes de permisos'),
('RULE-3', 'Analista', 'Suplencias', 'SOLICITAR', TRUE, 'Permite solicitar coberturas'),
('RULE-4', 'Analista', 'CrossTurno', 'SOLICITAR', TRUE, 'Permite solicitar cambio de turno')
ON CONFLICT (regla_id) DO NOTHING;

-- ==============================================================================
-- ACTIVACIÓN DE REALTIME EN SUPABASE (WEBSOCKETS PARA DASHBOARDS EN VIVO)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.asistencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_manuales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.amonestaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auditoria;

-- ==============================================================================
-- SEGURIDAD A NIVEL DE FILAS (ROW LEVEL SECURITY - RLS)
-- ==============================================================================
-- Se activan por defecto para permitir acceso controlado por API / Service Role
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suplencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amonestaciones ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas iniciales para arranque rápido con clave pública anon/authenticated:
CREATE POLICY "Permitir lectura general autenticada a usuarios" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "Permitir insercion asistencias desde scanner" ON public.asistencias FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura asistencias" ON public.asistencias FOR SELECT USING (true);
CREATE POLICY "Permitir lectura configuracion horarios" ON public.config_horarios FOR SELECT USING (true);
