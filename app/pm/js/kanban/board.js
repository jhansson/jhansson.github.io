import { collection, addDoc, getDocs, deleteDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { currentUser, setCurrentBoardId, db } from '../main.js';
import { loadBoard } from './card.js';

export async function loadBoards() {
    const boardSelector = document.getElementById('boardSelector');
    boardSelector.innerHTML = '';
    const querySnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'boards'));
    querySnapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().name;
        boardSelector.appendChild(option);
    });
    if (boardSelector.options.length > 0) {
        setCurrentBoardId(boardSelector.options[0].value);
        loadBoard(boardSelector.options[0].value);
    }
}

export function switchBoard() {
    const boardId = document.getElementById('boardSelector').value;
    setCurrentBoardId(boardId);
    loadBoard(boardId);
}

export async function createNewBoard() {
    const boardName = prompt('Enter a name for the new board:');
    if (boardName) {
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'boards'), {
            name: boardName
        });
        await setDoc(doc(db, 'users', currentUser.uid, 'boards', docRef.id, 'columns', 'todo'), { name: 'To Do' });
        await setDoc(doc(db, 'users', currentUser.uid, 'boards', docRef.id, 'columns', 'inprogress'), { name: 'In Progress' });
        await setDoc(doc(db, 'users', currentUser.uid, 'boards', docRef.id, 'columns', 'done'), { name: 'Done' });
        loadBoards();
    }
}

export async function deleteCurrentBoard() {
    const currentBoardId = document.getElementById('boardSelector').value;
    if (currentBoardId && confirm('Are you sure you want to delete this board?')) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId));
        loadBoards();
    }
}
