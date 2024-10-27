import { getFirestore, collection, addDoc, updateDoc, deleteDoc, onSnapshot, doc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let gantt;
let tasks = [];
let currentBoardId;
let selectedTaskId = null;
let db;
let currentUser;

export function setupGantt(app, user) {
    db = getFirestore(app);
    currentUser = user;
}

export function initGantt(boardId, user) {
    if (!user || !boardId) {
        console.error("User or board ID is missing");
        return;
    }
    currentBoardId = boardId;
    currentUser = user;
    loadTasksFromFirebase();
}

function loadTasksFromFirebase() {
    if (!db || !currentUser || !currentBoardId) {
        console.error("Firebase app not initialized or user/board not set");
        return;
    }
    const tasksRef = collection(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`);
    
    onSnapshot(tasksRef, (snapshot) => {
        tasks = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log("Raw task data:", data); // Log raw data for debugging
            
            // Convert Firestore Timestamps to JavaScript Date objects
            const start = data.start && data.start.toDate ? data.start.toDate() : new Date();
            const end = data.end && data.end.toDate ? data.end.toDate() : new Date(start.getTime() + 86400000);
            
            return {
                id: doc.id,
                name: data.name || 'Unnamed Task',
                start: start.toISOString().split('T')[0], // Format as YYYY-MM-DD
                end: end.toISOString().split('T')[0], // Format as YYYY-MM-DD
                progress: data.progress || 0
            };
        });
        
        console.log("Processed tasks:", tasks); // Log processed tasks for debugging
        
        if (tasks.length > 0) {
            initializeGanttChart();
        } else {
            document.getElementById('ganttChart').innerHTML = '<p>No tasks available. Add a task to get started.</p>';
        }
    });
}

function initializeGanttChart() {
    try {
        // Find the earliest start date and latest end date
        const startDates = tasks.map(task => new Date(task.start));
        const endDates = tasks.map(task => new Date(task.end));
        const minDate = new Date(Math.min(...startDates));
        const maxDate = new Date(Math.max(...endDates));

        // Set start date to one week before the earliest task
        const chartStartDate = new Date(minDate);
        chartStartDate.setDate(chartStartDate.getDate() - 7);

        // Set end date to three weeks after the latest task
        const chartEndDate = new Date(maxDate);
        chartEndDate.setDate(chartEndDate.getDate() + 21);

        if (gantt) {
            gantt.refresh(tasks);
        } else {
            gantt = new Gantt("#ganttChart", tasks, {
                view_modes: ['Day', 'Week', 'Month'],
                view_mode: 'Week', // Changed default view to 'Week' for better initial view
                date_format: 'YYYY-MM-DD',
                start_date: chartStartDate,
                end_date: chartEndDate,
                on_click: task => {
                    selectedTaskId = task.id;
                    openTaskModal(task);
                },
                on_date_change: (task, start, end) => {
                    updateTaskDatesInFirebase(task.id, start, end);
                },
                on_progress_change: (task, progress) => {
                    updateTaskProgressInFirebase(task.id, progress);
                },
                custom_popup_html: null,
            });
        }
        setupTaskModal();
        setupViewModeControls();
    } catch (error) {
        console.error("Error initializing Gantt chart:", error);
        document.getElementById('ganttChart').innerHTML = '<p>Error loading Gantt chart. Please try refreshing the page.</p>';
    }
}

function setupViewModeControls() {
    const viewControls = document.getElementById('ganttViewControls');
    viewControls.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const viewMode = e.target.dataset.viewMode;
            gantt.change_view_mode(viewMode);
            updateActiveViewModeButton(viewMode);
        }
    });
    updateActiveViewModeButton('Week'); // Set initial active button
}

function updateActiveViewModeButton(activeMode) {
    const buttons = document.querySelectorAll('#ganttViewControls button');
    buttons.forEach(button => {
        if (button.dataset.viewMode === activeMode) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

export function addGanttTask() {
    openTaskModal();
}

export function editGanttTask() {
    if (selectedTaskId) {
        const task = tasks.find(t => t.id === selectedTaskId);
        if (task) {
            openTaskModal(task);
        } else {
            alert("Please select a task to edit.");
        }
    } else {
        alert("Please select a task to edit.");
    }
}

export function deleteGanttTask() {
    if (selectedTaskId) {
        if (confirm("Are you sure you want to delete this task?")) {
            const taskRef = doc(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`, selectedTaskId);
            deleteDoc(taskRef)
                .then(() => {
                    console.log("Task successfully deleted");
                    selectedTaskId = null;
                })
                .catch((error) => {
                    console.error("Error deleting task: ", error);
                    alert("Error deleting task. Please try again.");
                });
        }
    } else {
        alert("Please select a task to delete.");
    }
}

function updateTaskDatesInFirebase(taskId, start, end) {
    const taskRef = doc(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`, taskId);
    updateDoc(taskRef, {
        start: new Date(start),
        end: new Date(end)
    })
    .then(() => {
        console.log("Task dates successfully updated in Firebase");
    })
    .catch((error) => {
        console.error("Error updating task dates: ", error);
        alert("Error updating task dates. Please try again.");
    });
}

function updateTaskProgressInFirebase(taskId, progress) {
    const taskRef = doc(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`, taskId);
    updateDoc(taskRef, {
        progress: progress
    })
    .then(() => {
        console.log("Task progress successfully updated in Firebase");
    })
    .catch((error) => {
        console.error("Error updating task progress: ", error);
        alert("Error updating task progress. Please try again.");
    });
}

function setupTaskModal() {
    const modal = document.getElementById("taskModal");
    const span = document.getElementsByClassName("close")[0];
    const form = document.getElementById("taskForm");

    span.onclick = () => {
        modal.style.display = "none";
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };

    form.onsubmit = (e) => {
        e.preventDefault();
        saveTask();
    };
}

function openTaskModal(task = null) {
    const modal = document.getElementById("taskModal");
    const form = document.getElementById("taskForm");
    const modalTitle = document.getElementById("modalTitle");

    if (task) {
        modalTitle.textContent = "Edit Task";
        form.taskId.value = task.id;
        form.taskName.value = task.name;
        form.taskStart.value = task.start;
        form.taskEnd.value = task.end;
        form.taskProgress.value = task.progress;
    } else {
        modalTitle.textContent = "Add New Task";
        form.reset();
        form.taskId.value = "";
    }

    modal.style.display = "block";
}

function saveTask() {
    const form = document.getElementById("taskForm");
    const taskData = {
        name: form.taskName.value,
        start: new Date(form.taskStart.value),
        end: new Date(form.taskEnd.value),
        progress: parseInt(form.taskProgress.value, 10)
    };

    if (form.taskId.value) {
        // Update existing task
        const taskRef = doc(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`, form.taskId.value);
        updateDoc(taskRef, taskData)
            .then(() => {
                console.log("Task successfully updated");
                document.getElementById("taskModal").style.display = "none";
            })
            .catch((error) => {
                console.error("Error updating task: ", error);
                alert("Error updating task. Please try again.");
            });
    } else {
        // Add new task
        addDoc(collection(db, `users/${currentUser.uid}/boards/${currentBoardId}/tasks`), taskData)
            .then(() => {
                console.log("Task successfully added");
                document.getElementById("taskModal").style.display = "none";
            })
            .catch((error) => {
                console.error("Error adding task: ", error);
                alert("Error adding task. Please try again.");
            });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    setupTaskModal();
    setupViewModeControls();
});
