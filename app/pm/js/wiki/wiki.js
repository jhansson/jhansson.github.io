import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { currentUser, currentBoardId, db } from '../main.js';
import { initializeEditor, destroyEditor } from './editor.js';

let wikiPages = [];
let currentWikiPageId = null;

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
    wikiPages = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    
    const rootPages = wikiPages.filter(page => !page.parentId);
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

    const childPages = wikiPages.filter(childPage => childPage.parentId === page.id);
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
        const newPage = {
            title: title,
            content: '',
            parentId: parentId,
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

