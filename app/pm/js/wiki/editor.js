let easyMDE;

export function initializeEditor(content) {
    if (!easyMDE) {
        easyMDE = new EasyMDE({
            element: document.getElementById('wikiPageContent'),
            spellChecker: false,
            autofocus: true,
            placeholder: "Write your content here...",
            toolbar: ["bold", "italic", "strikethrough", "code", "unordered-list", "ordered-list", "link", "image"],
        });
    }
    
    easyMDE.value(content);
    window.easyMDE = easyMDE;
}

export function destroyEditor() {
    if (easyMDE) {
        easyMDE.toTextArea();
        easyMDE = null;
    }
}

