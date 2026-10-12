# Contributing to Revelumo

Revelumo is an independently developed, local-first desktop photo editor. Contributions can include bug fixes, tests, documentation, translations, accessibility feedback, and focused feature proposals.

Issues and pull requests may be written in **English, Brazilian Portuguese, or Spanish**. The main contributor guide is in English; some detailed engineering records are in Portuguese.

## Before you start

- Read the [README](README.md) for the implemented features, current limits, and roadmap.
- Search [existing issues](https://github.com/glaucia86/revelumo/issues) and [pull requests](https://github.com/glaucia86/revelumo/pulls) to avoid overlapping work. For a substantial feature or architectural change, discuss the problem and scope in an issue before implementing it. A small documentation correction can go straight to a pull request.
- Read [AGENTS.md](AGENTS.md) and only the linked architecture or implementation notes relevant to your change. Keep decisions traceable to their issue and respect dependencies between issues.
- For usage questions, see [SUPPORT.md](SUPPORT.md). For a suspected vulnerability, follow [SECURITY.md](SECURITY.md) before sharing details publicly.
- Keep discussions respectful and specific. Explain the behavior or evidence you disagree with, and give others room to ask questions.

## Set up a working copy

Use Git and **Node.js 24 with npm**, matching CI. The [source setup instructions](README.md#how-to-try-it) cover prerequisites, platform caveats, and opening the app.

For a prose-only edit, a checkout and Markdown preview may be enough; use the documentation checks below. The full setup is for running or changing the application.

1. [Fork the repository](https://github.com/glaucia86/revelumo/fork), unless you already have permission to push a branch to it.
2. Clone your fork. Replace `YOUR-GITHUB-USERNAME` with your GitHub login:

   ```sh
   git clone https://github.com/YOUR-GITHUB-USERNAME/revelumo.git
   cd revelumo
   git remote add upstream https://github.com/glaucia86/revelumo.git
   git fetch upstream
   git switch -c fix/short-description upstream/main
   ```

   Contributors with repository access can clone `https://github.com/glaucia86/revelumo.git` and create a topic branch from its latest `main` instead.

3. When working on the application, install and verify the baseline, running each command only after the previous one succeeds:

   ```sh
   npm ci
   npm run install:electron
   npm run typecheck
   npm test
   npm run package
   ```

   `npm ci` uses the committed lockfile. `install:electron` installs the official Electron binary separately. Packaging creates a local development application in `out/`; it does not create a release or installer. See the README for launch instructions and platform-specific limitations.

Use a separate development catalog and synthetic images. Do not use your only copy of a photo library to test unreleased changes.

## Make a focused change

Keep the pull request small enough to review and tied to one clear outcome. Avoid unrelated cleanup, dependency upgrades, generated packages, or lockfile churn.

For changes to application behavior:

1. Identify the observable behavior and public interfaces under test in the issue or plan. Agree on any new test boundary before adding it.
2. Write one failing behavior test, verify that it fails for the expected reason, and implement only enough to make it pass. Repeat in small vertical slices; do not write all tests first and then all implementation.
3. Test through public interfaces. Prefer real filesystem/SQLite behavior with isolated fixtures; use substitutes only at necessary external boundaries and state what they leave unverified.
4. Cover relevant failures, interruption, reopening, repeated actions, and data preservation. For renderer, preload, or IPC changes, core tests alone do not prove packaged Electron behavior.
5. Review the change and refactor where useful after the red/green cycles. Update the affected documentation and evidence.

The project's [TDD guidance](.agents/skills/tdd/SKILL.md) and [review guidance](.agents/skills/code-review/SKILL.md) describe the development approach in more detail. Using an AI coding assistant is optional; contributors remain responsible for reviewing their changes and verification results.

### Preserve the product's boundaries

- Keep original photographs read-only. Editing recipes and generated previews must not silently overwrite original files.
- Keep the SQLite catalog in the main process and preserve the restricted preload/IPC boundary and Electron security protections.
- Keep changes within the agreed local-first product scope. RAW engine selection and other unresolved architecture choices require discussion; proposals are not implementation decisions.
- Use synthetic or appropriately redacted evidence. Do not commit personal photographs, catalogs, secrets, personal paths, or private EXIF/GPS metadata. Record the origin and license of any new third-party fixture or asset.

## Verify proportionally

**Code, dependency, or build changes:** run `npm run typecheck`, `npm test`, and `npm run package` against the final change. Run the relevant packaged Electron scenarios as described in [CI reproduction](docs-agents/ci.md) and the [workflow](.github/workflows/ci.yml). Use fresh, isolated scenario directories and preserve each scenario's required invocation order. State your OS, commands, results, skips, and any checks you could not run.

**Documentation-only changes:** run `npm run check:docs` (Node 24, no dependency installation or network required), then review the rendered Markdown, relative links and anchors, command accuracy, and consistency with the implementation. Keep the English, Portuguese, and Spanish READMEs aligned when changing shared facts. Issue forms must also parse as YAML and follow [GitHub's issue form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms). A prose-only change does not need a new application test or a claimed TDD cycle. Explain why runtime checks are not applicable rather than marking them as passed.

CI currently runs on **Windows and Ubuntu** with Node 24, read-only repository permissions, local documentation checks, typechecking, core tests, and packaging. Packaged Electron integration scenarios run on Windows. These checks do not establish macOS support, installer availability, complete visual QA, or a supported end-user platform matrix. The existing workflow also runs for documentation pull requests.

## Open a pull request

1. Commit your focused change and push your topic branch to your fork or the repository where you have access:

   ```sh
   git add path/to/changed-file
   git commit -m "docs: clarify contributor setup"
   git push -u origin HEAD
   ```

   Replace the example path and commit message with your actual change. Review the staged diff before committing.

2. Open a pull request against `glaucia86/revelumo`'s `main`. Use a draft while work or verification is incomplete.
3. Fill in the pull request template: explain the problem, link the issue if applicable, summarize the changes, and report verification and remaining limits. Include only sanitized evidence.
4. Address review feedback and rerun affected checks after changes. Independent review should consider both repository standards and the issue's requirements. Passing CI alone is not approval to merge.

## Changelog and versioning

Include an entry in [CHANGELOG.md](CHANGELOG.md) for each user-visible change in a pull request, with a PR or issue reference; explain when an entry is not applicable (for example, a typo-only edit). `Unreleased` describes changes once their PR is merged. Keep proposals and unfinished features out of delivered features. The changelog summarizes what changed; evidence reports record how and where it was checked.

A merged PR does not automatically create a version, tag, release, or download. The current [alpha preparation procedure](docs-agents/versioning.md) is manual: select a coherent integrated milestone, verify the final SHA and its package/CI, then synchronize package and lockfile versions during an approved release preparation. The first experimental [source-only pre-release, `0.1.0-alpha.1`](https://github.com/glaucia86/revelumo/releases/tag/v0.1.0-alpha.1), was published on 2026-10-12 without installers. Use its tag to reproduce that release; base new contributions on current `main`, as described above. Do not bump versions or create release tags incidentally in a feature or documentation PR. No release automation or installer publication is configured.

## License and third-party material

Project code and documentation use the [MIT License](LICENSE). Contribute only material you have the right to submit, and preserve applicable notices. Third-party code, tools, images, and other assets retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not assume that a public image or repository is licensed for reuse.
