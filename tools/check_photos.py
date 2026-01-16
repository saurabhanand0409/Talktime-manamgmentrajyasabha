import mysql.connector
from dotenv import load_dotenv
import os

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

conn = mysql.connector.connect(
    host=os.getenv('DB_HOST','127.0.0.1'),
    user=os.getenv('DB_USER','root'),
    password=os.getenv('DB_PASSWORD',''),
    database=os.getenv('DB_NAME','dashboard_db')
)
cursor = conn.cursor()

print("Current photo state for seats 1-15:")
print("="*60)

cursor.execute("""
    SELECT seat_no, name, 
           CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo
    FROM parliament_seats 
    WHERE seat_no <= 15 
    ORDER BY seat_no
""")

for row in cursor.fetchall():
    name = (row[1] or '-')[:35]
    print(f"Seat {row[0]:2}: {name:35} | Photo: {row[2]}")

conn.close()

