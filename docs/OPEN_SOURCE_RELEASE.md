# Open-source release checklist

This checklist is for the release owner. Do not change repository visibility until the exposure and rights reviews are complete. Turning a public repository private does not recall copies or public forks.

## Current release blockers

- `docs/art-direction/quickvolt9/product-reference.jpg` is a tracked third-party product photograph. Its documentation identifies an external product-image source but does not establish permission to redistribute the photo in a public source repository. Determine its rights or remove it from every history and ref that will be published. Removing it from the current tree alone does not remove historical copies. Coordinate any rewrite with the release owner and every active worktree; never force-push unilaterally. Alternatively, prepare a clean public snapshot with verified content and review the impact on links, issues, deployments, and contributors.
- Finish an asset-by-asset review, including art and reference images in Git history, generated derivatives, source-model notices, animations, fonts, map data and copied code. The recorded CC0 notices and ODbL geography terms are useful evidence, but this checklist does not certify every asset. Preserve applicable notices and attribution; remove or replace assets without established redistribution rights.
- Review all GitHub-visible branches, tags, pull requests, issues, Actions logs and artifacts, plus Git history for sensitive information and privacy. A secret scan is a screening tool, not a complete review. Rotate any real exposed credentials before considering history cleanup.
- Review the multiplayer threat model, connection and allocation abuse, chat, storage/retention, recovery and operational cost controls with the release owner. An Origin header can be forged by non-browser clients. Do not reset player data or test destructive traffic on production.
- Establish a working private security reporting channel and confirm that GitHub private vulnerability reporting is enabled and tested before directing public reporters to it.

## GitHub and publication

1. Keep outside contributors on forks, without granting repository write access. Audit collaborators, GitHub Apps, deployment credentials and account two-factor authentication.
2. Before publication, review GitHub's visibility-change consequences and coordinate the release and any history remediation. GitHub Actions logs become public. Branch/ruleset availability may differ between private and public repositories.
3. As soon as the repository is public, configure and verify `main` protection: require pull requests and passing checks, apply relevant rules to administrators, disable force pushes and deletion, and keep automatic merging off. Avoid requiring a second reviewer when the owner is the only maintainer. Verify the exact available controls on the account.
4. Enable available secret scanning, push protection, dependency alerts, and code scanning. Require approval for workflows from forked PRs where available. Never execute untrusted pull request code in a privileged `pull_request_target` workflow.
5. Using a separate unprivileged account or trusted contributor, verify that a fork can open a PR, cannot push or merge into `main`, required checks run safely, and the owner can merge a passing PR. Review deployment integrations so PRs cannot deploy to production or access production secrets.
6. Verify the production frontend and multiplayer service after release, then publish contribution and security-reporting instructions.

The project workflow assigns `main`, integration, and deployments to the release owner. This checklist does not grant permission to push `main`, merge a PR, force-push, or reset world data.
