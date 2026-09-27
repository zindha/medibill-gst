import sqlite3, time
db=r"C:/ProgramData/MediBill/data/medibill.db"
con=sqlite3.connect(db)
cur=con.cursor()
now_ms = int(time.time()*1000)
print("now_ms", now_ms)
for row in cur.execute('SELECT id, user_id, token, expires_at, created_at FROM sessions WHERE user_id="h-iq6qxC_tvgVeeN" ORDER BY created_at DESC LIMIT 5'):
    print(row, "expires_in_days", (row[3]-now_ms)/86400000)
for row in cur.execute('SELECT id, name, email FROM users WHERE id="h-iq6qxC_tvgVeeN"'):
    print("user", row)
# Try with the token that was in localStorage earlier - get from browser? Need to find a valid token
for row in cur.execute('SELECT token, expires_at FROM sessions WHERE user_id="h-iq6qxC_tvgVeeN"'):
    print("token", row[0][:10], "expires", row[1], "now", now_ms, "valid", row[1] > now_ms)
