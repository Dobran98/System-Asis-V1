import csv
import json
import urllib.request
import urllib.error
import os

SUPABASE_URL = 'https://bitplsgoqipffkamdmnx.supabase.co/rest/v1/usuarios'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpdHBsc2dvcWlwZmZrYW1kbW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDA5ODAsImV4cCI6MjEwODYxNjk4MH0.Dju5VAHt4vwdzsCzbis9S-Z0ZSS64XaMwGXryQ_EeZE'

headers = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
}

csv_file = 'usuarios_200_completo.csv' if os.path.exists('usuarios_200_completo.csv') else 'usuarios_para_importar_con_email.csv'
print(f"Leyendo archivo: {csv_file}...")

records = []
with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        nombre = row.get('nombre', '').strip()
        primer_nombre = nombre.split()[0].lower() if nombre else ''
        email = row.get('email', '').strip() or None
        cedula = row.get('cedula', '').strip() or None
        turno = row.get('turno', 'mañana').strip().lower()
        if turno not in ['mañana', 'tarde', 'mixto', 'nocturno']:
            turno = 'mañana'

        records.append({
            'user_id': row['user_id'].strip(),
            'nombre': nombre,
            'primer_nombre': primer_nombre,
            'email': email,
            'cedula': cedula,
            'turno': turno,
            'password_hash': row.get('password_hash', 'user123').strip(),
            'rol': row.get('rol', 'Usuario').strip(),
            'estado': row.get('estado', 'Activo').strip(),
            'sub_rol': row.get('sub_rol', 'Operador/a').strip(),
            'institucion': row.get('institucion', 'Constructora del Alba').strip()
        })

print(f"Cargados {len(records)} registros listos para sincronizar...")

BATCH_SIZE = 50
total_processed = 0

for i in range(0, len(records), BATCH_SIZE):
    batch = records[i:i + BATCH_SIZE]
    data = json.dumps(batch).encode('utf-8')
    req = urllib.request.Request(SUPABASE_URL, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as res:
            total_processed += len(batch)
            print(f"[OK] Lote procesado: {total_processed}/{len(records)} usuarios")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"[ERROR] En lote {i//BATCH_SIZE + 1}: HTTP {e.code} - {err_msg}")
        break

print(f"\nFinalizado. Total procesados con éxito: {total_processed} usuarios.")
