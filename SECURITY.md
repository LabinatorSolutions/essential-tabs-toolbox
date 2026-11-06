# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |

The add-on requires **Firefox 159 or newer**. Older Firefox releases carry known, unpatched vulnerabilities; the
`strict_min_version` floor is a deliberate security decision, not an oversight.

## What the add-on can access

- Tab addresses and titles (`tabs`), Firefox's recently closed tabs (`sessions`), its own settings (`storage`), and
  container IDs for opening links (`cookies`, which cannot read any cookie without site access).
- No site access, no content scripts, no remote code, no network requests of its own, no data collection.

## Reporting a vulnerability

Open a private security advisory on
[GitHub](https://github.com/LabinatorSolutions/essential-tabs-toolbox/security/advisories/new). Please don't file
public issues for security problems.
