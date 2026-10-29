import openpyxl
import csv

wb = openpyxl.load_workbook('SYSTEM ASIS V1.xlsx', data_only=True, read_only=True)
ws = wb['Usuarios']

rows_all = []
rows_nuevos = []
fieldnames = [
    'user_id', 'nombre', 'email', 'password_hash', 'rol', 
    'cedula', 'institucion', 'turno', 'estado', 'sub_rol'
]

for i, r in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue
    uid = r[0]
    if not uid:
        continue
    
    user_id = str(uid).strip()
    nombre = r[1] if r[1] and str(r[1]).strip() else f"Operador {user_id.replace('user', '')}"
    email = r[2] if r[2] and str(r[2]).strip() else f"{user_id.lower()}@empresa.com"
    password = r[3] if r[3] and str(r[3]).strip() else "user123"
    rol = r[4] if r[4] and str(r[4]).strip() in ['Admin', 'Coordinador', 'Usuario'] else 'Usuario'
    cedula = r[5] if r[5] and str(r[5]).strip() else f"V-{user_id.replace('user', '')}"
    institucion = r[6] if r[6] and str(r[6]).strip() else 'Sede Central'
    turno = 'mañana'
    estado = r[12] if r[12] and str(r[12]).strip() in ['Activo', 'Inactivo', 'Suspendido'] else 'Activo'
    sub_rol = r[14] if r[14] and str(r[14]).strip() else 'Operador/a'

    item = {
        'user_id': user_id,
        'nombre': nombre,
        'email': email,
        'password_hash': password,
        'rol': rol,
        'cedula': cedula,
        'institucion': institucion,
        'turno': turno,
        'estado': estado,
        'sub_rol': sub_rol
    }
    rows_all.append(item)
    if user_id.lower() != 'user001':
        rows_nuevos.append(item)

# 1. Archivo completo con todos los 200
with open('usuarios_200_completo.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_all)

# 2. Archivo listo para importar a Supabase (sin user001 para que no choque con la clave existente)
with open('usuarios_nuevos_199.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_nuevos)

print(f"Creados usuarios_200_completo.csv ({len(rows_all)}) y usuarios_nuevos_199.csv ({len(rows_nuevos)})")
