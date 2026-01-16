from PyQt5.QtWidgets import QApplication
from utils import check_environment, check_database_connection
from screens.welcome_screen import WelcomeScreen
import sys
import logging
import os

# Configure logging
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(log_dir, "application.log"),
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

if __name__ == "__main__":
    try:
        print("Starting application...")
        logging.info("Starting application")

        # Step 1: Check environment variables
        print("Checking environment variables...")
        check_environment()
        print("Environment variables are valid.")
        logging.info("Environment variables are valid.")

        # Step 2: Check database connection
        print("Testing database connection...")
        check_database_connection()
        print("Database connection test completed successfully!")
        logging.info("Database connection test completed successfully!")

        # Step 3: Launch PyQt application
        print("Launching Welcome Screen...")
        logging.info("Launching Welcome Screen...")
        app = QApplication(sys.argv)
        welcome_screen = WelcomeScreen()
        welcome_screen.show()
        print("Welcome Screen launched!")  # Debugging output
        logging.info("Welcome Screen displayed.")
        sys.exit(app.exec_())  # Start the PyQt event loop

    except Exception as e:
        logging.error(f"Unhandled exception occurred: {e}", exc_info=True)
        print(f"Error: {e}")
        sys.exit(1)
