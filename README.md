# contrl

your body is your controller

A mobile workout progression app built with Expo and React Native. Track push, pull, and squat sessions, level up through gates, and sync with Notion.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [EAS CLI](https://docs.expo.dev/build/setup/) (`npm install -g eas-cli`)
- Java 17 — set `JAVA_HOME` pointing to the JDK
- Android SDK — set `ANDROID_HOME` (default: `$HOME/Library/Android/sdk`)
- `adb` in PATH (comes with Android SDK Platform-Tools)

Add to `~/.zshrc`:
```bash
export JAVA_HOME="$HOME/.local/java-17.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

## Getting Started

```bash
# Install dependencies
npm install

# Generate native android/ folder (first time, or after adding native modules)
npm run prebuild:android
```

> This app uses `react-native-vision-camera` and `react-native-mediapipe-posedetection` which require a dev client build — Expo Go will not work.

## Development Workflow

### USB Physical Device (hot-reload)

**First time** — builds and installs the dev client APK (~2-10 min):
```bash
npm run android:device
```

**Every subsequent session** — just start Metro, no rebuild needed:
```bash
adb reverse tcp:8081 tcp:8081
npm run metro
```

> Re-run `npm run android:device` only when you add a new native module.

### Emulator

```bash
npm run android
```

### OTA update — JS-only changes, no reinstall needed

```bash
eas update --branch preview --platform android --message "description"
```

### New native module added — triggers a full cloud build

```bash
eas build --platform android --profile development
```

## Building for Android

### Preview APK (internal testing)

```bash
eas build --platform android --profile preview
```

### Production AAB (Google Play Store)

```bash
eas build --platform android --profile production
```

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
