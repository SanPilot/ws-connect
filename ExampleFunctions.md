# Example API Calls
## Authenticate

    auth();
    
## Create a task

    r("addTask", {task: {project: "projectid", priority: false, body: "Foobar", tags:["test"]}});