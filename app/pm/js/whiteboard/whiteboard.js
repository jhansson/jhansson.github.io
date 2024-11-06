import { db, auth } from '../firebase-config.js';
import { ref, set, get } from 'firebase/database';

export class Whiteboard {
    constructor() {
        this.canvas = document.getElementById('whiteboardCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('whiteboardContainer');
        this.currentTool = 'select';
        this.isDrawing = false;
        this.elements = [];
        this.selectedElement = null;
        
        this.initializeCanvas();
        this.setupEventListeners();
        this.setupTools();
    }

    initializeCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.container.offsetWidth;
        this.canvas.height = this.container.offsetHeight;
        this.redraw();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTool(e.target.dataset.tool);
            });
        });

        document.getElementById('clearBoard').addEventListener('click', () => this.clearBoard());
        document.getElementById('saveBoard').addEventListener('click', () => this.saveBoard());
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    handleMouseDown(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'pen') {
            this.startPath(pos);
        } else if (this.currentTool === 'note') {
            this.createStickyNote(pos);
        }
    }

    handleMouseMove(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        if (this.currentTool === 'pen') {
            this.drawPath(pos);
        }
    }

    handleMouseUp() {
        this.isDrawing = false;
        if (this.currentTool === 'pen') {
            this.completePath();
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    createStickyNote(pos) {
        const note = document.createElement('div');
        note.className = 'sticky-note';
        note.style.left = `${pos.x}px`;
        note.style.top = `${pos.y}px`;
        
        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Type your note here...';
        note.appendChild(textarea);
        
        this.container.appendChild(note);
        this.makeDraggable(note);
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    async saveBoard() {
        if (!auth.currentUser) return;
        
        const boardData = {
            elements: this.elements,
            notes: Array.from(document.querySelectorAll('.sticky-note')).map(note => ({
                text: note.querySelector('textarea').value,
                x: note.offsetLeft,
                y: note.offsetTop,
                width: note.offsetWidth,
                height: note.offsetHeight
            }))
        };

        try {
            await set(ref(db, `users/${auth.currentUser.uid}/whiteboards/default`), boardData);
            alert('Whiteboard saved successfully!');
        } catch (error) {
            console.error('Error saving whiteboard:', error);
            alert('Error saving whiteboard');
        }
    }

    async loadBoard() {
        if (!auth.currentUser) return;

        try {
            const snapshot = await get(ref(db, `users/${auth.currentUser.uid}/whiteboards/default`));
            const data = snapshot.val();
            
            if (data) {
                this.elements = data.elements || [];
                this.redraw();
                
                // Clear existing notes
                document.querySelectorAll('.sticky-note').forEach(note => note.remove());
                
                // Recreate notes
                data.notes?.forEach(note => {
                    const noteElement = document.createElement('div');
                    noteElement.className = 'sticky-note';
                    noteElement.style.left = `${note.x}px`;
                    noteElement.style.top = `${note.y}px`;
                    noteElement.style.width = `${note.width}px`;
                    noteElement.style.height = `${note.height}px`;
                    
                    const textarea = document.createElement('textarea');
                    textarea.value = note.text;
                    noteElement.appendChild(textarea);
                    
                    this.container.appendChild(noteElement);
                    this.makeDraggable(noteElement);
                });
            }
        } catch (error) {
            console.error('Error loading whiteboard:', error);
        }
    }

    clearBoard() {
        if (confirm('Are you sure you want to clear the board?')) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.elements = [];
            document.querySelectorAll('.sticky-note').forEach(note => note.remove());
        }
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.elements.forEach(element => {
            if (element.type === 'path') {
                this.drawSavedPath(element);
            }
        });
    }
} 