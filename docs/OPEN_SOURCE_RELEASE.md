# Open-source release checklist

This checklist is for the release owner. Do not change repository visibility until the exposure and rights reviews are complete. Turning a public repository private does not recall copies or public forks.

## Current release blockers

- `docs/art-direction/quickvolt9/product-reference.jpg` is a third-party product photograph removed from the current tree but still present in Git history. Its documentation identifies an external product-image source but does not establish permission to redistribute the photo in a public source repository. Determine its rights or remove it from every history and ref that will be published. Removing it from the current tree alone does not remove historical copies. Coordinate any rewrite with the release owner and every active worktree; never force-push unilaterally. Alternatively, prepare a clean public snapshot with verified content and review the impact on links, issues, deployments, and contributors.
- Finish an asset-by-asset review, including art and reference images in Git history, generated derivatives, source-model notices, animations, fonts, map data and copied code. The recorded CC0 notices and ODbL geography terms are useful evidence, but this checklist does not certify every asset. Preserve applicable notices and attribution; remove or replace assets without established redistribution rights.
  - The two legacy Ben Hickling fire atlases were matched by SHA-256 to the creator’s CC0 downloads; see [source and hashes](../third_party/ben-hickling-fire-SOURCES.md). The current renderer does not use them.
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

## Proposed branch-protection settings

The [example API payload](branch-protection.example.json) is a reviewable starting point, not an active rule. It requires pull requests, a passing up-to-date `check` status, resolved conversations, and applies protections to administrators; it blocks force-pushes and deletion. It requires zero separate approving reviews so a sole maintainer can merge their own changes. Restricting who can merge relies on keeping repository and app write access limited to the owner; personal repositories do not offer the organization-only branch push restrictions. Keep auto-merge disabled.

After publication and after the Actions check has run on the target repository, the owner can apply the payload with the GitHub branch protection API. Check that `check` resolves to the intended GitHub Actions app and that the API accepted every field, then test with a genuinely unprivileged fork and an owner-authored pull request. If GitHub rejects a field or branch rule, resolve that before inviting public contributions. This example has not been applied or validated against the target public repository.

## Investigation of the existing repository URL

On 29 October 2026, a read-only audit fetched the advertised remote branch and pull-request head refs into a separate temporary bare clone. The product photograph was present at the tips of 21 of 22 branches and 29 of 30 pull-request head refs. The remaining tips had removed it from their current trees but still inherited its history. These counts are a snapshot, not an inventory of every GitHub-managed object or a guarantee that the refs will remain unchanged.

GitHub's documented sensitive-data removal process says that rewriting and force-pushing branches alone does not remove pull-request references or cached views. It also says GitHub Support does not remove non-sensitive data through that process. Do not assume a history rewrite will make this photograph inaccessible; confirm the available remedy before publishing the current repository.

One possible route to keep the `Clarru/la-baraj` URL is to rename the existing private repository and create a new repository at the original name from a reviewed clean snapshot. This creates a different GitHub repository identity: old PR links and Git redirects would no longer lead to the renamed repository once the old name is reused. Existing worktrees must have their remotes and histories handled deliberately, and the Vercel Git connection, production branch, previews, and Cloudflare configuration must be assessed and reconnected as needed. A new repository is not automatically a safe or production-ready release. This route requires explicit owner/release coordination and verification; it has not been executed.

References: [GitHub history removal](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), [repository rename redirects](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository), and [Vercel Git deployment](https://vercel.com/docs/git).
