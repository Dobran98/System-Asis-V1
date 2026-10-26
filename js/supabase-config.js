/**
 * ASIS Constructora - Configuración de Supabase
 * Conexión cliente para Vercel Frontend
 */
const SUPABASE_CONFIG = {
  url: 'https://bitplsgoqipffkamdmnx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpdHBsc2dvcWlwZmZrYW1kbW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDA5ODAsImV4cCI6MjEwODYxNjk4MH0.Dju5VAHt4vwdzsCzbis9S-Z0ZSS64XaMwGXryQ_EeZE'
};

// Inicializar cliente oficial de Supabase
if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  console.log('⚡ [Supabase] Cliente inicializado correctamente para', SUPABASE_CONFIG.url);
} else {
  console.error('❌ [Supabase] SDK no disponible en window.supabase.');
}
