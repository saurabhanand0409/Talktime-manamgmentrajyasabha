class Example:
    name = "Class Name"  # Class variable

    def set_instance_name(self, name):
        self.name = name  # Instance variable

    def get_name(self):
        return self.name  # Returns instance variable
obj = Example()
#obj.set_instance_name("Instance Name")
print(obj.get_name())  # Output: Instance Name
