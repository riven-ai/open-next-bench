# Contributing

## Source intake

Nominate a repository in `catalog/candidates.json`. A source becomes accepted
only after all of the following are recorded:

1. canonical repository URL and an immutable 40-character commit SHA;
2. SPDX license identifier and license-file path;
3. redistribution review, including fonts, images, generated assets, and
   submodules;
4. lockfile-based install and build commands in an isolated environment;
5. Next.js and React versions, router mode, package manager, and relevant
   features;
6. a secret scan and a check that the fixture does not need production
   credentials;
7. a stable test or oracle that proves each later mutation exists.

## Mutation rules

- Keep the pristine source immutable.
- Store a mutation as a patch plus structured metadata.
- Introduce only documented issues; incidental breakage invalidates the case.
- Prefer behaviorally testable issues over style preferences.
- Require a human reviewer who did not author the mutation.
- Never use a source project's open issue or pull request verbatim as hidden
  ground truth.

## Development

Use Yarn 4 and Node.js 22 or newer.

```bash
yarn install
yarn check
```
