import os
import sys
import mysql.connector
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(log_dir, "application.log"),
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

# Database configuration using environment variables
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
}


def check_environment():
    """
    Validates the presence of required environment variables.
    """
    logging.info("Checking environment variables...")
    required_vars = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            logging.error(f"Missing environment variable: {var}")
            print(f"Error: Missing environment variable: {var}")
            sys.exit(1)
        logging.info(f"Environment variable {var} is set.")
    print("Environment variables are valid.")


def connect_to_database():
    """
    Establishes a connection to the MySQL database using environment variables.
    Returns:
        mysql.connector.connection.MySQLConnection: Database connection object.
    """
    logging.info("Connecting to database...")
    print(f"DB_CONFIG: {DB_CONFIG}")  # Debugging output

    try:
        connection = mysql.connector.connect(**DB_CONFIG, connection_timeout=5)
        logging.info("Database connection established successfully.")
        print("Database connection established successfully!")  # Debugging output
        return connection
    except mysql.connector.Error as err:
        logging.error(f"Database connection error: {err}")
        print(f"Error: Unable to connect to the database. Reason: {err}")
        sys.exit(1)



def check_database_connection():
    """
    Validates the database connection to ensure it is reachable.
    """
    print("Connecting to database...")  # Debugging output
    try:
        connection = connect_to_database()
        if connection:
            logging.info("Database connection test successful.")
            print("Database connection successful!")  # Debugging output
            connection.close()
            print("Connection closed successfully.")  # Debugging output
        else:
            logging.error("Database connection failed.")
            print("Error: Unable to connect to the database.")
            sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error during database connection: {e}", exc_info=True)
        print(f"Error: {e}")
        sys.exit(1)

def execute_query(query, params=None, fetch_one=False, fetch_all=False):
    """
    Executes a SQL query using the database connection.
    Args:
        query (str): SQL query to execute.
        params (tuple): Parameters to bind to the query (default: None).
        fetch_one (bool): Fetch one record if True (default: False).
        fetch_all (bool): Fetch all records if True (default: False).
    Returns:
        result: Query result if fetch_one or fetch_all is specified, otherwise None.
    """
    try:
        with connect_to_database() as connection:
            with connection.cursor() as cursor:
                logging.debug(f"Executing query: {query} with params: {params}")
                cursor.execute(query, params or ())
                if fetch_one:
                    return cursor.fetchone()
                if fetch_all:
                    return cursor.fetchall()
                connection.commit()
                return None
    except mysql.connector.Error as err:
        logging.error(f"Database Query Error: {err}")
        print(f"Error executing query: {err}")
