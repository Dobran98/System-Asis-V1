-- ==============================================================================
-- CORRECCIÓN DEFINITIVA DE RESTRICCIÓN DE EMAIL EN TABLA USUARIOS
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase para que
-- puedas importar usuarios sin correo o con correo vacío sin ningún error.
-- ==============================================================================

-- 1. Quitar la obligatoriedad (NOT NULL) del correo electrónico:
ALTER TABLE public.usuarios ALTER COLUMN email DROP NOT NULL;

-- 2. Eliminar la restricción UNIQUE global anterior que chocaba con correos vacíos:
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;

-- 3. Crear un índice UNIQUE condicional:
-- Garantiza que si dos personas tienen correo (ej. admin@empresa.com), no se repitan;
-- pero permite que múltiples empleados u obreros NO tengan correo electrónico (NULL).
DROP INDEX IF EXISTS public.idx_usuarios_unique_email;
CREATE UNIQUE INDEX idx_usuarios_unique_email 
ON public.usuarios (email) 
WHERE email IS NOT NULL AND email <> '';

-- 4. Trigger automático: convierte cualquier texto vacío '' o espacios en NULL
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

-- Mensaje de confirmación
SELECT 'Restricción de email corregida con éxito. Ahora puedes importar usuarios sin correo.' AS resultado;
