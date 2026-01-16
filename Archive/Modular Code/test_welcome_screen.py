from PyQt5.QtWidgets import QApplication
from screens.welcome_screen import WelcomeScreen

app = QApplication([])
welcome_screen = WelcomeScreen()
welcome_screen.show()
app.exec_()

