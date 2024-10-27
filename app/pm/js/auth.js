import { GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export function setupAuth(auth) {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider);
    });

    logoutBtn.addEventListener('click', logout);
}

function logout() {
    const auth = getAuth();
    signOut(auth).then(() => {
        console.log("User signed out");
    }).catch((error) => {
        console.error("Error signing out:", error);
    });
}

window.logout = logout;

