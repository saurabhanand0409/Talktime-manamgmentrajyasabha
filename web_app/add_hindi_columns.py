"""
Add Hindi columns to parliament_seats table
Run from web_app directory
"""
import mysql.connector
import os
from dotenv import load_dotenv

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

conn = mysql.connector.connect(
    host=os.getenv('DB_HOST'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    database=os.getenv('DB_NAME')
)
cursor = conn.cursor()

# Get current columns
cursor.execute("SHOW COLUMNS FROM parliament_seats")
columns = [c[0] for c in cursor.fetchall()]
print(f"Current columns: {columns}")

# Add Hindi columns if missing
if 'name_hindi' not in columns:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN name_hindi VARCHAR(100) AFTER name")
    print("Added name_hindi column")
else:
    print("name_hindi column already exists")

if 'party_hindi' not in columns:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN party_hindi VARCHAR(50) AFTER party")
    print("Added party_hindi column")
else:
    print("party_hindi column already exists")

if 'state_hindi' not in columns:
    cursor.execute("ALTER TABLE parliament_seats ADD COLUMN state_hindi VARCHAR(50) AFTER state")
    print("Added state_hindi column")
else:
    print("state_hindi column already exists")

conn.commit()
print("\nHindi columns setup complete!")
conn.close()
