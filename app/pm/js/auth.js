import { GoogleAuthProvider, signInWithPopup, signOut, getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

let accessToken = null;

export function setupAuth(auth) {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        
        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            accessToken = credential?.accessToken;
        } catch (error) {
            console.error("Login error:", error);
        }
    });

    logoutBtn.addEventListener('click', logout);
}

export function getGoogleAccessToken() {
    return accessToken;
}

function logout() {
    const auth = getAuth();
    accessToken = null;
    signOut(auth).then(() => {
        console.log("User signed out");
    }).catch((error) => {
        console.error("Error signing out:", error);
    });
}

window.logout = logout;

