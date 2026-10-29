import csv

records = []
with open(r'C:\Users\Maria\Downloads\usuarios.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    header = next(reader)
    for row in reader:
        if row and len(row) >= 5:
            records.append({
                'user_id': row[0].strip(),
                'nombre': row[1].strip() if len(row) > 1 and row[1].strip() else f"Operador {row[0].strip()}",
                'email': row[2].strip() if len(row) > 2 else '',
                'password_hash': row[3].strip() if len(row) > 3 and row[3].strip() else 'user123',
                'rol': row[4].strip() if len(row) > 4 and row[4].strip() else 'Usuario',
                'estado': row[5].strip() if len(row) > 5 and row[5].strip() else 'Activo',
                'sub_rol': row[6].strip() if len(row) > 6 and row[6].strip() else 'Operador/a'
            })

print(f'Total records read: {len(records)}')

fieldnames = ['user_id', 'nombre', 'email', 'password_hash', 'rol', 'estado', 'sub_rol']

# 1. Archivo CON correos generados (Listo para importar de inmediato sin tocar SQL)
with open('usuarios_para_importar_con_email.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in records:
        item = dict(r)
        item['email'] = item['user_id'].lower() + '@empresa.com'
        writer.writerow(item)

# 2. Archivo SIN correos (con coma estándar, para importar una vez ejecutado el SQL)
with open('usuarios_para_importar_sin_email.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in records:
        item = dict(r)
        item['email'] = ''
        writer.writerow(item)

# 3. También copiamos a Downloads para comodidad directa del usuario
with open(r'C:\Users\Maria\Downloads\usuarios_para_importar_con_email.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in records:
        item = dict(r)
        item['email'] = item['user_id'].lower() + '@empresa.com'
        writer.writerow(item)

print('Archivos creados con éxito.')
