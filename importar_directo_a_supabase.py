import csv
import json
import urllib.request
import urllib.error

SUPABASE_URL = 'https://bitplsgoqipffkamdmnx.supabase.co/rest/v1/usuarios'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpdHBsc2dvcWlwZmZrYW1kbW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDA5ODAsImV4cCI6MjEwODYxNjk4MH0.Dju5VAHt4vwdzsCzbis9S-Z0ZSS64XaMwGXryQ_EeZE'

headers = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
}

records = []
with open('usuarios_para_importar_con_email.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        records.append({
            'user_id': row['user_id'],
            'nombre': row['nombre'],
            'email': row['email'],
            'password_hash': row['password_hash'],
            'rol': row['rol'],
            'estado': row['estado'],
            'sub_rol': row['sub_rol']
        })

print(f"Cargados {len(records)} registros para importar...")

# Insertar en lotes de 50
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
