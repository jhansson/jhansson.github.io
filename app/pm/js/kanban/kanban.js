import { loadBoards, createNewBoard, deleteCurrentBoard, switchBoard } from './board.js';
import { setupCards } from './card.js';

export function setupKanban() {
    setupCards();
    window.createNewBoard = createNewBoard;
    window.deleteCurrentBoard = deleteCurrentBoard;
    window.switchBoard = switchBoard;
}

export { loadBoards };

