# Repository Guidelines

## Project Structure & Module Organization

Product documentation lives in `docs/`. The web service lives in `site/`: browser code in `site/src/`, the Node.js server in `site/server/`, the device agent in `site/agent/`, tests in `site/tests/`. `render.yaml` at the root describes hosting on Render. See [site/README.md](site/README.md) for details.

## Build, Test, and Development Commands

Run these from `site/` (Node.js 20+):

```sh
npm install      # installs pg, the only runtime dependency
npm start        # server on http://127.0.0.1:4173, data in site/data/
npm test         # node:test suites in site/tests/
npm run build    # offline single-file copy in site/dist/
```

Avoid documenting commands that have not been checked against the actual project configuration.

## Coding Style & Naming Conventions

Use descriptive names and keep each module focused on one responsibility. Match existing file conventions when extending code; establish language-specific indentation and naming rules with the first implementation.

For Markdown, use hash-prefixed headings, fenced code blocks with language labels, and relative links to repository files. Configure a formatter and linter appropriate to the selected language, and record their commands here.

## Testing Guidelines

No test framework or coverage threshold exists yet. Choose a framework compatible with the implementation and document its runner and test-file naming convention.

Add tests for new behavior and regression tests for bug fixes. Cover meaningful edge cases; keep tests deterministic and independent of private credentials or live services.

## Commit & Pull Request Guidelines

Use concise imperative subjects, such as `Add project configuration`, and keep commits focused.

Pull requests should describe the change, its purpose, and validation performed. Link relevant issues and include screenshots for visible interface changes. Clearly identify checks that could not be run.
