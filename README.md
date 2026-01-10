# calistheniq

**CalisthenIQ** - An AI-powered calisthenics coach focused on helping beginners build strength safely through proper form, controlled progressions, and body awareness.

## 🎯 Overview

Instead of generic workouts, CalisthenIQ uses an agent-based approach to guide users step-by-step—adapting exercises, cues, and difficulty based on movement quality, feedback, and consistency. The goal is not intensity, but sustainable strength built on solid fundamentals.

## 🏗️ Architecture

The application follows a modular architecture with the following core components:

### Core Modules

- **`src/agents/`** - Agent-based coaching system
  - `CoachingAgent.ts` - Main agent responsible for guiding users through their journey
  
- **`src/exercises/`** - Exercise library and management
  - `ExerciseLibrary.ts` - Repository of exercises with progressions and regressions
  
- **`src/types/`** - TypeScript type definitions
  - Core interfaces for agents, exercises, users, and sessions
  
- **`src/utils/`** - Utility functions
  - `Logger.ts` - Consistent logging across the application

### Key Features (Foundation)

- ✅ Agent-based architecture
- ✅ Type-safe TypeScript implementation
- ✅ Exercise library system
- ✅ User profile management (types defined)
- ✅ Workout session tracking (types defined)
- ✅ Testing infrastructure with Jest
- ✅ Linting with ESLint
- ✅ Build system with TypeScript compiler

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm (v10 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/rlynjb/calistheniq.git
cd calistheniq

# Install dependencies
npm install
```

### Development

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Run the built application
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## 📁 Project Structure

```
calistheniq/
├── src/
│   ├── agents/           # Agent implementations
│   ├── exercises/        # Exercise library and management
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── __tests__/       # Test files
│   └── index.ts         # Main entry point
├── dist/                # Compiled JavaScript (generated)
├── .eslintrc.json       # ESLint configuration
├── .gitignore          # Git ignore rules
├── jest.config.js      # Jest testing configuration
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## 🧪 Testing

The project uses Jest for testing with TypeScript support:

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

Current test coverage targets:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## 🔧 Technologies

- **TypeScript** - Type-safe JavaScript
- **Node.js** - JavaScript runtime
- **Jest** - Testing framework
- **ESLint** - Code linting
- **ts-node** - TypeScript execution for development

## 📝 Development Guidelines

### Code Style

- Use TypeScript for all source files
- Follow ESLint rules (run `npm run lint` to check)
- Write tests for new features
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Type Safety

- Leverage TypeScript's type system
- Define interfaces in `src/types/`
- Avoid using `any` type when possible
- Use strict mode (enabled by default)

## 🗺️ Roadmap

The foundation is now in place. Future development will include:

- [ ] Comprehensive exercise library with progressions
- [ ] Form assessment and feedback system
- [ ] Adaptive workout generator
- [ ] User progress tracking implementation
- [ ] Safety checks and modifications
- [ ] Interactive CLI interface
- [ ] Persistence layer (database)
- [ ] API endpoints
- [ ] Web interface

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. Code passes all tests (`npm test`)
2. Code passes linting (`npm run lint`)
3. New features include tests
4. Documentation is updated

## 📄 License

ISC

## 👤 Author

Repository: [rlynjb/calistheniq](https://github.com/rlynjb/calistheniq)
