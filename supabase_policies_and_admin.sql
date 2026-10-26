-- ==============================================================================
-- PASO 2: POLÍTICAS DE ACCESO COMPLETO (RLS) Y USUARIO ADMINISTRADOR INICIAL
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de Supabase para permitir que tu aplicación
-- web y el escáner QR puedan leer y guardar datos directamente en todas las tablas.
-- ==============================================================================

-- 1. Políticas completas para desarrollo y frontend web (Permitir SELECT, INSERT, UPDATE, DELETE):
DROP POLICY IF EXISTS "Permitir lectura general autenticada a usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir insercion asistencias desde scanner" ON public.asistencias;
DROP POLICY IF EXISTS "Permitir lectura asistencias" ON public.asistencias;
DROP POLICY IF EXISTS "Permitir lectura configuracion horarios" ON public.config_horarios;

CREATE POLICY "Permitir todo en usuarios" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en asistencias" ON public.asistencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en guardias" ON public.guardias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en permisos" ON public.permisos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en suplencias" ON public.suplencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en cross_turnos" ON public.cross_turnos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en areas_trabajo" ON public.areas_trabajo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en auditoria" ON public.auditoria FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en permisos_roles" ON public.permisos_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en solicitudes_baja" ON public.solicitudes_baja FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en tipos_amonestacion" ON public.tipos_amonestacion FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en amonestaciones" ON public.amonestaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en config_horarios" ON public.config_horarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en solicitudes_anulacion" ON public.solicitudes_anulacion FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en solicitudes_manuales" ON public.solicitudes_manuales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en horarios_clases" ON public.horarios_clases FOR ALL USING (true) WITH CHECK (true);

-- 2. Insertar Usuario Administrador Inicial
INSERT INTO public.usuarios (
    user_id, nombre, email, password_hash, rol, cedula, institucion, turno, sub_rol, estado
) VALUES (
    'user001', 'Administrador Principal', 'admin@empresa.com', 'admin123', 'Admin', 'V-00000001', 'Sede Central', 'mixto', 'SuperAdmin', 'Activo'
) ON CONFLICT (user_id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    password_hash = EXCLUDED.password_hash,
    rol = EXCLUDED.rol;
