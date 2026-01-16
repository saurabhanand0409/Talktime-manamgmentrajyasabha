import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv('../.env')

conn = mysql.connector.connect(
    host=os.getenv('DB_HOST'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    database=os.getenv('DB_NAME')
)
cursor = conn.cursor()

cursor.execute('''
    SELECT seat_no, name, 
    CASE WHEN picture IS NOT NULL AND LENGTH(picture) > 0 THEN 'Yes' ELSE 'No' END as has_photo 
    FROM parliament_seats
''')

print('MPs with Photos:')
print('-' * 50)
for r in cursor.fetchall():
    print(f'  Seat {r[0]}: {r[1]} - Photo: {r[2]}')

conn.close()
