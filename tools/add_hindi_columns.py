"""
Add Hindi columns to parliament_seats table
"""
import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv('.env')

conn = mysql.connector.connect(
    host=os.getenv('DB_HOST'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    database=os.getenv('DB_NAME')
)
cursor = conn.cursor()

# Check if columns exist, add if not
try:
    cursor.execute("SELECT name_hindi FROM parliament_seats LIMIT 1")
    print("name_hindi column already exists")
except mysql.connector.Error:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN name_hindi VARCHAR(100) AFTER name")
    print("Added name_hindi column")

try:
    cursor.execute("SELECT party_hindi FROM parliament_seats LIMIT 1")
    print("party_hindi column already exists")
except mysql.connector.Error:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN party_hindi VARCHAR(50) AFTER party")
    print("Added party_hindi column")

try:
    cursor.execute("SELECT state_hindi FROM parliament_seats LIMIT 1")
    print("state_hindi column already exists")
except mysql.connector.Error:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN state_hindi VARCHAR(50) AFTER state")
    print("Added state_hindi column")

conn.commit()
print("\nHindi columns setup complete!")
conn.close()
