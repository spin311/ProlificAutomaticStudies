# Build and Installation Guide

This guide will help you build and install the Prolific Studies Notifier Chrome extension.

## Prerequisites

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)
- **TypeScript** (will be installed as dependency)
- **Google Chrome** or **Chromium-based browser**

## Quick Installation (Recommended)

### Option 1: Download Pre-built Extension

1. Go to the [Releases page](https://github.com/officenotfound/ProlificNotifier/releases)
2. Download the latest `prolific-notifier-v*.zip` file
3. Extract the ZIP file
4. Follow the [Chrome Installation Steps](#chrome-installation-steps) below

### Option 2: Build from Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/officenotfound/ProlificNotifier.git
   cd ProlificNotifier
   ```

2. **Checkout the modern UI branch:**
   ```bash
   git checkout modern-ui-improvements
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the extension:**
   ```bash
   npm run build
   ```

5. **Create distribution package:**
   ```bash
   npm run package
   ```

   This creates `prolific-notifier-v1.1.0.zip` ready for installation.

## Chrome Installation Steps

1. **Open Chrome Extension Management:**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to Chrome menu → More Tools → Extensions

2. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the top right corner

3. **Install the Extension:**
   
   **Method A - Load Unpacked (for development):**
   - Click "Load unpacked"
   - Select the project root folder (contains manifest.json)
   
   **Method B - Install ZIP (recommended):**
   - Drag and drop the `.zip` file onto the extensions page
   - Or click "Load unpacked" and select the extracted folder

4. **Verify Installation:**
   - You should see "Prolific Studies Notifier" in your extensions list
   - The extension icon should appear in your Chrome toolbar
   - Click the icon to open the popup and configure settings

## Development Setup

If you want to modify or contribute to the extension:

1. **Set up development environment:**
   ```bash
   git clone https://github.com/officenotfound/ProlificNotifier.git
   cd ProlificNotifier
   git checkout modern-ui-improvements
   npm install
   ```

2. **Start development mode:**
   ```bash
   npm run dev
   ```
   This builds the extension and watches for changes.

3. **Load in Chrome:**
   - Follow the Chrome installation steps above using "Load unpacked"
   - Point Chrome to the project root directory

4. **Development workflow:**
   - Make changes to TypeScript files in `src/`
   - The `npm run dev` command will automatically rebuild
   - Click the refresh button on the extension in `chrome://extensions/`
   - Test your changes

## File Structure

```
ProlificNotifier/
├── manifest.json          # Extension manifest
├── package.json          # Build configuration
├── tsconfig.json         # TypeScript configuration
├── popup/
│   └── popup.html        # Extension popup UI
├── styles/
│   └── popup.css         # Modern Material Design styles
├── src/
│   ├── background.ts     # Service worker (main logic)
│   └── popup.ts          # Popup interface logic
├── dist/                 # Compiled output (auto-generated)
├── imgs/
│   └── logo.png          # Extension icons
└── audio/
    ├── alert1.mp3        # Notification sounds
    ├── alert2.mp3
    └── alert3.mp3
```

## Build Scripts

- `npm run build` - Compile TypeScript and copy assets
- `npm run watch` - Watch for changes and rebuild automatically
- `npm run package` - Create distribution ZIP file
- `npm run clean` - Remove build artifacts
- `npm run dev` - Build and start watching (development mode)

## Configuration

After installation:

1. **Pin the extension** to your toolbar for easy access
2. **Open the popup** by clicking the extension icon
3. **Configure settings:**
   - Enable/disable notifications
   - Choose audio alerts
   - Set volume levels
   - Configure auto-open Prolific on startup

## Permissions Explained

The extension requires these permissions:
- **Storage** - Save your preferences and statistics
- **Notifications** - Show desktop notifications for new studies
- **Tabs** - Monitor Prolific tab changes and open Prolific when needed
- **Offscreen** - Play audio notifications in the background
- **Host permissions** - Access Prolific.com to detect study changes

## Troubleshooting

### Extension doesn't work
- Ensure you have a Prolific tab open and logged in
- Check that notifications are enabled in both the extension and your browser
- Verify the extension has proper permissions

### Build fails
- Make sure you have Node.js 14+ installed
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript compilation errors in the console

### No notifications appearing
- Check browser notification permissions for the extension
- Ensure system notifications are enabled
- Test notifications using the "Test" button in the extension popup

### Audio not playing
- Check audio settings in the extension popup
- Verify browser allows audio playback
- Test audio using the play button next to audio selection

## Publishing to Chrome Web Store

To publish this extension:

1. **Create developer account** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)

2. **Prepare assets:**
   - Create high-quality screenshots (1280x800 or 640x400)
   - Design promotional tiles (440x280, 920x680, 1400x560)
   - Write detailed description

3. **Package for store:**
   ```bash
   npm run package
   ```

4. **Upload and submit** through the Developer Dashboard

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test thoroughly
4. Commit changes: `git commit -m 'Add your feature'`
5. Push to branch: `git push origin feature/your-feature`
6. Create a Pull Request

## License

MIT License - feel free to use and modify as needed.

## Support

If you encounter issues:
1. Check this guide first
2. Look at [existing issues](https://github.com/officenotfound/ProlificNotifier/issues)
3. Create a new issue with detailed information about your problem

---

**Happy studying! 🎓💰**