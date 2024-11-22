class MusicPlayer {
    constructor() {
        // Audio elements
        this.audio = document.getElementById('audio');
        
        // Player controls
        this.playPauseBtn = document.getElementById('play-pause');
        this.nextBtn = document.getElementById('next');
        this.prevBtn = document.getElementById('prev');
        this.shuffleBtn = document.getElementById('shuffle');
        this.repeatBtn = document.getElementById('repeat');
        
        // Song info elements
        this.songsList = document.getElementById('album-songs-list');
        this.trackTitle = document.getElementById('track-title');
        this.trackArtist = document.getElementById('track-artist');
        this.coverArt = document.getElementById('cover-art');
        
        // Progress elements
        this.progressBar = document.querySelector('.progress');
        this.currentTimeSpan = document.getElementById('current-time');
        this.durationSpan = document.getElementById('duration');

        // View elements
        this.albumsView = document.querySelector('.albums-view');
        this.albumSongsView = document.querySelector('.album-songs-view');
        this.albumsGrid = document.getElementById('albums-grid');
        
        // Mini player elements
        this.miniPlayer = document.getElementById('mini-player');
        this.playerOverlay = document.getElementById('player-overlay');
        this.miniPlayPauseBtn = document.getElementById('mini-play-pause');

        // State
        this.currentSongIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.isRepeating = false;
        this.currentAlbum = null;
        this.songs = [];
        this.shuffledPlaylist = [];

        // Initialize empty albums array instead of hardcoding
        this.albums = [];
        
        // Load albums when player initializes
        this.loadAlbumsFromJson();

        // Initialize navigation
        document.getElementById('back-to-albums').addEventListener('click', () => this.showAlbumsView());
        
        // Initialize mini player
        this.miniPlayer.addEventListener('click', (e) => {
            if (e.target !== this.miniPlayPauseBtn) {
                this.showPlayerOverlay();
            }
        });
        
        document.getElementById('minimize-player').addEventListener('click', () => {
            this.hidePlayerOverlay();
        });
        
        this.miniPlayPauseBtn.addEventListener('click', () => this.togglePlayPause());

        // Initialize player controls and show albums
        this.initializeEvents();
        this.showAlbumsView();

        // Add this to track current song globally
        this.currentSong = null;

        // Add visualizer elements
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas.getContext('2d');
        
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Connect audio element to analyser
        this.audioSource = this.audioContext.createMediaElementSource(this.audio);
        this.audioSource.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        // Start animation
        this.animate();

        // Update player overlay click handling
        this.playerOverlay.addEventListener('click', (e) => {
            if (e.target === this.playerOverlay) {
                this.hidePlayerOverlay();
            }
        });
    }

    initializeEvents() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.nextBtn.addEventListener('click', () => this.playNext());
        this.prevBtn.addEventListener('click', () => this.playPrev());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.handleSongEnd());
        
        // Add progress bar click handling
        const progressArea = document.querySelector('.progress-area');
        progressArea.addEventListener('click', (e) => this.seekTo(e));
    }

    async loadAlbum(albumName) {
        // Fade out all album cards first
        const cards = this.albumsGrid.querySelectorAll('.album-card');
        cards.forEach(card => card.classList.add('fade-out'));
        
        // Short delay before transition
        await new Promise(resolve => setTimeout(resolve, 150));
        
        this.currentAlbum = albumName;
        const [artist, album] = albumName.split(' - ');
        
        // Store current song path before updating songs array
        const currentSongPath = this.currentSong?.path;
        
        try {
            // Fetch the songs.json file from the album directory
            const response = await fetch(`albums/${albumName}/songs.json`);
            if (!response.ok) throw new Error('Failed to load album data');
            
            const albumData = await response.json();
            
            // Create song objects from the JSON data
            this.songs = albumData.songs.map(song => ({
                title: song.title,
                artist: albumData.artist,
                album: albumData.album,
                path: `albums/${albumName}/${song.file}`
            }));

            // If we had a current song, find its new index in the updated songs array
            if (currentSongPath) {
                const newIndex = this.songs.findIndex(song => song.path === currentSongPath);
                if (newIndex !== -1) {
                    this.currentSongIndex = newIndex;
                    this.currentSong = this.songs[newIndex];
                }
            }

            // Try to load album cover
            this.coverArt.src = `albums/${albumName}/${albumData.cover}`;
            this.coverArt.onerror = () => {
                this.coverArt.src = 'images/default-album.jpg';
            };

            this.showAlbumSongsView();
            document.getElementById('album-title').textContent = albumData.album;
            document.getElementById('album-artist').textContent = albumData.artist;
            document.getElementById('album-cover').src = `albums/${albumName}/${albumData.cover}`;
            
            await this.renderAlbum();

        } catch (error) {
            console.error('Error loading album:', error);
            alert('Failed to load album data. Please try again later.');
        }
    }

    async renderAlbum() {
        this.songsList.innerHTML = '';
        const playlist = this.isShuffled ? this.shuffledPlaylist : this.songs;
        
        // Wait for all durations to be loaded
        const songsWithDuration = await Promise.all(
            playlist.map(async (song) => {
                const duration = await this.getSongDuration(song.path);
                return { ...song, duration };
            })
        );
        
        songsWithDuration.forEach((song, index) => {
            const li = document.createElement('li');
            // Add 'playing' class if this is the current song
            if (this.currentSong && this.currentSong.path === song.path) {
                li.classList.add('playing');
            }
            
            li.innerHTML = `
                <span class="song-number">${(index + 1).toString().padStart(2, '0')}</span>
                <div class="song-info">
                    <h4>${song.title}</h4>
                    <p>${song.artist}</p>
                </div>
                <span class="song-duration">${this.formatTime(song.duration)}</span>
            `;
            li.addEventListener('click', () => {
                this.playSong(index);
                this.showMiniPlayer();
            });
            this.songsList.appendChild(li);
        });
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play();
        }
        this.isPlaying = !this.isPlaying;
        this.updatePlayPauseButtons();
    }

    async playSong(index) {
        // Resume audio context if it was suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.currentSongIndex = index;
        const playlist = this.isShuffled ? this.shuffledPlaylist : this.songs;
        const song = playlist[index];
        
        // Store current song reference
        this.currentSong = song;
        
        this.audio.src = song.path;
        
        this.updateNowPlayingDisplay(song);
        this.updateMiniPlayerDisplay(song);
        this.highlightCurrentSong();
        
        this.audio.play()
            .catch(error => {
                console.error('Error playing audio:', error);
                alert('Error playing the song. Please try again.');
            });
        
        this.isPlaying = true;
        this.updatePlayPauseButtons();
        this.showMiniPlayer();
    }

    updateNowPlayingDisplay(song) {
        this.trackTitle.textContent = song.title;
        this.trackArtist.textContent = song.artist;
        this.coverArt.src = `albums/${this.currentAlbum}/cover.jpg`;
    }

    updateMiniPlayerDisplay(song) {
        document.getElementById('mini-title').textContent = song.title;
        document.getElementById('mini-artist').textContent = song.artist;
        document.getElementById('mini-cover').src = `albums/${this.currentAlbum}/cover.jpg`;
    }

    updatePlayPauseButtons() {
        const iconClass = this.isPlaying ? 'fa-pause' : 'fa-play';
        this.playPauseBtn.className = `fas ${iconClass}`;
        this.miniPlayPauseBtn.className = `fas ${iconClass}`;
    }

    highlightCurrentSong() {
        const songs = this.songsList.querySelectorAll('li');
        songs.forEach((li, index) => {
            if (this.currentSong) {
                const playlist = this.isShuffled ? this.shuffledPlaylist : this.songs;
                const song = playlist[index];
                li.classList.toggle('playing', song.path === this.currentSong.path);
            }
        });
    }

    showMiniPlayer() {
        this.miniPlayer.classList.remove('hidden');
    }

    showPlayerOverlay() {
        this.playerOverlay.classList.remove('hidden');
        // Use requestAnimationFrame to ensure the transition happens
        requestAnimationFrame(() => {
            this.playerOverlay.classList.add('visible');
            const fullPlayer = this.playerOverlay.querySelector('.full-player');
            fullPlayer.classList.remove('sliding-down');
            fullPlayer.classList.add('sliding-up');
        });
    }

    hidePlayerOverlay() {
        const fullPlayer = this.playerOverlay.querySelector('.full-player');
        fullPlayer.classList.remove('sliding-up');
        fullPlayer.classList.add('sliding-down');
        this.playerOverlay.classList.remove('visible');
        
        // Wait for both animations to complete
        setTimeout(() => {
            this.playerOverlay.classList.add('hidden');
            fullPlayer.classList.remove('sliding-down');
        }, 300);
    }

    playNext() {
        const playlist = this.isShuffled ? this.shuffledPlaylist : this.songs;
        this.currentSongIndex = (this.currentSongIndex + 1) % playlist.length;
        this.playSong(this.currentSongIndex);
    }

    playPrev() {
        const playlist = this.isShuffled ? this.shuffledPlaylist : this.songs;
        this.currentSongIndex = (this.currentSongIndex - 1 + playlist.length) % playlist.length;
        this.playSong(this.currentSongIndex);
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this.shuffleBtn.style.color = this.isShuffled ? '#673ab7' : '#fff';
        
        if (this.isShuffled) {
            this.shuffledPlaylist = [...this.songs]
                .map(value => ({ value, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ value }) => value);
        }
        
        this.renderAlbum();
    }

    toggleRepeat() {
        this.isRepeating = !this.isRepeating;
        this.repeatBtn.style.color = this.isRepeating ? '#673ab7' : '#fff';
        this.audio.loop = this.isRepeating;
    }

    updateProgress() {
        const { currentTime, duration } = this.audio;
        const progressPercent = (currentTime / duration) * 100;
        this.progressBar.style.width = `${progressPercent}%`;
        
        this.currentTimeSpan.textContent = this.formatTime(currentTime);
        this.durationSpan.textContent = this.formatTime(duration);
    }

    handleSongEnd() {
        if (!this.isRepeating) {
            this.playNext();
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    showAlbumsView() {
        // Remove hidden class first
        this.albumsView.classList.remove('hidden');
        this.albumSongsView.classList.remove('hidden');
        
        // Trigger reflow
        void this.albumsView.offsetWidth;
        
        // Add active class to albums view and remove from songs view
        this.albumsView.classList.add('active');
        this.albumSongsView.classList.remove('active');
        
        // After animation, hide songs view
        setTimeout(() => {
            if (!this.albumSongsView.classList.contains('active')) {
                this.albumSongsView.classList.add('hidden');
            }
        }, 400); // Match transition duration

        this.renderAlbums();
    }

    showAlbumSongsView() {
        // Remove hidden class first
        this.albumsView.classList.remove('hidden');
        this.albumSongsView.classList.remove('hidden');
        
        // Trigger reflow
        void this.albumSongsView.offsetWidth;
        
        // Add active class to songs view and remove from albums view
        this.albumSongsView.classList.add('active');
        this.albumsView.classList.remove('active');
        
        // After animation, hide albums view
        setTimeout(() => {
            if (!this.albumsView.classList.contains('active')) {
                this.albumsView.classList.add('hidden');
            }
        }, 400); // Match transition duration
    }

    renderAlbums() {
        this.albumsGrid.innerHTML = '';
        this.albums.forEach(album => {
            const albumCard = document.createElement('div');
            albumCard.className = 'album-card';
            albumCard.innerHTML = `
                <img src="albums/${album.cover}" alt="${album.name}" onerror="this.src='images/default-album.jpg'">
                <h4>${album.name}</h4>
                <p>${album.artist}</p>
            `;
            albumCard.addEventListener('click', () => this.loadAlbum(`${album.artist} - ${album.name}`));
            this.albumsGrid.appendChild(albumCard);
            
            // Trigger reflow and remove fade-out
            void albumCard.offsetWidth;
            albumCard.classList.remove('fade-out');
        });
    }

    // Add this new method to get song duration
    async getSongDuration(songPath) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration);
            });
            audio.addEventListener('error', () => {
                resolve(0);
            });
            audio.src = songPath;
        });
    }

    // Update the animate method
    animate() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;

        // Clear the canvas with a fade effect
        this.ctx.fillStyle = 'rgba(15, 17, 25, 0.2)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average frequency for overall intensity
        const average = Array.from(this.dataArray).reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = average / 255;

        // Create pulsating background
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, `rgba(103, 58, 183, ${0.1 + intensity * 0.2})`);
        gradient.addColorStop(1, `rgba(15, 17, 25, ${0.8 + intensity * 0.2})`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw vertical bars
        const barWidth = this.canvas.width / 64;
        const barGap = 2;
        const minHeight = 5;
        
        // Start drawing from left side
        for (let i = 0; i < 64; i++) {
            const freq = this.dataArray[i] || 0;
            const normalizedFreq = freq / 255;
            
            // Calculate bar height based on frequency
            const barHeight = normalizedFreq * (this.canvas.height * 0.7); // 70% of canvas height

            // Calculate x position for the bar
            const x = i * (barWidth + barGap);
            
            // Draw mirrored bars (top and bottom)
            const y1 = (this.canvas.height - barHeight) / 2;
            const y2 = this.canvas.height - y1;

            // Create gradient for each bar
            const barGradient = this.ctx.createLinearGradient(x, y1, x, y2);
            barGradient.addColorStop(0, `rgba(103, 58, 183, ${0.1 + normalizedFreq * 0.9})`);
            barGradient.addColorStop(0.5, `rgba(156, 39, 176, ${0.3 + normalizedFreq * 0.7})`);
            barGradient.addColorStop(1, `rgba(103, 58, 183, ${0.1 + normalizedFreq * 0.9})`);

            // Draw the bar
            this.ctx.fillStyle = barGradient;
            
            // Top bar (going up)
            this.ctx.fillRect(x, y1, barWidth, Math.max(minHeight, barHeight / 2));
            
            // Bottom bar (going down)
            this.ctx.fillRect(x, this.canvas.height / 2, barWidth, Math.max(minHeight, barHeight / 2));

            // Add glow effect for higher frequencies
            if (normalizedFreq > 0.5) {
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = 'rgba(103, 58, 183, 0.5)';
            } else {
                this.ctx.shadowBlur = 0;
            }
        }

        requestAnimationFrame(() => this.animate());
    }

    // Add this new method for seeking
    seekTo(e) {
        const progressArea = document.querySelector('.progress-area');
        const progressBar = document.querySelector('.progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const clickPosition = e.clientX - rect.left;
        const percentage = (clickPosition / rect.width) * 100;
        
        // Ensure percentage is between 0 and 100
        const boundedPercentage = Math.max(0, Math.min(100, percentage));
        
        // Calculate and set new time
        const duration = this.audio.duration;
        const newTime = (boundedPercentage / 100) * duration;
        this.audio.currentTime = newTime;
        
        // Update progress bar visually
        this.progressBar.style.width = `${boundedPercentage}%`;
    }

    // Add this new method
    async loadAlbumsFromJson() {
        try {
            const response = await fetch('albums/albums.json');
            if (!response.ok) throw new Error('Failed to load albums data');
            
            const data = await response.json();
            this.albums = data.albums;
            this.renderAlbums();
        } catch (error) {
            console.error('Error loading albums:', error);
            alert('Failed to load albums list. Please try again later.');
        }
    }
}

// Initialize the music player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const player = new MusicPlayer();
}); 