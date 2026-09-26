# Repository Guidelines

## Project Structure & Module Organization

This repository contains an Angular 11 implementation of Thai checkers. Application code lives in `src/app/`: core game models such as `Board.ts`, `Checker.ts`, `Move.ts`, and `Player.ts` sit alongside Angular components under `board-component/` and `board-stat-component/`. Global styles, startup code, and environment settings are in `src/`. Static files belong in `src/assets/`. Jasmine unit tests are colocated with source files as `*.spec.ts`; browser-level Protractor tests live in `e2e/src/`. `rule_book/` contains rule documentation and reference images. Treat `dist/` and `dist_/` as generated output and do not edit them directly.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies from `package-lock.json`.
- `npm start` runs the development server; open `http://localhost:4200/` for live reload.
- `npm run build` creates a development build under `dist/app/`.
- `npm run build -- --configuration production` produces an optimized production build.
- `npm test -- --watch=false --browsers=ChromeHeadless` runs the Karma/Jasmine suite once for CI-style validation.
- `npm run lint` checks TypeScript and Angular templates with TSLint/Codelyzer.
- `npm run e2e` starts the app and runs the Protractor end-to-end suite.

## Coding Style & Naming Conventions

Use TypeScript with spaces for indentation, single quotes, semicolons, and lines no longer than 140 characters, as configured in `tslint.json`. Follow Angular naming: component selectors use `app-` plus kebab-case, component files use `name.component.ts`, and component classes end in `Component`. Preserve the existing PascalCase model filenames and classes (for example, `PlayerRandomBot.ts`). Keep game rules in model classes and view behavior in components.

## Testing Guidelines

Write Jasmine tests in a neighboring `*.spec.ts` file and group behavior with clear `describe`/`it` statements. Add focused tests for move validation, compulsory captures, promotion, multi-jumps, and draw conditions when changing game logic. Update `e2e/src/app.e2e-spec.ts` for user-visible flows. No coverage threshold is configured; nevertheless, new behavior should include regression coverage.