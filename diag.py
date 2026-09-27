import sqlite3, os
db=r"C:/ProgramData/MediBill/data/medibill.db"
con=sqlite3.connect(db)
cur=con.cursor()
print("Tables:")
for row in cur.execute('SELECT name FROM sqlite_master WHERE type="table"'):
    print(row[0])
print("\n--- medicines ---")
for row in cur.execute('SELECT id, name, brand, is_active, created_by, created_at FROM medicines ORDER BY created_at DESC LIMIT 10'):
    print(row)
print("\n--- users ---")
for row in cur.execute('SELECT id, email, name FROM users LIMIT 5'):
    print(row)
print("\n--- batches count ---")
for row in cur.execute('SELECT count(*) FROM batches'):
    print(row)
print("\n--- inventory_transactions count ---")
for row in cur.execute('SELECT count(*) FROM inventory_transactions'):
    print(row)
print("\n--- FK check ---")
for row in cur.execute('PRAGMA foreign_key_check'):
    print(row)
