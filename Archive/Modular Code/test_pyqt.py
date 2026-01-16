from PyQt5.QtWidgets import QApplication, QLabel

app = QApplication([])
window = QLabel('Hello, PyQt!')  # Simple test widget
window.setStyleSheet("font-size: 24px; font-weight: bold; color: #000;")
window.show()
app.exec_()
