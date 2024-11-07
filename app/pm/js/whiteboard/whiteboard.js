import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export class Whiteboard {
    constructor() {
        this.auth = getAuth();
        this.db = getFirestore();
        this.canvas = document.getElementById('whiteboardCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('whiteboardContainer');
        
        // Initialize all arrays and properties
        this.currentTool = 'select';
        this.isDrawing = false;
        this.elements = [];
        this.selectedElement = null;
        this.selectedNote = null;
        this.pathPoints = [];
        this.selectedPath = null;
        
        // Shape properties
        this.isDrawingShape = false;
        this.startX = null;
        this.startY = null;
        this.selectedShape = null;
        this.isDraggingShape = false;
        this.shapeDragStart = null;
        this.dragOffset = { x: 0, y: 0 };
        this.isResizingShape = false;
        this.resizeHandle = null;

        // Zoom and pan properties
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.lastX = 0;
        this.lastY = 0;
        this.minZoom = 0.1;
        this.maxZoom = 5;

        // Create and add option bars
        this.optionsBar = this.createOptionsBar();
        this.container.appendChild(this.optionsBar);
        this.textOptionsBar = this.createTextOptionsBar();
        this.container.appendChild(this.textOptionsBar);
        this.pathOptionsBar = this.createPathOptionsBar();
        this.container.appendChild(this.pathOptionsBar);
        this.shapeOptionsBar = this.createShapeOptionsBar();
        this.container.appendChild(this.shapeOptionsBar);
        this.imageOptionsBar = this.createImageOptionsBar();
        this.container.appendChild(this.imageOptionsBar);

        // Store all options bars in an array
        this.optionsBars = [
            { type: 'note', bar: this.optionsBar },
            { type: 'text', bar: this.textOptionsBar },
            { type: 'path', bar: this.pathOptionsBar },
            { type: 'shape', bar: this.shapeOptionsBar },
            { type: 'image', bar: this.imageOptionsBar }
        ];

        // Initialize canvas and set up event listeners
        this.initializeCanvas();
        this.setupEventListeners();
        this.setupTools();
        this.setupZoomAndPan();

        // Add clipboard paste event listener
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // ... rest of constructor
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
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) return;
            
            const pos = this.getMousePos(e);
            
            if (this.currentTool === 'select') {
                // Check for any clickable element
                const clickedElement = 
                    this.findImageAtPoint(pos) || 
                    this.findShapeAtPoint(pos) || 
                    this.findPathAtPoint(pos) ||
                    this.findTextAtPoint(pos);

                if (clickedElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Check for resize handles if already selected
                    if (clickedElement === this.selectedElement) {
                        const handle = this.findResizeHandle(pos, clickedElement);
                        if (handle) {
                            this.isResizingShape = clickedElement.type === 'rectangle';
                            this.isResizingImage = clickedElement.type === 'image';
                            this.resizeHandle = handle;
                            return;
                        }
                    }
                    
                    this.selectElement(clickedElement);
                    
                    // Set up dragging
                    if (clickedElement.type === 'path') {
                        this.isDraggingPath = true;
                        this.pathDragStart = pos;
                    } else {
                        this.isDraggingShape = clickedElement.type === 'rectangle';
                        this.isDraggingImage = clickedElement.type === 'image';
                        this.dragOffset = {
                            x: pos.x - clickedElement.x,
                            y: pos.y - clickedElement.y
                        };
                    }
                    return;
                }
                
                // If nothing was clicked, deselect everything
                this.deselectAll();
            } else if (this.currentTool === 'shape') {
                this.isDrawingShape = true;
                this.startX = pos.x;
                this.startY = pos.y;
            } else if (this.currentTool === 'pen') {
                this.isDrawing = true;
                this.startPath(pos);
            } else if (this.currentTool === 'text') {
                const text = this.createTextElement(pos);
                this.selectText(text);
            } else if (this.currentTool === 'note') {
                this.createStickyNote(pos);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(e);
            
            if (this.isDraggingImage && this.selectedImage) {
                // Update image position
                this.selectedImage.x = pos.x - this.dragOffset.x;
                this.selectedImage.y = pos.y - this.dragOffset.y;
                
                // Update options bar position
                this.showImageOptionsBar(this.selectedImage);
                this.redraw();
                return;
            } else if (this.isResizingImage && this.selectedImage) {
                const image = this.selectedImage;
                const aspectRatio = image.width / image.height;
                
                switch (this.resizeHandle) {
                    case 'left':
                        const newWidth = image.width + (image.x - pos.x);
                        if (newWidth > 10) {
                            image.width = newWidth;
                            image.x = pos.x;
                            image.height = image.width / aspectRatio;
                        }
                        break;
                    case 'right':
                        image.width = Math.max(10, pos.x - image.x);
                        image.height = image.width / aspectRatio;
                        break;
                    case 'top':
                        const newHeight = image.height + (image.y - pos.y);
                        if (newHeight > 10) {
                            image.height = newHeight;
                            image.y = pos.y;
                            image.width = image.height * aspectRatio;
                        }
                        break;
                    case 'bottom':
                        image.height = Math.max(10, pos.y - image.y);
                        image.width = image.height * aspectRatio;
                        break;
                }
                
                // Update options bar position after resizing too
                this.showImageOptionsBar(this.selectedImage);
                this.redraw();
                return;
            }
            
            // Update cursor based on hover over resize handles
            if (this.currentTool === 'select' && this.selectedShape) {
                const handle = this.findResizeHandle(pos, this.selectedShape);
                if (handle) {
                    this.canvas.style.cursor = handle === 'left' || handle === 'right' 
                        ? 'ew-resize' 
                        : 'ns-resize';
                    return;
                }
            }
            
            if (this.isDraggingShape && this.selectedShape) {
                // Update shape position
                this.selectedShape.x = pos.x - this.dragOffset.x;
                this.selectedShape.y = pos.y - this.dragOffset.y;
                this.redraw();
                // Update options bar position
                this.showShapeOptionsBar(this.selectedShape);
            } else if (this.isDraggingPath && this.selectedPath) {
                // Existing path dragging code...
                const dx = pos.x - this.pathDragStart.x;
                const dy = pos.y - this.pathDragStart.y;
                this.selectedPath.points = this.selectedPath.points.map(point => ({
                    x: point.x + dx,
                    y: point.y + dy
                }));
                this.pathDragStart = pos;
                this.redraw();
                this.showPathOptionsBar(this.selectedPath);
            } else if (this.isDrawingShape) {
                this.redraw();
                // Draw preview rectangle
                this.ctx.save();
                this.ctx.translate(this.offsetX, this.offsetY);
                this.ctx.scale(this.scale, this.scale);
                this.ctx.setLineDash([5, 5]);
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1;
                const width = pos.x - this.startX;
                const height = pos.y - this.startY;
                this.ctx.strokeRect(this.startX, this.startY, width, height);
                this.ctx.restore();
            } else if (this.isDrawing) {
                this.drawPath(pos);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (this.isDrawingShape) {
                const pos = this.getMousePos(e);
                const width = pos.x - this.startX;
                const height = pos.y - this.startY;
                
                if (Math.abs(width) > 2 && Math.abs(height) > 2) {
                    const shape = {
                        type: 'rectangle',
                        x: this.startX,
                        y: this.startY,
                        width: width,
                        height: height,
                        color: '#FFFFFF',
                        opacity: 1,
                        id: Date.now().toString()
                    };
                    
                    this.elements.push(shape);
                    this.selectElement(shape);
                }
                
                this.isDrawingShape = false;
                this.redraw();
            }
            if (this.isDraggingImage) {
                console.log('Ending image drag');
                this.isDraggingImage = false;
                this.dragStart = null;
                return;
            }
            if (this.isResizingShape) {
                this.isResizingShape = false;
                this.resizeHandle = null;
                this.canvas.style.cursor = 'default';
                return;
            }
            if (this.isResizingImage) {
                this.isResizingImage = false;
                this.resizeHandle = null;
                this.canvas.style.cursor = 'default';
                return;
            }
            
            if (this.isDraggingShape) {
                this.isDraggingShape = false;
                this.shapeDragStart = null;
            } else if (this.isDraggingPath) {
                this.isDraggingPath = false;
                this.pathDragStart = null;
            } else if (this.isDrawingShape) {
                const pos = this.getMousePos(e);
                const width = pos.x - this.startX;
                const height = pos.y - this.startY;
                
                if (Math.abs(width) > 2 && Math.abs(height) > 2) {
                    const shape = {
                        type: 'rectangle',
                        x: this.startX,
                        y: this.startY,
                        width: width,
                        height: height,
                        color: '#FFFFFF',
                        opacity: 1,
                        id: Date.now().toString()
                    };
                    
                    this.elements.push(shape);
                    this.selectElement(shape);
                }
                
                this.isDrawingShape = false;
                this.redraw();
            } else if (this.isDrawing) {
                this.completePath();
            }
        });

        // Remove duplicate event listeners
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTool(e.target.dataset.tool);
            });
        });

        document.getElementById('clearBoard').addEventListener('click', () => this.clearBoard());
        this.saveButton = document.getElementById('saveBoard');
        this.saveButton.addEventListener('click', () => this.saveBoard());
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        if (tool === 'shape') {
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.canvas.style.cursor = 'default';
        }
        
        // Deselect any selected elements when switching tools
        this.deselectAll();
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

        note.addEventListener('mousedown', (e) => {
            this.deselectAll();
            this.selectNote(note);
            e.stopPropagation();
        });
    }

    makeDraggable(element, textElement) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const dragMouseDown = (e) => {
            if (e.button === 2) return;
            
            // Only prevent dragging when clicking the editable content
            if (e.target.className === 'text-content') {
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
                this.selectText(textElement);
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

            // Update textElement position if it exists
            if (textElement) {
                textElement.x = newX;
                textElement.y = newY;
                this.showOptionsBar(textElement, this.textOptionsBar);
            }

            // Update options bar position during drag
            if (element.classList.contains('sticky-note') && this.selectedNote === element) {
                this.selectNote(element);
            }
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;
        };

        element.onmousedown = dragMouseDown;
    }

    async saveBoard() {
        if (!this.auth.currentUser) return;
        
        this.saveButton.disabled = true;
        this.saveButton.innerHTML = 'Saving...';
        this.saveButton.style.opacity = '0.7';
        
        // Clean up elements for saving by removing cached images and creating a clean copy
        const elementsToSave = this.elements.map(element => {
            const cleanElement = { ...element };
            // Remove the cached image DOM element before saving
            if (cleanElement.cachedImage) {
                delete cleanElement.cachedImage;
            }
            return cleanElement;
        });
        
        const boardData = {
            elements: elementsToSave,
            notes: Array.from(document.querySelectorAll('.sticky-note')).map(note => {
                return {
                    text: note.querySelector('textarea').value,
                    x: parseFloat(note.getAttribute('data-x')),
                    y: parseFloat(note.getAttribute('data-y')),
                    width: 200,
                    height: 200,
                    fontSize: note.querySelector('textarea').style.fontSize || '14px',
                    backgroundColor: note.style.backgroundColor
                };
            })
        };

        try {
            const whiteboardRef = doc(this.db, `users/${this.auth.currentUser.uid}/whiteboards/default`);
            await setDoc(whiteboardRef, boardData);
            
            this.saveButton.innerHTML = 'Saved!';
            this.saveButton.style.background = '#4CAF50';
            
            setTimeout(() => {
                this.saveButton.disabled = false;
                this.saveButton.innerHTML = 'Save';
                this.saveButton.style.opacity = '1';
                this.saveButton.style.background = '#2962ff';
            }, 1000);
        } catch (error) {
            console.error('Error saving whiteboard:', error);
            this.saveButton.innerHTML = 'Error!';
            this.saveButton.style.background = '#f44336';
            
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
                this.shapes = data.shapes || [];
                
                // Reset zoom and pan before loading images
                this.scale = 1;
                this.offsetX = 0;
                this.offsetY = 0;
                
                // Load images with proper positioning
                this.images = (data.images || []).map(image => ({
                    type: 'image',
                    src: image.src,
                    x: image.x,
                    y: image.y,
                    width: image.width,
                    height: image.height,
                    id: image.id
                }));

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
                
                this.redraw();
            }
        } catch (error) {
            console.error('Error loading whiteboard:', error);
        }
    }

    clearBoard() {
        if (confirm('Are you sure you want to clear the board?')) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.elements = [];
            this.shapes = [];
            this.images = [];  // Clear images
            document.querySelectorAll('.sticky-note').forEach(note => note.remove());
        }
    }

    redraw() {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        
        // Draw all elements in order
        this.elements.forEach(element => {
            if (element.type === 'image') {
                if (element.cachedImage && element.cachedImage.complete) {
                    this.ctx.drawImage(element.cachedImage, element.x, element.y, element.width, element.height);
                } else if (!element.cachedImage) {
                    const img = new Image();
                    img.src = element.src;
                    element.cachedImage = img;
                    
                    img.onload = () => {
                        this.redraw();
                    };
                }
            } else if (element.type === 'path') {
                this.ctx.beginPath();
                this.ctx.strokeStyle = element.color;
                this.ctx.lineWidth = element.width;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.drawCurve(element.points);
                this.ctx.stroke();
            } else if (element.type === 'rectangle') {
                this.ctx.save();
                this.ctx.globalAlpha = element.opacity;
                this.ctx.fillStyle = element.color;
                this.ctx.fillRect(element.x, element.y, element.width, element.height);
                this.ctx.restore();
            }
            // Draw selection for the selected element (except for text)
            if (element === this.selectedElement && element.type !== 'text') {
                this.drawElementSelection(element);
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

    showOptionsBar(element, optionsBar, options = {}) {
        if (!element || !optionsBar) {
            optionsBar.style.display = 'none';
            return;
        }

        // Temporarily make the bar visible but hidden to get its dimensions
        optionsBar.style.visibility = 'hidden';
        optionsBar.style.display = 'flex';
        
        // Force a reflow to get correct dimensions
        void optionsBar.offsetHeight;

        const containerRect = this.container.getBoundingClientRect();
        let elementX, elementY, elementWidth, elementHeight;

        if (element.type === 'text') {
            // Use the same positioning logic as in dragging
            const scaledX = element.x * this.scale + this.offsetX;
            const scaledY = element.y * this.scale + this.offsetY;
            elementX = scaledX;
            elementY = scaledY;
            
            // Get text dimensions from the DOM element
            const textRect = element.domElement.getBoundingClientRect();
            elementWidth = textRect.width;
            elementHeight = textRect.height;
        } else {
            // For canvas elements (shapes, paths, images)
            elementX = element.x * this.scale + this.offsetX;
            elementY = element.y * this.scale + this.offsetY;
            elementWidth = (element.width || 0) * this.scale;
            elementHeight = (element.height || 0) * this.scale;
        }

        // Position the options bar
        const barWidth = optionsBar.offsetWidth;
        const barHeight = optionsBar.offsetHeight;
        
        // Always position above the element
        let left = elementX + (elementWidth / 2) - (barWidth / 2);
        let top = elementY - barHeight - 10;

        // If not enough space above, position below
        if (top < 10) {
            top = elementY + elementHeight + 10;
        }

        // Keep within container bounds
        if (left < 10) {
            left = 10;
        } else if (left + barWidth > containerRect.width - 10) {
            left = containerRect.width - barWidth - 10;
        }

        // Make fully visible and position
        optionsBar.style.position = 'absolute';
        optionsBar.style.left = `${left}px`;
        optionsBar.style.top = `${top}px`;
        optionsBar.style.visibility = 'visible';
        optionsBar.style.display = 'flex';
        optionsBar.classList.add('visible');
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

    selectText(textElement) {
        this.deselectAll();
        this.selectedText = textElement;
        this.selectedElement = textElement;  // Important for unified selection
        this.showOptionsBar(textElement, this.textOptionsBar);  // Use unified showOptionsBar
        this.redraw();
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

        // Modify z-index controls
        const toFrontBtn = document.createElement('button');
        toFrontBtn.innerHTML = '⬆️ Front';
        toFrontBtn.onclick = () => {
            if (this.selectedText) {
                const index = this.elements.indexOf(this.selectedText);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.push(this.selectedText);
                    this.updateElementsZIndex();
                }
            }
        };

        const toBackBtn = document.createElement('button');
        toBackBtn.innerHTML = '⬇️ Back';
        toBackBtn.onclick = () => {
            if (this.selectedText) {
                const index = this.elements.indexOf(this.selectedText);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.unshift(this.selectedText);
                    this.updateElementsZIndex();
                }
            }
        };

        // Add delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️ Delete';
        deleteBtn.onclick = () => {
            if (this.selectedText) {
                this.selectedText.remove();
                this.selectedText = null;
                this.showTextOptionsBar(null);
            }
        };

        // Add event listeners for formatting
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

        // Add all elements to bar with dividers
        [
            fontFamily, 
            fontSize,
            document.createElement('div'), // divider
            boldBtn, 
            italicBtn, 
            strikeBtn,
            document.createElement('div'), // divider
            alignLeftBtn, 
            alignCenterBtn, 
            alignRightBtn,
            document.createElement('div'), // divider
            colorPicker,
            document.createElement('div'), // divider
            toFrontBtn,
            toBackBtn,
            deleteBtn
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
        
        // Create inner content div for text
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.contentEditable = true;
        textContent.innerHTML = '<br>';
        text.appendChild(textContent);
        
        // Set initial position
        const scaledX = pos.x * this.scale + this.offsetX;
        const scaledY = pos.y * this.scale + this.offsetY;
        text.style.left = `${scaledX}px`;
        text.style.top = `${scaledY}px`;
        text.style.transform = `scale(${this.scale})`;
        text.style.transformOrigin = 'top left';
        
        // Store original position
        text.setAttribute('data-x', pos.x);
        text.setAttribute('data-y', pos.y);
        
        // Add to elements array for z-index management
        const textElement = {
            type: 'text',
            domElement: text,
            x: pos.x,
            y: pos.y,
            id: Date.now().toString()
        };
        this.elements.push(textElement);
        
        // Event listeners
        text.addEventListener('mousedown', (e) => {
            if (e.target === text) {
                e.preventDefault();
                if (this.currentTool === 'select') {
                    this.selectText(textElement);
                }
            }
        });

        textContent.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (this.currentTool === 'select') {
                this.selectText(textElement);
            }
        });

        // Add focus handler for text content
        textContent.addEventListener('focus', () => {
            this.selectText(textElement);
        });

        // Add the DOM element to the container
        this.container.appendChild(text);
        this.makeDraggable(text, textElement);
        
        // Focus the text content and position options bar
        setTimeout(() => {
            textContent.focus();
            this.selectText(textElement);
        }, 0);
        
        return textElement;
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
        
        // Z-index controls
        const toFrontBtn = document.createElement('button');
        toFrontBtn.innerHTML = '⬆️ Front';
        toFrontBtn.onclick = () => {
            if (this.selectedPath) {
                const index = this.elements.indexOf(this.selectedPath);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.push(this.selectedPath);
                    this.redraw();
                }
            }
        };

        const toBackBtn = document.createElement('button');
        toBackBtn.innerHTML = '⬇️ Back';
        toBackBtn.onclick = () => {
            if (this.selectedPath) {
                const index = this.elements.indexOf(this.selectedPath);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.unshift(this.selectedPath);
                    this.redraw();
                }
            }
        };

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️ Delete';
        deleteBtn.onclick = () => {
            if (this.selectedPath) {
                const index = this.elements.indexOf(this.selectedPath);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.selectedPath = null;
                    this.selectedElement = null;  // Also clear the main selection
                    this.redraw();
                    this.hideAllOptionsBars();
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

        [colorPicker, strokeWidth, toFrontBtn, toBackBtn, deleteBtn].forEach(el => bar.appendChild(el));
        return bar;
    }

    deselectAll() {
        console.log('Deselecting all');
        this.selectedElement = null;
        this.selectedPath = null;
        this.selectedShape = null;
        this.selectedImage = null;
        this.selectedText = null;
        this.selectedNote = null;
        
        // Reset all dragging and resizing states
        this.isDraggingShape = false;
        this.isDraggingPath = false;
        this.isDraggingImage = false;
        this.isResizingShape = false;
        this.isResizingImage = false;
        this.shapeDragStart = null;
        this.pathDragStart = null;
        this.dragStart = null;
        this.resizeHandle = null;
        
        // Reset cursor
        this.canvas.style.cursor = 'default';
        
        // Hide all options bars
        this.hideAllOptionsBars();
        
        this.redraw();
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

    setMode(mode) {
        // ... existing mode setting code ...
        if (mode === 'shape') {
            this.canvas.style.cursor = 'crosshair';
        }
        // ... rest of existing code ...
    }

    findShapeAtPoint(pos) {
        // Check shapes in reverse order (top to bottom)
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const shape = this.elements[i];
            console.log('Checking shape:', shape);
            console.log('Mouse position:', pos);
            if (shape.type === 'rectangle') {
                // Add a small buffer for easier selection (5 pixels)
                const buffer = 5 / this.scale;
                const isInShape = pos.x >= shape.x - buffer && 
                    pos.x <= shape.x + shape.width + buffer &&
                    pos.y >= shape.y - buffer && 
                    pos.y <= shape.y + shape.height + buffer;
                
                console.log('Shape bounds:', {
                    left: shape.x - buffer,
                    right: shape.x + shape.width + buffer,
                    top: shape.y - buffer,
                    bottom: shape.y + shape.height + buffer
                });
                console.log('Is in shape:', isInShape);
                
                if (isInShape) {
                    return shape;
                }
            }
        }
        return null;
    }

    createShapeOptionsBar() {
        const bar = document.createElement('div');
        bar.className = 'options-bar shape-options-bar';
        
        // Color picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = '#FFFFFF';
        
        // Opacity slider
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = '100';
        
        // Z-index controls
        const toFrontBtn = document.createElement('button');
        toFrontBtn.innerHTML = '⬆️ Front';
        toFrontBtn.onclick = () => {
            if (this.selectedShape) {
                const index = this.elements.indexOf(this.selectedShape);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.push(this.selectedShape);
                    this.redraw();
                }
            }
        };

        const toBackBtn = document.createElement('button');
        toBackBtn.innerHTML = '⬇️ Back';
        toBackBtn.onclick = () => {
            if (this.selectedShape) {
                const index = this.elements.indexOf(this.selectedShape);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.unshift(this.selectedShape);
                    this.redraw();
                }
            }
        };

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️ Delete';
        deleteBtn.onclick = () => {
            if (this.selectedShape) {
                const index = this.elements.indexOf(this.selectedShape);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.selectedShape = null;
                    this.redraw();
                    this.hideAllOptionsBars();
                }
            }
        };

        // Add event listeners
        colorPicker.addEventListener('change', () => {
            if (this.selectedShape) {
                this.selectedShape.color = colorPicker.value;
                this.redraw();
            }
        });

        opacitySlider.addEventListener('input', () => {
            if (this.selectedShape) {
                this.selectedShape.opacity = opacitySlider.value / 100;
                this.redraw();
            }
        });

        [colorPicker, opacitySlider, toFrontBtn, toBackBtn, deleteBtn].forEach(el => bar.appendChild(el));
        return bar;
    }

    showShapeOptionsBar(shape) {
        if (!shape) {
            this.shapeOptionsBar.style.display = 'none';
            return;
        }
        
        // Update controls state
        const colorPicker = this.shapeOptionsBar.querySelector('input[type="color"]');
        const opacitySlider = this.shapeOptionsBar.querySelector('input[type="range"]');
        if (colorPicker) colorPicker.value = shape.color;
        if (opacitySlider) opacitySlider.value = shape.opacity * 100;
        
        this.showOptionsBar(shape, this.shapeOptionsBar);
    }

    findResizeHandle(pos, shape) {
        const handleRadius = 5 / this.scale; // Adjust for zoom level
        
        // Check each handle
        const handles = {
            left: { x: shape.x, y: shape.y + shape.height/2 },
            right: { x: shape.x + shape.width, y: shape.y + shape.height/2 },
            top: { x: shape.x + shape.width/2, y: shape.y },
            bottom: { x: shape.x + shape.width/2, y: shape.y + shape.height }
        };

        for (const [handle, point] of Object.entries(handles)) {
            const dx = pos.x - point.x;
            const dy = pos.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= handleRadius) {
                return handle;
            }
        }
        return null;
    }

    handlePaste(e) {
        if (!e.clipboardData || !e.clipboardData.items) return;

        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    
                    img.onload = () => {
                        // Calculate center position in canvas coordinates
                        const centerX = (-this.offsetX + this.canvas.width/2) / this.scale;
                        const centerY = (-this.offsetY + this.canvas.height/2) / this.scale;
                        
                        const imageObj = {
                            type: 'image',
                            src: event.target.result,
                            x: centerX - (img.width / 2 / this.scale),
                            y: centerY - (img.height / 2 / this.scale),
                            width: img.width / this.scale,
                            height: img.height / this.scale,
                            id: Date.now().toString()
                        };
                        
                        // Only add the image and cached version after it's loaded
                        imageObj.cachedImage = img;
                        this.elements.push(imageObj);
                        this.selectElement(imageObj);
                        this.redraw();
                    };
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    }

    findImageAtPoint(pos) {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            console.log('Checking image:', element);
            console.log('Mouse position:', pos);
            
            const isInElement = pos.x >= element.x && 
                             pos.x <= element.x + element.width &&
                             pos.y >= element.y && 
                             pos.y <= element.y + element.height;
            
            console.log('Element bounds:', {
                left: element.x,
                right: element.x + element.width,
                top: element.y,
                bottom: element.y + element.height
            });
            console.log('Is in element:', isInElement);
            
            if (isInElement) {
                return element;
            }
        }
        return null;
    }

    selectImage(image) {
        console.log('Selecting image:', image);
        this.deselectAll();
        this.selectedImage = image;
        console.log('Selected image set:', this.selectedImage);
        this.showImageOptionsBar(image);
        this.redraw();
    }

    findImageResizeHandle(pos, image) {
        const handleRadius = 5 / this.scale;
        
        const handles = {
            left: { x: image.x, y: image.y + image.height/2 },
            right: { x: image.x + image.width, y: image.y + image.height/2 },
            top: { x: image.x + image.width/2, y: image.y },
            bottom: { x: image.x + image.width/2, y: image.y + image.height }
        };

        for (const [handle, point] of Object.entries(handles)) {
            const dx = pos.x - point.x;
            const dy = pos.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= handleRadius) {
                return handle;
            }
        }
        return null;
    }

    handleImageZIndex(image, toFront) {
        const index = this.elements.indexOf(image);
        if (index > -1) {
            this.elements.splice(index, 1);
            if (toFront) {
                this.elements.push(image);
            } else {
                this.elements.unshift(image);
            }
            this.redraw();
        }
    }

    createImageOptionsBar() {
        const bar = document.createElement('div');
        bar.className = 'options-bar image-options-bar';
        
        // Add z-index controls
        const toFrontBtn = document.createElement('button');
        toFrontBtn.innerHTML = '⬆️ Front';
        toFrontBtn.onclick = () => {
            if (this.selectedImage) {
                const index = this.elements.indexOf(this.selectedImage);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.push(this.selectedImage);
                    this.redraw();
                }
            }
        };

        const toBackBtn = document.createElement('button');
        toBackBtn.innerHTML = '⬇️ Back';
        toBackBtn.onclick = () => {
            if (this.selectedImage) {
                const index = this.elements.indexOf(this.selectedImage);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.elements.unshift(this.selectedImage);
                    this.redraw();
                }
            }
        };

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️ Delete';
        deleteBtn.onclick = () => {
            if (this.selectedImage) {
                const index = this.elements.indexOf(this.selectedImage);
                if (index > -1) {
                    this.elements.splice(index, 1);
                    this.selectedImage = null;
                    this.redraw();
                    this.hideAllOptionsBars();
                }
            }
        };

        [toFrontBtn, toBackBtn, deleteBtn].forEach(el => bar.appendChild(el));
        return bar;
    }

    showImageOptionsBar(image) {
        if (!image) {
            this.imageOptionsBar.style.display = 'none';
            return;
        }
        this.showOptionsBar(image, this.imageOptionsBar);
    }

    hideAllOptionsBars() {
        if (!this.selectedImage && !this.selectedShape && !this.selectedPath && !this.selectedText) {
            this.optionsBars.forEach(({ bar }) => {
                bar.classList.remove('visible');
                bar.style.display = 'none';
            });
        }
    }

    // Add method to draw selection for any element type
    drawElementSelection(element) {
        this.ctx.save();
        this.ctx.strokeStyle = '#2962ff';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        if (element.type === 'text') {
            // Get text dimensions
            this.ctx.font = `${element.fontSize} ${element.fontFamily}`;
            const metrics = this.ctx.measureText(element.content);
            const height = parseInt(element.fontSize);
            
            // Draw selection rectangle around text
            this.ctx.strokeRect(
                element.x - 2,
                element.y - 2,
                metrics.width + 4,
                height + 4
            );
        } else if (element.type === 'path') {
            this.drawPathSelection(element);
        } else if (element.type === 'rectangle' || element.type === 'image') {
            // ... existing rectangle/image selection code ...
        }
        
        this.ctx.restore();
    }

    // Modify element creation to use unified array
    handlePaste(e) {
        if (!e.clipboardData || !e.clipboardData.items) return;

        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    
                    img.onload = () => {
                        // Calculate center position in canvas coordinates
                        const centerX = (-this.offsetX + this.canvas.width/2) / this.scale;
                        const centerY = (-this.offsetY + this.canvas.height/2) / this.scale;
                        
                        const imageObj = {
                            type: 'image',
                            src: event.target.result,
                            x: centerX - (img.width / 2 / this.scale),
                            y: centerY - (img.height / 2 / this.scale),
                            width: img.width / this.scale,
                            height: img.height / this.scale,
                            id: Date.now().toString()
                        };
                        
                        // Only add the image and cached version after it's loaded
                        imageObj.cachedImage = img;
                        this.elements.push(imageObj);
                        this.selectElement(imageObj);
                        this.redraw();
                    };
                };
                
                reader.readAsDataURL(blob);
                break;
            }
        }
    }

    // Use a single select method
    selectElement(element) {
        console.log('Selecting element:', element);
        this.deselectAll();
        this.selectedElement = element;
        
        // Show appropriate options bar based on element type
        if (element.type === 'path') {
            this.selectedPath = element;
            this.showPathOptionsBar(element);
        } else if (element.type === 'rectangle') {
            this.selectedShape = element;
            this.showShapeOptionsBar(element);
        } else if (element.type === 'image') {
            this.selectedImage = element;
            this.showImageOptionsBar(element);
        }
        
        this.redraw();
    }

    // Add deselectText method
    deselectText(text) {
        if (text === this.selectedText) {
            text.classList.remove('selected');
            this.selectedText = null;
            this.showTextOptionsBar(null);
        }
    }

    // Add showTextOptionsBar method if it doesn't exist
    showTextOptionsBar(text) {
        if (!text) {
            this.textOptionsBar.style.display = 'none';
            return;
        }
        this.showOptionsBar(text, this.textOptionsBar);
    }

    // Add findTextAtPoint method
    findTextAtPoint(pos) {
        // Check elements in reverse order (top to bottom)
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            if (element.type === 'text') {
                // Get text width using canvas context
                this.ctx.save();
                this.ctx.font = `${element.fontSize} ${element.fontFamily}`;
                const metrics = this.ctx.measureText(element.content);
                const height = parseInt(element.fontSize);
                this.ctx.restore();

                // Add a small buffer for easier selection
                const buffer = 5 / this.scale;
                if (pos.x >= element.x - buffer &&
                    pos.x <= element.x + metrics.width + buffer &&
                    pos.y >= element.y - buffer &&
                    pos.y <= element.y + height + buffer) {
                    return element;
                }
            }
        }
        return null;
    }

    // Add method to update z-index of all elements
    updateElementsZIndex() {
        this.elements.forEach((element, index) => {
            if (element.type === 'text' && element.domElement) {
                element.domElement.style.zIndex = 100 + index;
            }
        });
        this.redraw();
    }
} 