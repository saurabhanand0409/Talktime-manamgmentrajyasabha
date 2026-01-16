from utils import execute_query

users = execute_query("SELECT * FROM users;", fetch_all=True)
print(users) 