# 🏗️ ASIS Constructora - Sistema de Asistencias QR & Gestión de Personal

[![Vercel Ready](https://img.shields.io/badge/Vercel-PWA%20Ready-black?style=flat&logo=vercel)](https://vercel.com)
[![Supabase Ready](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Status](https://img.shields.io/badge/Versi%C3%B3n-v2.0%20Desacoplada-blue)](#)

Plataforma de alta fidelidad para control de asistencia laboral mediante códigos QR, gestión de turnos, guardias, permisos, suplencias y amonestaciones automáticas para obras de construcción y sedes administrativas.

---

## 📁 Estructura del Repositorio

```text
├── asys-qr-scanner/               # Terminal de Escaneo PWA lista para Vercel
│   ├── index.html                 # Interfaz visual del escáner
│   ├── app.js                     # Motor de escaneo, sonido háptico y cola offline
│   ├── styles.css                 # Estilos y animación láser
│   ├── manifest.json              # Configuración PWA (Instalable en móvil/tablet)
│   ├── sw.js                      # Service Worker para funcionamiento sin conexión
│   └── vercel.json                # Configuración de cabeceras seguras para cámara
│
├── supabase_schema.sql            # Esquema SQL oficial para Supabase (16 tablas + RLS)
├── Código.js                      # Backend original en Google Apps Script + Gateway doPost
├── JavaScript.html                # Lógica frontend de los dashboards
├── Stylesheet.html                # Estilos generales del sistema
├── AdminDashboard.html            # Panel de Administración Central
├── CoordinadorDashboard.html      # Panel de Control para Supervisores de Obra
├── UserDashboard.html             # Portal del Empleado
├── LoginPage.html                 # Pantalla de acceso y autenticación
├── SYSTEM ASIS V1.xlsx            # Diccionario de datos y estructura de hojas
├── GUIA_DESPLIEGUE_VERCEL_Y_VINCULACION_QR.md # Guía paso a paso para Vercel
└── package.json                   # Configuración del paquete
```

---

## ⚡ Inicio Rápido

### 1. Despliegue del Escáner en Vercel
```bash
cd asys-qr-scanner
npx vercel --prod
```

### 2. Configurar Base de Datos en Supabase
1. Crea un proyecto nuevo en [Supabase](https://supabase.com).
2. Abre la pestaña **SQL Editor**.
3. Copia y pega el contenido de [`supabase_schema.sql`](supabase_schema.sql) y pulsa **Run**.
4. ¡Tus 16 tablas con índices, claves foráneas, datos semilla y WebSockets en tiempo real estarán listas al instante!

---

## 🛠️ Tecnologías
- **Frontend:** HTML5, CSS3 moderno, JavaScript ES6+.
- **Escáner QR:** Html5-QRCode Engine, PWA con Service Worker y modo Offline.
- **Base de Datos:** PostgreSQL en Supabase / Google Sheets (Legacy).
- **Hosting:** Vercel (Edge CDN con SSL automático).
