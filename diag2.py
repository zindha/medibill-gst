import sqlite3
db=r"C:/ProgramData/MediBill/data/medibill.db"
con=sqlite3.connect(db)
cur=con.cursor()
print("FK check details:")
for row in cur.execute('PRAGMA foreign_key_check'):
    print(row)
print("\nFK list medicines:")
for row in cur.execute('PRAGMA foreign_key_list(medicines)'):
    print(row)
print("\nFK list batches:")
for row in cur.execute('PRAGMA foreign_key_list(batches)'):
    print(row)
print("\nTry soft delete Gelusil via SQL directly:")
gel_id='6TVzW0krTXtnkv4s'
try:
    con.execute('PRAGMA foreign_keys=ON')
    cur.execute('UPDATE medicines SET is_active=0, updated_at=? WHERE id=?', (int(__import__('time').time()*1000), gel_id))
    con.commit()
    print("direct SQL update succeeded")
    cur.execute('UPDATE medicines SET is_active=1 WHERE id=?', (gel_id,))
    con.commit()
    print("reverted")
except Exception as e:
    print("direct SQL failed:", e)
    import traceback; traceback.print_exc()

print("\nCheck sessions for user:")
for row in cur.execute('SELECT id, user_id, token, expires_at FROM sessions LIMIT 3'):
    print(row)
