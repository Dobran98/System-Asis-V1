-- ==============================================================================
-- SISTEMA ASIS (CONSTRUCTORA DEL ALBA BOLIVARIANA / MPPVH)
-- MIGRACIÓN DE ESQUEMA: LOGIN POR PRIMER NOMBRE O CÉDULA, TURNO NOCTURNO
-- Y SEGURIDAD DE DISPOSITIVO ÚNICO (ANTI-FRAUDE)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase / PostgreSQL.
-- Permite iniciar sesión con el primer nombre (ej. 'brando') o con la cédula (ej. '12345678')
-- sin depender de correos electrónicos.
-- ==============================================================================

-- 1. ELIMINAR OBLIGATORIEDAD DEL EMAIL Y PERMITIR NULOS
ALTER TABLE public.usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;

-- Índice condicional: unicidad solo si el correo no está vacío
DROP INDEX IF EXISTS public.idx_usuarios_unique_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_unique_email 
ON public.usuarios (email) 
WHERE email IS NOT NULL AND email <> '';

-- 2. AGREGAR COLUMNAS PARA PRIMER NOMBRE Y VALIDACIÓN DE DISPOSITIVO ÚNICO
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS primer_nombre TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS dispositivo_vinculado_id TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS dispositivo_info TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS dispositivo_fecha_vinculacion TIMESTAMPTZ;

-- 3. HABILITAR TURNO NOCTURNO EN EL CONSTRAINT DE TURNO
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_turno_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_turno_check 
CHECK (turno IN ('mañana', 'tarde', 'mixto', 'nocturno'));

-- 4. POBLAR AUTOMÁTICAMENTE 'primer_nombre' DE LOS USUARIOS EXISTENTES
-- Extrae el primer nombre en minúsculas y sin espacios adicionales
UPDATE public.usuarios 
SET primer_nombre = LOWER(SPLIT_PART(TRIM(nombre), ' ', 1))
WHERE primer_nombre IS NULL OR primer_nombre = '';

-- 5. CREAR ÍNDICES DE ALTO RENDIMIENTO PARA BÚSQUEDA INSTANTÁNEA EN LOGIN
CREATE INDEX IF NOT EXISTS idx_usuarios_primer_nombre ON public.usuarios(primer_nombre);
CREATE INDEX IF NOT EXISTS idx_usuarios_cedula ON public.usuarios(cedula);
CREATE INDEX IF NOT EXISTS idx_usuarios_dispositivo ON public.usuarios(dispositivo_vinculado_id);

-- 6. CONFIGURACIÓN DE HORARIOS PARA TURNO NOCTURNO Y GUARDIAS (SI EXISTE TABLA CONFIG)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'configuracion_horarios') THEN
        INSERT INTO public.configuracion_horarios (clave, valor, descripcion)
        VALUES 
            ('HORA_ENTRADA_NOCTURNO', '19:00', 'Hora oficial de inicio de guardia/turno nocturno'),
            ('HORA_SALIDA_NOCTURNO', '07:00', 'Hora oficial de salida de guardia/turno nocturno'),
            ('HORAS_ESTIPULADAS_NOCTURNO', '12', 'Horas reglamentarias a computar por guardia nocturna')
        ON CONFLICT (clave) DO UPDATE 
        SET valor = EXCLUDED.valor, descripcion = EXCLUDED.descripcion;
    END IF;
END $$;

-- 7. TRIGGER PARA NORMALIZAR AUTOMÁTICAMENTE 'primer_nombre' EN CADA INSERT O UPDATE
CREATE OR REPLACE FUNCTION public.trg_fn_set_primer_nombre()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.nombre IS NOT NULL AND TRIM(NEW.nombre) <> '' THEN
        NEW.primer_nombre := LOWER(SPLIT_PART(TRIM(NEW.nombre), ' ', 1));
    END IF;
    IF NEW.email IS NOT NULL AND TRIM(NEW.email) = '' THEN
        NEW.email := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_primer_nombre ON public.usuarios;
CREATE TRIGGER trg_usuarios_primer_nombre
BEFORE INSERT OR UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_set_primer_nombre();

-- ==============================================================================
-- 8. PLANTILLA LISTA PARA INSERTAR O ACTUALIZAR TUS TRABAJADORES (OPERADORES)
-- Puedes duplicar las líneas con los nombres y cédulas reales de tu constructora.
-- Nota: La contraseña inicial puede ser su propia cédula o un código simple (ej. 123456).
-- Al iniciar sesión por primera vez, el sistema la convertirá automáticamente en hash seguro.
-- ==============================================================================

/*
-- EJEMPLO DE CARGA MASIVA DE TRABAJADORES:
INSERT INTO public.usuarios (
    user_id,
    nombre,
    primer_nombre,
    cedula,
    rol,
    sub_rol,
    turno,
    institucion,
    password_hash,
    estado
)
VALUES
    ('op_001', 'Brando Jose Gonzalez', 'brando', 'V-12345678', 'Usuario', 'Operador/a', 'mañana', 'Constructora del Alba', '123456', 'Activo'),
    ('op_002', 'Juan Alberto Perez', 'juan', 'V-18765432', 'Usuario', 'Operador/a', 'mañana', 'Constructora del Alba', '123456', 'Activo'),
    ('op_003', 'Carlos Eduardo Rodriguez', 'carlos', 'V-20111222', 'Usuario', 'Operador/a', 'nocturno', 'Constructora del Alba', '123456', 'Activo')
ON CONFLICT (user_id) DO UPDATE 
SET 
    nombre = EXCLUDED.nombre,
    primer_nombre = EXCLUDED.primer_nombre,
    cedula = EXCLUDED.cedula,
    sub_rol = EXCLUDED.sub_rol,
    turno = EXCLUDED.turno,
    institucion = EXCLUDED.institucion,
    estado = EXCLUDED.estado;
*/

-- Mensaje de confirmación
SELECT 'Migración completada exitosamente. Ahora el acceso funciona con Primer Nombre o Cédula, con validación de 1 solo equipo por usuario y turno nocturno habilitado.' AS resultado;
