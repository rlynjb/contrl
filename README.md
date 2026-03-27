# contrl

your body is your controller

A mobile workout progression app built with Expo and React Native. Track push, pull, and squat sessions, level up through gates, and sync with Notion.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- [EAS CLI](https://docs.expo.dev/build/setup/) (`npm install -g eas-cli`)
- Android Studio (for emulator) or a physical Android device

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm start

# Start with cache cleared (use after installing new packages)
npx expo start --clear
```

## Development Commands

```bash
# Start Metro bundler
npm start

# Start and open on Android emulator
npm run android

# Start and open on iOS simulator
npm run ios

# Start for web
npm run web

# Clear Metro cache and restart
npx expo start --clear
```

## Running on a Physical Device (Expo Go)

1. Install **Expo Go** from the [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) or [App Store](https://apps.apple.com/app/expo-go/id982107779)
2. Run `npm start`
3. Scan the QR code shown in the terminal with Expo Go (Android) or your Camera app (iOS)
4. Make sure your phone and computer are on the same Wi-Fi network

## Building for Android

### Development APK (for testing with dev tools)

```bash
eas build --platform android --profile development
```

### Preview APK (for sharing/internal testing)

```bash
eas build --platform android --profile preview
```

### Production AAB (for Google Play Store)

```bash
eas build --platform android --profile production
```

### Installing an APK on your phone

1. Build a development or preview APK using the commands above
2. Once the build completes, EAS will provide a download URL
3. Open the URL on your Android phone or transfer the APK file
4. Go to **Settings > Security** and enable **Install from unknown sources** (or allow it for your browser when prompted)
5. Open the downloaded APK and tap **Install**

## Project Structure

```
app/                    # Expo Router screens
  _layout.tsx           # Root layout (fonts, providers)
  (tabs)/               # Tab navigation
    index.tsx           # Home screen
    tree.tsx            # Skill tree
    history.tsx         # Workout history
  settings/             # Settings stack
src/
  components/           # Reusable UI components
  constants/            # Theme and config
  hooks/                # React hooks
  lib/                  # Game logic (progression, gates, streaks)
  services/             # Database and Notion sync
  types/                # TypeScript types
  data/                 # Seed data
```

## Tech Stack

- **Expo SDK 55** with Expo Router
- **React Native 0.83**
- **TypeScript**
- **expo-sqlite** for local storage
- **Notion API** for optional cloud sync
- **Inter** font family
- **Feather** icons via @expo/vector-icons
