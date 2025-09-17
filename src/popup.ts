// Enhanced Popup Script for Modern Prolific Notifier

interface ProlificSettings {
    audioActive: boolean;
    audio: string;
    volume: number;
    showNotification: boolean;
    openProlific: boolean;
    counter: number;
    lastChecked?: string;
}

class ProlificPopup {
    private settings: ProlificSettings = {
        audioActive: true,
        audio: 'alert1.mp3',
        volume: 100,
        showNotification: true,
        openProlific: false,
        counter: 0
    };

    private elements: { [key: string]: HTMLElement | null } = {};
    private settingsExpanded = false;

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadSettings();
    }

    private initializeElements(): void {
        // Get all necessary DOM elements
        this.elements = {
            counter: document.getElementById('counter'),
            lastChecked: document.getElementById('lastChecked'),
            autoAudio: document.getElementById('autoAudio'),
            selectAudio: document.getElementById('selectAudio'),
            volume: document.getElementById('volume'),
            volumeValue: document.getElementById('volumeValue'),
            playAudio: document.getElementById('playAudio'),
            showNotification: document.getElementById('showNotification'),
            openProlific: document.getElementById('openProlific'),
            openProlificBtn: document.getElementById('openProlificBtn'),
            testNotificationBtn: document.getElementById('testNotificationBtn'),
            settingsToggle: document.getElementById('settingsToggle'),
            settingsContent: document.getElementById('settingsContent'),
            audioSettings: document.getElementById('audioSettings'),
            statusIndicator: document.getElementById('statusIndicator'),
            loadingOverlay: document.getElementById('loadingOverlay')
        };
    }

    private setupEventListeners(): void {
        // Settings toggle
        this.elements.settingsToggle?.addEventListener('click', () => this.toggleSettings());
        
        // Quick action buttons
        this.elements.openProlificBtn?.addEventListener('click', () => this.openProlific());
        this.elements.testNotificationBtn?.addEventListener('click', () => this.testNotification());
        
        // Audio controls
        this.elements.autoAudio?.addEventListener('change', (e) => this.handleAudioToggle(e));
        this.elements.selectAudio?.addEventListener('change', (e) => this.handleAudioSelect(e));
        this.elements.volume?.addEventListener('input', (e) => this.handleVolumeChange(e));
        this.elements.playAudio?.addEventListener('click', () => this.playTestAudio());
        
        // Notification settings
        this.elements.showNotification?.addEventListener('change', (e) => this.handleNotificationToggle(e));
        this.elements.openProlific?.addEventListener('change', (e) => this.handleOpenProlificToggle(e));
        
        // Settings section clicks
        document.querySelector('.section-header')?.addEventListener('click', () => this.toggleSettings());
    }

    private async loadSettings(): Promise<void> {
        this.showLoading(true);
        
        try {
            // Clear badge when popup opens
            await chrome.runtime.sendMessage({
                type: 'clear-badge',
                target: 'background'
            });

            // Load all settings from storage
            const result = await chrome.storage.sync.get([
                'audioActive', 'audio', 'volume', 'showNotification', 
                'openProlific', 'counter', 'lastChecked'
            ]);

            // Update settings object
            this.settings = { ...this.settings, ...result };

            // Update UI elements
            this.updateUI();
            this.updateLastChecked();
            
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showError('Failed to load settings');
        } finally {
            this.showLoading(false);
        }
    }

    private updateUI(): void {
        // Update counter
        if (this.elements.counter) {
            this.elements.counter.textContent = this.settings.counter.toString();
            this.animateCounter(this.settings.counter);
        }

        // Update checkboxes/toggles
        if (this.elements.autoAudio) {
            (this.elements.autoAudio as HTMLInputElement).checked = this.settings.audioActive;
            this.updateAudioSettingsVisibility();
        }

        if (this.elements.showNotification) {
            (this.elements.showNotification as HTMLInputElement).checked = this.settings.showNotification;
        }

        if (this.elements.openProlific) {
            (this.elements.openProlific as HTMLInputElement).checked = this.settings.openProlific;
        }

        // Update audio settings
        if (this.elements.selectAudio) {
            (this.elements.selectAudio as HTMLSelectElement).value = this.settings.audio;
        }

        if (this.elements.volume) {
            (this.elements.volume as HTMLInputElement).value = this.settings.volume.toString();
            this.updateVolumeDisplay(this.settings.volume);
        }

        // Update status indicator
        this.updateStatusIndicator();
    }

    private updateLastChecked(): void {
        if (this.elements.lastChecked) {
            if (this.settings.lastChecked) {
                const date = new Date(this.settings.lastChecked);
                this.elements.lastChecked.textContent = this.formatTime(date);
            } else {
                this.elements.lastChecked.textContent = 'Never';
            }
        }
    }

    private formatTime(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return date.toLocaleDateString();
    }

    private animateCounter(value: number): void {
        if (!this.elements.counter) return;
        
        const counter = this.elements.counter;
        const startValue = 0;
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentValue = Math.floor(startValue + (value - startValue) * progress);
            
            counter.textContent = currentValue.toString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    private updateStatusIndicator(): void {
        if (!this.elements.statusIndicator) return;
        
        const statusDot = this.elements.statusIndicator.querySelector('.status-dot');
        const statusText = this.elements.statusIndicator.querySelector('.status-text');
        
        if (this.settings.showNotification || this.settings.audioActive) {
            statusDot?.classList.add('active');
            if (statusText) statusText.textContent = 'Active';
        } else {
            statusDot?.classList.remove('active');
            if (statusText) statusText.textContent = 'Inactive';
        }
    }

    private toggleSettings(): void {
        this.settingsExpanded = !this.settingsExpanded;
        
        const content = this.elements.settingsContent;
        const toggleBtn = this.elements.settingsToggle;
        
        if (content && toggleBtn) {
            if (this.settingsExpanded) {
                content.classList.add('expanded');
                toggleBtn.classList.add('expanded');
            } else {
                content.classList.remove('expanded');
                toggleBtn.classList.remove('expanded');
            }
        }
    }

    private updateAudioSettingsVisibility(): void {
        if (this.elements.audioSettings) {
            if (this.settings.audioActive) {
                this.elements.audioSettings.style.display = 'block';
            } else {
                this.elements.audioSettings.style.display = 'none';
            }
        }
    }

    private updateVolumeDisplay(volume: number): void {
        if (this.elements.volumeValue) {
            this.elements.volumeValue.textContent = `${volume}%`;
        }
    }

    private async openProlific(): Promise<void> {
        this.showButtonLoading(this.elements.openProlificBtn as HTMLButtonElement, true);
        
        try {
            await chrome.tabs.create({ url: 'https://app.prolific.com/', active: true });
            window.close();
        } catch (error) {
            console.error('Error opening Prolific:', error);
            this.showError('Failed to open Prolific');
        } finally {
            this.showButtonLoading(this.elements.openProlificBtn as HTMLButtonElement, false);
        }
    }

    private async testNotification(): Promise<void> {
        const btn = this.elements.testNotificationBtn as HTMLButtonElement;
        this.showButtonLoading(btn, true);
        
        try {
            await chrome.runtime.sendMessage({
                type: 'show-notification',
                target: 'background'
            });
            
            this.showSuccess('Test notification sent!');
        } catch (error) {
            console.error('Error sending test notification:', error);
            this.showError('Failed to send notification');
        } finally {
            this.showButtonLoading(btn, false);
        }
    }

    private async playTestAudio(): Promise<void> {
        const btn = this.elements.playAudio as HTMLButtonElement;
        this.showButtonLoading(btn, true);
        
        try {
            await chrome.runtime.sendMessage({
                type: 'play-sound',
                target: 'background'
            });
        } catch (error) {
            console.error('Error playing test audio:', error);
            this.showError('Failed to play audio');
        } finally {
            setTimeout(() => this.showButtonLoading(btn, false), 500);
        }
    }

    private async handleAudioToggle(event: Event): Promise<void> {
        const checkbox = event.target as HTMLInputElement;
        this.settings.audioActive = checkbox.checked;
        
        await chrome.storage.sync.set({ audioActive: this.settings.audioActive });
        this.updateAudioSettingsVisibility();
        this.updateStatusIndicator();
    }

    private async handleAudioSelect(event: Event): Promise<void> {
        const select = event.target as HTMLSelectElement;
        this.settings.audio = select.value;
        
        await chrome.storage.sync.set({ audio: this.settings.audio });
    }

    private async handleVolumeChange(event: Event): Promise<void> {
        const slider = event.target as HTMLInputElement;
        this.settings.volume = parseInt(slider.value);
        
        await chrome.storage.sync.set({ volume: this.settings.volume });
        this.updateVolumeDisplay(this.settings.volume);
    }

    private async handleNotificationToggle(event: Event): Promise<void> {
        const checkbox = event.target as HTMLInputElement;
        this.settings.showNotification = checkbox.checked;
        
        await chrome.storage.sync.set({ showNotification: this.settings.showNotification });
        this.updateStatusIndicator();
    }

    private async handleOpenProlificToggle(event: Event): Promise<void> {
        const checkbox = event.target as HTMLInputElement;
        this.settings.openProlific = checkbox.checked;
        
        await chrome.storage.sync.set({ openProlific: this.settings.openProlific });
    }

    private showLoading(show: boolean): void {
        if (this.elements.loadingOverlay) {
            if (show) {
                this.elements.loadingOverlay.classList.add('show');
            } else {
                this.elements.loadingOverlay.classList.remove('show');
            }
        }
    }

    private showButtonLoading(button: HTMLButtonElement, loading: boolean): void {
        if (loading) {
            button.disabled = true;
            button.style.opacity = '0.6';
            const icon = button.querySelector('.material-icons');
            if (icon) {
                icon.textContent = 'hourglass_empty';
                icon.classList.add('spin');
            }
        } else {
            button.disabled = false;
            button.style.opacity = '1';
            const icon = button.querySelector('.material-icons');
            if (icon) {
                icon.classList.remove('spin');
                // Restore original icon based on button
                if (button.id === 'openProlificBtn') {
                    icon.textContent = 'open_in_new';
                } else if (button.id === 'testNotificationBtn') {
                    icon.textContent = 'notifications_active';
                } else if (button.id === 'playAudio') {
                    icon.textContent = 'play_arrow';
                }
            }
        }
    }

    private showSuccess(message: string): void {
        this.showToast(message, 'success');
    }

    private showError(message: string): void {
        this.showToast(message, 'error');
    }

    private showToast(message: string, type: 'success' | 'error'): void {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Add toast styles
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 16px',
            borderRadius: '8px',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            zIndex: '10000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            backgroundColor: type === 'success' ? '#10b981' : '#ef4444'
        });
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after delay
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProlificPopup();
});

// Add CSS for spinning animation
const style = document.createElement('style');
style.textContent = `
    .spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);