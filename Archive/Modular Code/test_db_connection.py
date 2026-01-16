import mysql.connector

DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': 'meeku0409@nand',
    'database': 'dashboard_db',
}

try:
    print("Testing database connection...")
    connection = mysql.connector.connect(**DB_CONFIG, connection_timeout=5)
    print("Database connection successful!")
    connection.close()
except mysql.connector.Error as err:
    print(f"Database connection error: {err}")
