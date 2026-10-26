# 🚀 ASIS QR Scanner Pro (Vercel Standalone Edition)

Terminal de escaneo ultrarrápido, desacoplado y de alta fidelidad para el registro de asistencias mediante códigos QR. Desarrollado para funcionar de forma 100% independiente en **Vercel** como una **PWA (Progressive Web App)** con acceso nativo a la cámara y compatibilidad universal con múltiples sistemas.

---

## 🌟 ¿Por qué alojar el escáner en Vercel?

1. **Acceso Nativo a Hardware de Cámara:** Elimina las restricciones de permisos y bloqueos de iframes cruzados propios del entorno de Google Apps Script (`googleusercontent.com`).
2. **Velocidad Extrema (Edge CDN):** Carga en milisegundos en cualquier dispositivo móvil o tablet.
3. **PWA Instalable:** Los trabajadores o supervisores pueden pulsar **"Agregar a la pantalla de inicio"** y utilizarlo como una app nativa en iOS o Android, a pantalla completa y sin barras de navegador.
4. **Resiliencia Offline:** Si en una obra o sótano se corta la conexión 4G, el escáner guarda los registros en memoria local y los sincroniza automáticamente en cuanto detecta internet.
5. **Universalidad (Multi-Sistema):** No está atado a Google Sheets; puede enviar datos a cualquier ERP, base de datos o API REST.

---

## 🌐 ¿Puede funcionar este escáner en otros sistemas?

### **¡SÍ, TOTALMENTE!**

Al estar desacoplado de Google Apps Script, el escáner actúa como un **cliente de captura agnóstico** que transmite peticiones HTTP estándar en formato JSON.

### Sistemas Compatibles Inmediatamente:
- **Google Apps Script / Google Sheets** (Backend actual mediante `doPost`).
- **APIs REST Propias** (Node.js, Express, Python FastAPI, Django, PHP Laravel, C# .NET, Go).
- **Sistemas ERP y RRHH** (Odoo, SAP, Buk, GeoVictoria, Meta4).
- **Bases de datos BaaS** (Supabase, Firebase, PocketBase).
- **Plataformas de Automatización** (n8n, Make, Zapier, Webhooks).

### Protocolo JSON Universal emitido por el Escáner:
```json
{
  "action": "recordAttendance",
  "apiKey": "mi-token-secreto-opcional",
  "data": {
    "userId": "10234567",
    "name": "Carlos Rodríguez",
    "type": "Entrada"
  },
  "meta": {
    "timestamp": "2026-10-26T15:30:00.000Z",
    "source": "Vercel-Scanner-Personal",
    "scannerUrl": "https://asys-scanner.vercel.app"
  }
}
```

---

## 🛠️ Modos de Operación

1. **Modo Móvil Personal (Empleado escanea QR de Obra):**
   - El trabajador abre la URL en su celular.
   - Configura su DNI/ID una sola vez (queda grabado en su teléfono).
   - Selecciona "Entrada" o "Salida" y apunta al QR oficial (`QR-MAESTRO-ASISTENCIA-V1`) pegado en la pared de la constructora.
2. **Modo Tótem / Kiosco (Cámara fija escanea Carnet del Empleado):**
   - Una tablet o teléfono se coloca en un pedestal o en la garita de guardia.
   - La cámara queda encendida continuamente.
   - El empleado muestra el código QR de su credencial o carnet (con su ID o JSON) y el registro se realiza en menos de 0.5 segundos con confirmación por audio.

---

## 🚀 Despliegue en Vercel (Paso a Paso)

### Opción 1: Despliegue Directo con Vercel CLI (Más rápido)
1. Abre tu terminal en la carpeta `asys-qr-scanner`:
   ```bash
   cd "asys-qr-scanner"
   ```
2. Ejecuta el comando de Vercel:
   ```bash
   npx vercel
   ```
3. Responde a las preguntas interactivas (presiona `Enter` para aceptar los valores por defecto).
4. Para pasar a producción:
   ```bash
   npx vercel --prod
   ```
5. ¡Listo! Recibirás una URL como `https://asys-qr-scanner-xxx.vercel.app`.

### Opción 2: Despliegue vía GitHub (Recomendado para producción continua)
1. Crea un nuevo repositorio en GitHub (ej: `asys-qr-scanner`).
2. Sube el contenido de la carpeta `asys-qr-scanner` a ese repositorio.
3. Entra a [vercel.com](https://vercel.com) e inicia sesión.
4. Haz clic en **"Add New..."** -> **"Project"**.
5. Selecciona tu repositorio de GitHub y haz clic en **"Deploy"**.
6. En 30 segundos tu escáner estará en línea con HTTPS y certificado SSL automático.

---

## 🔗 Conexión con Google Apps Script (Asys Constructora)

1. En tu hoja de cálculo o editor de Google Apps Script, verifica que los cambios de `Código.js` (función `doPost`) estén guardados.
2. Haz clic en **Implementar (Deploy)** -> **Gestionar implementaciones** o **Nueva implementación**.
3. Selecciona tipo: **Aplicación web**.
4. Configura:
   - **Ejecutar como:** `Yo (tu correo)`
   - **Quién tiene acceso:** `Cualquiera (Anyone)` *(Indispensable para que el escáner pueda conectarse)*.
5. Haz clic en **Implementar** y copia la **URL de la aplicación web**:
   `https://script.google.com/macros/s/AKfycbx.../exec`
6. Abre el escáner en Vercel, pulsa el ícono de **Tuerca (Ajustes)** y pega la URL en el campo **URL del Endpoint**.
7. Pulsa **"Probar Conexión con Servidor"** y luego **"Guardar y Aplicar"**.

---

## ⚡ Enlace Mágico por URL (Zero-Configuration)

Puedes generar enlaces preconfigurados para que los trabajadores no tengan que configurar nada manualmente:

```text
https://tu-scanner.vercel.app/?endpoint=https://script.google.com/macros/s/XXX/exec&mode=master&masterId=QR-MAESTRO-ASISTENCIA-V1
```

O para un punto de control tipo tótem:
```text
https://tu-scanner.vercel.app/?endpoint=https://script.google.com/macros/s/XXX/exec&mode=badge
```

Al abrir ese link, el escáner se autoconfigura en silencio y queda listo para usar.
