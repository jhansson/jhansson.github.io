import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { setupAuth } from './auth.js';
import { setupKanban, loadBoards } from './kanban/kanban.js';
import { setupWiki } from './wiki/wiki.js';
import { switchTab } from './utils.js';
import { initGantt, addGanttTask, editGanttTask, deleteGanttTask, setupGantt } from './gantt.js';
import { Whiteboard } from './whiteboard/whiteboard.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

export let currentUser = null;
export let currentBoardId = null;

// Setup Gantt with the initialized Firebase app
setupGantt(app);

export function setCurrentBoardId(boardId) {
    currentBoardId = boardId;
    if (document.querySelector('.tab-button[data-tab="gantt"]').classList.contains('active')) {
        initGanttIfReady();
    }
}

function initGanttIfReady() {
    console.log("Initializing Gantt if ready");
    console.log("Current user:", currentUser);
    console.log("Current board ID:", currentBoardId);
    if (currentUser && currentBoardId) {
        initGantt(currentBoardId, currentUser);
    } else {
        console.log("Not ready to initialize Gantt");
    }
}

// Setup authentication
setupAuth(auth);

// Setup Kanban functionality
setupKanban();

// Setup Wiki functionality
setupWiki();

onAuthStateChanged(auth, user => {
    if (user) {
        console.log("User authenticated:", user);
        currentUser = user;
        setupGantt(app, user);
        document.querySelector('.header').style.display = 'flex';
        document.getElementById('loginBtn').style.display = 'none';
        loadBoards();
    } else {
        console.log("User not authenticated");
        currentUser = null;
        document.getElementById('loginBtn').style.display = 'block';
        document.querySelector('.header').style.display = 'none';
        document.getElementById('currentBoard').innerHTML = '';
        document.getElementById('boardSelector').innerHTML = '';
    }
});

// Initialize with Kanban tab active
switchTab('kanban');

// Add event listeners for tab buttons
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        console.log("Tab clicked:", button.dataset.tab);
        switchTab(button.dataset.tab);
        if (button.dataset.tab === 'gantt') {
            initGanttIfReady();
        }
    });
});

// Make Gantt functions global so they can be called from HTML
window.addGanttTask = addGanttTask;
window.editGanttTask = editGanttTask;
window.deleteGanttTask = deleteGanttTask;

console.log("main.js fully loaded");

let whiteboard;

if (tabId === 'whiteboard') {
    if (!whiteboard) {
        whiteboard = new Whiteboard();
    }
    whiteboard.loadBoard();
}
