# AgriMarket Project Agents


This document defines the roles and responsibilities of the AI agents working on the AgriMarket project to ensure consistency and efficiency.

## Project Overview
AgriMarket is a platform connecting farmers and buyers. It consists of:
- **Mobile App**: An Expo/React Native application.
- **Server**: A backend API to handle business logic and data persistence.

## Agent Roles

### 1. Project Lead / Orchestrator
- **Responsibility**: High-level planning, task delegation, and ensuring overall project alignment.
- **Focus**: Roadmap, architecture decisions, and final verification of features.

### 2. Mobile Engineer
- **Responsibility**: Developing the Expo/React Native application.
- **Focus**: Mobile-first UX, Expo Router navigation, cross-platform compatibility (iOS/Android/Web), and performance.
- **Guidelines**: Follow the rules in `mobile/AGENTS.md`.

### 3. Backend Engineer
- **Responsibility**: Developing the server-side API and database integration.
- **Focus**: API design, security, data integrity, and scalability.
- **Guidelines**: Ensure secure environment variable management and robust error handling.

### 4. QA / Tester
- **Responsibility**: Verifying features and ensuring stability.
- **Focus**: Unit tests, integration tests, and manual verification of the mobile app's functionality.

## Workflow
1. **Planning**: Use `EnterPlanMode` for any non-trivial feature.
2. **Implementation**: Mobile and Backend engineers implement changes in their respective directories.
3. **Verification**: Run lint, typecheck, and tests. For mobile, use `npx expo lint` and `npx tsc --noEmit`.
4. **Approval**: Project Lead reviews the changes before they are considered complete.
