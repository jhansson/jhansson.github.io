import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { currentUser, currentBoardId, db } from '../main.js';
import { loadWikiPages } from '../wiki/wiki.js';

let draggedCard = null;
let cloneCard = null;
let placeholder = null;
let hoveredCard = null;

export function setupCards() {
    document.addEventListener('mouseover', cardHoverHandler);
    document.addEventListener('mouseout', cardHoverOutHandler);
    document.addEventListener('keydown', cardDeleteHandler);
}

export async function loadBoard(boardId) {
    const currentBoard = document.getElementById('currentBoard');
    currentBoard.innerHTML = '';
    try {
        const columnsSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'boards', boardId, 'columns'));

        const orderedColumns = ['todo', 'inprogress', 'done'];
        orderedColumns.forEach(columnId => {
            const columnDoc = columnsSnapshot.docs.find(doc => doc.id === columnId);
            if (columnDoc) {
                const column = createColumn(columnDoc.data().name, columnDoc.id);
                currentBoard.appendChild(column);
            }
        });

        const cardsSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'boards', boardId, 'cards'));
        cardsSnapshot.forEach(cardDoc => {
            const data = cardDoc.data();
            const card = createCard(cardDoc.id, data.text);
            const targetColumn = currentBoard.querySelector(`[data-column-id="${data.columnId}"]`);
            if (targetColumn) {
                targetColumn.querySelector('.cards').appendChild(card);
            }
        });

        loadWikiPages();

    } catch (error) {
        console.error("Error loading board: ", error);
    }
}

function createColumn(title, columnId) {
    const column = document.createElement('div');
    const icons = {
        "todo": "#45c6e4",
        "inprogress": "#8470f5",
        "done": "#6bdeac"
    };
    column.className = 'column';
    column.dataset.columnId = columnId;
    column.innerHTML = `
        <div class="column-header">
            <i class="column-icon" style="color: ${icons[columnId]}">•</i>
            <h2>${title}</h2>
        </div>
        <div class="cards-wrapper">
            <div class="cards"></div>
        </div>
    `;
    if (columnId === 'todo') {
        const preCard = document.createElement('div');
        preCard.className = 'pre-card';
        preCard.textContent = '+';
        preCard.onclick = () => startAddingCard(preCard);
        column.querySelector('.cards-wrapper').appendChild(preCard);
    }
    return column;
}

function createCard(id, text) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = id;
    card.innerHTML = `<div class="card-title">${text}</div>`;
    
    let dragTimeout;
    let isDragging = false;
    
    card.addEventListener('mousedown', function(e) {
        dragTimeout = setTimeout(() => {
            isDragging = true;
            dragStart.call(this, e);
        }, 250);
    });
    
    card.addEventListener('mouseup', function() {
        clearTimeout(dragTimeout);
        if (!isDragging) {
            this.focus();
        }
        isDragging = false;
    });
    
    card.addEventListener('dblclick', function(e) {
        clearTimeout(dragTimeout);
        isDragging = false;
        editCard(id);
    });

    card.addEventListener('touchstart', dragStart);
    
    return card;
}

async function editCard(cardId) {
    const cardElement = document.querySelector(`[data-id="${cardId}"]`);
    const cardTitle = cardElement.querySelector('.card-title');
    const currentText = cardTitle.textContent;
    
    cardTitle.contentEditable = true;
    cardTitle.focus();
    
    const range = document.createRange();
    range.selectNodeContents(cardTitle);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    const finishEditing = async () => {
        cardTitle.contentEditable = false;
        const newText = cardTitle.textContent.trim();
        if (newText !== currentText) {
            try {
                await updateDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'cards', cardId), {
                    text: newText
                });
            } catch (error) {
                console.error("Error renaming card: ", error);
                cardTitle.textContent = currentText;
            }
        }
    };
    
    cardTitle.addEventListener('blur', finishEditing);
    cardTitle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });
}

async function deleteCard(cardId) {
    try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'cards', cardId));
        document.querySelector(`[data-id="${cardId}"]`).remove();
    } catch (error) {
        console.error("Error deleting card: ", error);
    }
}

function insertCardWithAnimation(cardElement, containerElement) {
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'translateY(-20px)';
    containerElement.appendChild(cardElement);
    setTimeout(() => {
        cardElement.style.opacity = '1';
        cardElement.style.transform = 'translateY(0)';
    }, 50);
}

async function addCard(button) {
    const input = button.previousElementSibling;
    const text = input.value.trim();
    if (text) {
        const column = button.closest('.column');
        const columnId = column.dataset.columnId;
        try {
            const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'boards', currentBoardId, 'cards'), {
                text: text,
                columnId: columnId,
                createdAt: new Date().toISOString()
            });
            const card = createCard(docRef.id, text);
            insertCardWithAnimation(card, column.querySelector('.cards'));
            input.value = '';
        } catch (error) {
            console.error("Error adding card: ", error);
        }
    }
}

function dragStart(e) {
    e.preventDefault();
    draggedCard = this;
    
    document.body.style.userSelect = 'none';
    
    cloneCard = this.cloneNode(true);
    cloneCard.classList.add('card-dragging');

    const rect = draggedCard.getBoundingClientRect();
    cloneCard.style.width = `${rect.width}px`;
    cloneCard.style.height = `${rect.height}px`;
                
    document.body.appendChild(cloneCard);
    
    placeholder = createPlaceholder(draggedCard);
    draggedCard.parentNode.insertBefore(placeholder, draggedCard.nextSibling);
    
    if (e.type === 'touchstart') {
        moveAt(e.touches[0].pageX, e.touches[0].pageY);
    } else {
        moveAt(e.pageX, e.pageY);
    }
    
    draggedCard.style.visibility = 'hidden';
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
}

function createPlaceholder(originalCard) {
    const div = document.createElement('div');
    div.className = 'card placeholder';
    const rect = originalCard.getBoundingClientRect();
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    const style = window.getComputedStyle(originalCard);
    div.style.margin = style.margin;
    div.style.padding = style.padding;
    div.style.boxSizing = 'border-box';
    div.style.visibility = 'hidden';
    return div;
}

function moveAt(pageX, pageY) {
    const rect = cloneCard.getBoundingClientRect();
    cloneCard.style.left = pageX - rect.width / 2 + 'px';
    cloneCard.style.top = pageY - rect.height / 2 + 'px';
}

function onMouseMove(e) {
    moveAt(e.pageX, e.pageY);
    
    const columnUnderMouse = document.elementFromPoint(e.clientX, e.clientY).closest('.column');            
    
    if (columnUnderMouse) {                
        cloneCard.style.display = 'none';
        const cardUnderMouse = document.elementFromPoint(e.clientX, e.clientY).closest('.card:not(.placeholder)');
        cloneCard.style.display = 'block';
        
        if (cardUnderMouse && cardUnderMouse !== placeholder) {
            const rect = cardUnderMouse.getBoundingClientRect();
            const nextElement = (e.clientY - rect.top) < (rect.height / 2) ? cardUnderMouse : cardUnderMouse.nextElementSibling;
            columnUnderMouse.querySelector('.cards').insertBefore(placeholder, nextElement);
        } else if (!cardUnderMouse) {
            columnUnderMouse.querySelector('.cards').appendChild(placeholder);
        }
        
        placeholder.style.visibility = 'visible';
        placeholder.style.minHeight = '60px';
        placeholder.style.margin = window.getComputedStyle(draggedCard).margin;
        placeholder.style.padding = window.getComputedStyle(draggedCard).padding;
    } else {
        placeholder.style.visibility = 'hidden';
        placeholder.style.height = '0';
        placeholder.style.margin = '0';
        placeholder.style.padding = '0';
    }
}

function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    document.body.style.userSelect = '';
    
    const columnUnderMouse = document.elementFromPoint(e.clientX, e.clientY).closest('.column');
    if (columnUnderMouse) {
        const newColumnId = columnUnderMouse.dataset.columnId;
        updateCardColumn(draggedCard.dataset.id, newColumnId);
        columnUnderMouse.querySelector('.cards').insertBefore(draggedCard, placeholder);
    }
    
    cloneCard.remove();
    placeholder.remove();
    draggedCard.style.visibility = 'visible';
    draggedCard = null;
    cloneCard = null;
    placeholder = null;
}

async function updateCardColumn(cardId, newColumnId) {
    try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'cards', cardId), {
            columnId: newColumnId
        });
    } catch (error) {
        console.error('Error updating card column:', error);
    }
}

function onTouchMove(e) {
    moveAt(e.touches[0].pageX, e.touches[0].pageY);
    onMouseMove(e.touches[0]);
}

function onTouchEnd(e) {
    onMouseUp(e.changedTouches[0]);
}

function cardHoverHandler(e) {
    const card = e.target.closest('.card');
    if (card) {
        hoveredCard = card;
    }
}

function cardHoverOutHandler(e) {
    const card = e.target.closest('.card');
    if (card && card === hoveredCard) {
        hoveredCard = null;
    }
}

function cardDeleteHandler(e) {
    if (e.key === 'Delete' && hoveredCard) {
        const cardId = hoveredCard.dataset.id;
        deleteCard(cardId);
    }
}

window.startAddingCard = function(preCardElement) {
    const cardInputContainer = document.createElement('div');
    cardInputContainer.className = 'card';
    cardInputContainer.style.padding = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter card title...';
    input.className = 'card-input';
    input.style.width = '100%';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.background = 'transparent';
    input.style.color = '#ffffff';

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            addCardFromInput(this);
        }
    });

    cardInputContainer.appendChild(input);
    preCardElement.replaceWith(cardInputContainer);
    input.focus();
}

window.addCardFromInput = async function(inputElement) {
    const text = inputElement.value.trim();
    let column;
    if (text) {
        column = inputElement.closest('.column');
        const columnId = column.dataset.columnId;
        try {
            const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'boards', currentBoardId, 'cards'), {
                text: text,
                columnId: columnId,
                createdAt: new Date().toISOString()
            });
            const card = createCard(docRef.id, text);
            insertCardWithAnimation(card, column.querySelector('.cards'));
        } catch (error) {
            console.error("Error adding card: ", error);
        }
    }
    inputElement.parentElement.remove();
    const preCard = document.createElement('div');
    preCard.className = 'pre-card';
    preCard.textContent = '+';
    preCard.onclick = () => startAddingCard(preCard);
    column.querySelector('.cards-wrapper').appendChild(preCard);
}

