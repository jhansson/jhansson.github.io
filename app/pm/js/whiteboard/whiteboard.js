import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export class Whiteboard {
    constructor() {
        this.auth = getAuth();
        this.db = getFirestore();
        this.canvas = document.getElementById('whiteboardCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('whiteboardContainer');
        this.currentTool = 'select';
        this.isDrawing = false;
        this.elements = [];
        this.selectedElement = null;
        this.selectedNote = null;
        this.optionsBar = this.createOptionsBar();
        this.container.appendChild(this.optionsBar);
        this.textOptionsBar = this.createTextOptionsBar();
        this.container.appendChild(this.textOptionsBar);
        this.pathPoints = [];
        this.selectedPath = null;
        this.pathOptionsBar = this.createPathOptionsBar();
        this.container.appendChild(this.pathOptionsBar);
        
        this.initializeCanvas();
        this.setupEventListeners();
        this.setupTools();

        // Add keyboard event listener for delete
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Check if we're not typing in a textarea or contenteditable
                if (document.activeElement.tagName !== 'TEXTAREA' && 
                    document.activeElement.contentEditable !== 'true') {
                    if (this.selectedNote) {
                        this.selectedNote.remove();
                        this.selectedNote = null;
                        this.showOptionsBar(null);
                    }
                    if (this.selectedText) {
                        this.selectedText.remove();
                        this.selectedText = null;
                        this.showTextOptionsBar(null);
                    }
                }
            }
        });

        this.isDraggingPath = false;
        this.pathDragStart = null;
        
        // Add click listener to container for deselection
        this.container.addEventListener('mousedown', (e) => {
            if (e.target === this.canvas || e.target === this.container) {
                this.deselectAll();
            }
        });

        // Add zoom and pan properties
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
        
        // Add min/max zoom levels
        this.minZoom = 0.1;
        this.maxZoom = 5;
        
        // Add zoom and pan event listeners
        this.setupZoomAndPan();

        // Store all options bars in an array for easier management
        this.optionsBars = [
            { type: 'note', bar: this.optionsBar },
            { type: 'text', bar: this.textOptionsBar },
            { type: 'path', bar: this.pathOptionsBar }
        ];
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
        
        // Update save button handling
        this.saveButton = document.getElementById('saveBoard');
        this.saveButton.addEventListener('click', () => this.saveBoard());
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    handleMouseDown(e) {
        // Ignore right clicks for element interaction
        if (e.button === 2) return;
        
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'select') {
            const path = this.findPathAtPoint(pos);
            if (path) {
                e.preventDefault();
                e.stopPropagation();
                this.selectPath(path);
                this.isDraggingPath = true;
                this.pathDragStart = pos;
                return;
            }
            if (this.selectedPath) {
                this.deselectAll();
            }
        } else if (this.currentTool === 'pen') {
            this.deselectAll();
            this.isDrawing = true;
            this.startPath(pos);
        } else if (this.currentTool === 'text') {
            const text = this.createTextElement(pos);
            this.selectText(text);
        } else if (this.currentTool === 'note') {
            this.createStickyNote(pos);
        }
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.isDraggingPath && this.selectedPath) {
            // Calculate the movement delta
            const dx = pos.x - this.pathDragStart.x;
            const dy = pos.y - this.pathDragStart.y;
            
            // Move all points in the selected path
            this.selectedPath.points = this.selectedPath.points.map(point => ({
                x: point.x + dx,
                y: point.y + dy
            }));
            
            // Update the drag start position
            this.pathDragStart = pos;
            
            // Redraw the canvas
            this.redraw();
            
            // Update the options bar position
            this.showPathOptionsBar(this.selectedPath);
            return;
        }

        if (this.isDrawing && this.currentTool === 'pen') {
            this.drawPath(pos);
        }
    }

    handleMouseUp() {
        if (this.isDraggingPath) {
            this.isDraggingPath = false;
            this.pathDragStart = null;
        }
        
        if (this.isDrawing && this.currentTool === 'pen') {
            this.completePath();
        }
        
        this.isDrawing = false;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.offsetX) / this.scale,
            y: (e.clientY - rect.top - this.offsetY) / this.scale
        };
    }

    createStickyNote(pos) {
        const note = document.createElement('div');
        note.className = 'sticky-note';
        
        // Store original unscaled position
        note.setAttribute('data-x', pos.x);
        note.setAttribute('data-y', pos.y);
        
        // Apply scaled position
        const scaledX = pos.x * this.scale + this.offsetX;
        const scaledY = pos.y * this.scale + this.offsetY;
        
        note.style.left = `${scaledX}px`;
        note.style.top = `${scaledY}px`;
        note.style.width = '200px';
        note.style.height = '200px';
        note.style.transform = `scale(${this.scale})`;
        note.style.transformOrigin = 'top left';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'note-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            note.remove();
        };
        note.appendChild(deleteBtn);
        
        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Type your note here...';
        textarea.spellcheck = false;
        
        textarea.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        note.appendChild(textarea);
        this.container.appendChild(note);
        this.makeDraggable(note);
        
        textarea.focus();

        note.addEventListener('click', (e) => {
            if (e.target === note || e.target === textarea) {
                this.selectNote(note);
                e.stopPropagation();
            }
        });

        textarea.addEventListener('click', (e) => {
            if (note.classList.contains('selected')) {
                e.stopPropagation();
            }
        });

        document.addEventListener('click', (e) => {
            if (!note.contains(e.target) && !this.optionsBar.contains(e.target)) {
                this.deselectNote(note);
            }
        });
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const dragMouseDown = (e) => {
            if (e.button === 2) return; // Ignore right clicks
            
            if (element.classList.contains('text-element')) {
                if (e.target !== element) return;
            } else if (e.target === element.querySelector('textarea') || 
                      (e.offsetX >= element.offsetWidth - 15 && e.offsetY >= element.offsetHeight - 15)) {
                return;
            }
            
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;

            // Select the element when starting to drag
            if (element.classList.contains('sticky-note')) {
                this.selectNote(element);
            } else if (element.classList.contains('text-element')) {
                this.selectText(element);
            }
        };

        const elementDrag = (e) => {
            e.preventDefault();
            
            // Calculate the movement in screen pixels
            const dx = (e.clientX - pos3) / this.scale;
            const dy = (e.clientY - pos4) / this.scale;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // Update the data attributes with unscaled position
            const originalX = parseFloat(element.getAttribute('data-x'));
            const originalY = parseFloat(element.getAttribute('data-y'));
            const newX = originalX + dx;
            const newY = originalY + dy;
            
            element.setAttribute('data-x', newX);
            element.setAttribute('data-y', newY);
            
            // Apply scaled position
            const scaledX = newX * this.scale + this.offsetX;
            const scaledY = newY * this.scale + this.offsetY;
            
            element.style.left = `${scaledX}px`;
            element.style.top = `${scaledY}px`;

            // Update options bar position during drag
            if (element.classList.contains('sticky-note') && this.selectedNote === element) {
                this.selectNote(element);
            } else if (element.classList.contains('text-element') && this.selectedText === element) {
                this.selectText(element);
            }
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;

            // Update options bar position after drag ends
            if (element.classList.contains('sticky-note') && this.selectedNote === element) {
                this.selectNote(element);
            } else if (element.classList.contains('text-element') && this.selectedText === element) {
                this.selectText(element);
            }
        };

        element.onmousedown = dragMouseDown;
    }

    async saveBoard() {
        if (!this.auth.currentUser) return;
        
        this.saveButton.disabled = true;
        this.saveButton.innerHTML = 'Saving...';
        this.saveButton.style.opacity = '0.7';
        
        const boardData = {
            elements: this.elements,
            notes: Array.from(document.querySelectorAll('.sticky-note')).map(note => {
                // Save the original unscaled positions and dimensions
                return {
                    text: note.querySelector('textarea').value,
                    x: parseFloat(note.getAttribute('data-x')),
                    y: parseFloat(note.getAttribute('data-y')),
                    width: 200, // Use fixed width
                    height: 200, // Use fixed height
                    fontSize: note.querySelector('textarea').style.fontSize || '14px',
                    backgroundColor: note.style.backgroundColor
                };
            })
        };

        try {
            const whiteboardRef = doc(this.db, `users/${this.auth.currentUser.uid}/whiteboards/default`);
            await setDoc(whiteboardRef, boardData);
            
            // Show brief success state
            this.saveButton.innerHTML = 'Saved!';
            this.saveButton.style.background = '#4CAF50'; // Green color for success
            
            // Reset button after 1 second
            setTimeout(() => {
                this.saveButton.disabled = false;
                this.saveButton.innerHTML = 'Save';
                this.saveButton.style.opacity = '1';
                this.saveButton.style.background = '#2962ff';
            }, 1000);
        } catch (error) {
            console.error('Error saving whiteboard:', error);
            
            // Show error state
            this.saveButton.innerHTML = 'Error!';
            this.saveButton.style.background = '#f44336'; // Red color for error
            
            // Reset button after 1 second
            setTimeout(() => {
                this.saveButton.disabled = false;
                this.saveButton.innerHTML = 'Save';
                this.saveButton.style.opacity = '1';
                this.saveButton.style.background = '#2962ff';
            }, 1000);
        }
    }

    async loadBoard() {
        if (!this.auth.currentUser) return;

        try {
            const whiteboardRef = doc(this.db, `users/${this.auth.currentUser.uid}/whiteboards/default`);
            const snapshot = await getDoc(whiteboardRef);
            
            if (snapshot.exists()) {
                const data = snapshot.data();
                this.elements = data.elements || [];
                this.redraw();
                
                // Clear existing notes
                document.querySelectorAll('.sticky-note').forEach(note => note.remove());
                
                // Recreate notes
                data.notes?.forEach(note => {
                    const noteElement = document.createElement('div');
                    noteElement.className = 'sticky-note';
                    
                    // Store original unscaled position
                    noteElement.setAttribute('data-x', note.x);
                    noteElement.setAttribute('data-y', note.y);
                    
                    // Apply scaled position
                    const scaledX = note.x * this.scale + this.offsetX;
                    const scaledY = note.y * this.scale + this.offsetY;
                    
                    noteElement.style.left = `${scaledX}px`;
                    noteElement.style.top = `${scaledY}px`;
                    noteElement.style.width = '200px';  // Fixed width
                    noteElement.style.height = '200px'; // Fixed height
                    noteElement.style.transform = `scale(${this.scale})`;
                    noteElement.style.transformOrigin = 'top left';
                    
                    if (note.backgroundColor) {
                        noteElement.style.backgroundColor = note.backgroundColor;
                    }
                    
                    // Add delete button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'note-delete-btn';
                    deleteBtn.innerHTML = '×';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        noteElement.remove();
                    };
                    noteElement.appendChild(deleteBtn);
                    
                    // Add textarea
                    const textarea = document.createElement('textarea');
                    textarea.value = note.text;
                    textarea.spellcheck = false;
                    if (note.fontSize) {
                        textarea.style.fontSize = note.fontSize;
                    }
                    
                    textarea.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });
                    
                    noteElement.appendChild(textarea);
                    this.container.appendChild(noteElement);
                    this.makeDraggable(noteElement);

                    // Add selection handlers
                    noteElement.addEventListener('click', (e) => {
                        if (e.target === noteElement || e.target === textarea) {
                            this.selectNote(noteElement);
                        }
                    });

                    document.addEventListener('click', (e) => {
                        if (!noteElement.contains(e.target) && !this.optionsBar.contains(e.target)) {
                            this.deselectNote(noteElement);
                        }
                    });
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
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply zoom and pan transformation
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        
        this.elements.forEach(element => {
            if (element.type === 'path') {
                this.ctx.beginPath();
                this.ctx.strokeStyle = element.color;
                this.ctx.lineWidth = element.width;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                
                this.drawCurve(element.points);
                this.ctx.stroke();
                
                if (element === this.selectedPath) {
                    this.drawPathSelection(element);
                }
            }
        });
        
        this.ctx.restore();
    }

    setupTools() {
        this.colorPicker = document.getElementById('colorPicker');
        this.strokeWidth = document.getElementById('strokeWidth');
        
        // Set default values - white color for dark theme
        this.colorPicker.value = '#FFFFFF';
        this.currentColor = '#FFFFFF';
        this.currentStrokeWidth = parseInt(this.strokeWidth.value);

        // Add event listeners for tool controls
        this.colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });

        this.strokeWidth.addEventListener('input', (e) => {
            this.currentStrokeWidth = parseInt(e.target.value);
        });
    }

    startPath(pos) {
        this.pathPoints = [pos];
        this.currentPath = {
            type: 'path',
            color: this.currentColor,
            width: this.currentStrokeWidth,
            points: []
        };
    }

    drawPath(pos) {
        this.pathPoints.push(pos);
        
        // Clear the canvas and redraw all paths
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // First draw all existing paths with zoom and pan
        this.redraw();
        
        // Then draw the current path preview with the same transformations
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentStrokeWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Draw using curve
        this.drawCurve(this.pathPoints);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawCurve(points) {
        if (points.length < 2) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        
        if (points.length == 2) {
            this.ctx.lineTo(points[1].x, points[1].y);
        } else {
            // Use quadratic curves for smoother lines
            for (let i = 1; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                this.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            // For the last two points
            this.ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        }
    }

    completePath() {
        if (this.pathPoints.length > 1) {
            this.currentPath.points = this.pathPoints;
            this.elements.push(this.currentPath);
            
            // Automatically select the path after creation
            this.setTool('select');  // Switch to select tool
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === 'select');
            });
            this.selectPath(this.currentPath);  // Select the newly created path
        }
        this.pathPoints = [];
        this.currentPath = null;
        this.isDrawing = false;
    }

    findPathAtPoint(pos) {
        // Check paths in reverse order (top to bottom)
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            if (element.type === 'path') {
                // Increase threshold for easier selection
                const threshold = Math.max(20, element.width + 10);
                
                // Check each segment of the path
                for (let j = 0; j < element.points.length - 1; j++) {
                    const p1 = element.points[j];
                    const p2 = element.points[j + 1];
                    
                    // Calculate distance from point to line segment
                    const distance = this.pointToLineDistance(pos, p1, p2);
                    if (distance < threshold) {
                        console.log('Path found!'); // Debug log
                        return element;
                    }
                }
            }
        }
        console.log('No path found'); // Debug log
        return null;
    }

    isPointNearPath(point, path) {
        const threshold = Math.max(10, path.width + 5); // At least 10px, or path width + 5px
        
        for (let i = 0; i < path.points.length - 1; i++) {
            const p1 = path.points[i];
            const p2 = path.points[i + 1];
            
            const distance = this.pointToLineDistance(point, p1, p2);
            if (distance < threshold) {
                return true;
            }
        }
        return false;
    }

    pointToLineDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }
        
        const dx = point.x - xx;
        const dy = point.y - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }

    selectPath(path) {
        this.deselectAll();
        
        this.selectedPath = path;
        
        // Force redraw to ensure path is in correct position
        this.redraw();
        
        // Calculate correct position before showing options bar
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity;
        
        path.points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
        });
        
        // Update path position if needed
        path.centerX = (minX + maxX) / 2;
        path.topY = minY;
        
        // Now show the options bar
        this.showPathOptionsBar(path);
        
        // Update color picker and stroke width
        const colorPicker = this.pathOptionsBar.querySelector('input[type="color"]');
        const strokeWidth = this.pathOptionsBar.querySelector('select');
        if (colorPicker) colorPicker.value = path.color;
        if (strokeWidth) strokeWidth.value = path.width;
    }

    showPathOptionsBar(path) {
        if (!path) {
            this.pathOptionsBar.classList.remove('visible');
            this.pathOptionsBar.style.display = 'none';
            return;
        }

        // Temporarily make the options bar visible but hidden to get its dimensions
        this.pathOptionsBar.style.visibility = 'hidden';
        this.pathOptionsBar.style.display = 'flex';
        
        // Force a reflow to get correct dimensions
        void this.pathOptionsBar.offsetHeight;
        
        // Calculate the bounding box of the path in screen coordinates
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        path.points.forEach(point => {
            const screenX = point.x * this.scale + this.offsetX;
            const screenY = point.y * this.scale + this.offsetY;
            minX = Math.min(minX, screenX);
            maxX = Math.max(maxX, screenX);
            minY = Math.min(minY, screenY);
            maxY = Math.max(maxY, screenY);
        });
        
        const containerRect = this.container.getBoundingClientRect();
        const barWidth = this.pathOptionsBar.offsetWidth;
        const barHeight = this.pathOptionsBar.offsetHeight;
        
        // Center horizontally over the path
        let left = minX + (maxX - minX) / 2 - barWidth / 2;
        // Position above the path
        let top = minY - barHeight - 10;
        
        // If not enough space above, position below
        if (top < 10) {
            top = maxY + 10;
        }
        
        // Keep within container bounds
        if (left < 10) {
            left = 10;
        } else if (left + barWidth > containerRect.width - 10) {
            left = containerRect.width - barWidth - 10;
        }
        
        // Set position and make fully visible
        this.pathOptionsBar.style.left = `${left}px`;
        this.pathOptionsBar.style.top = `${top}px`;
        this.pathOptionsBar.style.visibility = 'visible';
        this.pathOptionsBar.classList.add('visible');
    }

    drawPathSelection(path) {
        this.ctx.save();
        
        // Draw outer glow
        this.ctx.strokeStyle = '#2962ff';
        this.ctx.lineWidth = path.width + 6;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalAlpha = 0.3;
        this.drawCurve(path.points);
        this.ctx.stroke();
        
        // Draw selection points at the ends
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#2962ff';
        const startPoint = path.points[0];
        const endPoint = path.points[path.points.length - 1];
        
        [startPoint, endPoint].forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        this.ctx.restore();
    }

    createOptionsBar() {
        const bar = document.createElement('div');
        bar.className = 'options-bar';
        
        // Font size control
        const fontSize = document.createElement('select');
        fontSize.innerHTML = `
            <option value="12">12px</option>
            <option value="14" selected>14px</option>
            <option value="16">16px</option>
            <option value="18">18px</option>
            <option value="20">20px</option>
            <option value="24">24px</option>
        `;
        fontSize.addEventListener('change', () => {
            if (this.selectedNote) {
                const textarea = this.selectedNote.querySelector('textarea');
                textarea.style.fontSize = `${fontSize.value}px`;
            }
        });

        // Color options
        const colors = ['#333333', '#325739', '#b93973', '#3942b9', '#b98439'];
        const colorOptions = document.createElement('div');
        colorOptions.className = 'color-options';
        
        colors.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = 'color-option';
            colorBtn.style.backgroundColor = color;
            colorBtn.addEventListener('click', () => {
                if (this.selectedNote) {
                    this.selectedNote.style.backgroundColor = color;
                }
            });
            colorOptions.appendChild(colorBtn);
        });

        // Add elements to bar
        bar.appendChild(fontSize);
        bar.appendChild(document.createElement('div')).className = 'divider';
        bar.appendChild(colorOptions);

        return bar;
    }

    showOptionsBar(element, type) {
        if (!element) {
            this.hideAllOptionsBars();
            return;
        }

        // Hide all other options bars first
        this.hideAllOptionsBars();
        
        const { bar } = this.optionsBars.find(b => b.type === type);
        if (!bar) return;

        const containerRect = this.container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const barWidth = bar.offsetWidth || 200;
        const barHeight = bar.offsetHeight || 40;
        
        // Calculate position relative to the container
        const relativeLeft = elementRect.left - containerRect.left;
        const relativeTop = elementRect.top - containerRect.top;
        
        // Center horizontally over the element
        let left = relativeLeft + (elementRect.width / 2) - (barWidth / 2);
        // Position above the element by default
        let top = relativeTop - barHeight - 10;
        
        // If not enough space above, position below
        if (top < 10) {
            top = relativeTop + elementRect.height + 10;
        }
        
        // Keep within container bounds
        if (left < 10) {
            left = 10;
        } else if (left + barWidth > containerRect.width - 10) {
            left = containerRect.width - barWidth - 10;
        }
        
        bar.style.left = `${left}px`;
        bar.style.top = `${top}px`;
        bar.style.display = 'flex';
        bar.classList.add('visible');
    }

    selectNote(note) {
        if (this.selectedNote) {
            this.selectedNote.classList.remove('selected');
        }
        this.selectedNote = note;
        note.classList.add('selected');
        
        // Update position and scale
        const originalX = parseFloat(note.getAttribute('data-x'));
        const originalY = parseFloat(note.getAttribute('data-y'));
        const scaledX = originalX * this.scale + this.offsetX;
        const scaledY = originalY * this.scale + this.offsetY;
        
        note.style.transform = `scale(${this.scale})`;
        note.style.transformOrigin = 'top left';
        note.style.left = `${scaledX}px`;
        note.style.top = `${scaledY}px`;
        
        void note.offsetHeight; // Force reflow
        
        this.showOptionsBar(note, 'note');
    }

    selectText(text) {
        if (this.selectedText) {
            this.selectedText.classList.remove('selected');
        }
        this.selectedText = text;
        text.classList.add('selected');
        this.showOptionsBar(text, 'text');
    }

    createTextOptionsBar() {
        const bar = document.createElement('div');
        bar.className = 'options-bar text-options-bar';
        
        // Font family
        const fontFamily = document.createElement('select');
        fontFamily.innerHTML = `
            <option value="Inter">Inter</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
        `;

        // Font size
        const fontSize = document.createElement('select');
        fontSize.innerHTML = `
            <option value="1">12px</option>
            <option value="2">14px</option>
            <option value="3">16px</option>
            <option value="4">18px</option>
            <option value="5">24px</option>
            <option value="6">32px</option>
            <option value="7">48px</option>
        `;

        // Style buttons
        const boldBtn = document.createElement('button');
        boldBtn.innerHTML = 'B';
        boldBtn.style.fontWeight = 'bold';
        
        const italicBtn = document.createElement('button');
        italicBtn.innerHTML = 'I';
        italicBtn.style.fontStyle = 'italic';
        
        const strikeBtn = document.createElement('button');
        strikeBtn.innerHTML = 'S';
        strikeBtn.style.textDecoration = 'line-through';

        // Alignment buttons
        const alignLeftBtn = document.createElement('button');
        alignLeftBtn.innerHTML = '⫷';
        
        const alignCenterBtn = document.createElement('button');
        alignCenterBtn.innerHTML = '⫶';
        
        const alignRightBtn = document.createElement('button');
        alignRightBtn.innerHTML = '⫸';

        // Color picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = '#FFFFFF';

        // Add event listeners
        const applyFormatting = (command, value = null) => {
            if (this.selectedText) {
                const textContent = this.selectedText.querySelector('.text-content');
                if (command === 'fontSize') {
                    const sizes = {
                        '1': '12px',
                        '2': '14px',
                        '3': '16px',
                        '4': '18px',
                        '5': '24px',
                        '6': '32px',
                        '7': '48px'
                    };
                    textContent.style.fontSize = sizes[value];
                } else {
                    document.execCommand(command, false, value);
                }
                textContent.focus();
            }
        };

        fontFamily.addEventListener('change', () => applyFormatting('fontName', fontFamily.value));
        fontSize.addEventListener('change', () => applyFormatting('fontSize', fontSize.value));
        boldBtn.addEventListener('click', () => applyFormatting('bold'));
        italicBtn.addEventListener('click', () => applyFormatting('italic'));
        strikeBtn.addEventListener('click', () => applyFormatting('strikeThrough'));
        alignLeftBtn.addEventListener('click', () => applyFormatting('justifyLeft'));
        alignCenterBtn.addEventListener('click', () => applyFormatting('justifyCenter'));
        alignRightBtn.addEventListener('click', () => applyFormatting('justifyRight'));
        colorPicker.addEventListener('change', () => applyFormatting('foreColor', colorPicker.value));

        // Add elements to bar
        [fontFamily, fontSize, 
         document.createElement('div'), // divider
         boldBtn, italicBtn, strikeBtn,
         document.createElement('div'), // divider
         alignLeftBtn, alignCenterBtn, alignRightBtn,
         document.createElement('div'), // divider
         colorPicker
        ].forEach(el => {
            if (el.tagName === 'DIV') {
                el.className = 'divider';
            }
            bar.appendChild(el);
        });

        return bar;
    }

    createTextElement(pos) {
        const text = document.createElement('div');
        text.className = 'text-element';
        
        // Store original unscaled position
        text.setAttribute('data-x', pos.x);
        text.setAttribute('data-y', pos.y);
        
        // Apply scaled position
        const scaledX = pos.x * this.scale + this.offsetX;
        const scaledY = pos.y * this.scale + this.offsetY;
        
        text.style.left = `${scaledX}px`;
        text.style.top = `${scaledY}px`;
        
        // Create inner content div for text
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.contentEditable = true;
        textContent.innerHTML = '<br>';
        text.appendChild(textContent);
        
        // Prevent text selection when dragging the container
        text.addEventListener('mousedown', (e) => {
            if (e.target === text) { // Only when clicking the padding area
                e.preventDefault(); // Prevent text selection
                if (this.currentTool === 'select') {
                    this.selectText(text);
                }
            }
        });

        // Handle text content events
        textContent.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // Prevent dragging when clicking text
            if (this.currentTool === 'select') {
                this.selectText(text);
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!text.contains(e.target) && !this.textOptionsBar.contains(e.target)) {
                this.deselectText(text);
            }
        });

        textContent.addEventListener('input', () => {
            if (textContent.innerHTML.trim() === '') {
                textContent.innerHTML = '<br>';
            }
        });

        textContent.addEventListener('blur', () => {
            if (textContent.innerHTML.trim() === '<br>' && !text.classList.contains('selected')) {
                text.remove();
            }
        });

        this.container.appendChild(text);
        this.makeDraggable(text);
        
        setTimeout(() => {
            textContent.focus();
        }, 0);
        
        return text;
    }

    deselectNote(note) {
        if (note === this.selectedNote) {
            note.classList.remove('selected');
            this.selectedNote = null;
            this.showOptionsBar(null);
        }
    }

    createPathOptionsBar() {
        const bar = document.createElement('div');
        bar.className = 'options-bar path-options-bar';
        
        // Color picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = '#FFFFFF';
        
        // Stroke width
        const strokeWidth = document.createElement('select');
        strokeWidth.innerHTML = `
            <option value="2">Thin</option>
            <option value="4">Medium</option>
            <option value="6">Thick</option>
            <option value="8">Very Thick</option>
        `;
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = 'Delete';
        deleteBtn.onclick = () => {
            if (this.selectedPath) {
                const index = this.elements.indexOf(this.selectedPath);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.selectedPath = null;
                    this.showPathOptionsBar(null);
                    this.redraw();
                }
            }
        };

        // Add event listeners
        colorPicker.addEventListener('change', () => {
            if (this.selectedPath) {
                this.selectedPath.color = colorPicker.value;
                this.redraw();
            }
        });

        strokeWidth.addEventListener('change', () => {
            if (this.selectedPath) {
                this.selectedPath.width = parseInt(strokeWidth.value);
                this.redraw();
            }
        });

        [colorPicker, strokeWidth, deleteBtn].forEach(el => bar.appendChild(el));
        return bar;
    }

    deselectAll() {
        if (this.selectedPath) {
            this.selectedPath = null;
            this.redraw();
        }
        if (this.selectedText) {
            this.selectedText.classList.remove('selected');
            this.selectedText = null;
        }
        if (this.selectedNote) {
            this.selectedNote.classList.remove('selected');
            this.selectedNote = null;
        }
        
        this.hideAllOptionsBars();
    }

    setupZoomAndPan() {
        // Zoom with mouse wheel
        this.container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY;
                const mouseX = e.clientX - this.canvas.offsetLeft;
                const mouseY = e.clientY - this.canvas.offsetTop;
                
                const zoom = delta > 0 ? 0.9 : 1.1;
                const newScale = Math.min(Math.max(this.scale * zoom, this.minZoom), this.maxZoom);
                
                if (newScale !== this.scale) {
                    const scaleChange = newScale - this.scale;
                    this.offsetX -= ((mouseX - this.offsetX) * scaleChange) / this.scale;
                    this.offsetY -= ((mouseY - this.offsetY) * scaleChange) / this.scale;
                    this.scale = newScale;
                    this.redraw();
                    this.updateAllElementPositions();
                }
            }
        }, { passive: false });

        // Pan with right mouse button
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // Right mouse button
                e.preventDefault();
                this.isPanning = true;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.container.style.cursor = 'grabbing';
                
                // Prevent any other actions when right-clicking
                if (this.selectedPath) {
                    this.deselectAll();
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                
                this.offsetX += dx;
                this.offsetY += dy;
                
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                
                this.redraw();
                this.updateAllElementPositions();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isPanning = false;
                this.container.style.cursor = 'default';
            }
        });

        // Prevent context menu on right click
        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    updateAllElementPositions() {
        const containerRect = this.container.getBoundingClientRect();

        // Update sticky notes
        document.querySelectorAll('.sticky-note').forEach(note => {
            const originalX = parseFloat(note.getAttribute('data-x'));
            const originalY = parseFloat(note.getAttribute('data-y'));
            
            const scaledX = originalX * this.scale + this.offsetX;
            const scaledY = originalY * this.scale + this.offsetY;
            
            note.style.transform = `scale(${this.scale})`;
            note.style.transformOrigin = 'top left';
            note.style.left = `${scaledX}px`;
            note.style.top = `${scaledY}px`;
        });

        // Update text elements
        document.querySelectorAll('.text-element').forEach(text => {
            const originalX = parseFloat(text.getAttribute('data-x') || text.style.left);
            const originalY = parseFloat(text.getAttribute('data-y') || text.style.top);
            
            if (!text.hasAttribute('data-x')) {
                text.setAttribute('data-x', originalX);
                text.setAttribute('data-y', originalY);
            }

            const scaledX = originalX * this.scale + this.offsetX;
            const scaledY = originalY * this.scale + this.offsetY;
            
            text.style.transform = `scale(${this.scale})`;
            text.style.transformOrigin = 'top left';
            text.style.left = `${scaledX}px`;
            text.style.top = `${scaledY}px`;
        });
    }

    hideAllOptionsBars() {
        this.optionsBars.forEach(({ bar }) => {
            bar.classList.remove('visible');
            bar.style.display = 'none';
        });
    }
} 