# Example API Calls
## Authenticate

    auth();

## Create a task

    r("addTask", {
        task: {
            project: "projectid",
            priority: false,
            body: "Foobar",
            tags:["test"],
            attachedFiles: []
        }
    });

## Modify task

    r("modifyTask", {
        modifyId: "",
        task: {
            project: "projectid",
            priority: false,
            body: "Foobar",
            tags:["test"],
            attachedFiles: []
        }
      });

## Create a new user

    r("createUser", {
        create: {
          user: "hussain1",
          name: "Hussain Khalil",
          passwd: "TestPassword",
          email: "hussain@sanpilot.co",
          miscKeys: {}
        }
      });

## List users

    r("getUsers", {
      users: []
    });
