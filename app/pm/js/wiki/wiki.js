import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { currentUser, currentBoardId, db } from '../main.js';
import { initializeEditor, destroyEditor } from './editor.js';

let wikiPages = [];
let currentWikiPageId = null;
let draggedItem = null;

export function setupWiki() {
    window.createNewWikiPage = createNewWikiPage;
    window.editCurrentWikiPage = editCurrentWikiPage;
    window.saveWikiPage = saveWikiPage;
    window.cancelWikiEdit = cancelWikiEdit;
    window.deleteCurrentWikiPage = deleteCurrentWikiPage;
    window.createSubPage = createSubPage;
}

export async function loadWikiPages() {
    const wikiPageListItems = document.getElementById('wikiPageListItems');
    wikiPageListItems.innerHTML = '';
    const querySnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages'));
    wikiPages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        sortOrder: doc.data().sortOrder || 0,  // Add default sortOrder
        ...doc.data()
    }));
    
    // Sort pages by sortOrder
    const rootPages = wikiPages
        .filter(page => !page.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    rootPages.forEach(page => {
        wikiPageListItems.appendChild(createWikiPageListItem(page));
    });

    if (wikiPages.length > 0) {
        loadWikiPage(wikiPages[0].id);
    } else {
        document.getElementById('wikiContent').innerHTML = 'No pages yet. Create a new page to get started!';
    }
}

function createWikiPageListItem(page) {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.pageId = page.id;
    
    // Add drag event listeners
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragend', handleDragEnd);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);

    const itemDiv = document.createElement('div');
    itemDiv.className = 'wiki-page-item';
    
    const arrow = document.createElement('span');
    arrow.className = 'wiki-page-arrow';
    const title = document.createElement('span');
    title.className = 'wiki-page-title';
    title.textContent = page.title;

    itemDiv.appendChild(arrow);
    itemDiv.appendChild(title);
    li.appendChild(itemDiv);

    const childPages = wikiPages
        .filter(childPage => childPage.parentId === page.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    if (childPages.length > 0) {
        const subList = document.createElement('ul');
        subList.className = 'wiki-subpages';
        subList.style.display = 'none';
        childPages.forEach(childPage => {
            subList.appendChild(createWikiPageListItem(childPage));
        });
        li.appendChild(subList);

        arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            arrow.classList.toggle('expanded');
            subList.style.display = subList.style.display === 'none' ? 'block' : 'none';
        });
    } else {
        arrow.style.visibility = 'hidden';
    }

    title.addEventListener('click', () => loadWikiPage(page.id));

    return li;
}

async function loadWikiPage(pageId) {
    currentWikiPageId = pageId;
    const docRef = doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages', pageId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        const page = docSnap.data();
        const wikiContent = document.getElementById('wikiContent');
        wikiContent.innerHTML = `<h2>${page.title}</h2>` + marked.parse(page.content);
        
        document.querySelectorAll('#wikiPageListItems li .wiki-page-title').forEach(span => {
            span.style.fontWeight = span.textContent === page.title ? 'bold' : 'normal';
        });
    }
}

async function createNewWikiPage(parentId = null) {
    const title = prompt('Enter the title for the new wiki page:');
    if (title) {
        // Get max sort order of siblings
        const siblings = wikiPages.filter(p => p.parentId === parentId);
        const maxSortOrder = siblings.length > 0 
            ? Math.max(...siblings.map(p => p.sortOrder))
            : 0;

        const newPage = {
            title: title,
            content: '',
            parentId: parentId,
            sortOrder: maxSortOrder + 1,  // Add this line
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages'), newPage);
        await loadWikiPages();
        currentWikiPageId = docRef.id;
        editCurrentWikiPage();
    }
}

async function editCurrentWikiPage() {
    const docRef = doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages', currentWikiPageId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        document.getElementById('wikiContent').style.display = 'none';
        document.getElementById('wikiEditor').style.display = 'flex';
        
        initializeEditor(docSnap.data().content);
    }
}

async function saveWikiPage() {
    const content = window.easyMDE.value();
    await updateDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages', currentWikiPageId), {
        content: content
    });
    document.getElementById('wikiContent').style.display = 'block';
    document.getElementById('wikiEditor').style.display = 'none';
    
    destroyEditor();
    
    await loadWikiPage(currentWikiPageId);
}

function cancelWikiEdit() {
    document.getElementById('wikiContent').style.display = 'block';
    document.getElementById('wikiEditor').style.display = 'none';
    destroyEditor();
}

async function deleteCurrentWikiPage() {
    if (confirm('Are you sure you want to delete this wiki page?')) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages', currentWikiPageId));
        loadWikiPages();
    }
}

function createSubPage() {
    createNewWikiPage(currentWikiPageId);
}

// Add these new functions for drag and drop handling
function handleDragStart(e) {
    draggedItem = e.target;
    e.target.classList.add('dragging');
    // Add a nice dragging visual effect
    e.target.style.opacity = '0.4';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    e.target.style.opacity = '1';
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    const li = e.target.closest('li');
    if (!li) return;
    
    const rect = li.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const dropPosition = e.clientY < midPoint ? 'before' : 'after';
    
    // Remove existing drop indicators
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    
    // Add drop indicator
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    li.insertAdjacentElement(dropPosition === 'before' ? 'beforebegin' : 'afterend', indicator);
}

async function handleDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    
    const targetLi = e.target.closest('li');
    if (!targetLi || !draggedItem || targetLi === draggedItem) return;

    const draggedPageId = draggedItem.dataset.pageId;
    const targetPageId = targetLi.dataset.pageId;
    
    const rect = targetLi.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const dropPosition = e.clientY < midPoint ? 'before' : 'after';
    
    // Get the new parent (if dropping into a subpage list)
    const newParentId = targetLi.closest('ul.wiki-subpages')?.closest('li')?.dataset.pageId || null;
    
    // Update the page order in Firebase
    await updatePageOrder(draggedPageId, targetPageId, dropPosition, newParentId);
    
    // Reload the wiki pages to reflect the new order
    await loadWikiPages();
}

async function updatePageOrder(draggedPageId, targetPageId, position, newParentId) {
    const pages = [...wikiPages];
    const draggedPage = pages.find(p => p.id === draggedPageId);
    const targetPage = pages.find(p => p.id === targetPageId);
    
    // Get siblings (pages at the same level)
    const siblings = pages.filter(p => p.parentId === newParentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    
    // Calculate new sort order
    const targetIndex = siblings.findIndex(p => p.id === targetPageId);
    const newSortOrder = position === 'before' 
        ? targetPage.sortOrder - 1
        : targetPage.sortOrder + 1;
    
    // Update the dragged page
    const updates = [{
        id: draggedPageId,
        data: {
            parentId: newParentId,
            sortOrder: newSortOrder
        }
    }];
    
    // Reorder affected pages
    siblings.forEach(page => {
        if (page.sortOrder >= newSortOrder && page.id !== draggedPageId) {
            updates.push({
                id: page.id,
                data: { sortOrder: page.sortOrder + 1 }
            });
        }
    });
    
    // Update all affected pages in Firebase
    await Promise.all(updates.map(update => 
        updateDoc(doc(db, 'users', currentUser.uid, 'boards', currentBoardId, 'wikiPages', update.id), update.data)
    ));
}
