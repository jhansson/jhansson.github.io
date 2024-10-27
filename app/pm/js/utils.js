import { loadWikiPages } from './wiki/wiki.js';

export function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');

    if (tabName === 'wiki' && !document.getElementById('wikiPageListItems').children.length) {
        loadWikiPages();
    }
}

// Add event listeners for tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
});
