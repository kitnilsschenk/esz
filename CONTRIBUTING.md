# Contributing to EDMS

Thank you for your interest in contributing. This project is developed under
a public-funding obligation with strict provenance, licensing, and data-
protection requirements. Please read this document before opening a pull
request.

## Developer Certificate of Origin (DCO)

All commits **must** be signed off using the `-s` / `--signoff` flag:

```sh
git commit -s -m "Your commit message"
```

This appends a `Signed-off-by: Your Name <your.email@example.com>` trailer to
the commit message, certifying that you wrote the change (or otherwise have
the right to submit it) under the terms below. Commits without a matching
`Signed-off-by` trailer will be rejected by CI (`dco-check`, see
`docs/adr/ADR-0001-projekt-skelett.md`, section 10.3).

### Developer Certificate of Origin 1.1

By making a contribution to this project, I certify that:

> (a) The contribution was created in whole or in part by me and I have the
> right to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my
> knowledge, is covered under an appropriate open source license and I have
> the right under that license to submit that work with modifications,
> whether created in whole or in part by me, under the same open source
> license (unless I am permitted to submit under a different license), as
> indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
> certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are
> public and that a record of the contribution (including all personal
> information I submit with it, including my sign-off) is maintained
> indefinitely and may be redistributed consistent with this project or the
> open source license(s) involved.

This is the standard DCO 1.1 text, as published at
[developercertificate.org](https://developercertificate.org/), reproduced
verbatim as permitted by its terms.

## License of contributions ("inbound = outbound")

This project is licensed under **Apache-2.0** (see `LICENSE`). By
submitting a contribution, you agree that it is licensed to the project
under the same terms — inbound contributions are outbound-licensed under
Apache-2.0, with no additional restrictions.

Section 4(d) of the licence requires that anyone redistributing this work,
or a derivative of it, passes on the contents of the `NOTICE` file. If your
contribution adds a third-party component that carries its own attribution
requirement, add it to `NOTICE` in the same change — an attribution that
arrives a release later is an attribution that was missing.

## No PII, no real data

Fixtures, seed data, test data, and example configuration files
(`.env.example`, sample documents, etc.) must **never** contain real personal
data or production secrets. Use synthetic data (e.g. via a fixture/faker
library once introduced) only. This applies to the entire repository, not
just `tests/`.

## Dependency licensing

Before adding **any** new dependency (production or dev), check its license
against the dependency whitelist:

> MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, MPL-2.0, PostgreSQL,
> Zlib, Unlicense, CC0-1.0, BlueOak-1.0.0 — nothing else without explicit
> approval.

Proprietary and source-available licenses (e.g. TSL, BUSL, SSPL, Elastic
License 2.0, Commons Clause) and copyleft licenses embedded as a library
(GPL-2.0/3.0, AGPL-3.0) are **not permitted** in shipped code. Services
accessed only over the network (PostgreSQL, Keycloak, MinIO, OpenSearch) are
an explicit exception, provided they remain unmodified.

Every new dependency added to a `package.json` must be logged with its name,
version, and license in `docs/architecture/dependency-log.md`. CI additionally
enforces this via an automated license gate and a CycloneDX SBOM per release.

## How to submit changes

1. Discuss non-trivial changes first after opening an issue.
2. Open a pull request against the default branch.
3. CI must pass: lint, typecheck, unit tests, integration tests, license
   gate, SBOM generation, secret scan, DCO check, and the public-export
   guard (see `docs/adr/ADR-0001-projekt-skelett.md`, section 10.3).
4. Do not force-push, rewrite shared history, or bypass CI/pre-commit hooks
   (`--no-verify`) without explicit maintainer approval.
