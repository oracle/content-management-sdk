# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2]

- Avoid executing NodeJS-specific code from browser contexts

[Diffs](../../compare/v1.4.2...v1.4.1)

## [1.3.1]

- Include ES module in package ([see issue](https://github.com/oracle/content-management-sdk/issues/1))
- Additional documentation for expandMacros
- Export package.json (to silence Svelte build process)
- Hide require() usage in the NodeJS implementation to workaround
challenges ignoring these modules (url, http, https, etc.) with rollup

[Diffs](../../compare/v1.3.1...v1.3.0)

## [1.3.0]

- Added support for *slug* parameter on getRenditionURL
- Added support for *download* parameter on getRenditionURL
- Server calls can be aborted by returning *false* from beforeSend()

[Diffs](../../compare/v1.3.0...v1.2.0)

## [1.2.0]

- First GitHub release
