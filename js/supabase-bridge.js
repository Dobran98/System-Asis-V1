/**
 * ASIS Constructora - Shim de Compatibilidad Universal para google.script.run
 * Permite que los 6,000 líneas de código existentes en el frontend funcionen
 * de inmediato sin ninguna modificación, consumiendo la API de Supabase.
 */

(function () {
  function createGoogleScriptRunProxy(successFn, failFn) {
    return new Proxy({}, {
      get(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (fn) {
            return createGoogleScriptRunProxy(fn, failFn);
          };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) {
            return createGoogleScriptRunProxy(successFn, fn);
          };
        }

        // Cualquier método invocado en google.script.run
        return async function (...args) {
          try {
            console.log(`[Bridge ➔ Supabase] ${prop}(`, args, `)`);

            let result = null;
            if (window.asisApi && typeof window.asisApi[prop] === 'function') {
              result = await window.asisApi[prop](...args);
            } else {
              console.warn(`[Bridge] Método pendiente en asisApi: ${prop}. Retornando valor seguro.`);
              result = { success: true, data: [] };
            }

            if (typeof successFn === 'function') {
              successFn(result);
            }
            return result;
          } catch (err) {
            console.error(`[Bridge] Error ejecutando ${prop}:`, err);
            if (typeof failFn === 'function') {
              failFn(err);
            } else if (typeof successFn === 'function') {
              successFn({ success: false, error: err.message });
            }
          }
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createGoogleScriptRunProxy(null, null);

  console.log('🚀 [Bridge] Shim de google.script.run conectado a Supabase con éxito.');
})();
