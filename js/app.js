const loginBtn =
document.getElementById("loginBtn");

loginBtn.addEventListener(
    "click",
    function(){

        const email =
        document.getElementById("email").value;

        const password =
        document.getElementById("password").value;

        if(email === "" || password === ""){

            alert(
                "Please fill all fields"
            );

            return;
        }

        alert(
            "Login Successful!"
        );

    }
);